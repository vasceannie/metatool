CREATE TYPE "public"."toggle_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "status" "toggle_status" DEFAULT 'ACTIVE' NOT NULL;