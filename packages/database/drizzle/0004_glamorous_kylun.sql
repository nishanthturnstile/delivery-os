CREATE TYPE "public"."object_manifest_purpose" AS ENUM('QUARANTINE', 'PRIMARY', 'BACKUP');--> statement-breakpoint
CREATE TYPE "public"."object_manifest_state" AS ENUM('PENDING', 'AVAILABLE', 'DELETING', 'DELETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."source_format" AS ENUM('PDF', 'DOCX', 'MARKDOWN', 'TEXT');--> statement-breakpoint
CREATE TYPE "public"."source_processing_state" AS ENUM('QUEUED', 'SCANNING', 'PROCESSING', 'SUCCEEDED', 'NEEDS_ATTENTION', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."source_retention_state" AS ENUM('ACTIVE', 'RECOVERABLE', 'PURGING', 'PURGED');--> statement-breakpoint
CREATE TYPE "public"."source_upload_session_state" AS ENUM('OPEN', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED');--> statement-breakpoint
CREATE TABLE "object_manifests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"source_artifact_id" uuid NOT NULL,
	"source_generation_id" uuid NOT NULL,
	"purpose" "object_manifest_purpose" NOT NULL,
	"replica" integer DEFAULT 0 NOT NULL,
	"object_key" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"media_type" varchar(120) NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"state" "object_manifest_state" DEFAULT 'PENDING' NOT NULL,
	"verified_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "object_manifests_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "object_manifests_size_check" CHECK ("object_manifests"."byte_size" > 0 and "object_manifests"."byte_size" <= 52428800),
	CONSTRAINT "object_manifests_hash_check" CHECK ("object_manifests"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "object_manifests_replica_check" CHECK ("object_manifests"."replica" >= 0)
);
--> statement-breakpoint
CREATE TABLE "source_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"current_generation_id" uuid NOT NULL,
	"display_name" varchar(240) NOT NULL,
	"format" "source_format" NOT NULL,
	"audience" "artifact_audience" NOT NULL,
	"processing_state" "source_processing_state" DEFAULT 'QUEUED' NOT NULL,
	"retention_state" "source_retention_state" DEFAULT 'ACTIVE' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"uploaded_by" text NOT NULL,
	"deleted_by" text,
	"deleted_at" timestamp with time zone,
	"recoverable_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_artifacts_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "source_artifacts_revision_check" CHECK ("source_artifacts"."revision" > 0),
	CONSTRAINT "source_artifacts_retention_dates_check" CHECK (("source_artifacts"."retention_state" = 'ACTIVE' and "source_artifacts"."deleted_at" is null and "source_artifacts"."recoverable_until" is null)
        or ("source_artifacts"."retention_state" <> 'ACTIVE' and "source_artifacts"."deleted_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "source_generations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"source_artifact_id" uuid NOT NULL,
	"generation_number" integer NOT NULL,
	"declared_media_type" varchar(120) NOT NULL,
	"detected_media_type" varchar(120),
	"declared_byte_size" bigint NOT NULL,
	"actual_byte_size" bigint,
	"expected_sha256" varchar(64) NOT NULL,
	"actual_sha256" varchar(64),
	"duplicate_of_generation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_generations_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "source_generations_declared_size_check" CHECK ("source_generations"."declared_byte_size" > 0 and "source_generations"."declared_byte_size" <= 52428800),
	CONSTRAINT "source_generations_actual_size_check" CHECK ("source_generations"."actual_byte_size" is null or ("source_generations"."actual_byte_size" > 0 and "source_generations"."actual_byte_size" <= 52428800)),
	CONSTRAINT "source_generations_hash_check" CHECK ("source_generations"."expected_sha256" ~ '^[a-f0-9]{64}$'
        and ("source_generations"."actual_sha256" is null or "source_generations"."actual_sha256" ~ '^[a-f0-9]{64}$'))
);
--> statement-breakpoint
CREATE TABLE "source_project_quotas" (
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"retained_bytes" bigint DEFAULT 0 NOT NULL,
	"reserved_bytes" bigint DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_project_quotas_workspace_id_project_id_pk" PRIMARY KEY("workspace_id","project_id"),
	CONSTRAINT "source_project_quotas_bytes_check" CHECK ("source_project_quotas"."retained_bytes" >= 0 and "source_project_quotas"."reserved_bytes" >= 0
        and "source_project_quotas"."retained_bytes" + "source_project_quotas"."reserved_bytes" <= 524288000),
	CONSTRAINT "source_project_quotas_revision_check" CHECK ("source_project_quotas"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "source_quota_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"upload_session_id" uuid NOT NULL,
	"byte_size" bigint NOT NULL,
	"state" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_quota_reservations_size_check" CHECK ("source_quota_reservations"."byte_size" > 0 and "source_quota_reservations"."byte_size" <= 52428800),
	CONSTRAINT "source_quota_reservations_state_check" CHECK ("source_quota_reservations"."state" in ('ACTIVE', 'CONSUMED', 'RELEASED')),
	CONSTRAINT "source_quota_reservations_release_check" CHECK (("source_quota_reservations"."state" = 'ACTIVE' and "source_quota_reservations"."released_at" is null)
        or ("source_quota_reservations"."state" <> 'ACTIVE' and "source_quota_reservations"."released_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "source_upload_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"source_artifact_id" uuid NOT NULL,
	"source_generation_id" uuid NOT NULL,
	"quarantine_manifest_id" uuid NOT NULL,
	"state" "source_upload_session_state" DEFAULT 'OPEN' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"reserved_bytes" bigint NOT NULL,
	"expected_sha256" varchar(64) NOT NULL,
	"expected_sha256_base64" varchar(44) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"failure_code" varchar(120),
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_upload_sessions_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "source_upload_sessions_reserved_bytes_check" CHECK ("source_upload_sessions"."reserved_bytes" > 0 and "source_upload_sessions"."reserved_bytes" <= 52428800),
	CONSTRAINT "source_upload_sessions_revision_check" CHECK ("source_upload_sessions"."revision" > 0),
	CONSTRAINT "source_upload_sessions_hash_check" CHECK ("source_upload_sessions"."expected_sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "source_upload_sessions_completion_check" CHECK (("source_upload_sessions"."state" = 'COMPLETED' and "source_upload_sessions"."completed_at" is not null)
        or ("source_upload_sessions"."state" <> 'COMPLETED'))
);
--> statement-breakpoint
ALTER TABLE "object_manifests" ADD CONSTRAINT "object_manifests_generation_fk" FOREIGN KEY ("workspace_id","project_id","source_generation_id") REFERENCES "public"."source_generations"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_artifacts" ADD CONSTRAINT "source_artifacts_uploaded_by_auth_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_artifacts" ADD CONSTRAINT "source_artifacts_deleted_by_auth_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_artifacts" ADD CONSTRAINT "source_artifacts_workspace_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_generations" ADD CONSTRAINT "source_generations_source_fk" FOREIGN KEY ("workspace_id","project_id","source_artifact_id") REFERENCES "public"."source_artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_project_quotas" ADD CONSTRAINT "source_project_quotas_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_quota_reservations" ADD CONSTRAINT "source_quota_reservations_session_fk" FOREIGN KEY ("workspace_id","project_id","upload_session_id") REFERENCES "public"."source_upload_sessions"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_upload_sessions" ADD CONSTRAINT "source_upload_sessions_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_upload_sessions" ADD CONSTRAINT "source_upload_sessions_generation_fk" FOREIGN KEY ("workspace_id","project_id","source_generation_id") REFERENCES "public"."source_generations"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "object_manifests_key_uidx" ON "object_manifests" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "object_manifests_generation_purpose_replica_uidx" ON "object_manifests" USING btree ("source_generation_id","purpose","replica");--> statement-breakpoint
CREATE INDEX "object_manifests_reconcile_idx" ON "object_manifests" USING btree ("state","purpose","updated_at","id");--> statement-breakpoint
CREATE INDEX "source_artifacts_project_audience_state_idx" ON "source_artifacts" USING btree ("workspace_id","project_id","audience","retention_state","processing_state","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_generations_number_uidx" ON "source_generations" USING btree ("source_artifact_id","generation_number");--> statement-breakpoint
CREATE INDEX "source_generations_content_idx" ON "source_generations" USING btree ("workspace_id","project_id","expected_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "source_quota_reservations_session_uidx" ON "source_quota_reservations" USING btree ("upload_session_id");--> statement-breakpoint
CREATE INDEX "source_quota_reservations_active_idx" ON "source_quota_reservations" USING btree ("workspace_id","project_id","created_at") WHERE "source_quota_reservations"."state" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "source_upload_sessions_active_generation_uidx" ON "source_upload_sessions" USING btree ("source_generation_id") WHERE "source_upload_sessions"."state" = 'OPEN';--> statement-breakpoint
CREATE INDEX "source_upload_sessions_expiry_idx" ON "source_upload_sessions" USING btree ("expires_at","id") WHERE "source_upload_sessions"."state" = 'OPEN';
--> statement-breakpoint
CREATE FUNCTION prevent_source_generation_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id <> OLD.id
     OR NEW.workspace_id <> OLD.workspace_id
     OR NEW.project_id <> OLD.project_id
     OR NEW.source_artifact_id <> OLD.source_artifact_id
     OR NEW.generation_number <> OLD.generation_number
     OR NEW.declared_media_type <> OLD.declared_media_type
     OR NEW.declared_byte_size <> OLD.declared_byte_size
     OR NEW.expected_sha256 <> OLD.expected_sha256
     OR (OLD.actual_byte_size IS NOT NULL AND NEW.actual_byte_size IS DISTINCT FROM OLD.actual_byte_size)
     OR (OLD.actual_sha256 IS NOT NULL AND NEW.actual_sha256 IS DISTINCT FROM OLD.actual_sha256)
     OR (OLD.detected_media_type IS NOT NULL AND NEW.detected_media_type IS DISTINCT FROM OLD.detected_media_type)
     OR (OLD.duplicate_of_generation_id IS NOT NULL AND NEW.duplicate_of_generation_id IS DISTINCT FROM OLD.duplicate_of_generation_id)
  THEN
    RAISE EXCEPTION 'immutable source generation evidence cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER source_generations_evidence_immutable
BEFORE UPDATE ON source_generations
FOR EACH ROW EXECUTE FUNCTION prevent_source_generation_evidence_mutation();
--> statement-breakpoint
CREATE FUNCTION prevent_object_manifest_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id <> OLD.id
     OR NEW.workspace_id <> OLD.workspace_id
     OR NEW.project_id <> OLD.project_id
     OR NEW.source_artifact_id <> OLD.source_artifact_id
     OR NEW.source_generation_id <> OLD.source_generation_id
     OR NEW.purpose <> OLD.purpose
     OR NEW.replica <> OLD.replica
     OR NEW.object_key <> OLD.object_key
     OR NEW.byte_size <> OLD.byte_size
     OR NEW.media_type <> OLD.media_type
     OR NEW.sha256 <> OLD.sha256
  THEN
    RAISE EXCEPTION 'immutable object manifest identity cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER object_manifests_identity_immutable
BEFORE UPDATE ON object_manifests
FOR EACH ROW EXECUTE FUNCTION prevent_object_manifest_identity_mutation();
