import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const createOrUpdateUploadSchema = z.object({
  subscriptionId: z.string().trim().min(1).max(191),
  slotIndex: z.number().int().min(1).max(8),
  imageUrl: z.string().trim().min(1).max(1000),
});

function monthKeyUtc(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const subscriptions = await prisma.subscription.findMany({
      where: {
        userId: user.id,
      },
      select: {
        id: true,
        status: true,
        tierPriceCents: true,
        classId: true,
        class: {
          select: {
            id: true,
            dayPattern: true,
            time: true,
            lessonMinutes: true,
            teacher: {
              select: { id: true, nickname: true, email: true },
            },
            level: true,
            house: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    });
    const subscriptionIds = subscriptions.map((sub) => sub.id);

    const [uploads, graduations] = await Promise.all([
      subscriptionIds.length
        ? prisma.upload.findMany({
            where: { subscriptionId: { in: subscriptionIds } },
            select: {
              id: true,
              subscriptionId: true,
              slotIndex: true,
              imageUrl: true,
              feedbackText: true,
              tasksText: true,
              createdAt: true,
              updatedAt: true,
              isHidden: true,
            },
            orderBy: [{ subscriptionId: "asc" }, { slotIndex: "asc" }],
          })
        : Promise.resolve([]),
      subscriptionIds.length
        ? prisma.graduation.findMany({
            where: {
              subscriptionId: { in: subscriptionIds },
              monthKey: monthKeyUtc(),
            },
            select: {
              id: true,
              subscriptionId: true,
              monthKey: true,
              approvedBool: true,
              decidedAt: true,
              decidedByTeacher: { select: { id: true, nickname: true } },
              eighthUpload: {
                select: {
                  id: true,
                  imageUrl: true,
                  feedbackText: true,
                  tasksText: true,
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const uploadsBySubscription = uploads.reduce<
      Record<
        string,
        Array<{
          id: string;
          slotIndex: number;
          imageUrl: string;
          feedbackText: string | null;
          tasksText: string | null;
          createdAt: Date;
          updatedAt: Date;
          isHidden: boolean;
        }>
      >
    >((acc, row) => {
      if (!acc[row.subscriptionId]) acc[row.subscriptionId] = [];
      acc[row.subscriptionId].push({
        id: row.id,
        slotIndex: row.slotIndex,
        imageUrl: row.imageUrl,
        feedbackText: row.feedbackText,
        tasksText: row.tasksText,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        isHidden: row.isHidden,
      });
      return acc;
    }, {});

    const graduationBySubscription = new Map(graduations.map((g) => [g.subscriptionId, g]));

    return NextResponse.json(
      {
        subscriptions: subscriptions.map((sub) => ({
          id: sub.id,
          status: sub.status,
          tierPriceCents: sub.tierPriceCents,
          class: sub.class,
          slots: uploadsBySubscription[sub.id] ?? [],
          slot9: (() => {
            const graduation = graduationBySubscription.get(sub.id);
            if (!graduation || !graduation.approvedBool || !graduation.eighthUpload) return null;
            return {
              id: graduation.id,
              monthKey: graduation.monthKey,
              approvedBool: graduation.approvedBool,
              decidedAt: graduation.decidedAt,
              teacher: graduation.decidedByTeacher,
              imageUrl: graduation.eighthUpload.imageUrl,
              remark:
                graduation.eighthUpload.feedbackText ??
                graduation.eighthUpload.tasksText ??
                null,
              sourceUploadId: graduation.eighthUpload.id,
            };
          })(),
        })),
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
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = createOrUpdateUploadSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const subscription = await prisma.subscription.findUnique({
      where: { id: parsed.data.subscriptionId },
      select: { id: true, userId: true, status: true, classId: true },
    });
    if (!subscription || subscription.userId !== user.id) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }
    if (subscription.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Only active subscriptions can upload slots." },
        { status: 409 },
      );
    }

    const existing = await prisma.upload.findFirst({
      where: {
        subscriptionId: subscription.id,
        slotIndex: parsed.data.slotIndex,
      },
      select: { id: true },
    });

    const upload = existing
      ? await prisma.upload.update({
          where: { id: existing.id },
          data: {
            imageUrl: parsed.data.imageUrl,
            isHidden: false,
          },
          select: {
            id: true,
            subscriptionId: true,
            classId: true,
            slotIndex: true,
            imageUrl: true,
            feedbackText: true,
            tasksText: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : await prisma.upload.create({
          data: {
            userId: user.id,
            subscriptionId: subscription.id,
            classId: subscription.classId,
            slotIndex: parsed.data.slotIndex,
            imageUrl: parsed.data.imageUrl,
          },
          select: {
            id: true,
            subscriptionId: true,
            classId: true,
            slotIndex: true,
            imageUrl: true,
            feedbackText: true,
            tasksText: true,
            createdAt: true,
            updatedAt: true,
          },
        });

    return NextResponse.json({ ok: true, upload }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
