import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function monthKeyUtc(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const postSchema = z.object({
  monthKey: z.string().trim().min(7).max(7).optional(),
  slotIndex: z.number().int().min(1).max(30),
  graduationUploadId: z.string().trim().min(1).max(191).optional(),
  studentUserId: z.string().trim().min(1).max(191).optional(),
  parentConsentNote: z.string().trim().max(500).optional(),
  clear: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const monthKey = new URL(request.url).searchParams.get("monthKey") ?? monthKeyUtc();
    const [slots, graduations] = await Promise.all([
      prisma.featuredSlot.findMany({
        where: { monthKey },
        select: {
          id: true,
          monthKey: true,
          slotIndex: true,
          graduationUploadId: true,
          studentUserId: true,
          createdAt: true,
          studentUser: {
            select: {
              id: true,
              nickname: true,
              avatarUrl: true,
              country: true,
            },
          },
          admin: {
            select: {
              id: true,
              nickname: true,
              email: true,
            },
          },
        },
        orderBy: { slotIndex: "asc" },
      }),
      prisma.graduation.findMany({
        where: {
          approvedBool: true,
          eighthUploadId: { not: null },
        },
        select: {
          id: true,
          monthKey: true,
          approvedBool: true,
          eighthUploadId: true,
          subscription: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  nickname: true,
                  avatarUrl: true,
                  country: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);

    const uploadIds = [
      ...new Set(
        graduations
          .map((row) => row.eighthUploadId)
          .filter((value): value is string => !!value),
      ),
    ];
    const uploads = uploadIds.length
      ? await prisma.upload.findMany({
          where: { id: { in: uploadIds } },
          select: { id: true, imageUrl: true, feedbackText: true, tasksText: true },
        })
      : [];
    const uploadMap = new Map(uploads.map((upload) => [upload.id, upload]));

    return NextResponse.json(
      {
        monthKey,
        slots: slots.map((slot) => ({
          ...slot,
          upload: slot.graduationUploadId
            ? uploadMap.get(slot.graduationUploadId) ?? null
            : null,
        })),
        candidates: graduations
          .map((row) => {
            if (!row.eighthUploadId) return null;
            const upload = uploadMap.get(row.eighthUploadId);
            if (!upload) return null;
            return {
              graduationId: row.id,
              monthKey: row.monthKey,
              graduationUploadId: row.eighthUploadId,
              studentUserId: row.subscription.user.id,
              nickname: row.subscription.user.nickname,
              avatarUrl: row.subscription.user.avatarUrl,
              country: row.subscription.user.country,
              imageUrl: upload.imageUrl,
              remark: upload.feedbackText ?? upload.tasksText ?? null,
            };
          })
          .filter((value): value is NonNullable<typeof value> => !!value),
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = postSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const monthKey = parsed.data.monthKey ?? monthKeyUtc();

    if (parsed.data.clear) {
      await prisma.featuredSlot.deleteMany({
        where: {
          monthKey,
          slotIndex: parsed.data.slotIndex,
        },
      });
      return NextResponse.json({ ok: true, cleared: true }, { status: 200 });
    }

    if (!parsed.data.graduationUploadId || !parsed.data.studentUserId) {
      return NextResponse.json(
        { error: "graduationUploadId and studentUserId are required when assigning a slot." },
        { status: 400 },
      );
    }

    const slot = await prisma.featuredSlot.upsert({
      where: {
        monthKey_slotIndex: {
          monthKey,
          slotIndex: parsed.data.slotIndex,
        },
      },
      update: {
        graduationUploadId: parsed.data.graduationUploadId,
        studentUserId: parsed.data.studentUserId,
        adminId: user.id,
      },
      create: {
        monthKey,
        slotIndex: parsed.data.slotIndex,
        graduationUploadId: parsed.data.graduationUploadId,
        studentUserId: parsed.data.studentUserId,
        adminId: user.id,
      },
      select: {
        id: true,
        monthKey: true,
        slotIndex: true,
        graduationUploadId: true,
        studentUserId: true,
      },
    });

    await prisma.adminTask.create({
      data: {
        type: "SUPPORT",
        status: "OPEN",
        createdById: user.id,
        payloadJson: {
          source: "featured_graduate_slot",
          monthKey,
          slotIndex: parsed.data.slotIndex,
          graduationUploadId: parsed.data.graduationUploadId,
          studentUserId: parsed.data.studentUserId,
          parentConsentNote: parsed.data.parentConsentNote ?? null,
          submittedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({ ok: true, slot }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
