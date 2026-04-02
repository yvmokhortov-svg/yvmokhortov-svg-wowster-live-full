import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { findSexualContent } from "@/lib/moderation/text-safety";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const createSupportTicketSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("question"),
    message: z.string().trim().min(5).max(2000),
    contactEmail: z.email().toLowerCase().optional(),
  }),
  z.object({
    kind: z.literal("custom_class_order"),
    numberOfStudents: z.number().int().min(10).max(5000),
    country: z.string().trim().min(2).max(120),
    preferredDaysTimes: z.string().trim().min(2).max(500),
    ageRange: z.string().trim().min(2).max(120),
    note: z.string().trim().max(1000).optional(),
    contactEmail: z.email().toLowerCase().optional(),
  }),
]);

export async function GET(request: Request) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limitRaw = Number(searchParams.get("limit") ?? 30);
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(limitRaw, 100))
      : 30;

    const tickets = await prisma.adminTask.findMany({
      where: {
        type: "SUPPORT",
        ...(status === "OPEN" || status === "CLOSED"
          ? { status }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        createdBy: {
          select: { id: true, email: true, nickname: true },
        },
        assignee: {
          select: { id: true, email: true, nickname: true },
        },
      },
    });

    return NextResponse.json({ tickets }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const json = await request.json();
    const parsed = createSupportTicketSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const sexualMatch =
      parsed.data.kind === "question"
        ? findSexualContent({
            message: parsed.data.message,
          })
        : findSexualContent({
            country: parsed.data.country,
            preferredDaysTimes: parsed.data.preferredDaysTimes,
            ageRange: parsed.data.ageRange,
            note: parsed.data.note ?? null,
          });
    if (sexualMatch) {
      return NextResponse.json(
        { error: "Sexual content is not allowed." },
        { status: 400 },
      );
    }

    const payload =
      parsed.data.kind === "question"
        ? {
            kind: "question",
            message: parsed.data.message,
            contactEmail: parsed.data.contactEmail ?? null,
            submittedAt: new Date().toISOString(),
          }
        : {
            kind: "custom_class_order",
            numberOfStudents: parsed.data.numberOfStudents,
            country: parsed.data.country,
            preferredDaysTimes: parsed.data.preferredDaysTimes,
            ageRange: parsed.data.ageRange,
            note: parsed.data.note ?? null,
            contactEmail: parsed.data.contactEmail ?? null,
            submittedAt: new Date().toISOString(),
          };

    const task = await prisma.adminTask.create({
      data: {
        type: "SUPPORT",
        status: "OPEN",
        createdById: user?.id ?? null,
        payloadJson: {
          source: "support_page",
          submitter: user
            ? {
                userId: user.id,
                email: user.email,
                nickname: user.nickname,
                role: user.role,
              }
            : null,
          ...payload,
        },
      },
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, ticket: task }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
