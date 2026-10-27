import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { jsonError, jsonResponse, preflight } from '../_shared/cors.ts';

/**
 * Opens the Stripe billing portal for the signed-in user, which is where a subscription
 * is actually cancelled and the payment method changed.
 *
 * The paywall and the terms both promise "cancel anytime from Settings"; before this
 * function existed there was no way to cancel at all, which is a consumer-protection
 * problem for a paid product.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return jsonError('Method not allowed', 405, req);

  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      console.error('[stripe-portal] STRIPE_SECRET_KEY is not configured');
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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userData.user.id)
      .single();

    if (profileError) {
      console.error('[stripe-portal] failed to load profile', { profileError });
      return jsonError('Failed to load your account', 500, req);
    }

    if (!profile?.stripe_customer_id) {
      return jsonError('No billing account on file yet. Subscribe first.', 409, req);
    }

    const appUrl = Deno.env.get('APP_URL') ?? req.headers.get('origin') ?? 'http://localhost:5173';

    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: profile.stripe_customer_id,
        return_url: `${appUrl}/settings`,
      }),
    });

    if (!portalRes.ok) {
      console.error('[stripe-portal] Stripe portal session creation failed', {
        status: portalRes.status,
        body: await portalRes.text(),
      });
      return jsonError('Failed to open the billing portal', 502, req);
    }

    const session = await portalRes.json();
    if (!session.url) return jsonError('Failed to open the billing portal', 502, req);

    return jsonResponse({ url: session.url }, 200, req);
  } catch (err) {
    console.error('[stripe-portal] unexpected error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonError('Internal error', 500, req);
  }
});
