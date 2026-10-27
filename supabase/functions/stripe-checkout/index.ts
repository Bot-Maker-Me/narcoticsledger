import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { jsonError, jsonResponse, preflight } from '../_shared/cors.ts';

/**
 * Starts a Stripe Checkout session for the signed-in user.
 *
 * The price is read from `system_settings` on the server and is never taken from the
 * request body: the previous version accepted `body.price_cents`, so any authenticated
 * user could subscribe for a cent. The session is also bound to the user with
 * `client_reference_id` so the webhook never has to guess who paid.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return jsonError('Method not allowed', 405, req);

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('[stripe-checkout] STRIPE_SECRET_KEY is not configured');
      return jsonError('Stripe is not configured', 500, req);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError('Authentication required', 401, req);

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) return jsonError('Invalid authentication', 401, req);

    const userId = userData.user.id;
    const userEmail = userData.user.email;

    // Price and interval come from the database, never from the caller.
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('subscription_price_cents')
      .eq('id', 1)
      .single();

    if (settingsError || !settings) {
      console.error('[stripe-checkout] failed to load pricing settings', { settingsError });
      return jsonError('Failed to load pricing settings', 500, req);
    }

    const priceCents = settings.subscription_price_cents;
    if (!Number.isInteger(priceCents) || priceCents <= 0) {
      console.error('[stripe-checkout] configured price is invalid', { priceCents });
      return jsonError('Subscription price is not configured', 500, req);
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('[stripe-checkout] failed to load profile', { profileError });
      return jsonError('Failed to load your account', 500, req);
    }

    let customerId = profile?.stripe_customer_id ?? null;

    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          email: userEmail ?? '',
          'metadata[user_id]': userId,
        }),
      });

      if (!customerRes.ok) {
        console.error('[stripe-checkout] Stripe customer creation failed', {
          status: customerRes.status,
          body: await customerRes.text(),
        });
        return jsonError('Failed to create billing customer', 502, req);
      }

      const customer = await customerRes.json();
      customerId = customer.id;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (updateError) {
        console.error('[stripe-checkout] failed to store customer id', { updateError });
      }
    }

    // Prefer a configured app URL so the redirect target cannot be influenced by a
    // spoofed Origin header.
    const appUrl = Deno.env.get('APP_URL') ?? req.headers.get('origin') ?? 'http://localhost:5173';

    const checkoutRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        mode: 'subscription',
        customer: customerId,
        client_reference_id: userId,
        'subscription_data[metadata][user_id]': userId,
        'line_items[0][price_data][currency]': 'cad',
        'line_items[0][price_data][recurring][interval]': 'month',
        'line_items[0][price_data][unit_amount]': String(priceCents),
        'line_items[0][price_data][product_data][name]': 'Narcotics Ledger Pro',
        'line_items[0][quantity]': '1',
        success_url: `${appUrl}/dashboard?checkout=success`,
        cancel_url: `${appUrl}/dashboard?checkout=cancelled`,
        'subscription_data[description]':
          `Monthly subscription at $${(priceCents / 100).toFixed(2)} CAD/month. ` +
          'Auto-renews monthly until cancelled. Cancel anytime from Settings.',
      }),
    });

    if (!checkoutRes.ok) {
      console.error('[stripe-checkout] Stripe checkout session creation failed', {
        status: checkoutRes.status,
        body: await checkoutRes.text(),
      });
      return jsonError('Failed to create checkout session', 502, req);
    }

    const session = await checkoutRes.json();
    if (!session.url) return jsonError('Failed to create checkout session', 502, req);

    return jsonResponse({ url: session.url }, 200, req);
  } catch (err) {
    console.error('[stripe-checkout] unexpected error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonError('Internal error', 500, req);
  }
});
