import Link from "next/link";
import { Role } from "@/generated/prisma/enums";
import { TeacherUploadsManager } from "@/components/teacher/teacher-uploads-manager";
import { getCurrentUser } from "@/lib/auth/current-user";
import { firstBlockBySection, getPublishedPageContentBlocks } from "@/lib/content/blocks";
import { isContentPreviewEnabled } from "@/lib/content/preview";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TeacherPage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== Role.TEACHER && user.role !== Role.ADMIN)) {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-white p-6">
        <h1 className="text-2xl font-bold">Teacher access required</h1>
        <p className="mt-2 text-[var(--text-soft)]">
          Please log in with a teacher account to access this dashboard.
        </p>
      </div>
    );
  }

  const previewEnabled = await isContentPreviewEnabled();
  const [streams, contentBlocks] = await Promise.all([
    prisma.stream.findMany({
      where: {
        ...(user.role === Role.ADMIN ? {} : { ownerId: user.id }),
      },
      orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
      take: 10,
      select: {
        id: true,
        type: true,
        status: true,
        startedAt: true,
        endedAt: true,
        class: {
          select: {
            house: { select: { name: true } },
            level: true,
            dayPattern: true,
            time: true,
          },
        },
      },
    }),
    getPublishedPageContentBlocks("teacher", { includeUnpublished: previewEnabled }),
  ]);
  const content = firstBlockBySection(contentBlocks);
  const hero = content.hero;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{hero?.title ?? "Teacher Dashboard"}</h1>
      {hero?.bodyText && <p className="text-[var(--text-soft)]">{hero.bodyText}</p>}
      <section className="rounded-xl border border-[var(--line)] bg-white p-5">
        <div className="space-y-3">
          <p className="text-xl font-semibold">My streams</p>
          <p className="text-sm text-[var(--text-soft)]">
            Stream management and recording details are available in Admin → Streams/Recordings.
          </p>
          {!streams.length ? (
            <p className="text-sm text-[var(--text-soft)]">No streams created yet.</p>
          ) : (
            <div className="space-y-2">
              {streams.map((stream) => (
                <article key={stream.id} className="rounded border border-[var(--line)] p-3 text-sm">
                  <p className="font-semibold">
                    {stream.type} • {stream.status}
                  </p>
                  <p className="text-[var(--text-soft)]">
                    {stream.class
                      ? `${stream.class.house.name} • Level ${stream.class.level} • ${stream.class.dayPattern} ${stream.class.time}`
                      : "Guest stream"}
                  </p>
                  <p className="text-[var(--text-soft)]">
                    Started: {stream.startedAt ? new Date(stream.startedAt).toLocaleString() : "-"} •
                    Ended: {stream.endedAt ? new Date(stream.endedAt).toLocaleString() : "-"}
                  </p>
                  <Link
                    href={`/live-room?streamId=${encodeURIComponent(stream.id)}&streamType=${stream.type}`}
                    className="mt-2 inline-block rounded bg-[var(--cta-blue)] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Open stream room
                  </Link>
                </article>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Link
              href="/live-shows-now"
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white"
            >
              View live streams
            </Link>
            {user.role === Role.ADMIN && (
              <Link
                href="/admin"
                className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white"
              >
                Open admin stream controls
              </Link>
            )}
          </div>
        </div>
      </section>
      <TeacherUploadsManager />
    </div>
  );
}
