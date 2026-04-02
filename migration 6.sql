-- CreateTable
CREATE TABLE "chat_bundle_pricing" (
    "id" TEXT NOT NULL,
    "type" "BundleType" NOT NULL,
    "bundle_price_cents" INTEGER NOT NULL,
    "total_items" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_bundle_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_bundle_pricing_type_key" ON "chat_bundle_pricing"("type");
