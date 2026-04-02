import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { resolveCurrentUserIdFromSession } from "./session";

export type CurrentUser = {
  id: string;
  role: Role;
  email: string;
  nickname: string;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const userId = await resolveCurrentUserIdFromSession();
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      email: true,
      nickname: true,
      bannedAt: true,
    },
  });

  if (!user) return null;
  // bannedAt is treated as "banned until". Past date restores access.
  if (user.bannedAt && user.bannedAt > new Date()) return null;

  return {
    id: user.id,
    role: user.role,
    email: user.email,
    nickname: user.nickname,
  };
}

export function hasRole(user: CurrentUser | null, roles: Role[]): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}
