import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { findSexualContent } from "@/lib/moderation/text-safety";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const createReportSchema = z.object({
  targetType: z.enum([
    "chat_message",
    "profile",
    "graduation_work",
    "upload",
    "stream",
    "other",
  ]),
  targetId: z.string().min(1).max(191).optional(),
  reason: z.string().trim().min(3).max(500),
  context: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = createReportSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const sexualMatch = findSexualContent({
      reason: parsed.data.reason,
      context: parsed.data.context ?? null,
    });
    if (sexualMatch) {
      return NextResponse.json(
        { error: "Sexual content is not allowed." },
        { status: 400 },
      );
    }

    const report = await prisma.adminTask.create({
      data: {
        type: "REPORT",
        status: "OPEN",
        createdById: user.id,
        payloadJson: {
          source: "in_app_report",
          targetType: parsed.data.targetType,
          targetId: parsed.data.targetId ?? null,
          reason: parsed.data.reason,
          context: parsed.data.context ?? null,
          reporter: {
            userId: user.id,
            email: user.email,
            nickname: user.nickname,
            role: user.role,
          },
          submittedAt: new Date().toISOString(),
        },
      },
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, report }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
