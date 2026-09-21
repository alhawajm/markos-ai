dev:
	corepack pnpm dev

verify:
	corepack pnpm verify

test:
	corepack pnpm test

test.browser:
	corepack pnpm --filter web test:browser

build:
	corepack pnpm build

db.up:
	docker compose up -d postgres redis opensearch

db.down:
	docker compose down

db.reset:
	docker compose down -v
	docker compose up -d postgres redis opensearch

migrate:
	corepack pnpm --filter api prisma migrate dev

seed:
	corepack pnpm --filter api prisma db seed
