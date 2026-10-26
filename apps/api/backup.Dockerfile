FROM node:22-bookworm-slim
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
# Match the deployed PostgreSQL major; Debian's default client is too old for PG16 dumps.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl openssl \
    && mkdir -p /usr/share/postgresql-common/pgdg \
    && curl --fail --silent --show-error https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 \
    && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages packages
COPY patches patches
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
RUN pnpm --filter api prisma generate && pnpm --filter api typecheck
CMD ["pnpm", "--filter", "api", "exec", "tsx", "src/operations/backup-runner.ts"]
