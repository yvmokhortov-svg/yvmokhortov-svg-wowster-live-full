import { NextResponse } from "next/server";
import { z } from "zod";
import { AdminTaskType, Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const querySchema = z.object({
  type: z.enum(["REPORT", "FLAG", "ALL"]).default("ALL"),
  status: z.enum(["OPEN", "CLOSED", "ALL"]).default("OPEN"),
  limit: z.number().int().min(1).max(100).default(50),
});

export async function GET(request: Request) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      type: searchParams.get("type") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const typeFilter: AdminTaskType[] =
      parsed.data.type === "ALL"
        ? [AdminTaskType.REPORT, AdminTaskType.FLAG]
        : [parsed.data.type === "REPORT" ? AdminTaskType.REPORT : AdminTaskType.FLAG];

    const tasks = await prisma.adminTask.findMany({
      where: {
        type: { in: typeFilter },
        ...(parsed.data.status === "ALL" ? {} : { status: parsed.data.status }),
      },
      orderBy: { createdAt: "desc" },
      take: parsed.data.limit,
      include: {
        createdBy: {
          select: { id: true, email: true, nickname: true },
        },
        assignee: {
          select: { id: true, email: true, nickname: true },
        },
      },
    });

    return NextResponse.json({ tasks }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
