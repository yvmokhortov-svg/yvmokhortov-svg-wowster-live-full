import { prisma } from "@/lib/db";

export type ClassSelectionInput = {
  classId?: string | null;
  houseName?: string | null;
  level?: number | null;
  classDay?: string | null;
  classTime?: string | null;
  teacherNickname?: string | null;
};

export async function resolveClassIdFromSelection(
  input: ClassSelectionInput,
): Promise<string | null> {
  if (input.classId) {
    const cls = await prisma.class.findUnique({
      where: { id: input.classId },
      select: { id: true },
    });
    return cls?.id ?? null;
  }

  if (
    !input.houseName ||
    !input.level ||
    !input.classDay ||
    !input.classTime ||
    !input.teacherNickname
  ) {
    return null;
  }

  const cls = await prisma.class.findFirst({
    where: {
      level: input.level,
      dayPattern: input.classDay,
      time: input.classTime,
      house: {
        name: input.houseName,
      },
      teacher: {
        nickname: input.teacherNickname,
      },
    },
    select: { id: true },
  });

  return cls?.id ?? null;
}
