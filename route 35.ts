import { NextResponse } from "next/server";
import { Role } from "@/generated/prisma/enums";
import { registerSchema } from "@/lib/auth/schemas";
import { findSexualContent } from "@/lib/moderation/text-safety";
import { registerAndCreateSession } from "@/lib/auth/register";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = registerSchema.safeParse({
      ...json,
      role: "STUDENT",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const sexualMatch = findSexualContent({ nickname: parsed.data.nickname });
    if (sexualMatch) {
      return NextResponse.json(
        { error: "Sexual content is not allowed." },
        { status: 400 },
      );
    }

    const result = await registerAndCreateSession({
      ...parsed.data,
      role: Role.STUDENT,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    return NextResponse.json({ user: result.user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
