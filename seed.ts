import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Role } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required before running seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

type SeedUserInput = {
  email: string;
  password: string;
  nickname: string;
  role: Role;
};

async function upsertUser(input: SeedUserInput) {
  const passwordHash = await hashPassword(input.password);
  return prisma.user.upsert({
    where: { email: input.email.toLowerCase() },
    update: {
      nickname: input.nickname,
      role: input.role,
      passwordHash,
    },
    create: {
      email: input.email.toLowerCase(),
      passwordHash,
      nickname: input.nickname,
      role: input.role,
    },
  });
}

async function ensureHouse(name: string) {
  return prisma.house.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function ensureClass(params: {
  houseId: string;
  level: number;
  teacherId: string;
  dayPattern: string;
  time: string;
  lessonMinutes: number;
}) {
  const existing = await prisma.class.findFirst({
    where: {
      houseId: params.houseId,
      level: params.level,
      teacherId: params.teacherId,
      dayPattern: params.dayPattern,
      time: params.time,
    },
  });
  if (existing) return existing;
  return prisma.class.create({
    data: {
      houseId: params.houseId,
      level: params.level,
      teacherId: params.teacherId,
      dayPattern: params.dayPattern,
      time: params.time,
      lessonMinutes: params.lessonMinutes,
      timezone: "UTC",
    },
  });
}

async function main() {
  const admin = await upsertUser({
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@wowster.live",
    password: process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!",
    nickname: process.env.SEED_ADMIN_NICKNAME ?? "WowsterAdmin",
    role: "ADMIN",
  });

  const teacher = await upsertUser({
    email: process.env.SEED_TEACHER_EMAIL ?? "teacher@wowster.live",
    password: process.env.SEED_TEACHER_PASSWORD ?? "ChangeMe123!",
    nickname: process.env.SEED_TEACHER_NICKNAME ?? "Mia Hart",
    role: "TEACHER",
  });

  const guest = await upsertUser({
    email: process.env.SEED_GUEST_EMAIL ?? "guest@wowster.live",
    password: process.env.SEED_GUEST_PASSWORD ?? "ChangeMe123!",
    nickname: process.env.SEED_GUEST_NICKNAME ?? "Open Guest A",
    role: "GUEST",
  });

  const picassosHouse = await ensureHouse("House of Picassos");
  const davincisHouse = await ensureHouse("House of Da Vincis");
  await ensureHouse("House of Michelangelos");
  await ensureHouse("House of Monets");

  const picassosClass = await ensureClass({
    houseId: picassosHouse.id,
    level: 1,
    teacherId: teacher.id,
    dayPattern: "Monday",
    time: "17:00",
    lessonMinutes: 45,
  });
  const davincisClass = await ensureClass({
    houseId: davincisHouse.id,
    level: 1,
    teacherId: teacher.id,
    dayPattern: "Tuesday",
    time: "18:00",
    lessonMinutes: 45,
  });

  await prisma.stream.upsert({
    where: { id: "school-demo-stream-1" },
    update: {
      type: "SCHOOL",
      ownerId: teacher.id,
      classId: picassosClass.id,
      status: "LIVE",
      roomName: "school-demo-stream-1",
    },
    create: {
      id: "school-demo-stream-1",
      type: "SCHOOL",
      ownerId: teacher.id,
      classId: picassosClass.id,
      status: "LIVE",
      roomName: "school-demo-stream-1",
    },
  });

  await prisma.stream.upsert({
    where: { id: "school-demo-stream-2" },
    update: {
      type: "SCHOOL",
      ownerId: teacher.id,
      classId: davincisClass.id,
      status: "LIVE",
      roomName: "school-demo-stream-2",
    },
    create: {
      id: "school-demo-stream-2",
      type: "SCHOOL",
      ownerId: teacher.id,
      classId: davincisClass.id,
      status: "LIVE",
      roomName: "school-demo-stream-2",
    },
  });

  await prisma.stream.upsert({
    where: { id: "guest-demo-stream-1" },
    update: {
      type: "GUEST",
      ownerId: guest.id,
      status: "LIVE",
      roomName: "guest-demo-stream-1",
    },
    create: {
      id: "guest-demo-stream-1",
      type: "GUEST",
      ownerId: guest.id,
      status: "LIVE",
      roomName: "guest-demo-stream-1",
    },
  });

  await prisma.stream.upsert({
    where: { id: "guest-demo-stream-2" },
    update: {
      type: "GUEST",
      ownerId: guest.id,
      status: "LIVE",
      roomName: "guest-demo-stream-2",
    },
    create: {
      id: "guest-demo-stream-2",
      type: "GUEST",
      ownerId: guest.id,
      status: "LIVE",
      roomName: "guest-demo-stream-2",
    },
  });

  console.log("Seed complete");
  console.log(`Admin: ${admin.email}`);
  console.log(`Teacher: ${teacher.email}`);
  console.log(`Guest: ${guest.email}`);
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
