-- CreateEnum
CREATE TYPE "CustomGroupOrderStatus" AS ENUM ('DRAFT', 'CHECKOUT_SENT', 'PAID', 'ACTIVE', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CustomGroupSeatStatus" AS ENUM ('AVAILABLE', 'CLAIMED', 'CANCELED');

-- CreateTable
CREATE TABLE "custom_group_orders" (
    "id" TEXT NOT NULL,
    "source_support_task_id" TEXT,
    "status" "CustomGroupOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "number_of_seats" INTEGER NOT NULL,
    "claimed_seats" INTEGER NOT NULL DEFAULT 0,
    "country" TEXT NOT NULL,
    "preferred_days_times" TEXT NOT NULL,
    "age_range" TEXT NOT NULL,
    "note" TEXT,
    "contact_email" TEXT,
    "seat_price_cents" INTEGER NOT NULL,
    "total_amount_cents" INTEGER NOT NULL,
    "checkout_url" TEXT,
    "checkout_reference" TEXT,
    "paid_at" TIMESTAMP(3),
    "activated_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "group_admin_user_id" TEXT,
    "created_by_admin_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_group_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_group_seats" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "seat_index" INTEGER NOT NULL,
    "status" "CustomGroupSeatStatus" NOT NULL DEFAULT 'AVAILABLE',
    "claim_token" TEXT NOT NULL,
    "invited_email" TEXT,
    "claimed_by_user_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_group_seats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_group_orders_source_support_task_id_key" ON "custom_group_orders"("source_support_task_id");

-- CreateIndex
CREATE INDEX "custom_group_orders_status_created_at_idx" ON "custom_group_orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "custom_group_orders_group_admin_user_id_idx" ON "custom_group_orders"("group_admin_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_group_seats_claim_token_key" ON "custom_group_seats"("claim_token");

-- CreateIndex
CREATE UNIQUE INDEX "custom_group_seats_order_id_seat_index_key" ON "custom_group_seats"("order_id", "seat_index");

-- CreateIndex
CREATE INDEX "custom_group_seats_order_id_status_idx" ON "custom_group_seats"("order_id", "status");

-- AddForeignKey
ALTER TABLE "custom_group_orders" ADD CONSTRAINT "custom_group_orders_group_admin_user_id_fkey" FOREIGN KEY ("group_admin_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_group_orders" ADD CONSTRAINT "custom_group_orders_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_group_seats" ADD CONSTRAINT "custom_group_seats_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "custom_group_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_group_seats" ADD CONSTRAINT "custom_group_seats_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
