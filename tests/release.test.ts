import { it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../server/index";
import { db, dataDir } from "../server/store";
import { aiConfig } from "../server/settings";
import { unzipSync, strFromU8 } from "fflate";
import PDFDocument from "pdfkit";
import { PDFParse } from "pdf-parse";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
let owner: any, project: any, root: string;
const password = "release-test password 12345";
beforeAll(async () => {
  owner = request.agent(app);
  await owner
    .post("/api/auth/register")
    .send({ email: "release@example.com", password })
    .expect(200);
  project = (await owner.post("/api/projects/demo")).body;
  root = "/api/projects/" + project.id;
});
it("keeps AI optional and stores tenant-provided keys encrypted without returning them", async () => {
  expect((await owner.get("/api/settings/ai")).body.aiConfigured).toBe(false);
  const key = "sk-test-fixture-not-a-real-api-key";
  const result = await owner
    .put("/api/settings/ai")
    .send({ apiKey: key, model: "gpt-4.1-mini" })
    .expect(200);
  expect(JSON.stringify(result.body)).not.toContain(key);
  const stored = db
    .prepare("SELECT data FROM organization_settings WHERE org=?")
    .get(project.org) as any;
  expect(stored.data).not.toContain(key);
  expect(aiConfig(project.org).key).toBe(key);
  const other = request.agent(app);
  await other.post("/api/demo");
  expect((await other.get("/api/settings/ai")).body.aiConfigured).toBe(false);
  await owner.put("/api/settings/ai").send({ removeKey: true }).expect(200);
  expect(aiConfig(project.org).key).toBe("");
});
it("rotates passwords, revokes old sessions and permits one-time account recovery", async () => {
  const account = request.agent(app),
    email = "recover@example.com";
  await account
    .post("/api/auth/register")
    .send({ email, password })
    .expect(200);
  const second = request.agent(app);
  await second.post("/api/auth/login").send({ email, password }).expect(200);
  const codes = (
    await account
      .post("/api/account/recovery-codes")
      .send({ password })
      .expect(200)
  ).body.codes;
  expect(codes).toHaveLength(8);
  await account
    .post("/api/account/password")
    .send({ currentPassword: password, newPassword: password + "new" })
    .expect(200);
  await second.get("/api/projects").expect(401);
  const recovered = request.agent(app);
  await recovered
    .post("/api/recovery")
    .send({ email, code: codes[0], password: password + "recovered" })
    .expect(200);
  await recovered
    .post("/api/recovery")
    .send({ email, code: codes[0], password })
    .expect(401);
  await account.get("/api/projects").expect(401);
});
it("creates single-use team invitations and revokes access on removal", async () => {
  const invitedEmail = "invited@example.com";
  const invite = (
    await owner
      .post("/api/team/invitations")
      .send({ email: invitedEmail, role: "reviewer" })
      .expect(201)
  ).body;
  const member = request.agent(app);
  await member
    .post("/api/invitations/accept")
    .send({ email: invitedEmail, password, token: invite.token })
    .expect(201);
  await member.get(root).expect(200);
  await request(app)
    .post("/api/invitations/accept")
    .send({ email: invitedEmail, password, token: invite.token })
    .expect(400);
  const user = (await owner.get("/api/team")).body.find(
    (u: any) => u.email === invitedEmail,
  );
  await owner.delete("/api/team/" + user.id).expect(200);
  await member.get(root).expect(401);
});
it("supports an evidence-backed manual investigation, independent review and targeted reopening without AI", async () => {
  const inv = (
    await owner.post(root + "/investigations").send({
      name: "Professional review",
      scope: "Review the notice provision without AI",
    })
  ).body;
  const path = root + "/investigations/" + inv.id;
  const d = project.documents[0];
  const f = (
    await owner
      .post(path + "/manual-findings")
      .send({
        title: "Notice period",
        detail:
          "The contract requires notice within fourteen days. Entitlement is not determined.",
        kind: "finding",
        sources: [
          {
            documentId: d.id,
            page: 1,
            quote:
              "The contractor shall provide written notice of delay within 14 calendar days",
          },
        ],
      })
      .expect(201)
  ).body;
  expect(f.output.origin).toBe("human");
  await owner
    .post(path + "/review")
    .send({ nodeId: f.id, findingIndex: 0, decision: "accepted" })
    .expect(200);
  let p = (await owner.get(root)).body;
  expect(p.investigations.find((i: any) => i.id === inv.id).status).toBe(
    "completed",
  );
  await owner
    .post(path + "/reopen")
    .send({ reason: "Reconsider access evidence", nodeIds: [f.id] })
    .expect(200);
  p = (await owner.get(root)).body;
  const i = p.investigations.find((i: any) => i.id === inv.id);
  expect(i.nodes.find((n: any) => n.id === f.id).output.findings[0].stale).toBe(
    true,
  );
  await owner
    .post(path + "/review")
    .send({ nodeId: f.id, findingIndex: 0, decision: "accepted" })
    .expect(400);
  expect(i.versions.length).toBeGreaterThan(0);
});
it("imports real CSV schedule rows and retains unrelated cost inputs", async () => {
  const csv =
    "id,name,duration,delay,dependencies\nA,Prepare,2,0,\nB,Build,3,1,A\n";
  const d = (
    await owner
      .post(root + "/documents")
      .field("category", "schedule")
      .attach("file", Buffer.from(csv), "programme.csv")
      .expect(201)
  ).body;
  const imported = (
    await owner.post(root + "/calculations/import/" + d.id).expect(200)
  ).body;
  expect(imported.calculations.schedule).toMatchObject({
    baseline: 5,
    duration: 6,
    impact: 1,
  });
  expect(imported.calculations.cost.supported).toBe(428000);
});
it("decodes MIME/base64 email while preserving raw source bytes", async () => {
  const email =
    "From: supervisor@example.test\nTo: project@example.test\nSubject: Access restriction\nMIME-Version: 1.0\nContent-Type: text/plain; charset=utf-8\nContent-Transfer-Encoding: base64\n\n" +
    Buffer.from("Grid C access was closed on 11 September 2026.").toString(
      "base64",
    );
  const d = (
    await owner
      .post(root + "/documents")
      .field("category", "event")
      .attach("file", Buffer.from(email), "restriction.eml")
      .expect(201)
  ).body;
  expect(d.pages[0].text).toContain("Grid C access was closed");
  expect(d.extractionMethod).toBe("mime-decoded");
  expect((await owner.get(root + "/documents/" + d.id + "/file")).text).toBe(
    email,
  );
});
it("extracts real image text through local OCR in a bounded worker", async () => {
  const pdf = new PDFDocument({ size: [800, 300], margin: 40 });
  const chunks: Buffer[] = [];
  const ready = new Promise<Buffer>((r) => {
    pdf.on("data", (b) => chunks.push(b));
    pdf.on("end", () => r(Buffer.concat(chunks)));
  });
  pdf.fontSize(32).text("SITE ACCESS CLOSED");
  pdf.fontSize(22).text("11 September 2026");
  pdf.end();
  const parse = new PDFParse({ data: await ready });
  const png = (await parse.getScreenshot({ scale: 1.5 })).pages[0].data;
  await parse.destroy();
  const d = (
    await owner
      .post(root + "/documents")
      .field("category", "evidence")
      .attach("file", Buffer.from(png), {
        filename: "site-sign.png",
        contentType: "image/png",
      })
      .expect(201)
  ).body;
  expect(d.extractionMethod).toBe("ocr");
  expect(d.pages[0].text).toContain("SITE ACCESS CLOSED");
  expect(d.pages[0].confidence).toBeGreaterThan(60);
}, 30000);
it("exports original files and complete project records without credentials", async () => {
  const response = await owner
    .get(root + "/export")
    .buffer(true)
    .parse((res: any, cb: any) => {
      const b: Buffer[] = [];
      res.on("data", (c: Buffer) => b.push(c));
      res.on("end", () => cb(null, Buffer.concat(b)));
    })
    .expect(200);
  const zip = unzipSync(response.body);
  expect(zip["project.json"]).toBeDefined();
  const data = JSON.parse(strFromU8(zip["project.json"]));
  expect(data.org).toBeUndefined();
  expect(zip["originals/" + project.documents[0].id]).toBeDefined();
  expect(Object.keys(zip).some((n) => n.includes("key"))).toBe(false);
});
it("backs up and restores actual SQLite data and originals with checksum validation", () => {
  const base = mkdtempSync("/tmp/cause-backup-test-"),
    backup = resolve(base, "snapshot"),
    restored = resolve(base, "restored");
  execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/backup.ts", backup],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATA_DIR: dataDir },
      stdio: "pipe",
    },
  );
  execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/restore.ts", backup, restored],
    { cwd: process.cwd(), stdio: "pipe" },
  );
  expect(existsSync(resolve(restored, "cause.sqlite"))).toBe(true);
  expect(
    readFileSync(resolve(restored, project.documents[0].id), "utf8"),
  ).toContain("Contract §8.3");
  const manifest = JSON.parse(
    readFileSync(resolve(backup, "manifest.json"), "utf8"),
  );
  expect(manifest.files["cause.sqlite"]).toMatch(/^[a-f0-9]{64}$/);
}, 15000);
it("preserves all originals and metadata when uploads finish concurrently", async () => {
  const before = (await owner.get(root)).body.documents.length;
  const responses = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      owner
        .post(root + "/documents")
        .field("category", "evidence")
        .attach(
          "file",
          Buffer.from("Concurrent evidence record number " + i),
          "parallel-" + i + ".txt",
        ),
    ),
  );
  expect(responses.every((r) => r.status === 201)).toBe(true);
  expect((await owner.get(root)).body.documents.length).toBe(before + 5);
}, 15000);
it("closes an existing event stream immediately when team access is revoked", async () => {
  const invitation = (
    await owner
      .post("/api/team/invitations")
      .send({ email: "stream@example.com", role: "viewer" })
  ).body;
  const member = request.agent(app);
  const joined = await member
    .post("/api/invitations/accept")
    .send({ email: "stream@example.com", password, token: invitation.token });
  const cookie = joined.headers["set-cookie"][0].split(";")[0];
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address() as any;
  const response = await fetch(
    `http://127.0.0.1:${address.port}${root}/investigations/${project.investigations[0].id}/events`,
    { headers: { Cookie: cookie } },
  );
  const reader = response.body!.getReader();
  await reader.read();
  const u = (await owner.get("/api/team")).body.find(
    (u: any) => u.email === "stream@example.com",
  );
  await owner.delete("/api/team/" + u.id).expect(200);
  const { listeners } = await import("../server/engine");
  listeners
    .get(project.investigations[0].id)!
    .forEach((fn) => fn({ message: "Confidential event after revocation" }));
  expect((await reader.read()).done).toBe(true);
  await reader.cancel();
  await new Promise<void>((r) => server.close(() => r()));
});
