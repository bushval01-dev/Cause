import { z } from "zod";
export const activitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  duration: z.number().int().min(0).max(36500),
  dependencies: z.array(z.string()),
  delay: z.number().int().min(0).max(36500).default(0),
});
export type Activity = z.infer<typeof activitySchema>;
export function schedule(input: Activity[]) {
  const activities = z.array(activitySchema).max(2000).parse(input);
  const map = new Map(activities.map((a) => [a.id, a]));
  if (map.size !== activities.length) throw Error("Duplicate activity IDs");
  const order: Activity[] = [];
  const visiting = new Set<string>(),
    done = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw Error("Schedule dependency cycle");
    if (done.has(id)) return;
    const a = map.get(id);
    if (!a) throw Error("Missing activity: " + id);
    visiting.add(id);
    a.dependencies.forEach(visit);
    visiting.delete(id);
    done.add(id);
    order.push(a);
  }
  activities.forEach((a) => visit(a.id));
  const result = new Map<
    string,
    Activity & {
      es: number;
      ef: number;
      ls: number;
      lf: number;
      float: number;
      critical: boolean;
    }
  >();
  for (const a of order) {
    const es = Math.max(0, ...a.dependencies.map((d) => result.get(d)!.ef));
    result.set(a.id, {
      ...a,
      es,
      ef: es + a.duration + a.delay,
      ls: 0,
      lf: 0,
      float: 0,
      critical: false,
    });
  }
  const duration = Math.max(0, ...[...result.values()].map((a) => a.ef));
  for (const a of [...order].reverse()) {
    const r = result.get(a.id)!;
    const next = [...result.values()].filter((n) =>
      n.dependencies.includes(a.id),
    );
    r.lf = next.length ? Math.min(...next.map((n) => n.ls)) : duration;
    r.ls = r.lf - a.duration - a.delay;
    r.float = r.ls - r.es;
    r.critical = r.float === 0;
  }
  return {
    duration,
    activities: [...result.values()],
    assumptions:
      "Finish-to-start dependencies; elapsed calendar days; common day-zero start; no resource constraints. Modeled impact is not legal entitlement.",
  };
}
export const costSchema = z.object({
  id: z.string(),
  category: z.string(),
  description: z.string(),
  quantity: z.number().min(0).max(1e8),
  rateCents: z.number().int().min(0).max(1e10),
  basis: z.enum(["documented", "estimated", "unsupported"]),
  source: z
    .object({
      documentId: z.string(),
      page: z.number().int().positive(),
      quote: z.string(),
    })
    .nullable(),
});
export type Cost = z.infer<typeof costSchema>;
export function costs(input: Cost[]) {
  const records = z.array(costSchema).max(10000).parse(input);
  const totals = { claimed: 0, supported: 0, estimated: 0, unsupported: 0 };
  const rows = records.map((r) => {
    const cents = Math.round(r.quantity * r.rateCents);
    if (!Number.isSafeInteger(cents))
      throw Error("Financial amount out of range");
    const basis =
      r.basis === "documented" && !r.source ? "unsupported" : r.basis;
    totals.claimed += cents;
    totals[basis === "documented" ? "supported" : basis] += cents;
    if (Object.values(totals).some((v) => !Number.isSafeInteger(v)))
      throw Error("Financial total out of range");
    return { ...r, basis, cents };
  });
  return {
    ...totals,
    rows,
    currency: "USD",
    assumptions:
      "Quantity × unit rate, rounded to cents per record. No tax, interest or entitlement assumed.",
  };
}
export type NodeState =
  "pending" | "running" | "completed" | "failed" | "cancelled" | "review";
export type GraphNode = {
  id: string;
  type: string;
  title: string;
  description: string;
  dependencies: string[];
  inputs?: { documentIds?: string[]; tool?: "schedule" | "cost" };
  state: NodeState;
  output: any;
  error?: string;
  updatedAt: string;
  history: { at: string; state: string; reason?: string }[];
  x: number;
  y: number;
};
export function validateGraph(nodes: GraphNode[]) {
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) throw Error("Duplicate node IDs");
  const active = new Set<string>(),
    done = new Set<string>();
  const map = new Map(nodes.map((n) => [n.id, n]));
  function visit(id: string) {
    if (active.has(id)) throw Error("Dependency cycle");
    if (done.has(id)) return;
    const n = map.get(id);
    if (!n) throw Error("Missing dependency");
    active.add(id);
    n.dependencies.forEach(visit);
    active.delete(id);
    done.add(id);
  }
  nodes.forEach((n) => visit(n.id));
  return true;
}
export function invalidate(
  nodes: GraphNode[],
  roots: string[],
  reason: string,
) {
  const changed = new Set(roots);
  let more = true;
  while (more) {
    more = false;
    for (const n of nodes)
      if (!changed.has(n.id) && n.dependencies.some((d) => changed.has(d))) {
        changed.add(n.id);
        more = true;
      }
  }
  for (const n of nodes)
    if (changed.has(n.id)) {
      n.history.push({ at: new Date().toISOString(), state: n.state, reason });
      n.state = "pending";
      if (n.output) {
        n.output.isStale = true;
        for (const f of n.output.findings || []) {
          f.review = "pending";
          f.stale = true;
        }
      }
      n.error = undefined;
      n.updatedAt = new Date().toISOString();
    }
  return [...changed];
}
export function verifySources(findings: any[], documents: any[]) {
  return findings.map((f) => {
    const refs = Array.isArray(f.sources) ? f.sources : [];
    const valid =
      refs.length > 0 &&
      refs.every((r: any) => {
        const doc = documents.find((d) => d.id === r.documentId);
        const page = doc?.pages.find((p: any) => p.number === r.page);
        return (
          typeof r.quote === "string" &&
          r.quote.trim().length >= 8 &&
          page?.text.includes(r.quote)
        );
      });
    return {
      ...f,
      verification: valid ? "source-checked" : "unsupported",
      review: "pending",
    };
  });
}
