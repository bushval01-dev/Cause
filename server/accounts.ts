import type express from "express";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { z } from "zod";
import { db, audit } from "./store.js";
import { publicSettings, saveSettings } from "./settings.js";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const password = z.string().min(12).max(256);
function encoded(p: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(p, salt, 64).toString("hex");
}
function matches(p: string, stored: string) {
  const [salt, hash] = stored.split(":");
  return (
    !!hash &&
    hash.length === 128 &&
    timingSafeEqual(scryptSync(p, salt, 64), Buffer.from(hash, "hex"))
  );
}
export function publicAccountRoutes(
  app: express.Express,
  limit: any,
  session: (res: express.Response, id: string) => any,
) {
  app.post("/api/recovery", limit, (req, res) => {
    const v = z
      .object({ email: z.email(), code: z.string().min(16).max(200), password })
      .parse(req.body);
    const u = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(v.email.toLowerCase()) as any;
    const code = db
      .prepare("SELECT userId FROM recovery_codes WHERE code=?")
      .get(digest(v.code)) as any;
    if (!u || !code || code.userId !== u.id) {
      res.status(401).json({ error: "Invalid email or recovery code" });
      return;
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM recovery_codes WHERE code=?").run(digest(v.code));
      db.prepare("UPDATE users SET password=? WHERE id=?").run(
        encoded(v.password),
        u.id,
      );
      db.prepare("DELETE FROM sessions WHERE userId=?").run(u.id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    session(res, u.id);
    audit(u.org, u.id, "Password recovered; existing sessions revoked");
    res.json({ ok: true });
  });
  app.post("/api/invitations/accept", limit, (req, res) => {
    const v = z
      .object({ token: z.string().length(64), email: z.email(), password })
      .parse(req.body);
    const invite = db
      .prepare("SELECT * FROM invitations WHERE token=? AND expires>?")
      .get(digest(v.token), Date.now()) as any;
    if (!invite || invite.email !== v.email.toLowerCase()) {
      res.status(400).json({ error: "Invitation is invalid or expired" });
      return;
    }
    if (db.prepare("SELECT id FROM users WHERE email=?").get(invite.email)) {
      res.status(409).json({
        error:
          "This email already has an account. Use a separate email for this organization.",
      });
      return;
    }
    const id = randomUUID();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(
        id,
        invite.email,
        encoded(v.password),
        invite.org,
        invite.role,
      );
      db.prepare("DELETE FROM invitations WHERE token=?").run(digest(v.token));
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    session(res, id);
    audit(invite.org, id, "Invitation accepted");
    res.status(201).json({ ok: true });
  });
}
export function accountRoutes(
  app: express.Express,
  session: (res: express.Response, id: string) => any,
) {
  app.get("/api/settings/ai", (req, res) =>
    res.json(publicSettings((req as any).user.org)),
  );
  app.put("/api/settings/ai", (req, res) => {
    const u = (req as any).user;
    if (u.role !== "owner") {
      res.status(403).json({ error: "Only owners can configure AI" });
      return;
    }
    const v = z
      .object({
        apiKey: z.string().min(20).max(500).optional(),
        removeKey: z.boolean().optional(),
        enabled: z.boolean().optional(),
        model: z
          .string()
          .regex(/^[a-zA-Z0-9_.:-]+$/)
          .max(100)
          .optional(),
        inputRate: z.number().min(0).max(10000).nullable().optional(),
        outputRate: z.number().min(0).max(10000).nullable().optional(),
      })
      .parse(req.body);
    const { removeKey, ...patch } = v;
    if (removeKey) (patch as any).apiKey = "";
    saveSettings(u.org, patch);
    audit(u.org, u.id, "AI configuration updated (credential values excluded)");
    res.json(publicSettings(u.org));
  });
  app.post("/api/account/password", (req, res) => {
    const u = (req as any).user;
    const v = z
      .object({ currentPassword: password, newPassword: password })
      .parse(req.body);
    const record = db
      .prepare("SELECT password FROM users WHERE id=?")
      .get(u.id) as any;
    if (!matches(v.currentPassword, record.password)) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }
    db.prepare("UPDATE users SET password=? WHERE id=?").run(
      encoded(v.newPassword),
      u.id,
    );
    db.prepare("DELETE FROM sessions WHERE userId=?").run(u.id);
    session(res, u.id);
    audit(u.org, u.id, "Password changed; other sessions revoked");
    res.json({ ok: true });
  });
  app.post("/api/account/recovery-codes", (req, res) => {
    const u = (req as any).user;
    const v = z.object({ password }).parse(req.body);
    const record = db
      .prepare("SELECT password FROM users WHERE id=?")
      .get(u.id) as any;
    if (!matches(v.password, record.password)) {
      res.status(401).json({ error: "Password is incorrect" });
      return;
    }
    const codes = Array.from({ length: 8 }, () =>
      randomBytes(16).toString("hex"),
    );
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM recovery_codes WHERE userId=?").run(u.id);
      for (const code of codes)
        db.prepare("INSERT INTO recovery_codes VALUES(?,?)").run(
          u.id,
          digest(code),
        );
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.setHeader("Cache-Control", "no-store");
    audit(u.org, u.id, "Recovery codes regenerated");
    res.json({ codes });
  });
  app.post("/api/team/invitations", (req, res) => {
    const u = (req as any).user;
    if (u.role !== "owner") {
      res.status(403).json({ error: "Owner role required" });
      return;
    }
    const v = z
      .object({
        email: z.email(),
        role: z.enum(["analyst", "reviewer", "viewer"]),
      })
      .parse(req.body);
    if (
      db
        .prepare("SELECT id FROM users WHERE email=?")
        .get(v.email.toLowerCase())
    ) {
      res.status(409).json({
        error:
          "Email already has an account; choose another organization email",
      });
      return;
    }
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM invitations WHERE org=? AND email=?").run(
      u.org,
      v.email.toLowerCase(),
    );
    db.prepare("INSERT INTO invitations VALUES(?,?,?,?,?)").run(
      digest(token),
      u.org,
      v.email.toLowerCase(),
      v.role,
      Date.now() + 48 * 3600000,
    );
    audit(u.org, u.id, "Team invitation created");
    res.status(201).json({ token, expiresInHours: 48 });
  });
  app.patch("/api/team/:userId", (req, res) => {
    const u = (req as any).user;
    if (u.role !== "owner") {
      res.status(403).json({ error: "Owner role required" });
      return;
    }
    const v = z
      .object({ role: z.enum(["analyst", "reviewer", "viewer"]) })
      .parse(req.body);
    const target = db
      .prepare("SELECT role FROM users WHERE id=? AND org=?")
      .get(String(req.params.userId), u.org) as any;
    if (!target || target.role === "owner") {
      res
        .status(400)
        .json({ error: "Organization owner cannot be changed here" });
      return;
    }
    db.prepare("UPDATE users SET role=? WHERE id=? AND org=?").run(
      v.role,
      String(req.params.userId),
      u.org,
    );
    db.prepare("DELETE FROM sessions WHERE userId=?").run(
      String(req.params.userId),
    );
    audit(u.org, u.id, "Team role changed");
    res.json({ ok: true });
  });
  app.delete("/api/team/:userId", (req, res) => {
    const u = (req as any).user;
    if (u.role !== "owner") {
      res.status(403).json({ error: "Owner role required" });
      return;
    }
    const id = String(req.params.userId),
      target = db
        .prepare("SELECT role FROM users WHERE id=? AND org=?")
        .get(id, u.org) as any;
    if (!target || target.role === "owner") {
      res.status(400).json({ error: "Organization owner cannot be removed" });
      return;
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM sessions WHERE userId=?").run(id);
      db.prepare("DELETE FROM recovery_codes WHERE userId=?").run(id);
      db.prepare("DELETE FROM users WHERE id=? AND org=?").run(id, u.org);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    audit(u.org, u.id, "Team member removed; sessions revoked");
    res.json({ ok: true });
  });
}
