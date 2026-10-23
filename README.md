# CAUSE

Construction evidence and claims intelligence, built with TypeScript, React, Express and SQLite. The interface blends the supplied Sudoku reference’s quiet sidebar and rounded panels with the Thai node reference’s cream surfaces, lime accents, curved connections and dotted canvas.

## Start without an OpenAI key

Requires Node **24.19+**. Work in the existing checkout; cloud tasks are already isolated.

```sh
npm ci --cache /tmp/cause-npm-cache
npm run dev
```

The default port is 3000. Development opens an explicitly fictional workspace. Create an account through Settings for your private organization. No AI findings are simulated. The OpenAI key may remain **empty**: projects, document extraction, scheduling, cost calculations, professional findings, review, versions, reports and exports all work without it.

Organization owners can optionally add an encrypted key in **Settings → Your OpenAI connection**. It is never returned to the browser. A hosting administrator may instead configure `OPENAI_API_KEY` or `CAUSE_AI_KEY`. See `.env.example`; no key belongs in frontend build variables. For proxy-managed cloud networking, use `NODE_USE_ENV_PROXY=1`, preserve platform CA trust, and allow `api.openai.com` only when AI is wanted.

## Included workflow

- Private projects, archive/restore, multiple investigations, project/source search, professional notes and audit history.
- Original-file preservation; PDF/text extraction; local English OCR for images/scans; MIME-decoded email bodies. Source inspection shows actual pages, extraction method and OCR confidence.
- CSV/JSON schedule and cost imports, downloadable templates, and usable entry forms. Critical-path calculations use deterministic code; financial math uses integer cents and distinguishes documented, estimated and unsupported amounts.
- Thirteen graph node types, persisted drag positions/dependencies, cycle prevention, source inspection, human decision gates, execution history, cancellation, retries and real SSE updates.
- Durable investigation jobs, bounded subprocess document extraction, restart recovery and preservation of completed operations.
- Source-backed professional findings without AI, explicit review, targeted reopening, side-by-side version comparison, and incremental invalidation from source references/topics and graph dependencies.
- Actual PDF assessments and complete ZIP project archives containing originals, source pages, graph, findings, calculations, notes and versions. Credentials are excluded from project exports.
- Account recovery codes, password rotation, team invitations, role changes/removal, secure sessions and organization isolation. Invitation links use your existing secure sharing channel; the app does not send email.
- Optional real OpenAI Responses API integration: six specialist/coordinating roles, source-search/calculation tools, structured outputs, token accounting, entered-rate cost estimates, limits and cancellation. Live AI quality remains unvalidated while the key is empty.

## Production

```sh
npm run build
NODE_ENV=production npm start
# Or:
docker compose up --build -d
```

Use one persistent instance behind HTTPS. Production cookies are Secure. Anonymous demos and their AI budget are disabled by default. Compose binds to loopback for an HTTPS reverse proxy and retains `/data` in a named volume. See [deployment](docs/deployment.md) for proxy, persistence, backup and restore details. This task does not publish a public deployment.

## Verify

```sh
npm test
npm run build
npm run test:e2e
npm run test:stress
npm audit --omit=dev --audit-level=high
```

Browser tests start an isolated production server on port 3100. Stress tests use port 3200 and never spend AI tokens. Restart recovery tests use port 3211. Chromium comes from the checksum-verified npm package, and OCR language data is bundled for offline operation.

[Validation results](docs/validation.md) · [Architecture](docs/architecture.md) · [Supported scope and limitations](docs/limitations.md)
