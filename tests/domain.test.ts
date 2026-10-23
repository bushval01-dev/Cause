import { describe, it, expect } from "vitest";
import {
  schedule,
  costs,
  validateGraph,
  invalidate,
  verifySources,
} from "../server/domain";
import { demoProject, graph } from "../server/demo";
import { calculations, execute } from "../server/engine";
describe("Deterministic critical path", () => {
  it("calculates parallel paths, float, baseline and revised impacts", () => {
    const s = schedule([
      { id: "a", name: "A", duration: 3, delay: 0, dependencies: [] },
      { id: "b", name: "B", duration: 5, delay: 0, dependencies: ["a"] },
      { id: "c", name: "C", duration: 2, delay: 0, dependencies: ["a"] },
      { id: "d", name: "D", duration: 1, delay: 0, dependencies: ["b", "c"] },
    ]);
    expect(s.duration).toBe(9);
    expect(s.activities.find((a) => a.id === "c")).toMatchObject({
      es: 3,
      ef: 5,
      ls: 6,
      lf: 8,
      float: 3,
      critical: false,
    });
    expect(s.activities.filter((a) => a.critical).map((a) => a.id)).toEqual([
      "a",
      "b",
      "d",
    ]);
  });
  it("rejects cycles, missing dependencies and negative duration", () => {
    expect(() =>
      schedule([
        { id: "a", name: "A", duration: 1, delay: 0, dependencies: ["a"] },
      ]),
    ).toThrow("cycle");
    expect(() =>
      schedule([
        { id: "a", name: "A", duration: 1, delay: 0, dependencies: ["b"] },
      ]),
    ).toThrow("Missing");
    expect(() =>
      schedule([
        { id: "a", name: "A", duration: -1, delay: 0, dependencies: [] },
      ]),
    ).toThrow();
  });
  it("handles zero-duration milestones and empty schedules", () => {
    expect(schedule([]).duration).toBe(0);
    expect(
      schedule([
        { id: "m", name: "Milestone", duration: 0, delay: 0, dependencies: [] },
      ]).activities[0].critical,
    ).toBe(true);
  });
});
describe("Financial/source integrity", () => {
  it("calculates demo amounts in integer cents with source checks", () => {
    const c = calculations(demoProject("test"));
    expect(c.cost).toMatchObject({
      claimed: 948000,
      supported: 428000,
      estimated: 520000,
      unsupported: 0,
    });
    expect(c.schedule).toMatchObject({ baseline: 45, duration: 53, impact: 8 });
  });
  it("downgrades fabricated sources instead of treating them as support", () => {
    const p = demoProject("test");
    p.costRecords[0].source.quote = "fabricated";
    expect(calculations(p).cost).toMatchObject({
      supported: 140000,
      unsupported: 288000,
    });
    const source = {
      documentId: p.documents[0].id,
      page: 1,
      quote: "Contract §8.3: The contractor shall provide written notice",
    };
    expect(
      verifySources([{ sources: [source] }], p.documents)[0].verification,
    ).toBe("source-checked");
    expect(
      verifySources([{ sources: [{ ...source, page: 9 }] }], p.documents)[0]
        .verification,
    ).toBe("unsupported");
    expect(verifySources([{ sources: [] }], p.documents)[0].verification).toBe(
      "unsupported",
    );
  });
  it("rejects aggregate amounts that exceed safe integer cents", () => {
    const r = {
      id: "x",
      category: "custom",
      description: "large",
      quantity: 1e6,
      rateCents: 1e9,
      basis: "estimated" as const,
      source: null,
    };
    expect(() =>
      costs(Array.from({ length: 10 }, (_, i) => ({ ...r, id: String(i) }))),
    ).toThrow("total out of range");
  });
  it("rounds fractional quantities once per cost record", () => {
    expect(
      costs([
        {
          id: "1",
          description: "unit",
          category: "custom",
          quantity: 1.5,
          rateCents: 101,
          basis: "estimated",
          source: null,
        },
      ]).claimed,
    ).toBe(152);
  });
});
describe("Persistent graph execution", () => {
  it("prevents cycles and unknown edges", () => {
    const n = graph([]);
    n[0].dependencies = ["lead"];
    expect(() => validateGraph(n)).toThrow("cycle");
    n[0].dependencies = ["unknown"];
    expect(() => validateGraph(n)).toThrow("Missing");
  });
  it("invalidates only affected dependants and preserves outputs/history", () => {
    const n = graph([]);
    n.forEach((v) => {
      v.state = "completed";
      v.output = { version: 1 };
    });
    const affected = invalidate(n, ["cost"], "New invoice");
    expect(affected).toContain("lead");
    expect(affected).not.toContain("contract");
    expect(n.find((n) => n.id === "contract")!.state).toBe("completed");
    expect(n.find((n) => n.id === "cost")!.output).toEqual({
      version: 1,
      isStale: true,
    });
    expect(n.find((n) => n.id === "cost")!.history[0].reason).toBe(
      "New invoice",
    );
  });
  it("executes source and independent deterministic nodes, preserves completed valid work", async () => {
    const p = demoProject("execution-test");
    const i = p.investigations[0];
    await execute(p, i, true);
    expect(i.nodes.find((n: any) => n.id === "sources").state).toBe(
      "completed",
    );
    expect(i.nodes.find((n: any) => n.id === "schedule").output.impact).toBe(8);
    expect(i.nodes.find((n: any) => n.id === "cost").output.supported).toBe(
      428000,
    );
    expect(i.nodes.find((n: any) => n.id === "contract").state).toBe("pending");
    const history = i.nodes.find((n: any) => n.id === "schedule").history
      .length;
    await execute(p, i, true);
    expect(i.nodes.find((n: any) => n.id === "schedule").history.length).toBe(
      history,
    );
    expect(i.versions).toHaveLength(2);
  });
  it("validates 2000-node dependency chains", () => {
    const nodes = Array.from({ length: 2000 }, (_, i) => ({
      ...graph([])[0],
      id: String(i),
      dependencies: i ? [String(i - 1)] : [],
    }));
    expect(validateGraph(nodes)).toBe(true);
  });
});
