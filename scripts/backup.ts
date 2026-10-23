import { DatabaseSync, backup } from "node:sqlite";
import {
  mkdirSync,
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
const source = resolve(process.env.DATA_DIR || ".data"),
  destination = resolve(process.argv[2] || "");
if (
  !process.argv[2] ||
  destination === source ||
  destination.startsWith(source + "/")
)
  throw Error("Provide a new backup directory outside DATA_DIR");
mkdirSync(destination, { recursive: false, mode: 0o700 });
const db = new DatabaseSync(join(source, "cause.sqlite"));
db.exec("PRAGMA busy_timeout=5000");
// Begin a read snapshot before backing up metadata. Originals are immutable UUID files.
await backup(db, join(destination, "cause.sqlite"));
db.close();
const snapshot = new DatabaseSync(join(destination, "cause.sqlite"), {
  readOnly: true,
});
const ids = new Set<string>();
for (const row of snapshot.prepare("SELECT data FROM projects").all() as any[])
  for (const d of JSON.parse(row.data).documents) ids.add(d.id);
snapshot.close();
const manifest: any = {
  version: 1,
  createdAt: new Date().toISOString(),
  files: {},
};
for (const name of ["cause.sqlite", ".master-key", ...ids]) {
  const path = join(source, name);
  if (name === "cause.sqlite") {
    manifest.files[name] = createHash("sha256")
      .update(readFileSync(join(destination, name)))
      .digest("hex");
    continue;
  }
  if (!existsSync(path)) {
    if (name === ".master-key") continue;
    throw Error("Original missing; backup is incomplete: " + name);
  }
  copyFileSync(path, join(destination, name));
  chmodSync(join(destination, name), 0o600);
  manifest.files[name] = createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
}
writeFileSync(
  join(destination, "manifest.json"),
  JSON.stringify(manifest, null, 2),
  { mode: 0o600 },
);
console.log(
  `Backup complete: ${ids.size} originals. Preserve this directory securely; it contains account data and may contain the credential encryption key.`,
);
