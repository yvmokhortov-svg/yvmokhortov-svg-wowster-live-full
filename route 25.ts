import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

const patchTaskSchema = z.object({
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  assignToMe: z.boolean().optional(),
  clearAssignee: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const parsed = patchTaskSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const existing = await prisma.adminTask.findUnique({
      where: { id },
      select: { id: true, type: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const assigneeId = parsed.data.clearAssignee
      ? null
      : parsed.data.assignToMe
        ? actor.id
        : undefined;

    const updated = await prisma.adminTask.update({
      where: { id },
      data: {
        status: parsed.data.status,
        assigneeId,
        closedAt:
          parsed.data.status === "CLOSED"
            ? new Date()
            : parsed.data.status === "OPEN"
              ? null
              : undefined,
      },
      include: {
        createdBy: {
          select: { id: true, email: true, nickname: true },
        },
        assignee: {
          select: { id: true, email: true, nickname: true },
        },
      },
    });

    return NextResponse.json({ task: updated }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
