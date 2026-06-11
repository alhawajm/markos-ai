import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import argon2 from "argon2";
import type { AuthSession, EmailVerificationChallenge, EmailVerificationResult, Locale, Role } from "@markos/shared-types";
import type {
  LoginInput,
  RefreshSessionInput,
  RegisterInput,
  RequestEmailVerificationInput,
  VerifyEmailInput
} from "@markos/validation";
import { createRedisClient } from "../cache/redis";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { slugifyWorkspaceName } from "./slug";
import { consumeRefreshToken, issueAuthTokens } from "./tokens";

export class AuthConflictError extends Error {
  constructor() {
    super("A user with this email already exists");
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
  }
}

export class EmailNotVerifiedError extends Error {
  constructor() {
    super("Email verification is required before login");
  }
}

export class EmailVerificationInvalidError extends Error {
  constructor() {
    super("Email verification token is invalid or expired");
  }
}

export async function register(input: RegisterInput): Promise<AuthSession> {
  const email = normalizeEmail(input.email);
  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id
  });
  const workspaceName = input.workspaceName ?? `${input.fullName}'s Workspace`;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const plan = await tx.plan.findUniqueOrThrow({
        where: {
          code: "STARTER"
        }
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName: input.fullName,
          locale: toPrismaLocale(input.locale),
          planId: plan.id,
          trialEndsAt: daysFromNow(14)
        }
      });

      const workspace = await tx.workspace.create({
        data: {
          ownerUserId: user.id,
          name: workspaceName,
          slug: await uniqueWorkspaceSlug(tx, workspaceName)
        }
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: "OWNER"
        }
      });

      return { user, workspace };
    });

    return sessionFor({
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        locale: fromPrismaLocale(result.user.locale),
        isVerified: result.user.isVerified
      },
      workspace: result.workspace,
      roles: ["OWNER"]
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AuthConflictError();
    }

    throw error;
  }
}

export async function login(input: LoginInput): Promise<AuthSession> {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({
    where: {
      email
    }
  });

  if (user?.passwordHash === undefined || user.passwordHash === null) {
    throw new InvalidCredentialsError();
  }

  const passwordOk = await argon2.verify(user.passwordHash, input.password);

  if (!passwordOk) {
    throw new InvalidCredentialsError();
  }

  if (!user.isVerified) {
    throw new EmailNotVerifiedError();
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      deletedAt: null
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  if (membership === null) {
    throw new InvalidCredentialsError();
  }

  const workspace = await prisma.workspace.findFirstOrThrow({
    where: {
      id: membership.workspaceId,
      deletedAt: null
    }
  });

  await prisma.user.update({
    where: {
      id: user.id
    },
    data: {
      lastLoginAt: new Date()
    }
  });

  return sessionFor({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      locale: fromPrismaLocale(user.locale),
      isVerified: user.isVerified
    },
    workspace,
    roles: [membership.role as Role]
  });
}

export async function requestEmailVerification(input: RequestEmailVerificationInput): Promise<EmailVerificationChallenge> {
  const email = normalizeEmail(input.email);
  const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_TTL * 1000);
  const user = await prisma.user.findUnique({
    where: {
      email
    }
  });

  if (user === null || user.deletedAt !== null) {
    return {
      alreadyVerified: false,
      email,
      expiresAt: expiresAt.toISOString()
    };
  }

  if (user.isVerified) {
    return {
      alreadyVerified: true,
      email,
      expiresAt: new Date().toISOString()
    };
  }

  const token = await storeEmailVerificationToken(user.id, expiresAt);

  return {
    alreadyVerified: false,
    email,
    expiresAt: expiresAt.toISOString(),
    ...(env.NODE_ENV === "production" ? {} : { verificationToken: token })
  };
}

export async function verifyEmail(input: VerifyEmailInput): Promise<EmailVerificationResult> {
  const tokenHash = hashToken(input.token);
  const redis = createRedisClient();
  let userId: string | null;

  try {
    await redis.connect();
    userId = await redis.get(emailVerificationTokenKey(tokenHash));

    if (userId === null) {
      throw new EmailVerificationInvalidError();
    }

    await redis.del(emailVerificationTokenKey(tokenHash), emailVerificationUserKey(userId));
  } finally {
    redis.disconnect();
  }

  const user = await prisma.user.update({
    data: {
      isVerified: true
    },
    where: {
      id: userId
    }
  });

  return {
    email: user.email,
    isVerified: user.isVerified
  };
}

export async function refreshSession(input: RefreshSessionInput): Promise<AuthSession> {
  const tokenInput = await consumeRefreshToken(input.refreshToken);
  const user = await prisma.user.findFirstOrThrow({
    where: {
      deletedAt: null,
      id: tokenInput.userId
    }
  });
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      deletedAt: null,
      userId: tokenInput.userId,
      workspaceId: tokenInput.workspaceId
    },
    select: {
      role: true
    }
  });

  if (membership === null) {
    throw new InvalidCredentialsError();
  }

  const workspace = await prisma.workspace.findFirstOrThrow({
    where: {
      deletedAt: null,
      id: tokenInput.workspaceId
    }
  });

  return sessionFor({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      locale: fromPrismaLocale(user.locale),
      isVerified: user.isVerified
    },
    workspace,
    roles: [membership.role as Role]
  });
}

async function storeEmailVerificationToken(userId: string, expiresAt: Date): Promise<string> {
  const redis = createRedisClient();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const ttlSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));

  try {
    await redis.connect();
    const previousTokenHash = await redis.get(emailVerificationUserKey(userId));
    const pipeline = redis.pipeline();

    if (previousTokenHash !== null) {
      pipeline.del(emailVerificationTokenKey(previousTokenHash));
    }

    pipeline.set(emailVerificationTokenKey(tokenHash), userId, "EX", ttlSeconds);
    pipeline.set(emailVerificationUserKey(userId), tokenHash, "EX", ttlSeconds);
    await pipeline.exec();
  } finally {
    redis.disconnect();
  }

  return token;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function emailVerificationTokenKey(tokenHash: string): string {
  return `email-verification:token:${tokenHash}`;
}

function emailVerificationUserKey(userId: string): string {
  return `email-verification:user:${userId}`;
}

async function sessionFor(input: {
  user: AuthSession["user"];
  workspace: AuthSession["workspace"];
  roles: Role[];
}): Promise<AuthSession> {
  const tokens = await issueAuthTokens({
    userId: input.user.id,
    workspaceId: input.workspace.id,
    roles: input.roles
  });

  return {
    user: input.user,
    workspace: input.workspace,
    roles: input.roles,
    tokens: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: env.JWT_ACCESS_TTL
    }
  };
}

async function uniqueWorkspaceSlug(tx: Prisma.TransactionClient, name: string): Promise<string> {
  const baseSlug = slugifyWorkspaceName(name);
  let attempt = 0;

  while (attempt < 20) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const slug = `${baseSlug}${suffix}`;
    const existing = await tx.workspace.findUnique({
      where: {
        slug
      },
      select: {
        id: true
      }
    });

    if (existing === null) {
      return slug;
    }

    attempt += 1;
  }

  return `${baseSlug}-${Date.now()}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function toPrismaLocale(locale: Locale): "AR" | "EN" {
  return locale === "ar" ? "AR" : "EN";
}

function fromPrismaLocale(locale: "AR" | "EN"): Locale {
  return locale === "AR" ? "ar" : "en";
}
