import { SubscribeCheckoutButton } from "@/components/subscriptions/checkout-button";
import { firstBlockBySection, getPublishedPageContentBlocks } from "@/lib/content/blocks";
import { isContentPreviewEnabled } from "@/lib/content/preview";
import { SUBSCRIPTION_TIERS } from "@/lib/subscriptions/tiers";

type SubscriptionsPageProps = {
  searchParams: Promise<{
    classId?: string;
    houseName?: string;
    level?: string;
    classDay?: string;
    classTime?: string;
    teacher?: string;
    lessonMinutes?: string;
  }>;
};

export default async function SubscriptionsPage({
  searchParams,
}: SubscriptionsPageProps) {
  const params = await searchParams;
  const hasSelection = Boolean(params.houseName && params.classTime && params.teacher);
  const previewEnabled = await isContentPreviewEnabled();
  const blocks = await getPublishedPageContentBlocks("subscriptions", {
    includeUnpublished: previewEnabled,
  });
  const content = firstBlockBySection(blocks);
  const hero = content.hero;
  const tierCopyMap = new Map(
    blocks
      .filter((block) => block.sectionKey.startsWith("tier_"))
      .map((block) => [block.sectionKey, block]),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{hero?.title ?? "Subscriptions"}</h1>
      {hero?.bodyText && <p className="text-[var(--text-soft)]">{hero.bodyText}</p>}
      {hasSelection && (
        <section className="rounded-xl border border-[var(--line)] bg-white p-4">
          <p className="text-sm font-semibold">Selected path</p>
          <p className="mt-1 text-sm text-[var(--text-soft)]">
            {params.houseName} • Level {params.level} • {params.classDay}{" "}
            {params.classTime} • {params.lessonMinutes} min • Teacher:{" "}
            {params.teacher}
          </p>
        </section>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SUBSCRIPTION_TIERS.map((tier) => {
          const override = tierCopyMap.get(`tier_${tier.code.toLowerCase()}`);
          return (
            <article
              key={tier.name}
              className="rounded-xl border border-[var(--line)] bg-white p-4"
            >
              <p className="text-xl font-bold">{override?.title ?? tier.name}</p>
              <p className="mt-2 text-sm text-[var(--text-soft)]">
                {override?.bodyText ?? tier.desc}
              </p>
              <SubscribeCheckoutButton
                tierName={tier.name}
                tierCents={tier.cents}
                classId={params.classId}
                houseName={params.houseName}
                level={params.level ? Number(params.level) : undefined}
                classDay={params.classDay}
                classTime={params.classTime}
                teacherNickname={params.teacher}
              />
            </article>
          );
        })}
      </div>
    </div>
  );
}
