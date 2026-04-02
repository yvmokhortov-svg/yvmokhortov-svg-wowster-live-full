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
  feedbackText: z.string().trim().max(1000).optional(),
  tasksText: z.string().trim().max(1000).optional(),
  graduationDecision: z.enum(["APPROVED", "NOT_APPROVED"]).optional(),
});

const HOUSE_ORDER = ["Picassos", "DaVincis", "Michelangelos", "Monets"] as const;

function monthKeyUtc(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function resolveNextHouseName(currentHouse: string): string | null {
  const idx = HOUSE_ORDER.findIndex((name) => name === currentHouse);
  if (idx < 0 || idx >= HOUSE_ORDER.length - 1) return null;
  return HOUSE_ORDER[idx + 1] ?? null;
}

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function minutesToClock(value: number | null): string | null {
  if (value === null) return null;
  const normalized = ((value % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(normalized / 60)).padStart(2, "0");
  const mm = String(normalized % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function buildSubscriptionHref(input: {
  classId: string;
  houseName: string;
  level: number;
  classDay: string;
  classTime: string;
  teacher: string;
  lessonMinutes: number;
}) {
  return `/subscriptions?classId=${encodeURIComponent(
    input.classId,
  )}&houseName=${encodeURIComponent(input.houseName)}&level=${
    input.level
  }&classDay=${encodeURIComponent(input.classDay)}&classTime=${encodeURIComponent(
    input.classTime,
  )}&teacher=${encodeURIComponent(input.teacher)}&lessonMinutes=${input.lessonMinutes}`;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== Role.TEACHER && user.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { id } = await params;

    const upload = await prisma.upload.findUnique({
      where: { id },
      select: {
        id: true,
        slotIndex: true,
        subscriptionId: true,
        class: {
          select: {
            id: true,
            teacherId: true,
            dayPattern: true,
            time: true,
            lessonMinutes: true,
            level: true,
            house: { select: { name: true } },
            teacher: { select: { id: true, nickname: true } },
          },
        },
        subscription: {
          select: {
            tierPriceCents: true,
            user: {
              select: { id: true, email: true, nickname: true },
            },
          },
        },
      },
    });
    if (!upload) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

    if (user.role !== Role.ADMIN && upload.class.teacherId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.upload.update({
      where: { id: upload.id },
      data: {
        feedbackText: parsed.data.feedbackText,
        tasksText: parsed.data.tasksText,
      },
      select: {
        id: true,
        slotIndex: true,
        feedbackText: true,
        tasksText: true,
        updatedAt: true,
      },
    });

    let graduation: {
      id: string;
      approvedBool: boolean | null;
      monthKey: string;
      decidedAt: Date | null;
    } | null = null;

    if (parsed.data.graduationDecision) {
      if (upload.slotIndex !== 8) {
        return NextResponse.json(
          {
            error:
              "Graduation decision is only available for slot 8.",
          },
          { status: 409 },
        );
      }

      const decisionBool = parsed.data.graduationDecision === "APPROVED";
      graduation = await prisma.graduation.upsert({
        where: {
          subscriptionId_monthKey: {
            subscriptionId: upload.subscriptionId,
            monthKey: monthKeyUtc(),
          },
        },
        update: {
          eighthUploadId: upload.id,
          approvedBool: decisionBool,
          decidedByTeacherId: user.id,
          decidedAt: new Date(),
        },
        create: {
          subscriptionId: upload.subscriptionId,
          monthKey: monthKeyUtc(),
          eighthUploadId: upload.id,
          approvedBool: decisionBool,
          decidedByTeacherId: user.id,
          decidedAt: new Date(),
        },
        select: {
          id: true,
          approvedBool: true,
          monthKey: true,
          decidedAt: true,
        },
      });

      if (decisionBool) {
        const nextHouseName = resolveNextHouseName(upload.class.house.name);
        const currentStartMinutes = parseTimeToMinutes(upload.class.time);
        const targetStartMinutes =
          currentStartMinutes !== null
            ? currentStartMinutes + upload.class.lessonMinutes
            : null;

        const nextHouseClasses = nextHouseName
          ? await prisma.class.findMany({
              where: {
                isActive: true,
                house: { name: nextHouseName },
              },
              select: {
                id: true,
                teacherId: true,
                dayPattern: true,
                time: true,
                lessonMinutes: true,
                level: true,
                house: { select: { name: true } },
                teacher: { select: { id: true, nickname: true } },
              },
              orderBy: [{ dayPattern: "asc" }, { time: "asc" }],
              take: 40,
            })
          : [];
        const sameTeacherNextHouseClasses = nextHouseClasses.filter(
          (candidate) => candidate.teacherId === upload.class.teacherId,
        );
        const useOtherTeachersFallback =
          sameTeacherNextHouseClasses.length === 0 && nextHouseClasses.length > 0;
        const optionPool = useOtherTeachersFallback
          ? nextHouseClasses
          : sameTeacherNextHouseClasses;

        const rankedNextHouseOptions = optionPool
          .map((candidate) => {
            const candidateMinutes = parseTimeToMinutes(candidate.time);
            const sameDay = candidate.dayPattern === upload.class.dayPattern;
            const sameTime = candidate.time === upload.class.time;
            const sameTeacher = candidate.teacherId === upload.class.teacherId;
            const delta =
              candidateMinutes !== null && targetStartMinutes !== null
                ? candidateMinutes - targetStartMinutes
                : null;

            let score = 0;
            let reason = sameTeacher
              ? "Alternative same teacher slot"
              : "Alternative next-house slot with other teacher";

            if (sameTeacher) score += 2000;

            if (sameDay && delta !== null && delta >= 0) {
              // Best path: same teacher + same day + nearest session after current.
              score += 6000 - Math.min(delta, 5000);
              reason = sameTeacher
                ? "Recommended: same day, nearest next slot after current session"
                : "Recommended fallback: nearest next slot in next house";
            } else if (!sameDay && sameTime) {
              // Second path: keep same teacher and same clock time on other day.
              score += 3500;
              reason = sameTeacher
                ? "Same teacher and same time on another day"
                : "Other teacher and same time on another day";
            } else if (sameDay) {
              score += 2200;
              reason = sameTeacher
                ? "Same teacher and same day"
                : "Other teacher and same day";
            } else {
              score += 1500;
            }

            if (delta !== null && delta >= 0) {
              score += 500 - Math.min(delta, 500);
            }

            return {
              classId: candidate.id,
              houseName: candidate.house.name,
              level: candidate.level,
              dayPattern: candidate.dayPattern,
              time: candidate.time,
              lessonMinutes: candidate.lessonMinutes,
              teacher: candidate.teacher.nickname,
              score,
              reason,
              link: buildSubscriptionHref({
                classId: candidate.id,
                houseName: candidate.house.name,
                level: candidate.level,
                classDay: candidate.dayPattern,
                classTime: candidate.time,
                teacher: candidate.teacher.nickname,
                lessonMinutes: candidate.lessonMinutes,
              }),
            };
          })
          .sort((a, b) => b.score - a.score);

        const recommendedLink = rankedNextHouseOptions[0]?.link ?? null;
        const staySameGroupLink = buildSubscriptionHref({
          classId: upload.class.id,
          houseName: upload.class.house.name,
          level: upload.class.level,
          classDay: upload.class.dayPattern,
          classTime: upload.class.time,
          teacher: upload.class.teacher.nickname,
          lessonMinutes: upload.class.lessonMinutes,
        });
        const scheduleLink = `/schedules?focusTeacher=${encodeURIComponent(
          upload.class.teacher.nickname,
        )}&fromHouse=${encodeURIComponent(upload.class.house.name)}&fromLevel=${
          upload.class.level
        }${nextHouseName ? `&targetHouse=${encodeURIComponent(nextHouseName)}` : ""}&preferredDay=${encodeURIComponent(
          upload.class.dayPattern,
        )}&preferredTime=${encodeURIComponent(
          minutesToClock(targetStartMinutes) ?? upload.class.time,
        )}`;

        const recentSupportTasks = await prisma.adminTask.findMany({
          where: { type: "SUPPORT" },
          select: { id: true, payloadJson: true },
          orderBy: { createdAt: "desc" },
          take: 400,
        });
        const letterAlreadyQueued = recentSupportTasks.some((task) => {
          const payload =
            task.payloadJson && typeof task.payloadJson === "object"
              ? (task.payloadJson as Record<string, unknown>)
              : null;
          return (
            payload?.source === "graduation_offer_letter" &&
            payload?.subscriptionId === upload.subscriptionId &&
            payload?.monthKey === graduation?.monthKey
          );
        });

        if (!letterAlreadyQueued) {
          await prisma.adminTask.create({
            data: {
              type: "SUPPORT",
              status: "OPEN",
              createdById: user.id,
              payloadJson: {
                source: "graduation_offer_letter",
                monthKey: graduation.monthKey,
                subscriptionId: upload.subscriptionId,
                graduationId: graduation.id,
                targetUserId: upload.subscription.user.id,
                targetEmail: upload.subscription.user.email,
                targetNickname: upload.subscription.user.nickname,
                currentHouse: upload.class.house.name,
                nextHouse: nextHouseName,
                currentTeacher: upload.class.teacher.nickname,
                questions: [
                  "Do you want to stay in the same group?",
                  "Or move to the next house group?",
                ],
                scenarioStaySameGroupLink: staySameGroupLink,
                recommendedSameTeacherLink: recommendedLink,
                sameTeacherNextHouseOptions: rankedNextHouseOptions.slice(0, 6),
                sameTeacherOptionCount: sameTeacherNextHouseClasses.length,
                usedOtherTeachersFallback: useOtherTeachersFallback,
                noNextHouseOptionsAvailable: rankedNextHouseOptions.length === 0,
                schedulesAlternativesLink: scheduleLink,
                staticTeacherForGraduationFlow: true,
                message:
                  rankedNextHouseOptions.length > 0
                    ? "Graduation approved. Student can choose: stay in same group or move to next house. Recommend same-teacher nearest next slot, else other teachers in next house."
                    : "Graduation approved. Student can choose to stay in same group now. No next-house options available yet; notify about new schedule later.",
                submittedAt: new Date().toISOString(),
              },
            },
          });
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        upload: updated,
        graduation,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
