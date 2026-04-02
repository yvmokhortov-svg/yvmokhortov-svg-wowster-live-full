import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
const REVALIDATE_SECONDS = 60;

const querySchema = z.object({
  range: z.enum(["7d", "30d", "month", "all"]).default("30d"),
});

function rangeStart(range: "7d" | "30d" | "month" | "all"): Date | null {
  const now = new Date();
  if (range === "all") return null;
  if (range === "month") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  }
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function GET(request: Request) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== Role.ADMIN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      range: searchParams.get("range") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const since = rangeStart(parsed.data.range);
    const filterByDate = since ? { gte: since } : undefined;

    const [
      subscribers,
      tipAgg,
      streamRows,
      classesCount,
      viewsCount,
      countryRows,
      schedulesCount,
    ] = await Promise.all([
      prisma.subscription.count({
        where: {
          status: "ACTIVE",
          ...(filterByDate ? { createdAt: filterByDate } : {}),
        },
      }),
      prisma.transaction.aggregate({
        where: {
          type: "DONATION",
          status: "SUCCEEDED",
          ...(filterByDate ? { createdAt: filterByDate } : {}),
        },
        _sum: { amountCents: true },
      }),
      prisma.stream.findMany({
        where: {
          endedAt: { not: null, ...(filterByDate ?? {}) },
        },
        select: { startedAt: true, endedAt: true },
        take: 5000,
      }),
      prisma.class.count({
        where: {
          isActive: true,
          ...(filterByDate ? { createdAt: filterByDate } : {}),
        },
      }),
      prisma.chatMessage.count({
        where: {
          ...(filterByDate ? { createdAt: filterByDate } : {}),
        },
      }),
      prisma.deviceSession.findMany({
        where: {
          revokedAt: null,
          ...(filterByDate ? { lastSeenAt: filterByDate } : {}),
        },
        select: { countryCode: true },
        take: 10000,
      }),
      prisma.class.count({
        where: { ...(filterByDate ? { createdAt: filterByDate } : {}) },
      }),
    ]);

    const streamHours = streamRows.reduce((sum, row) => {
      if (!row.startedAt || !row.endedAt) return sum;
      const secs = Math.max(Math.floor((row.endedAt.getTime() - row.startedAt.getTime()) / 1000), 0);
      return sum + secs / 3600;
    }, 0);

    const countriesIp = new Set(
      countryRows
        .map((row) => row.countryCode?.trim())
        .filter((v): v is string => !!v),
    ).size;

    return NextResponse.json(
      {
        range: parsed.data.range,
        kpis: {
          subscribers,
          tipsCents: tipAgg._sum.amountCents ?? 0,
          streamHours: Number(streamHours.toFixed(2)),
          classes: classesCount,
          views: viewsCount,
          countriesIp,
          allSchedules: schedulesCount,
        },
      },
      { status: 200, headers: { "Cache-Control": `private, max-age=0, s-maxage=${REVALIDATE_SECONDS}` } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
