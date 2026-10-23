import { it, expect, vi, afterEach } from "vitest";
import { demoProject } from "../server/demo";
import { execute, running } from "../server/engine";
import { invalidate } from "../server/domain";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses actual tool-loop code, source-checks structured outputs, and runs independent agents concurrently (mock transport)", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only-key");
  const p = demoProject("agent-test");
  const i = p.investigations[0];
  let active = 0,
    maxActive = 0;
  let toolCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: any, options: any) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 4));
      active--;
      const body = JSON.parse(options.body);
      const usedTool = body.input.some(
        (v: any) => v.type === "function_call_output",
      );
      if (!usedTool) {
        toolCalls++;
        return Response.json({
          output: [
            {
              type: "function_call",
              name: "search_sources",
              call_id: "tool-" + toolCalls,
              arguments: '{"query":"notice"}',
            },
          ],
          usage: { input_tokens: 100, output_tokens: 20 },
        });
      }
      const d = p.documents[0];
      return Response.json({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  summary: "Transport fixture; source check is real.",
                  findings: [
                    {
                      title: "Notice provision",
                      detail: "Requires professional review",
                      kind: "finding",
                      sources: [
                        {
                          documentId: d.id,
                          page: 1,
                          quote:
                            "The contractor shall provide written notice of delay within 14 calendar days",
                        },
                      ],
                    },
                  ],
                }),
              },
            ],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 30 },
      });
    }),
  );
  await execute(p, i);
  expect(i.status).toBe("review");
  expect(toolCalls).toBe(6);
  expect(maxActive).toBeGreaterThanOrEqual(2);
  expect(maxActive).toBeLessThanOrEqual(3);
  expect(i.usage.requests).toBe(12);
  expect(
    i.nodes.find((n: any) => n.id === "lead").output.findings[0],
  ).toMatchObject({ verification: "source-checked", review: "pending" });
  expect(i.nodes.find((n: any) => n.id === "approval").state).toBe("review");
  expect(running.has(i.id)).toBe(false);
  // A new cost record invalidates its dependants while preserving contract results and the previous snapshot.
  const contract = i.nodes.find((n: any) => n.id === "contract");
  const oldHistory = contract.history.length;
  invalidate(i.nodes, ["cost"], "New cost evidence");
  expect(contract.history.length).toBe(oldHistory);
  expect(contract.state).toBe("completed");
  expect(
    i.nodes.find((n: any) => n.id === "lead").output.findings[0],
  ).toMatchObject({ stale: true, review: "pending" });
  expect(
    i.versions[0].nodes.find((n: any) => n.id === "lead").output.findings[0]
      .stale,
  ).toBeUndefined();
});
it("fails authentication errors without retries or fabricated findings (mock transport)", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only-key");
  const fetch = vi.fn(async () => new Response("", { status: 401 }));
  vi.stubGlobal("fetch", fetch);
  const p = demoProject("failure-test");
  await execute(p, p.investigations[0]);
  const i = p.investigations[0];
  expect(i.status).toBe("failed");
  expect(fetch.mock.calls.length).toBe(2);
  expect(i.nodes.find((n: any) => n.id === "contract").output).toBeNull();
  expect(i.events.some((e: any) => e.message.includes("(401)"))).toBe(true);
});
it("cancels running network requests and preserves completed deterministic work (mock transport)", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only-key");
  const p = demoProject("cancel-test");
  const i = p.investigations[0];
  vi.stubGlobal(
    "fetch",
    (_url: any, opts: any) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener(
          "abort",
          () => reject(Error("Cancelled")),
          { once: true },
        );
      }),
  );
  const pending = execute(p, i);
  setTimeout(() => running.get(i.id)?.abort(), 20);
  await pending;
  expect(i.status).toBe("cancelled");
  expect(i.nodes.find((n: any) => n.id === "sources").state).toBe("completed");
  expect(i.nodes.some((n: any) => n.state === "cancelled")).toBe(true);
  expect(running.size).toBe(0);
});
