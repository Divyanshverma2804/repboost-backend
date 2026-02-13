-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'BUSINESS_ADMIN');

-- CreateEnum
CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PatientSource" AS ENUM ('MANUAL', 'CSV', 'QR');

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('SENT', 'FAILED', 'QUOTA_BLOCKED');

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "review_link" TEXT NOT NULL,
    "message_template" TEXT NOT NULL DEFAULT 'Hi {{name}}, thank you for visiting {{business_name}}! Please share your feedback: {{link}}',
    "reminder_template" TEXT NOT NULL DEFAULT 'Hi {{name}}, we noticed you haven''t shared your feedback yet. It would mean a lot to us: {{link}}',
    "send_delay_hours" INTEGER NOT NULL DEFAULT 3,
    "reminder_delay_hours" INTEGER NOT NULL DEFAULT 24,
    "max_reminders" INTEGER NOT NULL DEFAULT 2,
    "logo_url" TEXT,
    "status" "BusinessStatus" NOT NULL DEFAULT 'ACTIVE',
    "sms_monthly_limit" INTEGER NOT NULL DEFAULT 500,
    "sms_used_this_month" INTEGER NOT NULL DEFAULT 0,
    "max_csv_rows_per_upload" INTEGER NOT NULL DEFAULT 300,
    "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 20,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "business_id" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "visit_date" TIMESTAMP(3),
    "send_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "rating" INTEGER,
    "feedback" TEXT,
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    "source" "PatientSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_logs" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "status" "SmsStatus" NOT NULL,
    "provider_response" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "patients_business_id_idx" ON "patients"("business_id");

-- CreateIndex
CREATE INDEX "patients_send_at_idx" ON "patients"("send_at");

-- CreateIndex
CREATE INDEX "patients_sent_at_idx" ON "patients"("sent_at");

-- CreateIndex
CREATE INDEX "sms_logs_business_id_idx" ON "sms_logs"("business_id");

-- CreateIndex
CREATE INDEX "sms_logs_created_at_idx" ON "sms_logs"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
