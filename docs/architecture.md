# Architecture

React supplies the Sudoku-inspired application shell and SVG graph canvas. Express serves the authenticated API and the Vite production build. Node’s native SQLite stores users, hashed sessions, organization settings, recovery-code hashes, invitation hashes, durable jobs, audit records and project aggregates. WAL and organization/job/session indexes are enabled. Project aggregates preserve documents/pages, graph inputs/outputs, source references, notes, deterministic inputs and execution snapshots.

## Documents

Original files are immutable UUID-named files with restrictive permissions. Every file/SSE/project route checks the authenticated organization. Uploads are signature/type checked, capped at 15 MB, and handed to isolated subprocesses: at most two active and eight waiting, 120-second deadlines, 512 MiB JS heaps and no inherited API credential variables. PDFParse preserves page numbers. Tesseract uses bundled English language data; Sharp bounds image pixels and OCR resolution. Email bodies are MIME-decoded. Originals are never executed or rendered as HTML; React escapes extracted content.

The upload handler re-reads the latest project after asynchronous extraction so concurrent completions cannot overwrite one another. A project extraction-text budget keeps accepted input bounded. Explicit CSV/JSON import converts supported records into validated deterministic inputs. Source excerpts are literal substrings of stored original-page text; OCR output is labeled as recognition, not proof.

## Investigation execution

The persistent DAG validates IDs/dependencies and rejects cycles. Source nodes return bounded source excerpts, deterministic nodes calculate impacts, analytical nodes call OpenAI, and human gates pause for review. Up to three eligible nodes execute concurrently. Original documents stay inspectable even when tool excerpts are bounded. The Responses API integration uses source-search and impact tools, structured output schemas, four reasoning steps per agent, ten tool calls, three attempts for retryable statuses, 60-second request limits and a 10-minute run deadline.

SQLite jobs record queued/running/completed/failed/cancelled executions. A scheduler runs at most eight jobs globally and two per organization, with one active job per project. Input mutations are locked while jobs are queued/running. Interrupted running nodes become cancelled on startup, durable jobs are requeued, and valid completed nodes are retained. Cancellation handles queued and running jobs. Graceful shutdown aborts network work; a later startup recovers durable state. This is a single-instance durable worker, not a distributed system.

Actual transitions persist before emitting SSE updates. Access is rechecked before emitting events and at heartbeat, so a revoked user does not retain a live stream. Token counts come from provider usage; dollar estimates require entered model rates. The UI does not display invented thoughts or completion states.

## Review and incremental changes

Professional findings can be authored without AI and are explicitly labeled human-origin. Source quotation checks and human acceptance are separate. Unsupported or stale findings cannot be accepted. New evidence identifies roots through source links, document categories and topic overlap, then invalidates descendants. Unknown text falls back to conservative analytical invalidation. Previous outputs remain visibly stale, acceptance is cleared and historical snapshots are preserved. Professionals can reopen selected nodes or revise a professional assessment. A side-by-side comparison distinguishes changed from retained outputs.

Deterministic scheduling uses calendar-day finish-to-start relationships, earliest/latest dates and float; an optional baseline date supplies dated outputs. Financial calculations use integer cents, safe-integer guards and source integrity checks. These calculations do not establish legal entitlement.

## Security and portability

Passwords use salted scrypt; sessions use random 256-bit tokens stored as hashes. Cookies are HttpOnly, SameSite=Strict and Secure in production. Same-origin write checks, request limits, schema validation and role guards protect APIs. Password rotation/recovery revokes existing sessions. Recovery codes and team invitations are hashed and single-use. Owners can change roles or remove members and revoke their sessions. Organization keys use AES-256-GCM and are never sent back to the client; the default host encryption key is a restricted file in the persistent volume.

PDFs record scope, source register, professional/AI origin, calculation assumptions, review states, limitations and change history. ZIP exports contain the complete project and originals but no credentials. Native SQLite backups plus immutable originals support checksum-verified restoration; sessions and unfinished jobs are revoked during restore. See supported-scope documentation for deployment boundaries.
