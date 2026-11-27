import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { requestKeyHash } from "../_shared/gf-fast-gas-auth.ts";

const bucket = "gf-secure-intake-staging";
const encoder = new TextEncoder();
const json = (status: number, body: object) => Response.json(body, {
  status, headers: { "cache-control": "no-store" },
});

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method" });
  const secret = Deno.env.get("GF_FAST_INTAKE_SECRET") ?? "";
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key || secret.length < 48) return json(503, { error: "configuration" });
  const auth = req.headers.get("authorization") ?? "";
  if (auth.length > 512) return json(401, { error: "authorization" });
  const hmac = await crypto.subtle.importKey("raw", encoder.encode(secret), {
    name: "HMAC", hash: "SHA-256",
  }, false, ["sign", "verify"]);
  const expected = await crypto.subtle.sign("HMAC", hmac, encoder.encode("Bearer " + secret));
  if (!await crypto.subtle.verify("HMAC", hmac, expected, encoder.encode(auth))) {
    return json(401, { error: "authorization" });
  }

  // Only the private GAS bridge uses this endpoint. It never accepts a storage path.
  const body = await req.text();
  if (body.length > 512) return json(413, { error: "size" });
  let params;
  try { params = JSON.parse(body); } catch { return json(400, { error: "json" }); }
  const { requestId, receipt, action, kind } = params ?? {};
  if (![requestId, receipt, action, kind].every((v) => typeof v === "string")) {
    return json(400, { error: "parameters" });
  }
  if (!/^[a-f0-9]{64}$/i.test(requestId) || !/^TEST145-\d{14}-[a-f0-9]{8}$/i.test(receipt) ||
      !["read", "cleanup"].includes(action)) return json(400, { error: "parameters" });
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: session, error } = await db.from("gf_fast_upload_sessions_test")
    .select("id,resident_method").eq("request_key_hash", await requestKeyHash(requestId))
    .eq("gas_receipt", receipt).maybeSingle();
  if (error) return json(503, { error: "session" });
  if (!session) return json(404, { error: "session" });
  const { data: docs, error: lookupError } = await db.from("gf_fast_upload_documents_test")
    .select("document_type,object_path,sha256,bytes").eq("session_id", session.id);
  if (lookupError) return json(503, { error: "documents" });
  const required = ["license_front", "license_back"];
  if (session.resident_method === "upload") required.push("resident_pdf");
  const files = required.map((type) => docs.find((doc) =>
    doc.document_type === type && doc.object_path === "fast-test/" + session.id + "/" + type));
  if (files.some((file) => !file)) return json(409, { error: "incomplete" });
  const storage = db.storage.from(bucket);
  if (action === "cleanup") {
    const { error: removeError } = await storage.remove(files.map((file) => file!.object_path));
    return removeError ? json(503, { error: "cleanup" }) : json(200, { ok: true });
  }
  const file = files.find((entry) => entry?.document_type === kind);
  if (!file) return json(400, { error: "document_type" });
  const { data: blob, error: downloadError } = await storage.download(file.object_path);
  if (downloadError || !blob) return json(503, { error: "download" });
  const bytes = await blob.arrayBuffer();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (bytes.byteLength !== file.bytes || digest !== file.sha256) return json(409, { error: "checksum" });
  return new Response(bytes, { headers: { "content-type": blob.type, "cache-control": "no-store" } });
});
