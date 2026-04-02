import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ChatActionDock } from "@/components/live/chat-action-dock";
import { EndStreamButton } from "@/components/live/end-stream-button";
import { GuestWatchGate } from "@/components/live/guest-watch-gate";
import { TrialOrSubscribePanel } from "@/components/live/trial-or-subscribe-panel";
import { LiveChatPanel } from "@/components/live/live-chat-panel";
import { ReportAbuseForm } from "@/components/moderation/report-abuse-form";
import { prisma } from "@/lib/db";

type LiveRoomPageProps = {
  searchParams: Promise<{
    streamId?: string;
    streamType?: string;
    manualTrialToken?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function LiveRoomPage({ searchParams }: LiveRoomPageProps) {
  const params = await searchParams;
  const [currentUser, streamFromDb] = await Promise.all([
    getCurrentUser(),
    params.streamId
      ? prisma.stream.findUnique({
          where: { id: params.streamId },
          select: {
            id: true,
            type: true,
            classId: true,
            ownerId: true,
            status: true,
            class: {
              select: {
                id: true,
                level: true,
                dayPattern: true,
                time: true,
                lessonMinutes: true,
                house: { select: { name: true } },
                teacher: { select: { nickname: true } },
              },
            },
          },
        })
      : Promise.resolve(null),
  ]);

  const streamType: "GUEST" | "SCHOOL" =
    streamFromDb?.type ?? (params.streamType === "GUEST" ? "GUEST" : "SCHOOL");

  const subscriptionHref =
    streamType === "SCHOOL" && streamFromDb?.class
      ? `/subscriptions?classId=${encodeURIComponent(
          streamFromDb.class.id,
        )}&houseName=${encodeURIComponent(
          streamFromDb.class.house.name,
        )}&level=${streamFromDb.class.level}&classDay=${encodeURIComponent(
          streamFromDb.class.dayPattern,
        )}&classTime=${encodeURIComponent(
          streamFromDb.class.time,
        )}&teacher=${encodeURIComponent(
          streamFromDb.class.teacher.nickname,
        )}&lessonMinutes=${streamFromDb.class.lessonMinutes}`
      : "/subscriptions";

  const currentStream = {
    id: streamFromDb?.id ?? params.streamId ?? (streamType === "GUEST" ? "guest-stream-preview" : "school-stream-preview"),
    type: streamType,
    ownerId: streamFromDb?.ownerId ?? null,
    status: streamFromDb?.status ?? "LIVE",
    isLockedSchoolStream: streamType === "SCHOOL",
  };
  const canEndStream =
    !!currentUser &&
    (currentUser.role === "ADMIN" || currentUser.id === currentStream.ownerId);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Live Room</h1>
      <p className="text-sm text-[var(--text-soft)]">
        Stream: {currentStream.id} • {currentStream.type}
      </p>
      <section className="rounded-xl border border-[var(--line)] bg-white p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
          <div className="rounded-lg border border-[var(--line)] p-2">
            <GuestWatchGate
              isGuestStream={currentStream.type === "GUEST"}
              isAuthenticated={!!currentUser}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {currentStream.type === "SCHOOL" ? (
                <Link
                  href={subscriptionHref}
                  className="rounded-lg bg-[var(--cta-green)] px-4 py-2 text-sm font-semibold text-white"
                >
                  Choose subscription plan
                </Link>
              ) : (
                <Link
                  href={currentUser ? "/profile" : "/register-user"}
                  className="rounded-lg bg-[var(--cta-blue)] px-4 py-2 text-sm font-semibold text-white"
                >
                  {currentUser ? "Open profile" : "Create student account"}
                </Link>
              )}
              <Link
                href="/schedules"
                className="rounded-lg bg-[var(--cta-blue)] px-4 py-2 text-sm font-semibold text-white"
              >
                View schedules
              </Link>
              {canEndStream && <EndStreamButton streamId={currentStream.id} />}
            </div>
            <TrialOrSubscribePanel
              streamId={currentStream.id}
              streamType={currentStream.type}
              isLockedSchoolStream={currentStream.isLockedSchoolStream}
              subscriptionHref={subscriptionHref}
              manualTrialToken={params.manualTrialToken ?? null}
            />
            <ChatActionDock
              streamId={currentStream.id}
              disabled={currentStream.status !== "LIVE"}
            />
          </div>
          <aside className="rounded-lg border border-[var(--line)] p-3">
            <LiveChatPanel
              streamId={currentStream.id}
              manualTrialToken={params.manualTrialToken ?? null}
            />
            <div className="mt-3">
              <ReportAbuseForm
                defaultTargetType="stream"
                defaultTargetId={currentStream.id}
                title="Report this stream"
                compact
              />
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
