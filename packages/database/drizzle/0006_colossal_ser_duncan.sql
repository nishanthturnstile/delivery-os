CREATE TYPE "public"."document_job_state" AS ENUM('QUEUED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'NEEDS_ATTENTION', 'DEAD_LETTER', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."document_job_type" AS ENUM('SCAN', 'PARSE', 'OCR', 'EXTRACT', 'BACKUP', 'PURGE');--> statement-breakpoint
CREATE TYPE "public"."normalized_block_kind" AS ENUM('HEADING', 'PARAGRAPH', 'LIST_ITEM', 'TABLE_CELL');--> statement-breakpoint
CREATE TYPE "public"."normalized_extraction_method" AS ENUM('EMBEDDED_TEXT', 'OCR');--> statement-breakpoint
CREATE TABLE "document_job_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"worker_id" varchar(160) NOT NULL,
	"state" varchar(24) DEFAULT 'RUNNING' NOT NULL,
	"safe_error_code" varchar(120),
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "document_job_attempts_number_check" CHECK ("document_job_attempts"."attempt_number" > 0),
	CONSTRAINT "document_job_attempts_state_check" CHECK ("document_job_attempts"."state" in ('RUNNING', 'SUCCEEDED', 'RETRY_WAIT', 'NEEDS_ATTENTION', 'DEAD_LETTER', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "document_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"source_artifact_id" uuid,
	"source_generation_id" uuid,
	"intake_set_id" uuid,
	"job_type" "document_job_type" NOT NULL,
	"state" "document_job_state" DEFAULT 'QUEUED' NOT NULL,
	"input_hash" varchar(64) NOT NULL,
	"config_version" varchar(160) NOT NULL,
	"progress_completed" integer DEFAULT 0 NOT NULL,
	"progress_total" integer DEFAULT 1 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"maximum_attempts" integer DEFAULT 3 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"safe_error_code" varchar(120),
	"cancellation_requested_at" timestamp with time zone,
	"correlation_id" uuid NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_jobs_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "document_jobs_hash_check" CHECK ("document_jobs"."input_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "document_jobs_progress_check" CHECK ("document_jobs"."progress_completed" >= 0 and "document_jobs"."progress_total" > 0 and "document_jobs"."progress_completed" <= "document_jobs"."progress_total"),
	CONSTRAINT "document_jobs_attempt_check" CHECK ("document_jobs"."attempt_count" >= 0 and "document_jobs"."maximum_attempts" > 0 and "document_jobs"."attempt_count" <= "document_jobs"."maximum_attempts"),
	CONSTRAINT "document_jobs_revision_check" CHECK ("document_jobs"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "intake_set_sources" (
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"intake_set_id" uuid NOT NULL,
	"source_generation_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"audience" "artifact_audience" NOT NULL,
	CONSTRAINT "intake_set_sources_intake_set_id_source_generation_id_pk" PRIMARY KEY("intake_set_id","source_generation_id"),
	CONSTRAINT "intake_set_sources_ordinal_check" CHECK ("intake_set_sources"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "intake_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"source_manifest_hash" varchar(64) NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_sets_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "intake_sets_revision_check" CHECK ("intake_sets"."revision" > 0),
	CONSTRAINT "intake_sets_hash_check" CHECK ("intake_sets"."source_manifest_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "normalized_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"source_artifact_id" uuid NOT NULL,
	"source_generation_id" uuid NOT NULL,
	"normalized_document_id" uuid NOT NULL,
	"source_locator_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"block_key" varchar(64) NOT NULL,
	"kind" "normalized_block_kind" NOT NULL,
	"text" text NOT NULL,
	"extraction" "normalized_extraction_method" NOT NULL,
	"confidence" varchar(32),
	"audience" "artifact_audience" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "normalized_blocks_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "normalized_blocks_ordinal_check" CHECK ("normalized_blocks"."ordinal" >= 0),
	CONSTRAINT "normalized_blocks_key_check" CHECK ("normalized_blocks"."block_key" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "normalized_blocks_text_check" CHECK (length("normalized_blocks"."text") between 1 and 100000),
	CONSTRAINT "normalized_blocks_confidence_check" CHECK ("normalized_blocks"."confidence" is null or "normalized_blocks"."confidence" ~ '^(0(\.[0-9]+)?|1(\.0+)?)$')
);
--> statement-breakpoint
CREATE TABLE "normalized_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"source_artifact_id" uuid NOT NULL,
	"source_generation_id" uuid NOT NULL,
	"parser_version" varchar(120) NOT NULL,
	"renderer_version" varchar(120) NOT NULL,
	"ocr_config_version" varchar(160) NOT NULL,
	"source_sha256" varchar(64) NOT NULL,
	"document_hash" varchar(64) NOT NULL,
	"block_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "normalized_documents_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "normalized_documents_hash_check" CHECK ("normalized_documents"."source_sha256" ~ '^[a-f0-9]{64}$' and "normalized_documents"."document_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "normalized_documents_block_count_check" CHECK ("normalized_documents"."block_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "source_locators" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"source_artifact_id" uuid NOT NULL,
	"source_generation_id" uuid NOT NULL,
	"normalized_document_id" uuid NOT NULL,
	"format" "source_format" NOT NULL,
	"locator_json" jsonb NOT NULL,
	"locator_hash" varchar(64) NOT NULL,
	"audience" "artifact_audience" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_locators_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "source_locators_hash_check" CHECK ("source_locators"."locator_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "document_job_attempts" ADD CONSTRAINT "document_job_attempts_job_fk" FOREIGN KEY ("workspace_id","project_id","job_id") REFERENCES "public"."document_jobs"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_jobs" ADD CONSTRAINT "document_jobs_source_fk" FOREIGN KEY ("workspace_id","project_id","source_artifact_id") REFERENCES "public"."source_artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_set_sources" ADD CONSTRAINT "intake_set_sources_intake_fk" FOREIGN KEY ("workspace_id","project_id","intake_set_id") REFERENCES "public"."intake_sets"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_set_sources" ADD CONSTRAINT "intake_set_sources_generation_fk" FOREIGN KEY ("workspace_id","project_id","source_generation_id") REFERENCES "public"."source_generations"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_sets" ADD CONSTRAINT "intake_sets_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_sets" ADD CONSTRAINT "intake_sets_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_blocks" ADD CONSTRAINT "normalized_blocks_document_fk" FOREIGN KEY ("workspace_id","project_id","normalized_document_id") REFERENCES "public"."normalized_documents"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_blocks" ADD CONSTRAINT "normalized_blocks_locator_fk" FOREIGN KEY ("workspace_id","project_id","source_locator_id") REFERENCES "public"."source_locators"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_documents" ADD CONSTRAINT "normalized_documents_generation_fk" FOREIGN KEY ("workspace_id","project_id","source_generation_id") REFERENCES "public"."source_generations"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_locators" ADD CONSTRAINT "source_locators_document_fk" FOREIGN KEY ("workspace_id","project_id","normalized_document_id") REFERENCES "public"."normalized_documents"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_job_attempts_number_uidx" ON "document_job_attempts" USING btree ("job_id","attempt_number");--> statement-breakpoint
CREATE INDEX "document_job_attempts_running_idx" ON "document_job_attempts" USING btree ("claimed_at","id") WHERE "document_job_attempts"."state" = 'RUNNING';--> statement-breakpoint
CREATE UNIQUE INDEX "document_jobs_dedupe_uidx" ON "document_jobs" USING btree ("workspace_id","project_id","job_type","input_hash","config_version");--> statement-breakpoint
CREATE INDEX "document_jobs_worker_idx" ON "document_jobs" USING btree ("job_type","state","available_at","id") WHERE "document_jobs"."state" in ('QUEUED', 'RETRY_WAIT');--> statement-breakpoint
CREATE INDEX "document_jobs_attention_idx" ON "document_jobs" USING btree ("workspace_id","project_id","state","updated_at","id") WHERE "document_jobs"."state" in ('NEEDS_ATTENTION', 'DEAD_LETTER');--> statement-breakpoint
CREATE UNIQUE INDEX "intake_set_sources_ordinal_uidx" ON "intake_set_sources" USING btree ("intake_set_id","ordinal");--> statement-breakpoint
CREATE INDEX "intake_sets_project_time_idx" ON "intake_sets" USING btree ("workspace_id","project_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "normalized_blocks_key_uidx" ON "normalized_blocks" USING btree ("normalized_document_id","block_key");--> statement-breakpoint
CREATE UNIQUE INDEX "normalized_blocks_ordinal_uidx" ON "normalized_blocks" USING btree ("normalized_document_id","ordinal");--> statement-breakpoint
CREATE INDEX "normalized_blocks_source_idx" ON "normalized_blocks" USING btree ("workspace_id","project_id","source_artifact_id","normalized_document_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "normalized_documents_config_uidx" ON "normalized_documents" USING btree ("source_generation_id","parser_version","renderer_version","ocr_config_version");--> statement-breakpoint
CREATE INDEX "normalized_documents_source_time_idx" ON "normalized_documents" USING btree ("workspace_id","project_id","source_artifact_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_locators_document_hash_uidx" ON "source_locators" USING btree ("normalized_document_id","locator_hash");
--> statement-breakpoint
CREATE TRIGGER intake_sets_immutable
  BEFORE UPDATE ON intake_sets
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_artifact_record_change();
--> statement-breakpoint
CREATE TRIGGER intake_set_sources_immutable
  BEFORE UPDATE ON intake_set_sources
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_artifact_record_change();
--> statement-breakpoint
CREATE TRIGGER normalized_documents_immutable
  BEFORE UPDATE ON normalized_documents
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_artifact_record_change();
--> statement-breakpoint
CREATE TRIGGER source_locators_immutable
  BEFORE UPDATE ON source_locators
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_artifact_record_change();
--> statement-breakpoint
CREATE TRIGGER normalized_blocks_immutable
  BEFORE UPDATE ON normalized_blocks
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_artifact_record_change();
