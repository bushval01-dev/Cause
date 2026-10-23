import { defineConfig } from "@playwright/test";
import chromium from "@sparticuz/chromium";
export default defineConfig({
  testDir: "tests/e2e",
  webServer: {
    command:
      "NODE_ENV=production ENABLE_DEMO=true PORT=3100 DATA_DIR=/tmp/cause-e2e-" +
      process.pid +
      " npm start",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://localhost:3100",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: await chromium.executablePath(),
      args: chromium.args.filter((a) => a !== "--single-process"),
      env: { ...process.env, XDG_CACHE_HOME: "/tmp/cause-browser-cache" },
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
