FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=environment_ca if [ -f /run/secrets/environment_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/environment_ca; fi; npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24.19.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates fonts-liberation libfontconfig1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/scripts ./scripts
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm","start"]
