CREATE TABLE "source_purge_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"source_artifact_id" uuid NOT NULL,
	"authorized_by" text NOT NULL,
	"manifest_count" integer NOT NULL,
	"active_bytes_purged" bigint NOT NULL,
	"backup_objects_purged" integer NOT NULL,
	"purged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_purge_receipts_counts_check" CHECK ("source_purge_receipts"."manifest_count" >= 0 and "source_purge_receipts"."active_bytes_purged" >= 0 and "source_purge_receipts"."backup_objects_purged" >= 0)
);
--> statement-breakpoint
ALTER TABLE "source_purge_receipts" ADD CONSTRAINT "source_purge_receipts_authorized_by_auth_users_id_fk" FOREIGN KEY ("authorized_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "source_purge_receipts_source_uidx" ON "source_purge_receipts" USING btree ("workspace_id","project_id","source_artifact_id");--> statement-breakpoint
CREATE INDEX "source_purge_receipts_time_idx" ON "source_purge_receipts" USING btree ("workspace_id","purged_at","id");