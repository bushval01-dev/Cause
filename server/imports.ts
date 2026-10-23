import type express from "express";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { activitySchema, costSchema, invalidate } from "./domain.js";
import { calculations } from "./engine.js";
import { dataDir, saveProject, audit } from "./store.js";
export function importRoutes(app: express.Express) {
  app.get("/api/templates/:kind", (req, res) => {
    const schedule = req.params.kind === "schedule";
    res
      .type("text/csv")
      .attachment(schedule ? "schedule-template.csv" : "cost-template.csv")
      .send(
        schedule
          ? "id,name,duration,delay,dependencies\nA,Mobilisation,5,0,\nB,Foundation,12,0,A\nC,Handover,0,0,B\n"
          : "id,description,category,quantity,rate,basis\nC1,Crew standby,Labor,8,45,documented\n",
      );
  });
  app.post("/api/projects/:id/calculations/import/:documentId", (req, res) => {
    const p = (req as any).project,
      d = p.documents.find((d: any) => d.id === req.params.documentId);
    if (
      !d ||
      !["schedule", "cost"].includes(d.category) ||
      !/\.(csv|json)$/i.test(d.name)
    ) {
      res.status(400).json({
        error: "Choose a CSV or JSON document categorized as schedule or cost",
      });
      return;
    }
    const raw = readFileSync(resolve(dataDir, d.id), "utf8");
    let records: any;
    if (d.name.toLowerCase().endsWith(".json")) {
      const parsed = JSON.parse(raw);
      records = Array.isArray(parsed)
        ? parsed
        : d.category === "schedule"
          ? parsed.activities
          : parsed.costRecords;
    } else
      records = parse(raw, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        trim: true,
        max_record_size: 100000,
      });
    if (!Array.isArray(records) || records.length > 2000)
      throw Error("Import limit exceeded or invalid record array");
    const kind = d.category === "schedule" ? "activities" : "costRecords";
    const source = (r: any) => {
      const line = raw
        .split(/\r?\n/)
        .find((s) => s.includes(r.description) && s.length >= 8);
      return line ? { documentId: d.id, page: 1, quote: line } : null;
    };
    const values =
      d.category === "schedule"
        ? z.array(activitySchema).parse(
            records.map((r) => ({
              ...r,
              id: String(r.id || randomUUID()),
              duration: Number(r.duration),
              delay: Number(r.delay || 0),
              dependencies: Array.isArray(r.dependencies)
                ? r.dependencies
                : String(r.dependencies || "")
                    .split(";")
                    .filter(Boolean),
            })),
          )
        : z.array(costSchema).parse(
            records.map((r) => ({
              ...r,
              id: String(r.id || randomUUID()),
              quantity: Number(r.quantity),
              rateCents:
                r.rateCents !== undefined
                  ? Number(r.rateCents)
                  : Math.round(Number(r.rate) * 100),
              basis: r.basis || "documented",
              source: r.source || source(r),
            })),
          );
    calculations({ ...p, [kind]: values });
    p[kind] = values;
    for (const i of p.investigations) {
      invalidate(
        i.nodes,
        [d.category === "schedule" ? "schedule" : "cost"],
        "Calculation rows imported from " + d.name,
      );
      i.status = "draft";
    }
    saveProject(p);
    audit(p.org, (req as any).user.id, "Calculation rows imported: " + d.id);
    res.json({ imported: values.length, kind, calculations: calculations(p) });
  });
}
