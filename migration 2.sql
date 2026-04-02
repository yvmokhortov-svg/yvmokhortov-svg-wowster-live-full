-- CreateEnum
CREATE TYPE "StreamRecordingStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "stream_recordings" (
    "id" TEXT NOT NULL,
    "stream_id" TEXT NOT NULL,
    "status" "StreamRecordingStatus" NOT NULL DEFAULT 'PROCESSING',
    "storage_provider" TEXT NOT NULL DEFAULT 'DO_SPACES',
    "object_key" TEXT,
    "download_url" TEXT,
    "mime_type" TEXT,
    "size_bytes" BIGINT,
    "duration_seconds" INTEGER,
    "recorded_started_at" TIMESTAMP(3),
    "recorded_ended_at" TIMESTAMP(3),
    "available_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "expired_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stream_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording_download_audits" (
    "id" TEXT NOT NULL,
    "recording_id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recording_download_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stream_recordings_stream_id_key" ON "stream_recordings"("stream_id");

-- CreateIndex
CREATE INDEX "stream_recordings_status_expires_at_idx" ON "stream_recordings"("status", "expires_at");

-- CreateIndex
CREATE INDEX "stream_recordings_recorded_ended_at_idx" ON "stream_recordings"("recorded_ended_at");

-- CreateIndex
CREATE INDEX "recording_download_audits_recording_id_created_at_idx" ON "recording_download_audits"("recording_id", "created_at");

-- CreateIndex
CREATE INDEX "recording_download_audits_admin_user_id_created_at_idx" ON "recording_download_audits"("admin_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "stream_recordings" ADD CONSTRAINT "stream_recordings_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_download_audits" ADD CONSTRAINT "recording_download_audits_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "stream_recordings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_download_audits" ADD CONSTRAINT "recording_download_audits_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
