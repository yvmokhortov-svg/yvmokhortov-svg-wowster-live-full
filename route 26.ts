import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const reportSchema = z.object({
  streamId: z.string().trim().min(1).max(191),
  chatMessageId: z.string().trim().min(1).max(191),
  reason: z.string().trim().min(3).max(500),
});

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const parsed = reportSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const message = await prisma.chatMessage.findUnique({
      where: { id: parsed.data.chatMessageId },
      select: { id: true, streamId: true, userId: true, message: true, createdAt: true },
    });
    if (!message || message.streamId !== parsed.data.streamId) {
      return NextResponse.json({ error: "Chat message not found" }, { status: 404 });
    }

    const task = await prisma.adminTask.create({
      data: {
        type: "SUPPORT",
        status: "OPEN",
        createdById: user?.id ?? null,
        payloadJson: {
          source: "chat_report_abuse",
          kind: "question",
          streamId: parsed.data.streamId,
          chatMessageId: parsed.data.chatMessageId,
          reason: parsed.data.reason,
          reportedMessageHtml: message.message,
          messageCreatedAt: message.createdAt.toISOString(),
          submittedAt: new Date().toISOString(),
        },
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, ticketId: task.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
