import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LiveShowsNowPage() {
  const streams = await prisma.stream.findMany({
    where: { status: "LIVE" },
    include: {
      owner: { select: { nickname: true } },
      class: {
        include: {
          house: { select: { name: true } },
          teacher: { select: { nickname: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
    take: 60,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Live Shows Now</h1>
      {!streams.length && (
        <p className="rounded-xl border border-[var(--line)] bg-white p-4 text-sm text-[var(--text-soft)]">
          No live streams right now.
        </p>
      )}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {streams.map((stream) => {
          const isSchool = stream.type === "SCHOOL";
          const displayName = isSchool
            ? stream.class?.teacher.nickname ?? "School Teacher"
            : stream.owner.nickname;
          return (
            <article
              key={stream.id}
              className="relative rounded-xl border border-[var(--line)] bg-white p-4"
            >
              <div className="h-36 rounded-md bg-slate-200" />
              <p className="mt-3 text-base font-semibold">{displayName}</p>
              <p className="text-sm text-[var(--text-soft)]">
                {isSchool ? "School" : "Guest"} • LIVE
                {isSchool && stream.class
                  ? ` • ${stream.class.house.name} • Level ${stream.class.level}`
                  : ""}
              </p>
              <Link
                href={`/live-room?streamId=${stream.id}&streamType=${stream.type}`}
                className="mt-3 inline-block rounded bg-[var(--cta-blue)] px-3 py-2 text-xs font-semibold text-white"
              >
                Open stream
              </Link>
              {isSchool && (
                <span className="absolute right-3 top-3 rounded-full bg-yellow-300 px-2 py-0.5 text-xs">
                  🔒
                </span>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
