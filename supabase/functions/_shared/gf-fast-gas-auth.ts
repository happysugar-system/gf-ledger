/**
 * GF fast-intake server-auth primitives — NOT DEPLOYED.
 * Shared by the future server-to-server Edge Function. Never expose the secret
 * to GitHub Pages or any browser. Authentication alone is NOT a complete intake API.
 */
export type GasEnvelope = {
  timestamp: number;
  nonce: string;
  requestId: string;
  receipt: string;
  lineUserId: string;\n  residentMethod: 'upload' | 'mail';
  signature: string;
};
const encoder = new TextEncoder();
export const isValidEnvelope = (v: unknown): v is GasEnvelope => {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return Number.isSafeInteger(p.timestamp) &&
    typeof p.nonce === "string" && /^[0-9a-f-]{36}$/i.test(p.nonce) &&
    typeof p.requestId === "string" && /^[0-9a-f]{64}$/i.test(p.requestId) &&
    typeof p.receipt === "string" && /^[A-Za-z0-9-]{4,100}$/.test(p.receipt) &&
    typeof p.lineUserId === "string" && /^U[0-9a-f]{32}$/i.test(p.lineUserId) &&
    (p.residentMethod === 'upload' || p.residentMethod === 'mail') &&\n    typeof p.signature === "string" && /^[0-9a-f]{64}$/i.test(p.signature);
};
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const decodeHex = (s: string) => Uint8Array.from(s.match(/.{2}/g)!, b => parseInt(b, 16));
export async function verifyGasEnvelope(
  raw: unknown, secret: string, nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!isValidEnvelope(raw) || secret.length < 48) return false;
  if (Math.abs(nowSeconds - raw.timestamp) > 120) return false;
  const msg = [String(raw.timestamp), raw.nonce, raw.requestId, raw.receipt, raw.lineUserId, raw.residentMethod].join("\n");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, decodeHex(raw.signature), encoder.encode(msg));
}
/** Derive a non-reversible request key; NEVER persist raw LINE IDs in logs. */
export async function requestKeyHash(requestId: string): Promise<string> {
  if (!/^[a-f0-9]{64}$/i.test(requestId)) throw new Error("invalid_request_id");
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(requestId.toLowerCase()))));
}
/**
 * REQUIRED BEFORE PUBLIC USE:
 * - Persist and atomically consume nonce (prevent replay within 120 s).
 * - Bind verified LINE identity + requestId to an immutable server-issued receipt.
 * - Issue short-lived upload capability bound to receipt and allowed document types.
 * - Validate file bytes, sizes, hashes; verify private storage durability.
 * - Keep GF115 and Drive worker idempotent; fail closed.
 */
