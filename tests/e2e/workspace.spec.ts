import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Riverside Quarter" }),
  ).toBeVisible();
});
test("evidence upload, exact source inspection, persistent project, calculations and PDF", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: "Add evidence", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "access-email.eml",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "11 September 2026. Grid C access was closed pending a safety inspection. This contradicts the site diary reporting available access.",
    ),
  });
  await page.locator("select[name=category]").selectOption("event");
  await page
    .getByRole("button", { name: "Upload evidence", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Evidence uploaded");
  await page
    .getByRole("button", { name: "Evidence library", exact: false })
    .first()
    .click();
  await page.getByLabel("Search evidence").fill("access-email");
  await page.getByRole("button", { name: /access-email.eml/ }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Grid C access was closed",
  );
  await expect(page.getByRole("dialog")).toContainText("PAGE 1");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Investigations", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Run calculations", exact: true })
    .click();
  await expect(page.getByText("3/11 completed")).toBeVisible();
  await page
    .getByRole("button", { name: "Inspect Financial analysis" })
    .click();
  await expect(page.locator(".inspector")).toContainText("428000");
  await page
    .getByRole("button", { name: "Impact analysis", exact: true })
    .click();
  await expect(page.getByText("+8", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF" }).click();
  expect((await download).suggestedFilename()).toContain(".pdf");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.locator("input[name=name]").fill("Harbour Extension");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Harbour Extension" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Harbour Extension" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("graph zoom, inspection, rejection of dependency cycles and missing AI key", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Investigations", exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.locator(".canvas-controls")).toContainText("72%");
  await page
    .getByRole("button", { name: "Inspect Contract analyst", exact: true })
    .click();
  await expect(page.locator(".inspector")).toContainText("No output yet");
  await page.getByRole("button", { name: "Edit node", exact: true }).click();
  await page
    .getByLabel("JSON inputs")
    .fill(JSON.stringify({ dependencies: ["lead"] }));
  await page.getByRole("button", { name: "Validate & save" }).click();
  await expect(page.getByRole("dialog")).toContainText("Dependency cycle");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page
    .getByRole("button", { name: "Run investigation", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Your workspace works without a key",
  );
});
test("mobile navigation, evidence source and no document overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Riverside Quarter" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await page
    .getByRole("button", { name: "Evidence library", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: /Construction agreement.txt/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Contract §8.3");
  await page.getByRole("button", { name: "Close dialog" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-workspace.png",
    fullPage: true,
  });
});
test("repeated navigation and searches remain responsive", async ({ page }) => {
  for (let i = 0; i < 15; i++) {
    await page
      .getByRole("button", { name: "Evidence library", exact: false })
      .first()
      .click();
    await page.getByLabel("Search evidence").fill("Construction agreement");
    await expect(page.locator(".library .doc-card")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Overview", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Riverside Quarter" }),
    ).toBeVisible();
  }
  await page.screenshot({
    path: "test-results/desktop-workspace.png",
    fullPage: true,
  });
});

test("no-key professional assessment, review, report and version comparison", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Investigations", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Add professional finding", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Notice obligation");
  await dialog
    .getByLabel("Assessment", { exact: true })
    .fill(
      "The contract requires notice. This is a professional assessment; no AI was used.",
    );
  const option = await dialog
    .locator("select[name=documentId] option")
    .nth(1)
    .getAttribute("value");
  await dialog.locator("select[name=documentId]").selectOption(option!);
  await dialog
    .getByLabel("Exact excerpt")
    .fill(
      "The contractor shall provide written notice of delay within 14 calendar days",
    );
  await dialog.getByRole("button", { name: "Add finding for review" }).click();
  await expect(page.locator("div.finding")).toContainText("Notice obligation");
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.locator("div.finding")).toContainText("accepted");
  await page.getByRole("button", { name: "Reopen selected analysis" }).click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Revisit the notice obligation");
  const id = await page
    .locator("select[name=nodeIds] option")
    .filter({ hasText: "Notice obligation" })
    .getAttribute("value");
  await page.locator("select[name=nodeIds]").selectOption([id!]);
  await page.getByRole("button", { name: "Save snapshot & reopen" }).click();
  await expect(page.locator("div.finding")).toContainText("Outdated");
  await page.getByRole("button", { name: /versions/ }).click();
  await expect(page.locator(".version-comparison")).toContainText("Changed");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  const file = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF" }).click();
  expect((await file).suggestedFilename()).toContain(".pdf");
});
test("schedule and cost entry use real forms and preserve cent precision", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Impact analysis", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit inputs" }).click();
  await page.getByLabel("Baseline start date").fill("2026-09-01");
  const first = page.locator(".input-record").first();
  await first.getByLabel("Baseline duration (days)").fill("6");
  await page.getByRole("button", { name: "Cost records", exact: true }).click();
  await page
    .locator(".input-record")
    .first()
    .getByLabel("Unit rate (USD)")
    .fill("45.25");
  await page.getByRole("button", { name: "Validate & save inputs" }).click();
  await expect(page.getByRole("status")).toContainText("Inputs saved");
  await expect(
    page.getByText("$45.25", { exact: false }).first(),
  ).toBeVisible();
});
test("account-owned workspace launches with the OpenAI field empty", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings & account" }).click();
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(`browser-${Date.now()}@example.test`);
  await page
    .getByRole("dialog")
    .locator("input[name=password]")
    .fill("a secure browser password 123");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your next project starts here." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.getByLabel("Project name").fill("Launch workspace");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Launch workspace" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings & account" }).click();
  await expect(
    page.getByRole("heading", { name: "Your OpenAI connection" }),
  ).toBeVisible();
  await expect(page.getByLabel("OpenAI API key (optional)")).toHaveValue("");
  await page.getByRole("button", { name: "Save connection settings" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "AI settings saved" }),
  ).toBeVisible();
  await expect(
    page.getByText("Optional · not connected", { exact: true }),
  ).toBeVisible();
});
test("100-node evidence graph stays interactive", async ({ page }) => {
  const p = (await (await page.request.get("/api/projects")).json())[0],
    i = p.investigations[0];
  for (let n = 11; n < 100; n++) {
    const response = await page.request.post(
      `/api/projects/${p.id}/investigations/${i.id}/nodes`,
      {
        data: {
          type: "evidence",
          title: `Evidence ${n}`,
          dependencies: ["sources"],
          inputs: { documentIds: [p.documents[0].id] },
        },
      },
    );
    expect(response.status()).toBe(201);
  }
  await page.reload();
  await page
    .getByRole("button", { name: "Investigations", exact: false })
    .first()
    .click();
  await expect(page.locator(".graph-node")).toHaveCount(100);
  await page.getByRole("button", { name: "Fit graph" }).click();
  await expect(page.locator(".canvas-controls")).toContainText("40%");
  await page
    .getByRole("button", { name: "Inspect Project evidence", exact: true })
    .click();
  await expect(page.locator(".inspector")).toContainText("Project evidence");
});
