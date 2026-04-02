import { cookies } from "next/headers";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";

const PREVIEW_COOKIE = "preview_content";

export async function isContentPreviewEnabled(): Promise<boolean> {
  const cookieStore = await cookies();
  const flag = cookieStore.get(PREVIEW_COOKIE)?.value === "1";
  if (!flag) return false;

  const user = await getCurrentUser();
  return !!user && user.role === Role.ADMIN;
}

export { PREVIEW_COOKIE };
