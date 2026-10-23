import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError("Authentication required", 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData.user) {
      return jsonError("Invalid authentication", 401);
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email;

    // Get system settings for price
    const { data: settings, error: settingsError } = await supabase
      .from("system_settings")
      .select("subscription_price_cents")
      .eq("id", 1)
      .single();

    if (settingsError || !settings) {
      return jsonError("Failed to load pricing settings", 500);
    }

    const body = await req.json().catch(() => ({}));
    const priceCents = body.price_cents ?? settings.subscription_price_cents;

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    let customerId = profile?.stripe_customer_id;

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return jsonError("Stripe not configured", 500);
    }

    if (!customerId) {
      const customerRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ email: userEmail ?? "" }),
      });
      const customer = await customerRes.json();
      customerId = customer.id;

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);
    }

    // Create checkout session
    const origin = req.headers.get("origin") || "http://localhost:5173";
    const checkoutRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        mode: "subscription",
        customer: customerId,
        "line_items[0][price_data][currency]": "cad",
        "line_items[0][price_data][recurring][interval]": "month",
        "line_items[0][price_data][unit_amount]": String(priceCents),
        "line_items[0][price_data][product_data][name]": "PharmaFlow Pro",
        "line_items[0][quantity]": "1",
        success_url: `${origin}/dashboard?checkout=success`,
        cancel_url: `${origin}/dashboard?checkout=cancelled`,
        "subscription_data[description]": `Monthly subscription at $${(priceCents / 100).toFixed(2)} CAD/month. Auto-renews monthly until cancelled. Cancel anytime from Settings. Complies with Canadian consumer protection laws.`,
        "payment_intent_data[description]": "PharmaFlow Pro Subscription - Canadian users",
      }),
    });

    const session = await checkoutRes.json();

    if (!session.url) {
      return jsonError("Failed to create checkout session", 500);
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Internal error", 500);
  }
});

function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
