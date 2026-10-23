import { randomUUID } from "node:crypto";
import { db, getProject, saveProject } from "./store.js";
import { execute, running } from "./engine.js";
db.exec(`CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,org TEXT NOT NULL,projectId TEXT NOT NULL,invId TEXT NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL,error TEXT);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status,createdAt);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_active_inv ON jobs(invId) WHERE status IN ('queued','running');`);
let timer: ReturnType<typeof setInterval> | undefined;
export function projectBusy(id: string) {
  return !!db
    .prepare(
      "SELECT id FROM jobs WHERE projectId=? AND status IN ('queued','running')",
    )
    .get(id);
}
export function enqueue(p: any, i: any, mode: string) {
  if (
    (
      db
        .prepare(
          "SELECT count(*) AS n FROM jobs WHERE org=? AND status IN ('queued','running')",
        )
        .get(p.org) as any
    ).n >= 20
  )
    throw Error("Investigation queue limit reached");
  if (projectBusy(p.id))
    throw Error("Project already has a queued or running investigation");
  const id = randomUUID(),
    at = new Date().toISOString();
  db.prepare("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,NULL)").run(
    id,
    p.org,
    p.id,
    i.id,
    mode,
    "queued",
    at,
    at,
  );
  i.status = "queued";
  i.events.push({
    id: randomUUID(),
    at,
    message: "Investigation queued for background execution",
  });
  saveProject(p);
  if (process.env.NODE_ENV === "test") queueMicrotask(() => void pump());
  return id;
}
export function cancelJob(p: any, i: any) {
  const job = db
    .prepare(
      "SELECT id,status FROM jobs WHERE invId=? AND status IN ('queued','running')",
    )
    .get(i.id) as any;
  if (job?.status === "queued") {
    db.prepare("UPDATE jobs SET status='cancelled',updatedAt=? WHERE id=?").run(
      new Date().toISOString(),
      job.id,
    );
    i.status = "cancelled";
    saveProject(p);
  }
  running.get(i.id)?.abort();
}
async function pump() {
  const active = db
    .prepare("SELECT count(*) AS n FROM jobs WHERE status='running'")
    .get() as any;
  if (active.n >= 8) return;
  const queued = db
    .prepare(
      "SELECT * FROM jobs WHERE status='queued' ORDER BY createdAt LIMIT 40",
    )
    .all() as any[];
  for (const job of queued) {
    const orgActive = db
      .prepare(
        "SELECT count(*) AS n FROM jobs WHERE org=? AND status='running'",
      )
      .get(job.org) as any;
    if (orgActive.n >= 2 || running.size >= 8) continue;
    const p = getProject(job.projectId, job.org),
      i = p?.investigations.find((v: any) => v.id === job.invId);
    if (!p || !i) {
      db.prepare(
        "UPDATE jobs SET status='failed',error='Project or investigation missing' WHERE id=?",
      ).run(job.id);
      continue;
    }
    db.prepare(
      "UPDATE jobs SET status='running',updatedAt=? WHERE id=? AND status='queued'",
    ).run(new Date().toISOString(), job.id);
    void execute(p, i, job.mode === "calculations")
      .then(() => {
        db.prepare("UPDATE jobs SET status=?,updatedAt=? WHERE id=?").run(
          i.status === "failed"
            ? "failed"
            : i.status === "cancelled"
              ? "cancelled"
              : "completed",
          new Date().toISOString(),
          job.id,
        );
      })
      .catch((e: any) => {
        i.status = "failed";
        i.events.push({
          id: randomUUID(),
          at: new Date().toISOString(),
          message: e.message,
        });
        saveProject(p);
        db.prepare(
          "UPDATE jobs SET status='failed',updatedAt=?,error=? WHERE id=?",
        ).run(new Date().toISOString(), e.message, job.id);
      });
  }
}
export function startJobs() {
  db.prepare(
    "UPDATE jobs SET status='queued',updatedAt=? WHERE status='running'",
  ).run(new Date().toISOString());
  timer = setInterval(() => void pump(), 250);
  timer.unref();
  void pump();
}
export function stopJobs() {
  if (timer) clearInterval(timer);
  for (const controller of running.values()) controller.abort();
}
