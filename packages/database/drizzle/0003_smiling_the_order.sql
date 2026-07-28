CREATE TYPE "public"."artifact_approval_decision" AS ENUM('APPROVE', 'REJECT', 'CHANGES_REQUESTED');--> statement-breakpoint
CREATE TYPE "public"."artifact_approval_request_state" AS ENUM('OPEN', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."artifact_approval_scope" AS ENUM('INTERNAL', 'EXTERNAL_BINDING');--> statement-breakpoint
CREATE TYPE "public"."artifact_attachment_state" AS ENUM('PENDING', 'AVAILABLE', 'REMOVED', 'QUARANTINED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."artifact_audience" AS ENUM('TEAM_ONLY', 'CLIENT_VISIBLE');--> statement-breakpoint
CREATE TYPE "public"."artifact_audience_source" AS ENUM('EXPLICIT', 'INHERITED');--> statement-breakpoint
CREATE TYPE "public"."artifact_baseline_state" AS ENUM('CURRENT', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."artifact_comment_state" AS ENUM('OPEN', 'RESOLVED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."artifact_delta_state" AS ENUM('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'CANCELLED', 'APPLIED');--> statement-breakpoint
CREATE TYPE "public"."artifact_export_state" AS ENUM('PENDING', 'PROCESSING', 'READY', 'FAILED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."artifact_lifecycle_state" AS ENUM('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED');--> statement-breakpoint
CREATE TYPE "public"."artifact_target_type" AS ENUM('DRAFT_REVISION', 'REVIEW_SNAPSHOT', 'BASELINE', 'DELTA');--> statement-breakpoint
CREATE TABLE "artifact_approval_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"slot_key" varchar(64) NOT NULL,
	"scope" "artifact_approval_scope" NOT NULL,
	"decision" "artifact_approval_decision" NOT NULL,
	"actor_id" text NOT NULL,
	"actor_role" varchar(32) NOT NULL,
	"comment" text,
	"snapshot_hash" varchar(64) NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_approval_decisions_snapshot_hash_check" CHECK (length("artifact_approval_decisions"."snapshot_hash") = 64),
	CONSTRAINT "artifact_approval_decisions_comment_check" CHECK ("artifact_approval_decisions"."decision" = 'APPROVE' or length(trim("artifact_approval_decisions"."comment")) >= 2)
);
--> statement-breakpoint
CREATE TABLE "artifact_approval_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"request_number" integer NOT NULL,
	"state" "artifact_approval_request_state" DEFAULT 'OPEN' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"required_slots" jsonb NOT NULL,
	"binding_decision_id" uuid,
	"opened_by" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" text,
	"closed_at" timestamp with time zone,
	"close_comment" text,
	CONSTRAINT "artifact_approval_requests_close_check" CHECK (("artifact_approval_requests"."state" = 'OPEN' and "artifact_approval_requests"."closed_at" is null and "artifact_approval_requests"."closed_by" is null)
        or ("artifact_approval_requests"."state" <> 'OPEN' and "artifact_approval_requests"."closed_at" is not null and "artifact_approval_requests"."closed_by" is not null))
);
--> statement-breakpoint
CREATE TABLE "artifact_attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"target_type" "artifact_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"display_name" varchar(240) NOT NULL,
	"media_type" varchar(120) NOT NULL,
	"byte_size" bigint NOT NULL,
	"content_hash" varchar(64),
	"object_reference" text NOT NULL,
	"audience_id" uuid NOT NULL,
	"state" "artifact_attachment_state" DEFAULT 'PENDING' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_attachments_revision_check" CHECK ("artifact_attachments"."revision" > 0),
	CONSTRAINT "artifact_attachments_size_check" CHECK ("artifact_attachments"."byte_size" > 0 and "artifact_attachments"."byte_size" <= 100000000)
);
--> statement-breakpoint
CREATE TABLE "artifact_audiences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"declared_audience" "artifact_audience" NOT NULL,
	"effective_audience" "artifact_audience" NOT NULL,
	"source" "artifact_audience_source" NOT NULL,
	"parent_audience_id" uuid,
	"actor_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_audiences_inheritance_check" CHECK (("artifact_audiences"."source" = 'EXPLICIT' and "artifact_audiences"."parent_audience_id" is null)
        or ("artifact_audiences"."source" = 'INHERITED' and "artifact_audiences"."parent_audience_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "artifact_baselines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"major_number" integer NOT NULL,
	"source_snapshot_id" uuid NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"schema_version" varchar(8) NOT NULL,
	"predecessor_baseline_id" uuid,
	"audience_id" uuid NOT NULL,
	"state" "artifact_baseline_state" DEFAULT 'CURRENT' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_baselines_number_check" CHECK ("artifact_baselines"."major_number" > 0),
	CONSTRAINT "artifact_baselines_hash_check" CHECK (length("artifact_baselines"."content_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "artifact_comment_mentions" (
	"comment_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"mentioned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_comment_mentions_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "artifact_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"target_type" "artifact_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"body" text,
	"audience_id" uuid NOT NULL,
	"state" "artifact_comment_state" DEFAULT 'OPEN' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"author_id" text NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"removed_by" text,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_comments_revision_check" CHECK ("artifact_comments"."revision" > 0),
	CONSTRAINT "artifact_comments_body_check" CHECK (("artifact_comments"."state" = 'REMOVED' and "artifact_comments"."body" is null) or ("artifact_comments"."state" <> 'REMOVED' and length(trim("artifact_comments"."body")) between 1 and 8000))
);
--> statement-breakpoint
CREATE TABLE "artifact_deltas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"base_baseline_id" uuid NOT NULL,
	"proposed_draft_revision_id" uuid,
	"approval_request_id" uuid,
	"successor_baseline_id" uuid,
	"audience_id" uuid NOT NULL,
	"state" "artifact_delta_state" DEFAULT 'DRAFT' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"rationale" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_deltas_revision_check" CHECK ("artifact_deltas"."revision" > 0),
	CONSTRAINT "artifact_deltas_rationale_check" CHECK (length(trim("artifact_deltas"."rationale")) >= 2)
);
--> statement-breakpoint
CREATE TABLE "artifact_draft_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"draft_number" integer NOT NULL,
	"parent_revision_id" uuid,
	"source_baseline_id" uuid,
	"delta_id" uuid,
	"audience_id" uuid NOT NULL,
	"schema_version" varchar(8) NOT NULL,
	"canonicalization" varchar(32) DEFAULT 'JCS_RFC8785' NOT NULL,
	"hash_algorithm" varchar(16) DEFAULT 'SHA256' NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"canonical_body" text NOT NULL,
	"body_json" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_draft_revisions_number_check" CHECK ("artifact_draft_revisions"."draft_number" > 0),
	CONSTRAINT "artifact_draft_revisions_hash_check" CHECK (length("artifact_draft_revisions"."content_hash") = 64 and "artifact_draft_revisions"."hash_algorithm" = 'SHA256' and "artifact_draft_revisions"."canonicalization" = 'JCS_RFC8785')
);
--> statement-breakpoint
CREATE TABLE "artifact_export_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"target_type" "artifact_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"format" varchar(16) NOT NULL,
	"audience" "artifact_audience" NOT NULL,
	"requester_id" text NOT NULL,
	"state" "artifact_export_state" DEFAULT 'PENDING' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"dedupe_key" varchar(64) NOT NULL,
	"object_reference" text,
	"content_hash" varchar(64),
	"failure_code" varchar(120),
	"permission_checked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_export_requests_revision_check" CHECK ("artifact_export_requests"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "artifact_review_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"draft_revision_id" uuid NOT NULL,
	"audience_id" uuid NOT NULL,
	"snapshot_number" integer NOT NULL,
	"schema_version" varchar(8) NOT NULL,
	"policy_version" varchar(8) NOT NULL,
	"canonicalization" varchar(32) NOT NULL,
	"hash_algorithm" varchar(16) NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"canonical_body" text NOT NULL,
	"body_json" jsonb NOT NULL,
	"submitted_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_review_snapshots_number_check" CHECK ("artifact_review_snapshots"."snapshot_number" > 0),
	CONSTRAINT "artifact_review_snapshots_hash_check" CHECK (length("artifact_review_snapshots"."content_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind_key" varchar(64) NOT NULL,
	"schema_version" varchar(8) NOT NULL,
	"policy_version" varchar(8) NOT NULL,
	"title" varchar(200) NOT NULL,
	"state" "artifact_lifecycle_state" DEFAULT 'DRAFT' NOT NULL,
	"audience" "artifact_audience" NOT NULL,
	"root_audience_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"current_draft_revision_id" uuid NOT NULL,
	"open_approval_request_id" uuid,
	"current_baseline_id" uuid,
	"next_draft_number" integer DEFAULT 2 NOT NULL,
	"next_snapshot_number" integer DEFAULT 1 NOT NULL,
	"next_request_number" integer DEFAULT 1 NOT NULL,
	"next_baseline_major" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifacts_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "artifacts_revision_check" CHECK ("artifacts"."revision" > 0),
	CONSTRAINT "artifacts_counters_check" CHECK ("artifacts"."next_draft_number" > 0 and "artifacts"."next_snapshot_number" > 0 and "artifacts"."next_request_number" > 0 and "artifacts"."next_baseline_major" > 0),
	CONSTRAINT "artifacts_kind_check" CHECK ("artifacts"."kind_key" ~ '^[A-Z][A-Z0-9_]{1,63}$'),
	CONSTRAINT "artifacts_state_pointer_check" CHECK (("artifacts"."state" = 'IN_REVIEW' and "artifacts"."open_approval_request_id" is not null)
        or ("artifacts"."state" <> 'IN_REVIEW'))
);
--> statement-breakpoint
ALTER TABLE "artifact_approval_decisions" ADD CONSTRAINT "artifact_approval_decisions_request_id_artifact_approval_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."artifact_approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_approval_decisions" ADD CONSTRAINT "artifact_approval_decisions_snapshot_id_artifact_review_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."artifact_review_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_approval_decisions" ADD CONSTRAINT "artifact_approval_decisions_actor_id_auth_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_approval_decisions" ADD CONSTRAINT "artifact_approval_decisions_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_approval_requests" ADD CONSTRAINT "artifact_approval_requests_snapshot_id_artifact_review_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."artifact_review_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_approval_requests" ADD CONSTRAINT "artifact_approval_requests_opened_by_auth_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_approval_requests" ADD CONSTRAINT "artifact_approval_requests_closed_by_auth_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_approval_requests" ADD CONSTRAINT "artifact_approval_requests_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_attachments" ADD CONSTRAINT "artifact_attachments_audience_id_artifact_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."artifact_audiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_attachments" ADD CONSTRAINT "artifact_attachments_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_attachments" ADD CONSTRAINT "artifact_attachments_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_audiences" ADD CONSTRAINT "artifact_audiences_actor_id_auth_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_audiences" ADD CONSTRAINT "artifact_audiences_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_baselines" ADD CONSTRAINT "artifact_baselines_source_snapshot_id_artifact_review_snapshots_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."artifact_review_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_baselines" ADD CONSTRAINT "artifact_baselines_audience_id_artifact_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."artifact_audiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_baselines" ADD CONSTRAINT "artifact_baselines_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_baselines" ADD CONSTRAINT "artifact_baselines_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_comment_mentions" ADD CONSTRAINT "artifact_comment_mentions_comment_id_artifact_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."artifact_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_comment_mentions" ADD CONSTRAINT "artifact_comment_mentions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_comments" ADD CONSTRAINT "artifact_comments_audience_id_artifact_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."artifact_audiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_comments" ADD CONSTRAINT "artifact_comments_author_id_auth_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_comments" ADD CONSTRAINT "artifact_comments_resolved_by_auth_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_comments" ADD CONSTRAINT "artifact_comments_removed_by_auth_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_comments" ADD CONSTRAINT "artifact_comments_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_deltas" ADD CONSTRAINT "artifact_deltas_base_baseline_id_artifact_baselines_id_fk" FOREIGN KEY ("base_baseline_id") REFERENCES "public"."artifact_baselines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_deltas" ADD CONSTRAINT "artifact_deltas_audience_id_artifact_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."artifact_audiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_deltas" ADD CONSTRAINT "artifact_deltas_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_deltas" ADD CONSTRAINT "artifact_deltas_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_draft_revisions" ADD CONSTRAINT "artifact_draft_revisions_audience_id_artifact_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."artifact_audiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_draft_revisions" ADD CONSTRAINT "artifact_draft_revisions_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_draft_revisions" ADD CONSTRAINT "artifact_draft_revisions_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_export_requests" ADD CONSTRAINT "artifact_export_requests_requester_id_auth_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_export_requests" ADD CONSTRAINT "artifact_export_requests_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_review_snapshots" ADD CONSTRAINT "artifact_review_snapshots_audience_id_artifact_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."artifact_audiences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_review_snapshots" ADD CONSTRAINT "artifact_review_snapshots_submitted_by_auth_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_review_snapshots" ADD CONSTRAINT "artifact_review_snapshots_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_review_snapshots" ADD CONSTRAINT "artifact_review_snapshots_draft_fk" FOREIGN KEY ("draft_revision_id") REFERENCES "public"."artifact_draft_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_workspace_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_approval_decisions_slot_uidx" ON "artifact_approval_decisions" USING btree ("request_id","slot_key");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_approval_decisions_external_binding_uidx" ON "artifact_approval_decisions" USING btree ("request_id") WHERE "artifact_approval_decisions"."scope" = 'EXTERNAL_BINDING';--> statement-breakpoint
CREATE INDEX "artifact_approval_decisions_actor_time_idx" ON "artifact_approval_decisions" USING btree ("actor_id","decided_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_approval_requests_number_uidx" ON "artifact_approval_requests" USING btree ("artifact_id","request_number");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_approval_requests_open_uidx" ON "artifact_approval_requests" USING btree ("artifact_id") WHERE "artifact_approval_requests"."state" = 'OPEN';--> statement-breakpoint
CREATE INDEX "artifact_approval_requests_inbox_idx" ON "artifact_approval_requests" USING btree ("workspace_id","state","opened_at","id");--> statement-breakpoint
CREATE INDEX "artifact_attachments_target_idx" ON "artifact_attachments" USING btree ("artifact_id","target_type","target_id","state");--> statement-breakpoint
CREATE INDEX "artifact_audiences_artifact_created_idx" ON "artifact_audiences" USING btree ("artifact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_baselines_number_uidx" ON "artifact_baselines" USING btree ("artifact_id","major_number");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_baselines_snapshot_uidx" ON "artifact_baselines" USING btree ("source_snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_baselines_current_uidx" ON "artifact_baselines" USING btree ("artifact_id") WHERE "artifact_baselines"."state" = 'CURRENT';--> statement-breakpoint
CREATE INDEX "artifact_comment_mentions_user_idx" ON "artifact_comment_mentions" USING btree ("user_id","mentioned_at");--> statement-breakpoint
CREATE INDEX "artifact_comments_target_idx" ON "artifact_comments" USING btree ("artifact_id","target_type","target_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_deltas_open_uidx" ON "artifact_deltas" USING btree ("artifact_id") WHERE "artifact_deltas"."state" in ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED');--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_draft_revisions_number_uidx" ON "artifact_draft_revisions" USING btree ("artifact_id","draft_number");--> statement-breakpoint
CREATE INDEX "artifact_draft_revisions_hash_idx" ON "artifact_draft_revisions" USING btree ("artifact_id","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_export_requests_dedupe_uidx" ON "artifact_export_requests" USING btree ("workspace_id","requester_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "artifact_export_requests_worker_idx" ON "artifact_export_requests" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "artifact_export_requests_requester_idx" ON "artifact_export_requests" USING btree ("requester_id","state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_review_snapshots_number_uidx" ON "artifact_review_snapshots" USING btree ("artifact_id","snapshot_number");--> statement-breakpoint
CREATE INDEX "artifacts_project_kind_updated_idx" ON "artifacts" USING btree ("workspace_id","project_id","kind_key","updated_at","id");
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_root_audience_fk"
  FOREIGN KEY ("root_audience_id") REFERENCES "artifact_audiences"("id")
  DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_current_draft_fk"
  FOREIGN KEY ("current_draft_revision_id") REFERENCES "artifact_draft_revisions"("id")
  DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_open_request_fk"
  FOREIGN KEY ("open_approval_request_id") REFERENCES "artifact_approval_requests"("id")
  DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_current_baseline_fk"
  FOREIGN KEY ("current_baseline_id") REFERENCES "artifact_baselines"("id")
  DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "artifact_audiences" ADD CONSTRAINT "artifact_audiences_parent_fk"
  FOREIGN KEY ("parent_audience_id") REFERENCES "artifact_audiences"("id");
--> statement-breakpoint
ALTER TABLE "artifact_baselines" ADD CONSTRAINT "artifact_baselines_predecessor_fk"
  FOREIGN KEY ("predecessor_baseline_id") REFERENCES "artifact_baselines"("id");
--> statement-breakpoint
ALTER TABLE "artifact_comments" ADD CONSTRAINT "artifact_comments_parent_fk"
  FOREIGN KEY ("parent_comment_id") REFERENCES "artifact_comments"("id");
--> statement-breakpoint
CREATE FUNCTION reject_immutable_artifact_record_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'immutable artifact record: %', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER artifact_draft_revisions_immutable
  BEFORE UPDATE OR DELETE ON "artifact_draft_revisions"
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_artifact_record_change();
--> statement-breakpoint
CREATE TRIGGER artifact_review_snapshots_immutable
  BEFORE UPDATE OR DELETE ON "artifact_review_snapshots"
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_artifact_record_change();
--> statement-breakpoint
CREATE TRIGGER artifact_approval_decisions_immutable
  BEFORE UPDATE OR DELETE ON "artifact_approval_decisions"
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_artifact_record_change();
--> statement-breakpoint
CREATE TRIGGER artifact_audiences_immutable
  BEFORE UPDATE OR DELETE ON "artifact_audiences"
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_artifact_record_change();
--> statement-breakpoint
CREATE FUNCTION protect_artifact_baseline() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'immutable artifact baseline'
      USING ERRCODE = '55000';
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
    OR OLD.project_id IS DISTINCT FROM NEW.project_id
    OR OLD.artifact_id IS DISTINCT FROM NEW.artifact_id
    OR OLD.major_number IS DISTINCT FROM NEW.major_number
    OR OLD.source_snapshot_id IS DISTINCT FROM NEW.source_snapshot_id
    OR OLD.content_hash IS DISTINCT FROM NEW.content_hash
    OR OLD.schema_version IS DISTINCT FROM NEW.schema_version
    OR OLD.predecessor_baseline_id IS DISTINCT FROM NEW.predecessor_baseline_id
    OR OLD.audience_id IS DISTINCT FROM NEW.audience_id
    OR OLD.created_by IS DISTINCT FROM NEW.created_by
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
    OR NOT (OLD.state = 'CURRENT' AND NEW.state = 'SUPERSEDED')
  THEN
    RAISE EXCEPTION 'immutable artifact baseline'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER artifact_baselines_immutable
  BEFORE UPDATE OR DELETE ON "artifact_baselines"
  FOR EACH ROW EXECUTE FUNCTION protect_artifact_baseline();
