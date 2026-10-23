import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, Stripe-Signature",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!stripeSecretKey || !webhookSecret) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.text();
  const signature = req.headers.get("Stripe-Signature");

  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing signature" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify webhook signature
  let event;
  try {
    event = await verifyStripeSignature(body, signature, webhookSecret, stripeSecretKey);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Invalid signature", detail: err instanceof Error ? err.message : "Unknown" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Idempotency check
  const { data: existingEvent } = await supabase
    .from("stripe_events")
    .select("id, processed")
    .eq("stripe_event_id", event.id)
    .single();

  if (existingEvent?.processed) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Log event
  await supabase.from("stripe_events").upsert({
    stripe_event_id: event.id,
    event_type: event.type,
    processed: false,
  }, { onConflict: "stripe_event_id" });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const customerId = session.customer;
        const customerEmail = session.customer_email;

        // Find user by stripe_customer_id or email
        let { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (!profile && customerEmail) {
          const { data: emailProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("email", customerEmail)
            .single();
          profile = emailProfile;

          if (profile) {
            await supabase
              .from("profiles")
              .update({ stripe_customer_id: customerId })
              .eq("id", profile.id);
          }
        }

        if (profile) {
          await supabase
            .from("profiles")
            .update({ subscription_status: "active" })
            .eq("id", profile.id);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const status = subscription.status;

        const statusMap: Record<string, string> = {
          active: "active",
          past_due: "past_due",
          canceled: "cancelled",
          unpaid: "revoked",
          incomplete: "none",
          trialing: "trialing",
        };

        const mappedStatus = statusMap[status] ?? "none";

        await supabase
          .from("profiles")
          .update({ subscription_status: mappedStatus })
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        await supabase
          .from("profiles")
          .update({ subscription_status: "cancelled" })
          .eq("stripe_customer_id", customerId);
        break;
      }
    }

    // Mark as processed
    await supabase
      .from("stripe_events")
      .update({ processed: true })
      .eq("stripe_event_id", event.id);

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    await supabase
      .from("stripe_events")
      .update({ error: err instanceof Error ? err.message : "Unknown error" })
      .eq("stripe_event_id", event.id);

    return new Response(
      JSON.stringify({ error: "Webhook processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
  _stripeKey: string
): Promise<{ id: string; type: string; data: { object: Record<string, unknown> } }> {
  const parts = signature.split(",");
  const sigMap: Record<string, string> = {};
  for (const part of parts) {
    const [key, value] = part.split("=");
    sigMap[key] = value;
  }

  const timestamp = sigMap["t"];
  const sig = sigMap["v1"];

  if (!timestamp || !sig) {
    throw new Error("Invalid signature format");
  }

  const signedPayload = `${timestamp}.${payload}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const expectedSig = await crypto.subtle.sign("HMAC", key, enc.encode(signedPayload));
  const expectedHex = Array.from(new Uint8Array(expectedSig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (sig !== expectedHex) {
    throw new Error("Signature verification failed");
  }

  // Check timestamp freshness (5 minutes)
  const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (age > 300) {
    throw new Error("Webhook timestamp too old");
  }

  return JSON.parse(payload);
}
