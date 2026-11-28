import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const validationUrl = "https://tgxrnrqxafytyqfwwsag.supabase.co";
const headers = {
  "access-control-allow-origin": "https://happysugar-system.github.io",
  "access-control-allow-headers": "authorization,apikey,content-type",
  "access-control-allow-methods": "OPTIONS,POST",
  "cache-control": "no-store",
};
const reply = (status: number, body: unknown) => Response.json(body, { status, headers });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply(405, { error: "method" });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("GF3_MYPAGE_LINE_CHANNEL_ID");
  if (Deno.env.get("SUPABASE_URL") !== validationUrl || !serviceKey || !clientId) {
    return reply(503, { error: "validation_unconfigured" });
  }
  try {
    const { line_id_token } = await request.json();
    if (typeof line_id_token !== "string" || line_id_token.length > 5000) {
      return reply(400, { error: "token" });
    }
    const verification = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      body: new URLSearchParams({ id_token: line_id_token, client_id: clientId }),
      signal: AbortSignal.timeout(10000),
    });
    if (!verification.ok) return reply(401, { error: "identity" });
    const { sub } = await verification.json();
    if (typeof sub !== "string" || !sub) return reply(401, { error: "identity" });
    const db = createClient(validationUrl, serviceKey, { auth: { persistSession: false } });
    const links = await db.from("gf_line_auth_role_links").select("subject_id")
      .eq("line_user_id", sub).eq("role_type", "driver").eq("status", "active").limit(2);
    if (links.error) return reply(503, { error: "driver_lookup" });
    if (links.data.length !== 1 || links.data[0].subject_id !== "D999902") {
      return reply(403, { error: "validation_driver_required" });
    }
    const driverId = links.data[0].subject_id;
    const [vehicle, delivered] = await Promise.all([
      db.from("gf_vehicles_test").select("vehicle_id,vehicle_number,vehicle_data")
        .eq("vehicle_id", "V900005").eq("vehicle_data->>DriverID", driverId).maybeSingle(),
      db.from("gf3_actual_receipts_test").select("actual_date")
        .eq("application_id", "2").eq("vehicle_id", "V900005").eq("driver_id", driverId)
        .eq("kind", "納車完了").eq("state", "完了")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (vehicle.error || delivered.error) return reply(503, { error: "validation_read" });
    if (!vehicle.data) return reply(200, { vehicles: [], vehicle_progress: null });
    const fields = vehicle.data.vehicle_data;
    return reply(200, {
      vehicles: [{ vehicle_id: vehicle.data.vehicle_id, vehicle_number: vehicle.data.vehicle_number }],
      vehicle_progress: {
        stage: fields["管理区分"] || null,
        delivery_available_date: fields["納車可能日"] || null,
        delivery_confirmed_date: fields["納車確定日"] || null,
        delivery_planned_date: fields["納車予定日"] || null,
        delivered_date: delivered.data&&fields["区分/ステータス"]==="貸出中"&&fields["引渡し"]===delivered.data.actual_date
          ? delivered.data.actual_date : null,
      },
    });
  } catch {
    return reply(503, { error: "validation_read" });
  }
});
