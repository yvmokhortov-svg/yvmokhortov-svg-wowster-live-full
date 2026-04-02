import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const createClassSchema = z.object({
  houseId: z.string().min(1),
  level: z.number().int().positive().default(1),
  teacherId: z.string().min(1),
  dayPattern: z.string().trim().min(2).max(120),
  time: z.string().trim().min(2).max(20),
  timezone: z.string().trim().min(2).max(120).default("UTC"),
  lessonMinutes: z.number().int().min(30).max(120).default(45),
  qnaMinutes: z.number().int().min(0).max(60).default(15),
});

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.ADMIN) return null;
  return user;
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const houseId = searchParams.get("houseId");

    const [classes, houses, teachers] = await Promise.all([
      prisma.class.findMany({
        where: houseId ? { houseId } : undefined,
        include: {
          house: { select: { id: true, name: true } },
          teacher: { select: { id: true, nickname: true, email: true } },
        },
        orderBy: [{ house: { name: "asc" } }, { level: "asc" }, { dayPattern: "asc" }],
      }),
      prisma.house.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.user.findMany({
        where: { role: "TEACHER" },
        select: { id: true, nickname: true, email: true },
        orderBy: { nickname: "asc" },
      }),
    ]);

    return NextResponse.json({ classes, houses, teachers }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const parsed = createClassSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const cls = await prisma.class.create({
      data: {
        houseId: parsed.data.houseId,
        level: parsed.data.level,
        teacherId: parsed.data.teacherId,
        dayPattern: parsed.data.dayPattern,
        time: parsed.data.time,
        timezone: parsed.data.timezone,
        lessonMinutes: parsed.data.lessonMinutes,
        qnaMinutes: parsed.data.qnaMinutes,
      },
      include: {
        house: { select: { id: true, name: true } },
        teacher: { select: { id: true, nickname: true, email: true } },
      },
    });

    return NextResponse.json({ class: cls }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
