import { Prisma } from "@prisma/client";
import argon2 from "argon2";
import type { AuthSession, Locale, Role } from "@markos/shared-types";
import type { LoginInput, RefreshSessionInput, RegisterInput } from "@markos/validation";
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
