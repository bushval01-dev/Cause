/** Local API stress check. Does not spend OpenAI tokens. */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
const dir = mkdtempSync(resolve(tmpdir(), "cause-load-"));
const port = 3200;
const base = `http://localhost:${port}`;
const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    ENABLE_DEMO: "true",
    PORT: String(port),
    DATA_DIR: dir,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: any[] = [];
let failures = 0;
async function stage(
  name: string,
  count: number,
  concurrency: number,
  fn: (index: number) => Promise<Response>,
) {
  const latencies: number[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < count) {
        const idx = cursor++;
        const start = performance.now();
        const r = await fn(idx);
        await r.arrayBuffer();
        if (!r.ok) failures++;
        latencies.push(performance.now() - start);
      }
    }),
  );
  latencies.sort((a, b) => a - b);
  results.push({
    name,
    requests: count,
    concurrency,
    p50Ms: Math.round(latencies[Math.floor(count * 0.5)]),
    p95Ms: Math.round(latencies[Math.floor(count * 0.95)]),
    maxMs: Math.round(latencies[count - 1]),
  });
}
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await wait(100);
  }
  if (!ready) throw Error("Stress server did not start");
  const demo = await fetch(base + "/api/demo", { method: "POST" });
  if (!demo.ok) throw Error("Demo initialization failed");
  const cookie = demo.headers.get("set-cookie")!.split(";")[0];
  const headers = { Cookie: cookie };
  const projects = (await (
    await fetch(base + "/api/projects", { headers })
  ).json()) as any[];
  const p = projects[0];
  await stage("Project reads", 300, 30, () =>
    fetch(`${base}/api/projects/${p.id}`, { headers }),
  );
  await stage("Isolated project writes", 20, 10, (i) =>
    fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Stress project " + i }),
    }),
  );
  await stage("PDF generation", 6, 3, () =>
    fetch(
      `${base}/api/projects/${p.id}/investigations/${p.investigations[0].id}/report`,
      { headers },
    ),
  );
  const all = (await (
    await fetch(base + "/api/projects", { headers })
  ).json()) as any[];
  if (all.filter((p) => p.name.startsWith("Stress project")).length !== 20)
    throw Error("Concurrent writes lost data");
  const rss = readFileSync(`/proc/${server.pid}/status`, "utf8").match(
    /^VmRSS:\s+(.*)$/m,
  )?.[1];
  const output = {
    at: new Date().toISOString(),
    environment:
      "Local single-process production build, fictional data, no AI requests",
    results,
    failures,
    serverRss: rss,
    persistedConcurrentWrites: 20,
  };
  console.log(JSON.stringify(output, null, 2));
  writeFileSync(
    "/tmp/cause-stress-results.json",
    JSON.stringify(output, null, 2),
  );
  if (failures || results.some((r) => r.p95Ms > 2000)) process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
}
