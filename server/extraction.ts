import { fork } from "node:child_process";
import { resolve } from "node:path";
let active = 0;
const queue: (() => void)[] = [];
async function slot() {
  if (active >= 2) {
    if (queue.length >= 8)
      throw Error("Document processing queue is full; retry shortly");
    await new Promise<void>((r) => queue.push(r));
  }
  active++;
}
export async function extract(
  path: string,
  mime: string,
  name: string,
): Promise<{ pages: any[]; method: string; attachments: any[] }> {
  await slot();
  try {
    return await new Promise((resolveResult, reject) => {
      const worker = fork(resolve("server/extraction-worker.ts"), [], {
        execArgv: ["--import", "tsx", "--max-old-space-size=512"],
        env: {
          PATH: process.env.PATH,
          NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS,
        },
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
      const timer = setTimeout(() => {
        worker.kill("SIGKILL");
        reject(Error("Document extraction timed out (120 seconds)"));
      }, 120000);
      let settled = false;
      const done = () => {
        settled = true;
        clearTimeout(timer);
      };
      worker.on("message", (v: any) => {
        done();
        v.error ? reject(Error(v.error)) : resolveResult(v);
      });
      worker.on("error", (e) => {
        done();
        reject(e);
      });
      worker.on("exit", (code) => {
        const missing = !settled;
        done();
        if (code || missing)
          reject(Error("Document processor stopped unexpectedly"));
      });
      worker.send({ path, mime, name });
    });
  } finally {
    active--;
    queue.shift()?.();
  }
}
