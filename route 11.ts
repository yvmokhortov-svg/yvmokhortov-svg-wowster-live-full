import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type Params = {
  params: Promise<{ id: string }>;
};

const patchSchema = z.object({
  cancel: z.boolean().optional(),
  reopen: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const task = await prisma.adminTask.findUnique({
      where: { id },
      select: { id: true, type: true, status: true, payloadJson: true },
    });
    if (!task) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    if (task.type !== "SUPPORT") {
      return NextResponse.json({ error: "Task is not manual trial assignment" }, { status: 409 });
    }
    const payload =
      task.payloadJson && typeof task.payloadJson === "object"
        ? (task.payloadJson as Record<string, unknown>)
        : null;
    if (payload?.source !== "manual_trial_assignment") {
      return NextResponse.json({ error: "Task is not manual trial assignment" }, { status: 409 });
    }

    const nextStatus = parsed.data.cancel
      ? "CLOSED"
      : parsed.data.reopen
        ? "OPEN"
        : task.status;

    const updated = await prisma.adminTask.update({
      where: { id },
      data: {
        status: nextStatus,
        closedAt: nextStatus === "CLOSED" ? new Date() : null,
      },
      select: { id: true, status: true, closedAt: true, updatedAt: true },
    });

    return NextResponse.json({ assignment: updated }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
