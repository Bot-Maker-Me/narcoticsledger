import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { CDSA_REFERENCE_B64 } from "../_shared/cdsaReferenceData.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReferenceEntry {
  din: string;
  description: string;
  strength: string;
  schedule: string;
}

let index: Map<string, ReferenceEntry> | null = null;

/** Decodes the bundled reference once per instance. */
function getIndex(): Map<string, ReferenceEntry> {
  if (index) return index;

  const binary = atob(CDSA_REFERENCE_B64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const rows = JSON.parse(new TextDecoder().decode(bytes)) as string[][];

  const map = new Map<string, ReferenceEntry>();
  for (const row of rows) {
    const din = String(row[0] ?? "").replace(/\D/g, "");
    if (!din) continue;
    map.set(din, {
      din,
      description: String(row[1] ?? ""),
      strength: String(row[2] ?? ""),
      schedule: String(row[3] ?? ""),
    });
  }

  console.log(`[din-reference] reference loaded: ${map.size} DINs`);
  index = map;
  return map;
}

/**
 * Candidate keys for a DIN. Supplier exports often drop the leading zeros of an 8 digit
 * DIN, so the exact value, progressively zero-padded values and the trimmed value are
 * all tried.
 */
function dinCandidates(raw: string): string[] {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return [];

  const candidates: string[] = [digits];
  for (let length = digits.length + 1; length <= 8; length += 1) {
    candidates.push(digits.padStart(length, "0"));
  }
  candidates.push(digits.padStart(8, "0"));

  const trimmed = digits.replace(/^0+/, "");
  if (trimmed && trimmed !== digits) {
    candidates.push(trimmed, trimmed.padStart(8, "0"));
  }

  return candidates;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.error("[din-reference] rejected: missing authorization header");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    console.error("[din-reference] rejected: invalid token", userError?.message);
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: { dins?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const requested = Array.isArray(body.dins) ? body.dins.slice(0, 2000) : [];
  const map = getIndex();

  const entries: ReferenceEntry[] = [];
  const seen = new Set<string>();

  for (const raw of requested) {
    for (const candidate of dinCandidates(String(raw ?? ""))) {
      const match = map.get(candidate);
      if (match) {
        if (!seen.has(match.din)) {
          seen.add(match.din);
          entries.push(match);
        }
        break;
      }
    }
  }

  console.log(`[din-reference] looked up ${requested.length} DINs, matched ${entries.length}`);
  return jsonResponse({ entries });
});
