# Release validation

Recorded 23 October 2026 on Linux / Node 24.19. All materials are fictional fixtures. OpenAI keys remained empty for application/browser/container workflows; AI engine tests use an explicitly mocked transport.

## Passed

- Strict TypeScript and Vite production build, both locally and inside the Docker image.
- **39 automated domain/API/release/recovery checks**: scheduling paths and float; cent arithmetic and overflow; source integrity; dependency validation/concurrency; cancellation and mocked provider failures; PDF and MIME extraction; actual image OCR; concurrent upload preservation; tenant/role/session isolation; password recovery and rotation; invitation consumption and team removal; encrypted optional organization keys; manual professional assessments/review/reopening; CSV imports; real PDF/ZIP files; native database backup/checksum restore; actual process-restart durable-job recovery; and immediate event-stream closure after access revocation.
- **8 Chromium workflows** against an isolated production server: uploads/source inspection/calculations/export/project persistence; graph inspection and cycle rejection; no-key optional-AI path; mobile navigation/overflow at 390×844; repeated search/navigation; professional findings/review/version comparison; schedule/cost forms with cent precision; account-owned startup with the key empty; and interactive rendering of a 100-node evidence graph. Some workflows cover several behaviors in one test.
- **326 local stress requests, zero failures**: 300 project reads at concurrency 30, 20 writes at concurrency 10 and 6 PDF exports at concurrency 3. All 20 writes persisted. Latest local p95: 28 ms reads, 28 ms writes, 42 ms PDF generation; observed server RSS ~123 MiB. These measurements use small fictional projects and do not establish WAN/live-model/maximum-document capacity.
- A 2,000-node dependency-validation test passes separately from the 100-node browser rendering check.
- A non-root production container constrained to **2 CPUs / 2 GiB** passes real health, English OCR, durable queue, deterministic calculation, PDF and project-archive checks with no key configured. Its immutable image includes local OCR data and production-only dependencies.
- npm production dependency audit: **zero reported vulnerabilities** at the recorded run. This is not an independent penetration test or an OS vulnerability certification.

## Deliberately unrun

Live Responses API/model quality, autonomous semantic contradiction quality, live token billing and the complete autonomous before/after demonstration require a user-supplied key. The no-key professional-assessment workflow is tested independently. No public deployment, domain/certificate provisioning or production-host capacity is claimed.

Run the documented checks again after changes. See `limitations.md` for supported formats, limits and single-instance deployment scope.
