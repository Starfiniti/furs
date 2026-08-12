ARG NODE_IMAGE=node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03
FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
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
COPY --from=build --chown=node:node /release /app
USER node
EXPOSE 8080
CMD ["node", "/app/api/dist/main.js"]
