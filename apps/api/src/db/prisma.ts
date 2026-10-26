import { env } from "../config/env";

import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({ transactionOptions: { maxWait: env.DB_TRANSACTION_MAX_WAIT_MS, timeout: env.DB_TRANSACTION_TIMEOUT_MS } });
