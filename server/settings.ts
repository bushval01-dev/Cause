import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { db, dataDir } from "./store.js";
db.exec(`CREATE TABLE IF NOT EXISTS organization_settings(org TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS recovery_codes(userId TEXT NOT NULL,code TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS invitations(token TEXT PRIMARY KEY,org TEXT NOT NULL,email TEXT NOT NULL,role TEXT NOT NULL,expires INTEGER NOT NULL);`);
function master() {
  if (process.env.CAUSE_ENCRYPTION_KEY) {
    const b = Buffer.from(process.env.CAUSE_ENCRYPTION_KEY, "base64");
    if (b.length !== 32)
      throw Error("CAUSE_ENCRYPTION_KEY must encode exactly 32 bytes");
    return b;
  }
  const path = resolve(dataDir, ".master-key");
  try {
    writeFileSync(path, randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
  }
  const key = readFileSync(path);
  if (key.length !== 32) throw Error("Invalid encryption master key");
  return key;
}
function encrypt(value: string) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", master(), iv);
  const encrypted = Buffer.concat([c.update(value, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), encrypted]).toString("base64");
}
function decrypt(value: string) {
  const b = Buffer.from(value, "base64"),
    c = createDecipheriv("aes-256-gcm", master(), b.subarray(0, 12));
  c.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString("utf8");
}
export function settings(org: string): any {
  const row = db
    .prepare("SELECT data FROM organization_settings WHERE org=?")
    .get(org) as any;
  return row ? JSON.parse(row.data) : {};
}
export function saveSettings(org: string, patch: any) {
  const next = { ...settings(org), ...patch };
  if ("apiKey" in patch) {
    next.encryptedKey = patch.apiKey ? encrypt(patch.apiKey) : undefined;
    delete next.apiKey;
  }
  db.prepare(
    "INSERT INTO organization_settings VALUES(?,?) ON CONFLICT(org) DO UPDATE SET data=excluded.data",
  ).run(org, JSON.stringify(next));
}
export function aiConfig(org: string) {
  const s = settings(org);
  return {
    key:
      s.enabled === false
        ? ""
        : s.encryptedKey
          ? decrypt(s.encryptedKey)
          : process.env.CAUSE_AI_KEY || process.env.OPENAI_API_KEY || "",
    model: s.model || process.env.OPENAI_MODEL || "gpt-4.1-mini",
    inputRate: s.inputRate ?? null,
    outputRate: s.outputRate ?? null,
  };
}
export function publicSettings(org: string) {
  const s = settings(org),
    hasServer = !!(process.env.CAUSE_AI_KEY || process.env.OPENAI_API_KEY);
  return {
    aiConfigured: s.enabled !== false && !!(s.encryptedKey || hasServer),
    enabled: s.enabled !== false,
    model: s.model || process.env.OPENAI_MODEL || "gpt-4.1-mini",
    keySource: s.encryptedKey ? "organization" : hasServer ? "server" : "none",
    inputRate: s.inputRate ?? null,
    outputRate: s.outputRate ?? null,
  };
}
