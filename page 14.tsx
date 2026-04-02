import { ClassActions } from "@/components/schedules/class-actions";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

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

type SchedulesPageProps = {
  searchParams: Promise<{
    focusTeacher?: string;
    fromHouse?: string;
    fromLevel?: string;
    targetHouse?: string;
    preferredDay?: string;
    preferredTime?: string;
  }>;
};

export default async function SchedulesPage({ searchParams }: SchedulesPageProps) {
  const params = await searchParams;
  const focusTeacher = params.focusTeacher?.trim() || null;
  const fromHouse = params.fromHouse?.trim() || null;
  const targetHouse = params.targetHouse?.trim() || null;
  const preferredDay = params.preferredDay?.trim() || null;
  const preferredTime = params.preferredTime?.trim() || null;
  const preferredMinutes = parseTimeToMinutes(preferredTime);
  const fromLevel = Number(params.fromLevel ?? "");
  const fromLevelSafe = Number.isFinite(fromLevel) ? fromLevel : null;

  const houses = await prisma.house.findMany({
    include: {
      classes: {
        where: { isActive: true },
        include: {
          teacher: {
            select: { nickname: true },
          },
        },
        orderBy: [{ level: "asc" }, { dayPattern: "asc" }, { time: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });
  const recommendationCandidates = houses.flatMap((house) =>
    house.classes
      .filter(() => !targetHouse || house.name === targetHouse)
      .map((classRow) => ({
        ...classRow,
        houseName: house.name,
        score: (() => {
          const candidateMinutes = parseTimeToMinutes(classRow.time);
          let score =
            (classRow.teacher.nickname === focusTeacher ? 2200 : 0) +
            (fromHouse && house.name === fromHouse ? 200 : 0) +
            (targetHouse && house.name === targetHouse ? 3000 : 0) +
            (fromLevelSafe !== null && classRow.level >= fromLevelSafe ? 100 : 0);

          if (preferredDay && classRow.dayPattern === preferredDay) {
            score += 1500;
          }
          if (preferredMinutes !== null && candidateMinutes !== null) {
            const delta = Math.abs(candidateMinutes - preferredMinutes);
            score += 1000 - Math.min(delta, 1000);
          }

          return score;
        })(),
      })),
  );
  const rankedRecommendations = focusTeacher
    ? recommendationCandidates.sort((a, b) => b.score - a.score).slice(0, 8)
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Schedules</h1>
      {focusTeacher && rankedRecommendations.length > 0 && (
        <section className="rounded-xl border border-sky-300 bg-sky-50 p-4">
          <h2 className="text-xl font-semibold">
            Recommended groups — {focusTeacher} first when available
          </h2>
          <p className="mt-1 text-xs text-[var(--text-soft)]">
            From graduation letter: same teacher first, then alternatives
            {targetHouse ? ` in ${targetHouse}` : ""}.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {rankedRecommendations.map((classRow) => (
              <article
                key={`rec-${classRow.id}`}
                className={`rounded-lg border p-3 ${
                  classRow.teacher.nickname === focusTeacher
                    ? "border-sky-400 bg-white"
                    : targetHouse && classRow.houseName === targetHouse
                      ? "border-emerald-300 bg-emerald-50/60"
                    : "border-[var(--line)] bg-white/70"
                }`}
              >
                <p className="font-semibold">
                  {classRow.teacher.nickname} — {classRow.houseName} / Level {classRow.level}
                </p>
                <p className="text-sm text-[var(--text-soft)]">
                  {classRow.dayPattern} {classRow.time} • {classRow.lessonMinutes} min + Q&A{" "}
                  {classRow.qnaMinutes}
                </p>
                <ClassActions
                  classId={classRow.id}
                  houseName={classRow.houseName}
                  level={classRow.level}
                  classDay={classRow.dayPattern}
                  classTime={classRow.time}
                  teacher={classRow.teacher.nickname}
                  lessonMinutes={classRow.lessonMinutes}
                />
              </article>
            ))}
          </div>
        </section>
      )}
      {!houses.length && (
        <section className="rounded-xl border border-[var(--line)] bg-white p-4">
          <p className="text-sm text-[var(--text-soft)]">
            No houses/classes published yet.
          </p>
        </section>
      )}
      <div className="space-y-4">
        {houses.map((house) => (
          <section
            key={house.id}
            className="rounded-xl border border-[var(--line)] bg-white p-4"
          >
            <h2 className="text-xl font-semibold">{house.name}</h2>
            <div className="mt-3 space-y-3">
              {Array.from(new Set(house.classes.map((cls) => cls.level))).map(
                (level) => (
                  <div key={`${house.id}-${level}`} className="space-y-2">
                  <p className="text-sm font-semibold text-[var(--text-soft)]">
                    Level {level}
                  </p>
                  {house.classes
                    .filter((cls) => cls.level === level)
                    .map((classRow) => (
                    <article
                      key={classRow.id}
                      className={`rounded-lg border p-3 ${
                        focusTeacher && classRow.teacher.nickname === focusTeacher
                          ? "border-sky-400 bg-sky-50/40"
                          : targetHouse && house.name === targetHouse
                            ? "border-emerald-300 bg-emerald-50/40"
                          : "border-[var(--line)]"
                      }`}
                    >
                      <p className="font-semibold">
                        {classRow.teacher.nickname} — {classRow.dayPattern}{" "}
                        {classRow.time}
                      </p>
                      <p className="text-sm text-[var(--text-soft)]">
                        {classRow.lessonMinutes} min + Q&A {classRow.qnaMinutes}
                      </p>
                      <ClassActions
                        classId={classRow.id}
                        houseName={house.name}
                        level={classRow.level}
                        classDay={classRow.dayPattern}
                        classTime={classRow.time}
                        teacher={classRow.teacher.nickname}
                        lessonMinutes={classRow.lessonMinutes}
                      />
                    </article>
                  ))}
                </div>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
