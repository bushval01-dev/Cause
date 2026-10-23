import { it, expect } from "vitest";
import { spawn, execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
it("recovers a persisted interrupted job after a real server restart without an AI key", async () => {
  const dir = mkdtempSync("/tmp/cause-restart-"),
    port = 3211,
    base = `http://localhost:${port}`;
  let processHandle: any;
  const start = async () => {
    processHandle = spawn(
      process.execPath,
      ["--import", "tsx", "server/index.ts"],
      {
        env: {
          ...process.env,
          NODE_ENV: "production",
          ENABLE_DEMO: "true",
          PORT: String(port),
          DATA_DIR: dir,
          OPENAI_API_KEY: "",
          CAUSE_AI_KEY: "",
        },
        stdio: "ignore",
      },
    );
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(base + "/api/health")).ok) return;
      } catch {}
      await wait(100);
    }
    throw Error("Restart test server failed to start");
  };
  const stop = async () => {
    if (!processHandle) return;
    const p = processHandle;
    processHandle = null;
    await new Promise<void>((resolve) => {
      p.once("exit", () => resolve());
      p.kill("SIGTERM");
    });
  };
  try {
    await start();
    const demo = await fetch(base + "/api/demo", { method: "POST" });
    const cookie = demo.headers.get("set-cookie")!.split(";")[0],
      headers = { Cookie: cookie };
    let p = (
      await (await fetch(base + "/api/projects", { headers })).json()
    )[0];
    await stop();
    const db = new DatabaseSync(join(dir, "cause.sqlite"));
    p.investigations[0].status = "running";
    p.investigations[0].nodes[0].state = "running";
    db.prepare("UPDATE projects SET data=? WHERE id=?").run(
      JSON.stringify(p),
      p.id,
    );
    const at = new Date().toISOString();
    db.prepare("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,NULL)").run(
      "restart-test",
      p.org,
      p.id,
      p.investigations[0].id,
      "calculations",
      "running",
      at,
      at,
    );
    db.close();
    await start();
    for (let n = 0; n < 80; n++) {
      p = await (
        await fetch(base + "/api/projects/" + p.id, { headers })
      ).json();
      if (
        p.investigations[0].nodes.find((n: any) => n.id === "cost").state ===
        "completed"
      )
        break;
      await wait(100);
    }
    expect(
      p.investigations[0].nodes.find((n: any) => n.id === "cost").output
        .supported,
    ).toBe(428000);
    expect(p.documents).toHaveLength(6);
    const verified = new DatabaseSync(join(dir, "cause.sqlite"));
    expect(
      (
        verified
          .prepare("SELECT status FROM jobs WHERE id=?")
          .get("restart-test") as any
      ).status,
    ).toBe("completed");
    verified.close();
  } finally {
    await stop();
  }
}, 25000);
