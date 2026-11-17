-- Uploads (every file is uploaded once, then attached by id), one video per lesson,
-- lesson materials as uploads or links, module final tests, dynamic test points and
-- per-user module test progress. Existing lesson video links and material links are kept.

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'READY');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('IMAGE', 'FILE');

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'READY',
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uploads_object_key_key" ON "uploads"("object_key");

-- CreateIndex
CREATE INDEX "uploads_status_created_at_idx" ON "uploads"("status", "created_at");

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "lesson_videos" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "upload_id" UUID,
    "external_url" TEXT,
    "title" TEXT,
    "duration" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_videos_pkey" PRIMARY KEY ("id"),
    -- An uploaded file or an external link, exactly one (not managed by Prisma).
    CONSTRAINT "lesson_videos_source_check" CHECK (("upload_id" IS NULL) <> ("external_url" IS NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "lesson_videos_lesson_id_key" ON "lesson_videos"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_videos_upload_id_key" ON "lesson_videos"("upload_id");

-- AddForeignKey
ALTER TABLE "lesson_videos" ADD CONSTRAINT "lesson_videos_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_videos" ADD CONSTRAINT "lesson_videos_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data: the lesson video link moves to lesson_videos.
INSERT INTO "lesson_videos" ("id", "lesson_id", "external_url", "duration", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", "video_url", "video_duration", "created_at", CURRENT_TIMESTAMP
FROM "lessons"
WHERE "video_url" IS NOT NULL;

-- AlterTable
ALTER TABLE "lessons" DROP COLUMN "video_duration",
DROP COLUMN "video_url";

-- AlterTable: existing material links keep their URL.
ALTER TABLE "lesson_materials" RENAME COLUMN "url" TO "external_url";
ALTER TABLE "lesson_materials" ALTER COLUMN "external_url" DROP NOT NULL,
ADD COLUMN     "type" "MaterialType" NOT NULL DEFAULT 'FILE',
ADD COLUMN     "upload_id" UUID,
ALTER COLUMN "title" DROP NOT NULL;

-- An uploaded file or an external link, exactly one (not managed by Prisma).
ALTER TABLE "lesson_materials" ADD CONSTRAINT "lesson_materials_source_check"
CHECK (("upload_id" IS NULL) <> ("external_url" IS NULL));

-- CreateIndex
CREATE UNIQUE INDEX "lesson_materials_upload_id_key" ON "lesson_materials"("upload_id");

-- AddForeignKey
ALTER TABLE "lesson_materials" ADD CONSTRAINT "lesson_materials_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "lesson_tests" ADD COLUMN     "module_id" UUID,
ADD COLUMN     "total_points" INTEGER NOT NULL DEFAULT 100,
ALTER COLUMN "lesson_id" DROP NOT NULL;

-- A test belongs to exactly one lesson or one module (not managed by Prisma).
ALTER TABLE "lesson_tests" ADD CONSTRAINT "lesson_tests_owner_check"
CHECK (("lesson_id" IS NULL) <> ("module_id" IS NULL));

-- CreateIndex
CREATE UNIQUE INDEX "lesson_tests_module_id_key" ON "lesson_tests"("module_id");

-- AddForeignKey
ALTER TABLE "lesson_tests" ADD CONSTRAINT "lesson_tests_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: existing tests keep their question points, so the total is their sum.
UPDATE "lesson_tests" t
SET "total_points" = q."sum"
FROM (SELECT "test_id", SUM("points")::INTEGER AS "sum" FROM "test_questions" GROUP BY "test_id") q
WHERE q."test_id" = t."id" AND q."sum" > 0;

-- AlterTable
ALTER TABLE "test_questions" ALTER COLUMN "points" DROP NOT NULL,
ALTER COLUMN "points" DROP DEFAULT;

-- CreateTable
CREATE TABLE "module_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "best_test_percent" INTEGER,
    "test_passed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "module_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "module_progress_module_id_idx" ON "module_progress"("module_id");

-- CreateIndex
CREATE UNIQUE INDEX "module_progress_user_id_module_id_key" ON "module_progress"("user_id", "module_id");

-- AddForeignKey
ALTER TABLE "module_progress" ADD CONSTRAINT "module_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_progress" ADD CONSTRAINT "module_progress_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "course_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
