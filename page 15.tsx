import Link from "next/link";
import { flags } from "@/config/flags";
import { ReportAbuseForm } from "@/components/moderation/report-abuse-form";
import { StudentUploadsManager } from "@/components/profile/student-uploads-manager";
import { resolveSchoolAccess } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth/current-user";
import { firstBlockBySection, getPublishedPageContentBlocks } from "@/lib/content/blocks";
import { isContentPreviewEnabled } from "@/lib/content/preview";
import { prisma } from "@/lib/db";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-white p-6">
        <h1 className="text-2xl font-bold">Login required</h1>
        <p className="mt-2 text-[var(--text-soft)]">
          Sign in to view your student profile and access state.
        </p>
      </div>
    );
  }

  const previewEnabled = await isContentPreviewEnabled();
  const [dbUser, activeSubscription, grants, policyFlags, contentBlocks] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        nickname: true,
        email: true,
        age: true,
        country: true,
        favoriteColor: true,
        strengthAnswer: true,
        avatarUrl: true,
        trialAttendedCount: true,
      },
    }),
    prisma.subscription.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      select: { tierPriceCents: true },
    }),
    flags.grantsFeatureEnabled
      ? prisma.accountGrant.findMany({
          where: {
            userId: user.id,
            active: true,
            type: "FREE_LESSONS",
          },
          select: { id: true, lessonLimit: true, lessonsUsed: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    prisma.adminTask.findMany({
      where: {
        type: "FLAG",
        createdById: user.id,
      },
      select: { payloadJson: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    getPublishedPageContentBlocks("profile", { includeUnpublished: previewEnabled }),
  ]);
  const content = firstBlockBySection(contentBlocks);
  const hero = content.hero;

  const activeGrant = grants.find((g) => g.lessonsUsed < g.lessonLimit) ?? null;
  const lessonsRemaining = activeGrant
    ? Math.max(activeGrant.lessonLimit - activeGrant.lessonsUsed, 0)
    : 0;

  const access = resolveSchoolAccess({
    hasActiveSubscription: !!activeSubscription,
    hasActiveGrant: !!activeGrant,
    trialAttendedCount: flags.trialEnabled
      ? (dbUser?.trialAttendedCount ?? 0)
      : Number.MAX_SAFE_INTEGER,
  });

  const chatPolicyStrikeCount = policyFlags.filter((task) => {
    const payload =
      task.payloadJson && typeof task.payloadJson === "object"
        ? (task.payloadJson as Record<string, unknown>)
        : null;
    return payload?.source === "chat_message_filter";
  }).length;

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">{hero?.title ?? "Profile"}</h1>
      {hero?.bodyText && <p className="text-sm text-[var(--text-soft)]">{hero.bodyText}</p>}
      <p className="text-sm text-[var(--text-soft)]">
        Signed in as {user.nickname} ({user.email}) • Access:{" "}
        <span className="font-semibold">{access.tier}</span>
      </p>
      {activeGrant && (
        <p className="text-sm text-[var(--text-soft)]">
          Account grant active • Lessons remaining: {lessonsRemaining}
        </p>
      )}
      {chatPolicyStrikeCount > 0 && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Policy notice: Naughty naughty ban caution. Chat violations:{" "}
          {chatPolicyStrikeCount}/3. On the 3rd violation, account ban and support/refund
          review are triggered.
        </p>
      )}
      <section className="rounded-xl border border-[var(--line)] bg-white p-5">
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div>
            {dbUser?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dbUser.avatarUrl}
                alt={`${dbUser.nickname} avatar`}
                className="h-56 w-full rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-56 items-center justify-center rounded-lg bg-slate-300 text-3xl font-semibold text-slate-700">
                {dbUser?.nickname?.slice(0, 1).toUpperCase() ?? "U"}
              </div>
            )}
            <Link
              href="/subscriptions"
              className="mt-3 block w-full rounded-lg bg-[var(--cta-green)] py-2 text-center text-sm font-semibold text-white"
            >
              Choose subscription plan
            </Link>
            <Link
              href="/live-shows-now"
              className="mt-2 block w-full rounded-lg bg-[var(--cta-blue)] py-2 text-center text-sm font-semibold text-white"
            >
              Start trial in live room
            </Link>
          </div>
          <div>
            <div className="rounded-lg bg-slate-100 p-2 text-sm text-[var(--text-soft)]">
              {dbUser?.nickname ?? user.nickname} ({dbUser?.email ?? user.email})
            </div>
            <div className="mt-3 grid gap-2 rounded-lg bg-slate-100 p-3 text-sm text-[var(--text-soft)] sm:grid-cols-2">
              <p>
                <span className="font-semibold text-slate-800">Country:</span>{" "}
                {dbUser?.country?.trim() || "Not set"}
              </p>
              <p>
                <span className="font-semibold text-slate-800">Age:</span>{" "}
                {dbUser?.age ?? "Not set"}
              </p>
              <p>
                <span className="font-semibold text-slate-800">Favorite color:</span>{" "}
                {dbUser?.favoriteColor?.trim() || "Not set"}
              </p>
              <p>
                <span className="font-semibold text-slate-800">Trial lessons attended:</span>{" "}
                {dbUser?.trialAttendedCount ?? 0}
              </p>
              <p className="sm:col-span-2">
                <span className="font-semibold text-slate-800">Strength answer:</span>{" "}
                {dbUser?.strengthAnswer?.trim() || "Not set"}
              </p>
            </div>
          </div>
        </div>
      </section>
      <ReportAbuseForm
        defaultTargetType="profile"
        title="Report a profile or graduation work"
      />
      <StudentUploadsManager currentUserId={user.id} />
    </div>
  );
}
