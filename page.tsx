import { Role } from "@/generated/prisma/enums";
import { flags } from "@/config/flags";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AccountGrantsManager } from "@/components/admin/account-grants-manager";
import { HousesClassesManager } from "@/components/admin/houses-classes-manager";
import { SupportTicketsManager } from "@/components/admin/support-tickets-manager";
import { ModerationQueueManager } from "@/components/admin/moderation-queue-manager";
import { ChatMessageAudit } from "@/components/admin/chat-message-audit";
import { BanManager } from "@/components/admin/ban-manager";
import { ManualTrialAssignmentsManager } from "@/components/admin/manual-trial-assignments-manager";
import { FeaturedGraduatesManager } from "@/components/admin/featured-graduates-manager";
import { StreamsMonitor } from "@/components/admin/streams-monitor";
import { RecordingsManager } from "@/components/admin/recordings-manager";
import { ChatEconomyManager } from "@/components/admin/chat-economy-manager";
import { CustomGroupOrdersManager } from "@/components/admin/custom-group-orders-manager";
import { ContentManager } from "@/components/admin/content-manager";
import { KpiPanel } from "@/components/admin/kpi-panel";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.ADMIN) {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-white p-6">
        <h1 className="text-2xl font-bold">Admin access required</h1>
        <p className="mt-2 text-[var(--text-soft)]">
          Please log in with an admin account to access this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      <KpiPanel />
      <ContentManager />
      <HousesClassesManager />
      <ModerationQueueManager />
      <BanManager />
      <FeaturedGraduatesManager />
      <ManualTrialAssignmentsManager />
      <ChatEconomyManager />
      <CustomGroupOrdersManager />
      <StreamsMonitor />
      <RecordingsManager />
      <ChatMessageAudit />
      <SupportTicketsManager />
      {flags.grantsFeatureEnabled ? (
        <AccountGrantsManager />
      ) : (
        <section className="rounded-xl border border-[var(--line)] bg-white p-5">
          <h2 className="text-xl font-semibold">Account grants</h2>
          <p className="mt-1 text-sm text-[var(--text-soft)]">
            Grants feature is currently OFF. Enable GRANTS_FEATURE_ENABLED=true to use
            per-account free-lesson grants.
          </p>
        </section>
      )}
    </div>
  );
}
