import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { hashPassword } from "./password";
import { createOrReplaceDeviceSession, setSessionCookie } from "./session";

type RegisterInput = {
  email: string;
  password: string;
  nickname: string;
  role: Role;
};

export async function registerAndCreateSession(input: RegisterInput) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    return { ok: false as const, code: "EMAIL_EXISTS" as const };
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      nickname: input.nickname,
      role: input.role,
    },
    select: {
      id: true,
      email: true,
      nickname: true,
      role: true,
    },
  });

  const token = await createOrReplaceDeviceSession(user.id);
  await setSessionCookie(token);

  return { ok: true as const, user };
}
