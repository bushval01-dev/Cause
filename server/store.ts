import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
export const dataDir = resolve(process.env.DATA_DIR || ".data");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
export const db = new DatabaseSync(resolve(dataDir, "cause.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,org TEXT NOT NULL,role TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,userId TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,org TEXT NOT NULL,name TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0,data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS project_org ON projects(org,archived);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,org TEXT NOT NULL,actor TEXT NOT NULL,event TEXT NOT NULL,at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS audit_org ON audit(org,id);
CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);`);
export function audit(org: string, actor: string, event: string) {
  db.prepare("INSERT INTO audit(org,actor,event,at) VALUES(?,?,?,?)").run(
    org,
    actor,
    event,
    new Date().toISOString(),
  );
}
export function projects(org: string) {
  return db
    .prepare("SELECT data FROM projects WHERE org=? ORDER BY rowid DESC")
    .all(org)
    .map((r: any) => JSON.parse(r.data));
}
export function getProject(id: string, org: string) {
  const r = db
    .prepare("SELECT data FROM projects WHERE id=? AND org=?")
    .get(id, org) as any;
  return r ? JSON.parse(r.data) : null;
}
export function saveProject(p: any) {
  db.prepare(
    "INSERT INTO projects(id,org,name,archived,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,archived=excluded.archived,data=excluded.data",
  ).run(p.id, p.org, p.name, p.archived ? 1 : 0, JSON.stringify(p));
}
