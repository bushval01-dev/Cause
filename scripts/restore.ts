import { DatabaseSync } from "node:sqlite";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  chmodSync,
} from "node:fs";
import { resolve, join, basename } from "node:path";
import { createHash } from "node:crypto";
const from = resolve(process.argv[2] || ""),
  to = resolve(process.argv[3] || "");
if (!process.argv[2] || !process.argv[3] || existsSync(to))
  throw Error(
    "Usage: npm run restore -- BACKUP NEW_DATA_DIRECTORY (target must not exist)",
  );
const manifest = JSON.parse(readFileSync(join(from, "manifest.json"), "utf8"));
if (manifest.version !== 1 || !manifest.files["cause.sqlite"])
  throw Error("Unsupported or incomplete backup");
for (const [name, checksum] of Object.entries(manifest.files)) {
  if (
    basename(name) !== name ||
    (!["cause.sqlite", ".master-key"].includes(name) &&
      !/^[a-f0-9-]{36}$/.test(name))
  )
    throw Error("Invalid backup file name");
  const content = readFileSync(join(from, name));
  if (createHash("sha256").update(content).digest("hex") !== checksum)
    throw Error("Checksum mismatch: " + name);
}
mkdirSync(to, { mode: 0o700 });
for (const name of Object.keys(manifest.files)) {
  copyFileSync(join(from, name), join(to, name));
  chmodSync(join(to, name), 0o600);
}
const db = new DatabaseSync(join(to, "cause.sqlite"));
const integrity = db.prepare("PRAGMA integrity_check").get() as any;
if (integrity.integrity_check !== "ok")
  throw Error("SQLite integrity check failed");
db.exec(
  "DELETE FROM sessions; DELETE FROM invitations; UPDATE jobs SET status='cancelled' WHERE status IN ('queued','running');",
);
db.close();
console.log(
  "Restore verified. Start CAUSE with DATA_DIR pointing to the restored directory. Sessions and invitations were revoked.",
);
