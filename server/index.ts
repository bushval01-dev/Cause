import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { PDFParse } from "pdf-parse";
import {
  db,
  dataDir,
  projects,
  getProject,
  saveProject,
  audit,
} from "./store.js";
import { emptyProject, demoProject, graph } from "./demo.js";
import { execute, running, listeners, calculations } from "./engine.js";
import {
  activitySchema,
  costSchema,
  invalidate,
  validateGraph,
  type GraphNode,
  verifySources,
} from "./domain.js";
import { aiConfig, publicSettings } from "./settings.js";
import { publicAccountRoutes, accountRoutes } from "./accounts.js";
import {
  enqueue,
  cancelJob,
  projectBusy,
  startJobs,
  stopJobs,
} from "./jobs.js";
import { importRoutes } from "./imports.js";
import { projectExport } from "./export.js";
import { extract } from "./extraction.js";
import { evidenceChanged } from "./changes.js";
export const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "production" ? undefined : false,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
if (process.env.TRUST_PROXY_HOPS)
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS));
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 600,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Wait a minute and retry." },
  }),
);
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) {
      res.status(403).json({ error: "Cross-origin writes are forbidden" });
      return;
    }
  }
  next();
});
const authLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 30,
  message: { error: "Too many sign-in attempts. Please wait before retrying." },
});
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function session(res: express.Response, id: string) {
  const token = randomBytes(32).toString("hex");
  db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    hash(token),
    id,
    Date.now() + 7 * 86400000,
  );
  res.cookie("cause_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 86400000,
    path: "/",
  });
  return token;
}
function user(req: express.Request) {
  const token = req.headers.cookie?.match(
    /(?:^|; )cause_session=([a-f0-9]{64})(?:;|$)/,
  )?.[1];
  if (!token) return null;
  return db
    .prepare(
      "SELECT u.id,u.email,u.org,u.role FROM users u JOIN sessions s ON u.id=s.userId WHERE s.token=? AND s.expires>?",
    )
    .get(hash(token), Date.now()) as any;
}
app.get("/api/session", (req, res) => {
  const u = user(req);
  res.json({
    user: u ? { ...u, guest: u.role === "guest" } : null,
    aiConfigured: u ? publicSettings(u.org).aiConfigured : false,
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    demoAllowed:
      process.env.NODE_ENV !== "production" ||
      process.env.ENABLE_DEMO === "true",
  });
});
const credentials = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(256),
});
publicAccountRoutes(app, authLimit, session);
app.post("/api/auth/:action", authLimit, (req, res) => {
  const { email: raw, password } = credentials.parse(req.body);
  const email = raw.toLowerCase();
  const action = req.params.action;
  if (!["register", "login"].includes(String(action))) {
    res.status(404).json({ error: "Unknown authentication action" });
    return;
  }
  let u: any = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (action === "register") {
    if (u) {
      res.status(409).json({ error: "Email is already registered" });
      return;
    }
    const salt = randomBytes(16).toString("hex");
    u = { id: randomUUID(), email, org: randomUUID(), role: "owner" };
    db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(
      u.id,
      email,
      salt + ":" + scryptSync(password, salt, 64).toString("hex"),
      u.org,
      u.role,
    );
    audit(u.org, u.id, "Account created");
  } else {
    const [salt, stored] = u?.password?.split(":") || ["invalid", ""];
    const digest = scryptSync(password, salt, 64);
    if (
      !u ||
      stored.length !== 128 ||
      !timingSafeEqual(digest, Buffer.from(stored, "hex"))
    ) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
  }
  session(res, u.id);
  res.json({ ok: true });
});
app.post("/api/demo", authLimit, (req, res) => {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_DEMO !== "true"
  ) {
    res
      .status(403)
      .json({ error: "Anonymous demo is disabled; sign in or register" });
    return;
  }
  const existing = user(req);
  if (existing) {
    res.json({ ok: true });
    return;
  }
  const id = randomUUID(),
    org = randomUUID();
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(
    id,
    `guest-${id}@demo.invalid`,
    "",
    org,
    "guest",
  );
  session(res, id);
  const p = demoProject(org);
  for (const d of p.documents)
    writeFileSync(resolve(dataDir, d.id), d.pages[0].text, { mode: 0o600 });
  saveProject(p);
  res.json({ ok: true });
});
app.post("/api/logout", (req, res) => {
  const token = req.headers.cookie?.match(/cause_session=([a-f0-9]{64})/)?.[1];
  if (token) db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
  res.clearCookie("cause_session");
  res.json({ ok: true });
});
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", (req, res, next) => {
  const u = user(req);
  if (!u) {
    res.status(401).json({ error: "Sign in required" });
    return;
  }
  (req as any).user = u;
  if (
    u.role === "viewer" &&
    !["GET", "HEAD"].includes(req.method) &&
    !req.path.startsWith("/account/")
  ) {
    res.status(403).json({ error: "Viewer role has read-only access" });
    return;
  }
  next();
});
accountRoutes(app, session);
app.get("/api/team", (req, res) =>
  res.json(
    db
      .prepare("SELECT id,email,role FROM users WHERE org=?")
      .all((req as any).user.org),
  ),
);
app.post("/api/team", (req, res) => {
  const owner = (req as any).user;
  if (owner.role !== "owner") {
    res.status(403).json({ error: "Only owners can add team members" });
    return;
  }
  const v = credentials
    .extend({ role: z.enum(["analyst", "reviewer", "viewer"]) })
    .parse(req.body);
  if (
    db.prepare("SELECT id FROM users WHERE email=?").get(v.email.toLowerCase())
  ) {
    res.status(409).json({ error: "Email is already registered" });
    return;
  }
  const salt = randomBytes(16).toString("hex");
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(
    randomUUID(),
    v.email.toLowerCase(),
    salt + ":" + scryptSync(v.password, salt, 64).toString("hex"),
    owner.org,
    v.role,
  );
  audit(owner.org, owner.id, "Team member added: " + v.role);
  res.status(201).json({ ok: true });
});
app.get("/api/projects", (req, res) =>
  res.json(projects((req as any).user.org)),
);
app.post("/api/projects", (req, res) => {
  const v = z
    .object({
      name: z.string().trim().min(1).max(120),
      description: z.string().max(2000).default(""),
    })
    .parse(req.body);
  if (projects((req as any).user.org).length >= 100) {
    res.status(400).json({ error: "Project limit reached (100)" });
    return;
  }
  const p = emptyProject((req as any).user.org, v.name, v.description);
  saveProject(p);
  audit(p.org, (req as any).user.id, "Project created: " + p.id);
  res.status(201).json(p);
});
app.post("/api/projects/demo", (req, res) => {
  const p = demoProject((req as any).user.org);
  for (const d of p.documents)
    writeFileSync(resolve(dataDir, d.id), d.pages[0].text, { mode: 0o600 });
  saveProject(p);
  res.status(201).json(p);
});
app.use("/api/projects/:id", (req, res, next) => {
  const p = getProject(req.params.id, (req as any).user.org);
  if (!p) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  (req as any).project = p;
  if (
    (projectBusy(p.id) ||
      [...p.investigations].some((i: any) => running.has(i.id))) &&
    !["GET", "HEAD"].includes(req.method) &&
    !req.path.endsWith("/cancel")
  ) {
    res.status(409).json({
      error: "Cancel the active investigation before editing its inputs",
    });
    return;
  }
  next();
});
projectExport(app);
importRoutes(app);
app.get("/api/projects/:id", (req, res) => res.json((req as any).project));
app.patch("/api/projects/:id", (req, res) => {
  const p = (req as any).project;
  Object.assign(
    p,
    z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().max(2000).optional(),
        archived: z.boolean().optional(),
      })
      .parse(req.body),
  );
  saveProject(p);
  audit(p.org, (req as any).user.id, "Project updated: " + p.id);
  res.json(p);
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});
function invalidation(p: any, roots: string[], reason: string) {
  for (const inv of p.investigations) {
    const customRoots = inv.nodes
      .filter(
        (n: GraphNode) =>
          ![
            "sources",
            "contract",
            "timeline",
            "schedule",
            "cost",
            "delay",
            "cost-agent",
            "verify",
            "lead",
            "approval",
            "report",
          ].includes(n.id) &&
          (!n.inputs?.documentIds?.length ||
            ["agent", "validation", "contradiction"].includes(n.type)),
      )
      .map((n: GraphNode) => n.id);
    const changed = invalidate(inv.nodes, [...roots, ...customRoots], reason);
    inv.status = "draft";
    inv.events.push({
      id: randomUUID(),
      at: new Date().toISOString(),
      message: `${reason}. ${changed.length} nodes require review; unrelated results retained.`,
    });
  }
}
app.post(
  "/api/projects/:id/documents",
  upload.single("file"),
  async (req, res) => {
    let p = (req as any).project;
    const f = req.file;
    if (!f) {
      res.status(400).json({ error: "Choose a file" });
      return;
    }
    if (p.documents.length >= 100) {
      res.status(400).json({ error: "Project document limit reached (100)" });
      return;
    }
    const category = z
      .enum(["contract", "schedule", "event", "evidence", "cost"])
      .parse(req.body.category || "evidence");
    const id = randomUUID();
    let pages: any[] = [];
    let mime = f.mimetype;
    if (f.buffer.subarray(0, 5).toString() === "%PDF-")
      mime = "application/pdf";
    else if (/\.(txt|csv|eml|json)$/i.test(f.originalname)) mime = "text/plain";
    else if (["image/png", "image/jpeg", "image/webp"].includes(mime)) {
      const b = f.buffer;
      const valid =
        (mime === "image/png" &&
          b
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
        (mime === "image/jpeg" && b[0] === 255 && b[1] === 216) ||
        (mime === "image/webp" &&
          b.subarray(0, 4).toString() === "RIFF" &&
          b.subarray(8, 12).toString() === "WEBP");
      if (!valid) throw Error("Image contents do not match type");
    } else {
      res.status(415).json({
        error: "Supported: PDF, TXT, CSV, EML, JSON, PNG, JPEG and WebP",
      });
      return;
    }
    writeFileSync(resolve(dataDir, id), f.buffer, { mode: 0o600 });
    const extracted = await extract(
      resolve(dataDir, id),
      mime,
      f.originalname,
    ).catch(async (error) => {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(resolve(dataDir, id));
      throw error;
    });
    pages = extracted.pages;
    const d = {
      id,
      name: f.originalname.slice(0, 180),
      category,
      mime,
      size: f.size,
      pages,
      extractionMethod: extracted.method,
      attachments: extracted.attachments,
      status: pages.some((p) => p.text.trim())
        ? "extracted"
        : "needs-transcription",
      createdAt: new Date().toISOString(),
    };
    p = getProject(p.id, p.org);
    if (
      projectBusy(p.id) ||
      p.investigations.some((i: any) => running.has(i.id))
    ) {
      unlinkSync(resolve(dataDir, id));
      res.status(409).json({
        error:
          "Investigation started during extraction; retry the upload when it finishes",
      });
      return;
    }
    if (p.documents.length >= 100) {
      unlinkSync(resolve(dataDir, id));
      throw Error("Document limit exceeded");
    }
    const totalText =
      p.documents.reduce(
        (sum: number, doc: any) =>
          sum +
          doc.pages.reduce((s: number, page: any) => s + page.text.length, 0),
        0,
      ) + pages.reduce((sum: number, page: any) => sum + page.text.length, 0);
    if (totalText > 5000000) {
      unlinkSync(resolve(dataDir, id));
      throw Error(
        "Project extracted-text limit exceeded (5 million characters)",
      );
    }
    p.documents.push(d);
    const roots =
      category === "cost"
        ? ["cost", "cost-agent", "timeline"]
        : category === "schedule"
          ? ["schedule", "delay", "timeline"]
          : category === "contract"
            ? ["contract", "timeline"]
            : ["timeline", "delay"];
    evidenceChanged(p, d, `New evidence: ${d.name}`);
    const source = p.investigations.map((i: any) =>
      i.nodes.find((n: GraphNode) => n.id === "sources"),
    );
    for (const s of source)
      if (s?.state === "completed")
        s.output = {
          documents: p.documents.length,
          pages: p.documents.reduce(
            (sum: number, d: any) => sum + d.pages.length,
            0,
          ),
        };
    saveProject(p);
    audit(p.org, (req as any).user.id, "Document uploaded: " + id);
    res.status(201).json(d);
  },
);
app.get("/api/projects/:id/documents/:documentId/file", (req, res) => {
  const d = (req as any).project.documents.find(
    (d: any) => d.id === req.params.documentId,
  );
  if (!d) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.type(d.mime);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(d.name)}`,
  );
  res.send(readFileSync(resolve(dataDir, d.id)));
});
app.get("/api/projects/:id/calculations", (req, res) =>
  res.json(calculations((req as any).project)),
);
app.put("/api/projects/:id/calculations", (req, res) => {
  const p = (req as any).project;
  const input = z
    .object({
      activities: z.array(activitySchema).max(2000),
      costRecords: z.array(costSchema).max(10000),
      scheduleStart: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
    })
    .parse(req.body);
  if (
    input.scheduleStart &&
    (!Number.isFinite(Date.parse(input.scheduleStart + "T00:00:00Z")) ||
      new Date(input.scheduleStart + "T00:00:00Z")
        .toISOString()
        .slice(0, 10) !== input.scheduleStart)
  ) {
    res.status(400).json({ error: "Choose a valid baseline date" });
    return;
  }
  calculations({ ...p, ...input });
  Object.assign(p, input);
  invalidation(p, ["schedule", "cost"], "Calculation inputs changed");
  saveProject(p);
  res.json(calculations(p));
});
app.post("/api/projects/:id/investigations", (req, res) => {
  const p = (req as any).project;
  if (p.investigations.length >= 30) {
    res.status(400).json({ error: "Investigation limit reached (30)" });
    return;
  }
  const v = z
    .object({
      name: z.string().trim().min(1).max(120),
      scope: z.string().min(1).max(3000),
    })
    .parse(req.body);
  const i = {
    id: randomUUID(),
    ...v,
    status: "draft",
    createdAt: new Date().toISOString(),
    nodes: graph(p.documents),
    events: [],
    versions: [],
    usage: { inputTokens: 0, outputTokens: 0, requests: 0 },
  };
  p.investigations.push(i);
  saveProject(p);
  res.status(201).json(i);
});
app.use("/api/projects/:id/investigations/:invId", (req, res, next) => {
  const inv = (req as any).project.investigations.find(
    (i: any) => i.id === req.params.invId,
  );
  if (!inv) {
    res.status(404).json({ error: "Investigation not found" });
    return;
  }
  (req as any).investigation = inv;
  next();
});
app.post("/api/projects/:id/investigations/:invId/run", (req, res) => {
  const p = (req as any).project,
    i = (req as any).investigation;
  if (running.has(i.id)) {
    res.status(409).json({ error: "Already running" });
    return;
  }
  if (
    running.size >= 8 ||
    projects(p.org)
      .flatMap((p: any) => p.investigations)
      .filter((i: any) => running.has(i.id)).length >= 2
  ) {
    res.status(429).json({
      error:
        "Investigation capacity reached; try again after an active run finishes",
    });
    return;
  }
  const mode = z.enum(["full", "calculations"]).parse(req.body.mode || "full");
  if (
    mode === "full" &&
    (req as any).user.role === "guest" &&
    aiConfig(p.org).key &&
    process.env.ALLOW_DEMO_AI !== "true"
  ) {
    res.status(403).json({
      error:
        "Create an account to use AI analysis. Anonymous demo AI is disabled to protect your API budget.",
    });
    return;
  }
  if (mode === "full" && !aiConfig(p.org).key) {
    res.status(503).json({
      error:
        "Configure OPENAI_API_KEY on the server to run the AI investigators. You can run deterministic calculations now.",
    });
    return;
  }
  const jobId = enqueue(p, i, mode);
  audit(p.org, (req as any).user.id, "Execution started: " + i.id);
  res.status(202).json({ ok: true, jobId });
});
app.post("/api/projects/:id/investigations/:invId/reopen", (req, res) => {
  const p = (req as any).project,
    i = (req as any).investigation;
  const v = z
    .object({
      reason: z.string().trim().min(1).max(2000),
      nodeIds: z.array(z.string()).min(1).max(300),
    })
    .parse(req.body);
  if (v.nodeIds.some((id) => !i.nodes.some((n: GraphNode) => n.id === id))) {
    res.status(400).json({ error: "Unknown node" });
    return;
  }
  i.versions.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    status: i.status,
    nodes: structuredClone(i.nodes),
    reason: v.reason,
  });
  if (i.versions.length > 20) i.versions.shift();
  const changed = invalidate(i.nodes, v.nodeIds, v.reason);
  i.status = "draft";
  i.events.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    message: `Reopened: ${v.reason}. ${changed.length} nodes require review.`,
  });
  saveProject(p);
  audit(p.org, (req as any).user.id, "Investigation reopened: " + i.id);
  res.json({ changed });
});
app.post(
  "/api/projects/:id/investigations/:invId/manual-findings",
  (req, res) => {
    const p = (req as any).project,
      i = (req as any).investigation;
    const v = z
      .object({
        title: z.string().trim().min(1).max(200),
        detail: z.string().trim().min(1).max(10000),
        kind: z.enum(["finding", "contradiction", "missing-information"]),
        replacesNodeId: z.string().optional(),
        sources: z
          .array(
            z.object({
              documentId: z.string(),
              page: z.number().int().positive(),
              quote: z.string().min(8).max(20000),
            }),
          )
          .max(20),
      })
      .parse(req.body);
    if (i.nodes.length >= 300) {
      res.status(400).json({ error: "Node limit reached" });
      return;
    }
    const f = verifySources([v], p.documents)[0];
    const sourceNode = i.nodes.find((n: GraphNode) => n.id === "sources");
    if (sourceNode) {
      sourceNode.state = "completed";
      sourceNode.output = {
        documents: p.documents.length,
        pages: p.documents.reduce(
          (sum: number, d: any) => sum + d.pages.length,
          0,
        ),
      };
    }
    const at = new Date().toISOString();
    const n = {
      id: randomUUID(),
      type: "finding",
      title: v.title,
      description: "Professional finding — authored by a human, not AI",
      dependencies: ["sources"],
      inputs: { documentIds: v.sources.map((s) => s.documentId) },
      state: "completed",
      output: {
        summary: "Professional assessment; requires independent review.",
        origin: "human",
        author: (req as any).user.id,
        findings: [f],
      },
      history: [
        { at, state: "completed", reason: "Professional finding entered" },
      ],
      updatedAt: at,
      x: 60,
      y: 720 + (i.nodes.length - 11) * 60,
    };
    if (v.replacesNodeId) {
      const existing = i.nodes.find(
        (node: GraphNode) =>
          node.id === v.replacesNodeId && node.output?.origin === "human",
      );
      if (!existing) {
        res.status(404).json({ error: "Professional finding not found" });
        return;
      }
      i.versions.push({
        id: randomUUID(),
        at,
        status: i.status,
        nodes: structuredClone(i.nodes),
      });
      n.id = existing.id;
      n.history = [...existing.history, ...n.history];
      Object.assign(existing, n);
    } else i.nodes.push(n);
    const approval = i.nodes.find((node: GraphNode) => node.id === "approval");
    if (approval && !approval.dependencies.includes(n.id))
      approval.dependencies.push(n.id);
    if (approval) {
      approval.state = "review";
      approval.output = null;
    }
    i.mode = "manual";
    i.status = "review";
    saveProject(p);
    audit(p.org, (req as any).user.id, "Professional finding added: " + n.id);
    res.status(201).json(n);
  },
);
app.post("/api/projects/:id/investigations/:invId/cancel", (req, res) => {
  cancelJob((req as any).project, (req as any).investigation);
  res.json({ ok: true });
});
app.post("/api/projects/:id/investigations/:invId/nodes", (req, res) => {
  const p = (req as any).project,
    i = (req as any).investigation;
  if (i.nodes.length >= 300) {
    res.status(400).json({ error: "Node limit reached (300)" });
    return;
  }
  const v = z
    .object({
      type: z.enum([
        "document",
        "evidence",
        "event",
        "clause",
        "activity",
        "financial",
        "agent",
        "tool",
        "validation",
        "contradiction",
        "decision",
        "approval",
        "finding",
      ]),
      title: z.string().trim().min(1).max(120),
      description: z.string().max(2000).default(""),
      dependencies: z.array(z.string()).max(100).default([]),
      inputs: z
        .object({
          documentIds: z.array(z.string()).max(100).optional(),
          tool: z.enum(["schedule", "cost"]).optional(),
        })
        .default({}),
    })
    .parse(req.body);
  const n = {
    ...v,
    id: randomUUID(),
    state: "pending",
    output: null,
    updatedAt: new Date().toISOString(),
    history: [],
    x: 60 + (i.nodes.length % 6) * 350,
    y: 720 + Math.floor((i.nodes.length - 11) / 6) * 220,
  };
  validateGraph([...i.nodes, n] as GraphNode[]);
  i.nodes.push(n);
  saveProject(p);
  res.status(201).json(n);
});
app.post(
  "/api/projects/:id/investigations/:invId/nodes/:nodeId/decision",
  (req, res) => {
    const u = (req as any).user;
    if (!["owner", "reviewer", "guest"].includes(u.role)) {
      res.status(403).json({ error: "Reviewer role required" });
      return;
    }
    const i = (req as any).investigation,
      n = i.nodes.find((n: GraphNode) => n.id === req.params.nodeId);
    if (
      !n ||
      !["approval", "decision"].includes(n.type) ||
      n.state !== "review"
    ) {
      res.status(400).json({ error: "Node is not awaiting a human decision" });
      return;
    }
    const v = z
      .object({
        decision: z.enum(["accepted", "rejected"]),
        note: z.string().trim().min(1).max(3000),
      })
      .parse(req.body);
    if (n.id === "approval" && v.decision === "accepted") {
      const all = i.nodes.flatMap((n: GraphNode) => n.output?.findings || []);
      if (
        !all.length ||
        all.some(
          (f: any) =>
            !["accepted", "rejected"].includes(f.review) ||
            f.stale ||
            (f.review === "accepted" && f.verification !== "source-checked"),
        )
      ) {
        res.status(400).json({
          error:
            "Review every current finding before approving the investigation",
        });
        return;
      }
    }
    n.state = v.decision === "accepted" ? "completed" : "failed";
    n.output = { ...v, actor: u.id, at: new Date().toISOString() };
    n.history.push({
      at: new Date().toISOString(),
      state: n.state,
      reason: v.note,
    });
    saveProject((req as any).project);
    audit(u.org, u.id, "Human decision: " + n.id);
    res.json(n);
  },
);
app.patch(
  "/api/projects/:id/investigations/:invId/nodes/:nodeId",
  (req, res) => {
    const p = (req as any).project,
      i = (req as any).investigation;
    const n = i.nodes.find((n: GraphNode) => n.id === req.params.nodeId);
    if (!n) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    const v = z
      .object({
        title: z.string().min(1).max(120).optional(),
        description: z.string().max(2000).optional(),
        x: z.number().min(-10000).max(10000).optional(),
        y: z.number().min(-10000).max(10000).optional(),
        dependencies: z.array(z.string()).max(100).optional(),
        inputs: z
          .object({
            documentIds: z.array(z.string()).max(100).optional(),
            tool: z.enum(["schedule", "cost"]).optional(),
          })
          .optional(),
      })
      .parse(req.body);
    const proposed = i.nodes.map((a: GraphNode) =>
      a.id === n.id ? { ...a, ...v } : a,
    );
    validateGraph(proposed);
    Object.assign(n, v);
    if (v.dependencies || v.description || v.inputs)
      invalidate(i.nodes, [n.id], "Node configuration changed");
    saveProject(p);
    res.json(n);
  },
);
app.post("/api/projects/:id/investigations/:invId/review", (req, res) => {
  if (!["owner", "reviewer", "guest"].includes((req as any).user.role)) {
    res
      .status(403)
      .json({ error: "Owner or reviewer role required to approve findings" });
    return;
  }
  const p = (req as any).project,
    i = (req as any).investigation;
  const v = z
    .object({
      nodeId: z.string(),
      findingIndex: z.number().int().min(0),
      decision: z.enum(["accepted", "rejected"]),
      note: z.string().max(3000).default(""),
    })
    .parse(req.body);
  const node = i.nodes.find((n: GraphNode) => n.id === v.nodeId);
  const f = node?.output?.findings?.[v.findingIndex];
  if (!f) {
    res.status(404).json({ error: "Finding not found" });
    return;
  }
  if (
    v.decision === "accepted" &&
    (f.verification !== "source-checked" ||
      f.stale ||
      node.state !== "completed")
  ) {
    res.status(400).json({
      error: "Stale, incomplete, or unsupported findings cannot be accepted",
    });
    return;
  }
  f.review = v.decision;
  f.reviewNote = v.note;
  f.reviewedAt = new Date().toISOString();
  const all = i.nodes.flatMap((n: GraphNode) => n.output?.findings || []);
  if (
    all.length &&
    all.every((f: any) => ["accepted", "rejected"].includes(f.review)) &&
    (i.mode === "manual" ||
      i.nodes.find((n: GraphNode) => n.id === "lead")?.state === "completed")
  ) {
    const approval = i.nodes.find((n: GraphNode) => n.id === "approval");
    approval.state = "completed";
    approval.output = { reviewedFindings: all.length };
    approval.history.push({
      at: new Date().toISOString(),
      state: "completed",
      reason: "All findings reviewed by a human",
    });
    i.status = "completed";
  }
  audit(
    p.org,
    (req as any).user.id,
    `${v.decision} finding ${v.nodeId}:${v.findingIndex}`,
  );
  saveProject(p);
  res.json(f);
});
app.post("/api/projects/:id/notes", (req, res) => {
  const p = (req as any).project;
  const text = z.string().trim().min(1).max(5000).parse(req.body.text);
  p.notes.push({
    id: randomUUID(),
    text,
    at: new Date().toISOString(),
    actor: (req as any).user.id,
  });
  saveProject(p);
  res.status(201).json({ ok: true });
});
app.get("/api/projects/:id/investigations/:invId/events", (req, res) => {
  const i = (req as any).investigation;
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  res.write(
    `data: ${JSON.stringify({ message: "Connected to investigation updates", at: new Date().toISOString() })}\n\n`,
  );
  const fn = (e: any) => {
    if (!user(req)) {
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify(e)}\n\n`);
  };
  if (!listeners.has(i.id)) listeners.set(i.id, new Set());
  listeners.get(i.id)!.add(fn);
  const timer = setInterval(() => {
    if (!user(req)) {
      res.end();
      return;
    }
    res.write(": heartbeat\n\n");
  }, 15000);
  req.on("close", () => {
    clearInterval(timer);
    listeners.get(i.id)?.delete(fn);
  });
});
app.get("/api/audit", (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT event,at FROM audit WHERE org=? ORDER BY id DESC LIMIT 100",
      )
      .all((req as any).user.org),
  ),
);
app.get("/api/projects/:id/investigations/:invId/report", (req, res) => {
  const p = (req as any).project,
    i = (req as any).investigation;
  res.type("application/pdf");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="CAUSE-investigation.pdf"',
  );
  const pdf = new PDFDocument({ margin: 48 });
  pdf.pipe(res);
  const h = (s: string) => {
    pdf.moveDown().fontSize(16).fillColor("#111111").text(s).moveDown(0.4);
  };
  const t = (s: string) =>
    pdf.fontSize(10).fillColor("#333333").text(s, { lineGap: 4 });
  pdf.fontSize(30).text("CAUSE / Investigation report");
  t(
    p.fictional
      ? "FICTIONAL DEMONSTRATION CASE"
      : "DRAFT — PROFESSIONAL REVIEW REQUIRED",
  );
  h(p.name);
  t(
    `${i.name}\nScope: ${i.scope}\nAssessment mode: ${i.mode === "manual" ? "Professional assessment (human-authored)" : "AI investigation"}\nExported: ${new Date().toISOString()}\nExecution status: ${i.status}`,
  );
  h("Executive summary & limitations");
  t(
    "This assessment is a working investigation record. Source checking is not proof of factual correctness. No legal entitlement or recovery is established. Unrun analysis and missing evidence remain explicitly identified.",
  );
  for (const n of i.nodes) {
    if (["agent", "validation", "finding", "contradiction"].includes(n.type)) {
      h(n.title + " · " + n.state);
      t(n.output?.summary || n.error || "Analysis has not completed.");
      for (const f of n.output?.findings || []) {
        t(
          `${f.kind}: ${f.title}\n${f.detail}\nEvidence: ${f.verification}${f.stale ? " (STALE — REQUIRES RE-ANALYSIS)" : ""}; human review: ${f.review}`,
        );
        for (const s of f.sources || [])
          t(`[${s.documentId}, p.${s.page}] “${s.quote}”`);
      }
    }
  }
  const c = calculations(p);
  h("Schedule impact");
  t(
    `Baseline ${c.schedule.baseline} days; modeled ${c.schedule.duration} days; impact ${c.schedule.impact} days. ${c.schedule.assumptions}`,
  );
  for (const a of c.schedule.activities)
    t(
      `${a.name}: ES ${a.es}, EF ${a.ef}, LS ${a.ls}, LF ${a.lf}, float ${a.float}.`,
    );
  h("Financial impact");
  t(
    `Claimed $${(c.cost.claimed / 100).toFixed(2)}; supported $${(c.cost.supported / 100).toFixed(2)}; estimated $${(c.cost.estimated / 100).toFixed(2)}; unsupported $${(c.cost.unsupported / 100).toFixed(2)}. ${c.cost.assumptions}`,
  );
  for (const r of c.cost.rows)
    t(
      `${r.description}: ${r.quantity} × $${(r.rateCents / 100).toFixed(2)} = $${(r.cents / 100).toFixed(2)} (${r.basis}). Source: ${r.source ? JSON.stringify(r.source) : "No supporting source"}`,
    );
  h("Evidence register");
  for (const d of p.documents) {
    t(`${d.id} · ${d.name} · ${d.status}`);
    for (const page of d.pages) t(`Page ${page.number}: ${page.text}`);
  }
  h("Execution history & changed assessments");
  for (const e of i.events) t(`${e.at} · ${e.message}`);
  h("Professional notes");
  p.notes.forEach((n: any) => t(`${n.at}: ${n.text}`));
  pdf.end();
  const report = i.nodes.find((n: GraphNode) => n.id === "report");
  if (report) {
    const at = new Date().toISOString();
    report.state = i.status === "completed" ? "completed" : "review";
    report.output = {
      generatedAt: at,
      format: "pdf",
      draft: i.status !== "completed",
      mode: i.mode || "ai",
    };
    report.history.push({
      at,
      state: report.state,
      reason: "Actual PDF generated",
    });
    report.updatedAt = at;
    saveProject(p);
  }
  audit(p.org, (req as any).user.id, "Report exported: " + i.id);
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Endpoint not found" }),
);
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res
      .status(
        err instanceof z.ZodError ||
          err instanceof multer.MulterError ||
          /cycle|Missing dependency|Missing activity|Duplicate activity|Financial .*out of range|Binary content|match type|limit exceeded|extraction timed out|processor|processing queue/.test(
            err.message,
          )
          ? 400
          : Number.isInteger(err.status) &&
              err.status >= 400 &&
              err.status < 500
            ? err.status
            : 500,
      )
      .json({
        error:
          err instanceof z.ZodError
            ? err.issues.map((i) => i.message).join("; ")
            : err.message || "Request failed",
      });
  },
);
export async function start() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(resolve("dist")));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve("dist/index.html")),
    );
  }
  // Interrupted processes are never presented as still running after a restart.
  const all = db.prepare("SELECT data FROM projects").all() as any[];
  for (const row of all) {
    const p = JSON.parse(row.data);
    let changed = false;
    for (const i of p.investigations)
      if (i.status === "running") {
        i.status = "cancelled";
        for (const n of i.nodes)
          if (n.state === "running") {
            n.state = "cancelled";
            n.error = "Server restarted during execution";
          }
        changed = true;
      }
    if (changed) saveProject(p);
  }
  startJobs();
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, "0.0.0.0", () =>
    console.log(`CAUSE listening on ${port}`),
  );
  const shutdown = () => {
    stopJobs();
    server.close();
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return server;
}
if (process.env.NODE_ENV !== "test") void start();
