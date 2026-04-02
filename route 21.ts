import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { PREVIEW_COOKIE } from "@/lib/content/preview";

export const runtime = "nodejs";

export async function GET() {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cookieStore = await cookies();
  const previewEnabled = cookieStore.get(PREVIEW_COOKIE)?.value === "1";
  return NextResponse.json({ previewEnabled }, { status: 200 });
}

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let enabled = false;
  try {
    const payload = (await request.json()) as { enabled?: boolean };
    enabled = payload.enabled === true;
  } catch {
    enabled = false;
  }

  const cookieStore = await cookies();
  if (enabled) {
    cookieStore.set(PREVIEW_COOKIE, "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  } else {
    cookieStore.delete(PREVIEW_COOKIE);
  }

  return NextResponse.json({ previewEnabled: enabled }, { status: 200 });
}
