import Link from "next/link";
import { GraduatesStripe } from "@/components/home/graduates-stripe";
import { SupportSchoolButton } from "@/components/home/support-school-button";
import { getCurrentUser } from "@/lib/auth/current-user";
import { firstBlockBySection, getPublishedPageContentBlocks } from "@/lib/content/blocks";
import { isContentPreviewEnabled } from "@/lib/content/preview";
import { prisma } from "@/lib/db";
import { isTrialWindowActive } from "@/lib/trial";

export const dynamic = "force-dynamic";

function monthKeyUtc(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function Home() {
  const currentUser = await getCurrentUser();
  const now = new Date();
  const previewEnabled = await isContentPreviewEnabled();

  const [
    liveStreams,
    upcomingGuestStreams,
    upcomingClasses,
    activeSubs,
    grants,
    activeTrials,
    featuredSlots,
    homeContentBlocks,
  ] = await Promise.all([
      prisma.stream.findMany({
        where: { status: "LIVE" },
        include: {
          owner: { select: { id: true, nickname: true } },
          class: {
            include: {
              house: { select: { name: true } },
              teacher: { select: { id: true, nickname: true } },
            },
          },
        },
        orderBy: { startedAt: "desc" },
        take: 24,
      }),
      prisma.stream.findMany({
        where: {
          type: "GUEST",
          status: "OFFLINE",
          startedAt: { gt: now },
        },
        include: {
          owner: { select: { nickname: true } },
        },
        orderBy: { startedAt: "asc" },
        take: 6,
      }),
      prisma.class.findMany({
        where: { isActive: true },
        include: {
          house: { select: { name: true } },
          teacher: { select: { nickname: true } },
        },
        orderBy: [{ house: { name: "asc" } }, { level: "asc" }, { dayPattern: "asc" }],
        take: 8,
      }),
      currentUser
        ? prisma.subscription.findMany({
            where: { userId: currentUser.id, status: "ACTIVE" },
            select: { id: true, classId: true },
          })
        : Promise.resolve([]),
      currentUser
        ? prisma.accountGrant.findMany({
            where: {
              userId: currentUser.id,
              active: true,
              type: "FREE_LESSONS",
            },
            select: { lessonLimit: true, lessonsUsed: true },
            orderBy: { createdAt: "desc" },
            take: 20,
          })
        : Promise.resolve([]),
      currentUser
        ? prisma.trialAttendance.findMany({
            where: { userId: currentUser.id },
            select: { streamId: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 20,
          })
        : Promise.resolve([]),
      prisma.featuredSlot.findMany({
        where: { monthKey: monthKeyUtc() },
        select: {
          id: true,
          slotIndex: true,
          graduationUploadId: true,
          studentUser: {
            select: {
              nickname: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { slotIndex: "asc" },
        take: 30,
      }),
      getPublishedPageContentBlocks("home", { includeUnpublished: previewEnabled }),
    ]);

  const activeSubscriptionClassIds = new Set(activeSubs.map((sub) => sub.classId));
  const hasActiveGrant = grants.some((grant) => grant.lessonsUsed < grant.lessonLimit);
  const activeTrialStreamIds = new Set(
    activeTrials.filter((row) => isTrialWindowActive(row.createdAt)).map((row) => row.streamId),
  );

  const liveCards = liveStreams.map((stream) => {
    const isSchool = stream.type === "SCHOOL";
    const hasClassSubscription = !!(
      stream.classId && activeSubscriptionClassIds.has(stream.classId)
    );
    const hasAccess =
      !isSchool ||
      (!!currentUser &&
        (hasClassSubscription || hasActiveGrant || activeTrialStreamIds.has(stream.id)));
    return {
      id: stream.id,
      type: stream.type,
      houseName: stream.class?.house.name ?? null,
      streamerNickname:
        isSchool ? (stream.class?.teacher.nickname ?? stream.owner.nickname) : stream.owner.nickname,
      startedAt: stream.startedAt,
      isLocked: isSchool && !hasAccess,
    };
  });

  const graduationUploadIds = featuredSlots
    .map((slot) => slot.graduationUploadId)
    .filter((value): value is string => !!value);
  const graduationUploads = graduationUploadIds.length
    ? await prisma.upload.findMany({
        where: { id: { in: graduationUploadIds } },
        select: { id: true, imageUrl: true },
      })
    : [];
  const uploadMap = new Map(graduationUploads.map((upload) => [upload.id, upload]));
  const featuredGraduates = featuredSlots
    .map((slot) => {
      if (!slot.graduationUploadId) return null;
      const upload = uploadMap.get(slot.graduationUploadId);
      if (!upload) return null;
      return {
        id: slot.id,
        slotIndex: slot.slotIndex,
        nickname: slot.studentUser.nickname,
        avatarUrl: slot.studentUser.avatarUrl,
        imageUrl: upload.imageUrl,
      };
    })
    .filter((item): item is NonNullable<typeof item> => !!item);
  const content = firstBlockBySection(homeContentBlocks);
  const hero = content.hero;
  const liveNow = content.live_now;
  const upcoming = content.upcoming;

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-[var(--line)] bg-white p-5">
        <h1 className="text-3xl font-bold">{hero?.title ?? "Structured Live Art School"}</h1>
        <p className="mt-2 text-[var(--text-soft)]">
          {hero?.bodyText ??
            "Join live lessons, follow the monthly program, and grow with the WOWSTER community."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={hero?.ctaHref ?? "/live-shows-now"}
            className="rounded-lg bg-[var(--cta-green)] px-5 py-2.5 text-sm font-semibold text-white"
          >
            {hero?.ctaLabel ?? "Try a lesson"}
          </Link>
          {(hero?.ctaSecondaryLabel ?? "View schedules") && (
            <Link
              href={hero?.ctaSecondaryHref ?? "/schedules"}
              className="rounded-lg bg-[var(--cta-blue)] px-5 py-2.5 text-sm font-semibold text-white"
            >
              {hero?.ctaSecondaryLabel ?? "View schedules"}
            </Link>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-2xl font-semibold">{liveNow?.title ?? "LIVE now"}</h2>
        {liveNow?.bodyText && (
          <p className="mt-1 text-sm text-[var(--text-soft)]">{liveNow.bodyText}</p>
        )}
        {!liveCards.length ? (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-[var(--text-soft)]">No streams are live right now.</p>
            <Link
              href="/live-shows-now"
              className="inline-block rounded bg-[var(--cta-green)] px-3 py-2 text-xs font-semibold text-white"
            >
              Try a lesson
            </Link>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveCards.map((card) => (
              <article
                key={card.id}
                className="relative overflow-hidden rounded-xl border border-[var(--line)] bg-slate-100 p-3"
              >
                <div className="h-28 rounded-md bg-slate-300 blur-[1px]" />
                <div className="absolute right-3 top-3 flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  REC
                </div>
                <p className="mt-2 text-sm font-semibold">{card.streamerNickname}</p>
                <p className="text-xs text-[var(--text-soft)]">
                  {card.type === "GUEST" ? "Guest" : "School"} • LIVE
                  {card.houseName ? ` • ${card.houseName}` : ""}
                  {card.startedAt ? ` • ${new Date(card.startedAt).toLocaleTimeString()}` : ""}
                </p>
                <Link
                  href={`/live-room?streamId=${card.id}&streamType=${card.type}`}
                  className="mt-2 inline-block rounded bg-[var(--cta-blue)] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Open stream
                </Link>
                {card.isLocked && (
                  <span className="absolute inset-0 flex items-center justify-center bg-yellow-300/35 text-xs font-bold">
                    🔒 Subscribe / Trial to unlock
                  </span>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-white p-5">
        <h2 className="text-2xl font-semibold">{upcoming?.title ?? "Upcoming"}</h2>
        {upcoming?.bodyText && (
          <p className="mt-1 text-sm text-[var(--text-soft)]">{upcoming.bodyText}</p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {upcomingClasses.map((classRow) => (
            <article key={classRow.id} className="rounded-lg border border-[var(--line)] p-3">
              <p className="text-sm font-semibold">
                School • {classRow.house.name} • Level {classRow.level}
              </p>
              <p className="text-xs text-[var(--text-soft)]">
                {classRow.teacher.nickname} • {classRow.dayPattern} {classRow.time} •{" "}
                {classRow.lessonMinutes} min
              </p>
            </article>
          ))}
          {upcomingGuestStreams.map((stream) => (
            <article key={stream.id} className="rounded-lg border border-[var(--line)] p-3">
              <p className="text-sm font-semibold">Guest promo • {stream.owner.nickname}</p>
              <p className="text-xs text-[var(--text-soft)]">
                {stream.startedAt
                  ? new Date(stream.startedAt).toLocaleString()
                  : "Scheduled soon"}
              </p>
            </article>
          ))}
        </div>
        {!upcomingClasses.length && !upcomingGuestStreams.length && (
          <div className="mt-3">
            <Link
              href="/schedules"
              className="rounded bg-[var(--cta-green)] px-3 py-2 text-xs font-semibold text-white"
            >
              View schedules
            </Link>
          </div>
        )}
      </section>

      <GraduatesStripe items={featuredGraduates} />
      <SupportSchoolButton />
    </div>
  );
}
