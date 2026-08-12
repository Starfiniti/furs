ARG NODE_IMAGE=node:24-alpine3.23@sha256:244cc2b53f46f9e876304391d17682b0ddae9ac33491f4857e25e35a36ba7995
FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md ./
RUN pnpm install --frozen-lockfile \
    && pnpm build \
    && pnpm --filter @starfiniti/furs-api deploy --prod --offline /release/api \
    && pnpm --filter @starfiniti/furs-worker deploy --prod --offline /release/worker \
    && pnpm --filter @starfiniti/furs-persistence-postgres deploy --prod --offline /release/persistence

FROM build AS evidence
ENV NODE_ENV=test
USER node

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
        /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=build --chown=node:node /release /app
COPY --from=build --chown=node:node /app/LICENSE /app/NOTICE /app/THIRD_PARTY_NOTICES.md /app/
USER node
EXPOSE 8080
CMD ["node", "/app/api/dist/main.js"]
