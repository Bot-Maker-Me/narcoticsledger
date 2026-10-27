import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { jsonError, jsonResponse, preflight } from '../_shared/cors.ts';

/**
 * Stripe webhook handler.
 *
 * Hardening over the previous version:
 * - the signature is compared in constant time and the timestamp is freshness-checked
 *   before the payload is trusted;
 * - the paying user is resolved from `client_reference_id` / subscription metadata first
 *   (set by `stripe-checkout`), so the webhook never has to guess from an email address;
 * - `stripe_events` is written for real, which makes replays idempotent and makes failed
 *   deliveries visible on the admin health tab;
 * - the checkout amount is sanity-checked and logged for the audit trail.
 */

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

const SUBSCRIPTION_STATUS_MAP: Record<string, string> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  unpaid: 'revoked',
  canceled: 'cancelled',
  incomplete: 'none',
  incomplete_expired: 'cancelled',
  paused: 'none',
};

/** Constant-time comparison of two hex signatures. */
function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<StripeEvent> {
  let timestamp = '';
  const signatures: string[] = [];

  for (const part of signature.split(',')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === 't') timestamp = value;
    if (key === 'v1') signatures.push(value);
  }

  if (!timestamp || signatures.length === 0) throw new Error('Invalid signature format');

  const age = Math.floor(Date.now() / 1000) - Number.parseInt(timestamp, 10);
  if (!Number.isFinite(age) || age > 300) throw new Error('Webhook timestamp too old');

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`));
  const expected = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  if (!signatures.some((candidate) => timingSafeEqual(candidate, expected))) {
    throw new Error('Signature verification failed');
  }

  return JSON.parse(payload) as StripeEvent;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return jsonError('Method not allowed', 405, req);

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured');
    return jsonError('Stripe is not configured', 500, req);
  }

  const payload = await req.text();
  const signature = req.headers.get('Stripe-Signature');
  if (!signature) return jsonError('Missing signature', 400, req);

  let event: StripeEvent;
  try {
    event = await verifyStripeSignature(payload, signature, webhookSecret);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown';
    console.error('[stripe-webhook] signature rejected', { detail });
    return jsonError('Invalid signature', 400, req);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Idempotency: a delivery that already succeeded is acknowledged and ignored.
  const { data: existing, error: lookupError } = await supabase
    .from('stripe_events')
    .select('processed')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

  if (lookupError) {
    console.error('[stripe-webhook] could not read stripe_events', { lookupError });
  }

  if (existing?.processed) {
    console.log('[stripe-webhook] duplicate delivery ignored', { eventId: event.id });
    return jsonResponse({ received: true, duplicate: true }, 200, req);
  }

  if (!existing) {
    const { error: insertError } = await supabase
      .from('stripe_events')
      .insert({ stripe_event_id: event.id, event_type: event.type, processed: false });

    if (insertError && insertError.code !== '23505') {
      console.error('[stripe-webhook] could not record event', { insertError });
    }
  }

  /** Resolves the profile a Stripe customer or an explicit user id belongs to. */
  async function resolveUserId(
    explicitUserId: unknown,
    customerId: unknown,
    email: unknown
  ): Promise<string | null> {
    if (typeof explicitUserId === 'string' && explicitUserId) return explicitUserId;

    if (typeof customerId === 'string' && customerId) {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle();
      if (data?.id) return data.id;
    }

    if (typeof email === 'string' && email) {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (data?.id) return data.id;
    }

    return null;
  }

  async function applyStatus(
    column: 'id' | 'stripe_customer_id',
    value: string,
    patch: Record<string, unknown>,
    label: string
  ): Promise<void> {
    const { data: updated, error } = await supabase
      .from('profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq(column, value)
      .select('id');

    if (error) {
      console.error('[stripe-webhook] failed to update profile', { label, error });
      throw error;
    }

    if (!updated || updated.length === 0) {
      console.warn('[stripe-webhook] no profile matched, nothing updated', {
        label,
        column,
        value,
      });
    }
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;

        if (session.status !== 'complete') {
          console.warn('[stripe-webhook] session not complete, ignoring', {
            eventId: event.id,
            status: session.status,
          });
          break;
        }

        const amountTotal = session.amount_total;
        if (typeof amountTotal !== 'number' || amountTotal <= 0) {
          throw new Error(`Checkout completed with a non-positive amount (${String(amountTotal)})`);
        }

        const customerId = session.customer;
        const userId = await resolveUserId(
          session.client_reference_id,
          customerId,
          session.customer_email
        );

        if (!userId) {
          throw new Error('Could not resolve a profile for the completed checkout');
        }

        const patch: Record<string, unknown> = { subscription_status: 'active' };
        if (typeof customerId === 'string' && customerId) {
          patch.stripe_customer_id = customerId;
        }

        await applyStatus('id', userId, patch, 'checkout.session.completed');
        console.log('[stripe-webhook] subscription activated', { eventId: event.id, amountTotal });
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const rawStatus = typeof subscription.status === 'string' ? subscription.status : '';
        const mappedStatus = SUBSCRIPTION_STATUS_MAP[rawStatus] ?? 'none';
        const metadata = subscription.metadata as Record<string, unknown> | null;

        const userId = await resolveUserId(metadata?.user_id, subscription.customer, null);

        if (userId) {
          await applyStatus(
            'id',
            userId,
            { subscription_status: mappedStatus },
            `customer.subscription:${rawStatus}`
          );
        } else if (typeof subscription.customer === 'string') {
          await applyStatus(
            'stripe_customer_id',
            subscription.customer,
            { subscription_status: mappedStatus },
            `customer.subscription:${rawStatus}`
          );
        } else {
          console.warn('[stripe-webhook] subscription event without a customer', {
            eventId: event.id,
          });
        }

        console.log('[stripe-webhook] subscription status synced', {
          eventId: event.id,
          stripeStatus: rawStatus,
          appStatus: mappedStatus,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const metadata = subscription.metadata as Record<string, unknown> | null;

        const userId = await resolveUserId(metadata?.user_id, subscription.customer, null);

        if (userId) {
          await applyStatus(
            'id',
            userId,
            { subscription_status: 'cancelled' },
            'subscription.deleted'
          );
        } else if (typeof subscription.customer === 'string') {
          await applyStatus(
            'stripe_customer_id',
            subscription.customer,
            { subscription_status: 'cancelled' },
            'subscription.deleted'
          );
        }
        break;
      }

      default:
        console.log('[stripe-webhook] unhandled event type', { type: event.type });
    }

    const { error: markError } = await supabase
      .from('stripe_events')
      .update({ processed: true, error: null })
      .eq('stripe_event_id', event.id);

    if (markError) {
      console.error('[stripe-webhook] could not mark event processed', { markError });
    }

    return jsonResponse({ received: true }, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stripe-webhook] processing failed', { eventId: event.id, message });

    await supabase
      .from('stripe_events')
      .update({ error: message })
      .eq('stripe_event_id', event.id);

    // A non-2xx response tells Stripe to retry the delivery.
    return jsonError('Webhook processing failed', 500, req);
  }
});
