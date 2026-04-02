import { prisma } from "@/lib/db";
import { verifyPassword } from "./password";
import { createOrReplaceDeviceSession, setSessionCookie } from "./session";

export async function loginAndCreateSession(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      nickname: true,
      role: true,
      passwordHash: true,
      bannedAt: true,
    },
  });

  if (!user) return { ok: false as const, code: "INVALID_CREDENTIALS" as const };
  if (user.bannedAt) return { ok: false as const, code: "BANNED" as const };

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { ok: false as const, code: "INVALID_CREDENTIALS" as const };

  const token = await createOrReplaceDeviceSession(user.id);
  await setSessionCookie(token);

  return {
    ok: true as const,
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
    },
  };
}
