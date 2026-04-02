import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

export const AUTH_COOKIE_NAME = "wowster_session";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createOrReplaceDeviceSession(userId: string): Promise<string> {
  const token = randomBytes(48).toString("hex");
  const tokenHash = hashToken(token);

  const headersStore = await headers();
  const userAgent = headersStore.get("user-agent");
  const ipAddress =
    headersStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersStore.get("x-real-ip");
  const countryCode =
    headersStore.get("x-vercel-ip-country") ??
    headersStore.get("cf-ipcountry");

  await prisma.deviceSession.upsert({
    where: { userId },
    create: {
      userId,
      tokenHash,
      userAgent,
      ipAddress,
      countryCode,
    },
    update: {
      tokenHash,
      userAgent,
      ipAddress,
      countryCode,
      revokedAt: null,
      lastSeenAt: new Date(),
    },
  });

  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

export async function resolveCurrentUserIdFromSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.deviceSession.findFirst({
    where: { tokenHash, revokedAt: null },
    select: { userId: true },
  });
  return session?.userId ?? null;
}

export async function revokeSessionByToken(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await prisma.deviceSession.updateMany({
    where: { tokenHash },
    data: { revokedAt: new Date() },
  });
}
