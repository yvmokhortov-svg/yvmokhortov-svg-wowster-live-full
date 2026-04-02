import Link from "next/link";
import { firstBlockBySection, getPublishedPageContentBlocks } from "@/lib/content/blocks";
import { prisma } from "@/lib/db";
import { isContentPreviewEnabled } from "@/lib/content/preview";

export const dynamic = "force-dynamic";

export default async function ProgramPage() {
  const previewEnabled = await isContentPreviewEnabled();
  const [houses, contentBlocks] = await Promise.all([
    prisma.house.findMany({
      include: {
        classes: {
          where: { isActive: true },
          select: {
            id: true,
            level: true,
            teacher: { select: { nickname: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    getPublishedPageContentBlocks("program", { includeUnpublished: previewEnabled }),
  ]);

  const content = firstBlockBySection(contentBlocks);
  const hero = content.hero;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{hero?.title ?? "Program"}</h1>
      <p className="text-[var(--text-soft)]">
        {hero?.bodyText ??
          "Structured progression across houses and levels. Inside each house, students choose a class (teacher + day/time) and can switch class times when needed."}
      </p>
      {!houses.length ? (
        <p className="rounded-xl border border-[var(--line)] bg-white p-4 text-sm text-[var(--text-soft)]">
          No houses published yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {houses.map((house) => {
            const levels = Array.from(new Set(house.classes.map((c) => c.level))).sort(
              (a, b) => a - b,
            );
            const teacherNames = Array.from(
              new Set(house.classes.map((c) => c.teacher.nickname)),
            );
            return (
              <div key={house.id} className="rounded-xl border border-[var(--line)] bg-white p-4">
                <p className="text-lg font-semibold">{house.name}</p>
                <p className="mt-1 text-sm text-[var(--text-soft)]">
                  Levels: {levels.length ? levels.join(", ") : "-"} • Teachers:{" "}
                  {teacherNames.length ? teacherNames.join(", ") : "-"}
                </p>
                <Link
                  href={`/schedules?targetHouse=${encodeURIComponent(house.name)}`}
                  className="mt-3 inline-block rounded-lg bg-[var(--cta-blue)] px-4 py-2 text-sm font-semibold text-white"
                >
                  View schedules in this house
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
