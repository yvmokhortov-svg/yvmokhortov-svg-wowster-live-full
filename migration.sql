-- CreateTable
CREATE TABLE "page_content_blocks" (
    "id" TEXT NOT NULL,
    "page_key" TEXT NOT NULL,
    "section_key" TEXT NOT NULL,
    "title" TEXT,
    "body_text" TEXT,
    "cta_label" TEXT,
    "cta_href" TEXT,
    "cta_secondary_label" TEXT,
    "cta_secondary_href" TEXT,
    "image_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_content_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_content_blocks_page_key_is_published_sort_order_idx" ON "page_content_blocks"("page_key", "is_published", "sort_order");

-- CreateIndex
CREATE INDEX "page_content_blocks_page_key_section_key_sort_order_idx" ON "page_content_blocks"("page_key", "section_key", "sort_order");

-- AddForeignKey
ALTER TABLE "page_content_blocks" ADD CONSTRAINT "page_content_blocks_updated_by_admin_id_fkey" FOREIGN KEY ("updated_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
