import { SupportForms } from "@/components/support/support-forms";
import { firstBlockBySection, getPublishedPageContentBlocks } from "@/lib/content/blocks";
import { isContentPreviewEnabled } from "@/lib/content/preview";

export default async function SupportPage() {
  const previewEnabled = await isContentPreviewEnabled();
  const blocks = await getPublishedPageContentBlocks("support", {
    includeUnpublished: previewEnabled,
  });
  const content = firstBlockBySection(blocks);
  const hero = content.hero;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{hero?.title ?? "Support"}</h1>
      {hero?.bodyText ? (
        <p className="text-[var(--text-soft)]">{hero.bodyText}</p>
      ) : (
        <p className="text-[var(--text-soft)]">
          Contact support for account, class, payment, or moderation requests.
        </p>
      )}
      <SupportForms />
    </div>
  );
}
