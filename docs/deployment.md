# Deployment

The supported deployment is **one persistent Node 24.19+ service behind HTTPS**. No OpenAI key is needed. Production does not silently create anonymous accounts; users register or sign in. Organization owners can opt into AI later in application Settings.

## Container

```sh
docker compose up --build -d
```

The image builds the production bundle, removes development dependencies, runs as the non-root `node` user and includes the fonts/native libraries needed for PDF/OCR. Local OCR language data ships inside the image. Compose limits the service to 2 CPUs/2 GiB, uses a named `/data` volume, and binds `127.0.0.1:3000` for a reverse proxy. A health check uses `/api/health`.

Configure your HTTPS reverse proxy to forward to port 3000, permit request bodies up to 16 MB (the application caps files at 15 MB), and disable response buffering for SSE event endpoints. Set an upload response timeout above the 120-second document-processing limit. Configure `TRUST_PROXY_HOPS` only to the exact trusted hop count; otherwise the default conservative IP limiter may be shared across proxy users. Do not expose the application port as a public alternative to HTTPS.

For a managed host without Docker:

```sh
npm ci
npm run build
NODE_ENV=production DATA_DIR=/persistent/cause npm start
```

Provide a persistent writable volume, restart policy, health monitoring and HTTPS. Snapshot-backed cloud files can persist; running processes must restart. Serverless/ephemeral and multi-instance deployments are unsupported. No public host, domain, certificate or external deployment was provisioned in this task.

## Persistence and recovery

`DATA_DIR` contains SQLite/WAL, immutable UUID-named originals, and a restricted `.master-key` created only when organization credentials are first saved. An optional externally managed `CAUSE_ENCRYPTION_KEY` must base64-encode 32 bytes; preserve it outside the volume if you use it. Losing that key makes saved AI credentials unrecoverable. Project ZIP exports exclude keys, passwords and sessions.

```sh
npm run backup -- /secure-backups/cause-2026-10-23
npm run restore -- /secure-backups/cause-2026-10-23 /new-persistent/cause
```

Backup uses SQLite’s native backup operation, copies originals referenced by that snapshot, and records SHA-256 checksums. Restore requires a new directory, verifies every checksum and database integrity, and revokes sessions, pending invitations and unfinished jobs. Protect and encrypt backup storage; a full backup contains account data and may include the credential encryption key. Stop the old instance before switching `DATA_DIR` to the restored directory. Automated tests exercise an actual backup/restore and real process-restart job recovery.

## Optional AI

No host credential is required. Owners can save or remove an encrypted organization key in Settings, select a model and enter provider rates. If using a server environment key instead, configure it in the host’s secret manager. Never use `VITE_` variables for secrets. Allow outbound HTTPS to `api.openai.com` only when enabling AI. A proxy-managed cloud can use `NODE_USE_ENV_PROXY=1` and its existing CA trust; do not disable verification.

Enabling AI introduces provider cost and model uncertainty. Live-key acceptance is separate from the tested no-key release. Anonymous demo and demo AI flags (`ENABLE_DEMO`, `ALLOW_DEMO_AI`) remain independently off by default.

## Build behind a cloud proxy

Docker’s build network may need the platform’s existing proxy and hostname mapping. Forward standard Docker proxy build arguments. The Dockerfile accepts an optional BuildKit `environment_ca` secret for npm trust during build; it is not copied into runtime layers. Keep npm integrity, Debian package signatures and TLS checks enabled. Normal hosts can use the plain Compose command above.
