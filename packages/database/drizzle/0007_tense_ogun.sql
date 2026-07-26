CREATE TABLE "ocr_page_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"source_generation_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"input_hash" varchar(64) NOT NULL,
	"renderer_version" varchar(120) NOT NULL,
	"model_version" varchar(160) NOT NULL,
	"model_digest" varchar(64) NOT NULL,
	"config_version" varchar(160) NOT NULL,
	"output_hash" varchar(64) NOT NULL,
	"minimum_confidence" varchar(32) NOT NULL,
	"needs_attention" boolean NOT NULL,
	"result_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ocr_page_results_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "ocr_page_results_page_check" CHECK ("ocr_page_results"."page_number" > 0),
	CONSTRAINT "ocr_page_results_hash_check" CHECK ("ocr_page_results"."input_hash" ~ '^[a-f0-9]{64}$' and "ocr_page_results"."model_digest" ~ '^[a-f0-9]{64}$' and "ocr_page_results"."output_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "project_requirement_template_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"template_version_id" uuid NOT NULL,
	"template_hash" varchar(64) NOT NULL,
	"definitions_json" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_requirement_template_snapshots_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "project_requirement_template_snapshots_hash_check" CHECK ("project_requirement_template_snapshots"."template_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "requirement_citations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"source_generation_id" uuid NOT NULL,
	"locator_id" uuid NOT NULL,
	"block_ids" uuid[] NOT NULL,
	"locator_excerpt_hash" varchar(64) NOT NULL,
	"audience" "artifact_audience" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_citations_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "requirement_citations_hash_check" CHECK ("requirement_citations"."locator_excerpt_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "requirement_claim_dispositions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"disposition" varchar(16) NOT NULL,
	"edited_value_json" jsonb,
	"note" text,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_claim_dispositions_kind_check" CHECK ("requirement_claim_dispositions"."disposition" in ('ACCEPTED', 'EDITED', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "requirement_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"intake_set_id" uuid NOT NULL,
	"field_key" varchar(80) NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"value_json" jsonb NOT NULL,
	"citation_ids" uuid[] NOT NULL,
	"audience" "artifact_audience" NOT NULL,
	"workflow_kind" varchar(16) NOT NULL,
	"workflow_version" varchar(160) NOT NULL,
	"workflow_config_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_claims_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "requirement_claims_workflow_check" CHECK ("requirement_claims"."workflow_kind" in ('MANUAL', 'FAKE_AI', 'LIVE_AI')),
	CONSTRAINT "requirement_claims_hash_check" CHECK ("requirement_claims"."fingerprint" ~ '^[a-f0-9]{64}$' and "requirement_claims"."workflow_config_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "requirement_conflict_resolutions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"conflict_id" uuid NOT NULL,
	"selected_claim_id" uuid,
	"authored_value_json" jsonb,
	"note" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_conflict_resolutions_choice_check" CHECK (("requirement_conflict_resolutions"."selected_claim_id" is null) <> ("requirement_conflict_resolutions"."authored_value_json" is null)),
	CONSTRAINT "requirement_conflict_resolutions_note_check" CHECK (length(trim("requirement_conflict_resolutions"."note")) >= 2)
);
--> statement-breakpoint
CREATE TABLE "requirement_conflicts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"field_key" varchar(80) NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"claim_ids" uuid[] NOT NULL,
	"severity" varchar(16) NOT NULL,
	"state" varchar(16) DEFAULT 'OPEN' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_conflicts_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "requirement_conflicts_state_check" CHECK ("requirement_conflicts"."state" in ('OPEN', 'RESOLVED')),
	CONSTRAINT "requirement_conflicts_severity_check" CHECK ("requirement_conflicts"."severity" in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);
--> statement-breakpoint
CREATE TABLE "requirement_field_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"field_key" varchar(80) NOT NULL,
	"revision" integer NOT NULL,
	"state" varchar(24) NOT NULL,
	"value_json" jsonb,
	"audience" "artifact_audience" NOT NULL,
	"human_note" text,
	"risk_owner_id" text,
	"risk_review_date" date,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_field_revisions_revision_check" CHECK ("requirement_field_revisions"."revision" > 0),
	CONSTRAINT "requirement_field_revisions_state_check" CHECK ("requirement_field_revisions"."state" in ('UNRESOLVED', 'RESOLVED', 'NOT_APPLICABLE', 'ACCEPTED_RISK'))
);
--> statement-breakpoint
CREATE TABLE "requirement_gap_dispositions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"gap_id" uuid NOT NULL,
	"disposition" varchar(24) NOT NULL,
	"field_revision_id" uuid,
	"justification" text,
	"risk_owner_id" text,
	"risk_consequence" text,
	"risk_review_date" date,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_gap_dispositions_kind_check" CHECK ("requirement_gap_dispositions"."disposition" in ('RESOLVED', 'NOT_APPLICABLE', 'ACCEPTED_RISK'))
);
--> statement-breakpoint
CREATE TABLE "requirement_gaps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"field_key" varchar(80) NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"reason" varchar(32) NOT NULL,
	"blocking" boolean NOT NULL,
	"state" varchar(16) DEFAULT 'OPEN' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_gaps_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "requirement_gaps_reason_check" CHECK ("requirement_gaps"."reason" in ('MISSING', 'WEAK_SUPPORT', 'CONFLICT', 'CONDITIONALLY_REQUIRED')),
	CONSTRAINT "requirement_gaps_state_check" CHECK ("requirement_gaps"."state" in ('OPEN', 'RESOLVED'))
);
--> statement-breakpoint
CREATE TABLE "requirement_readiness_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"review_snapshot_id" uuid NOT NULL,
	"template_snapshot_id" uuid NOT NULL,
	"template_hash" varchar(64) NOT NULL,
	"body_hash" varchar(64) NOT NULL,
	"readiness_hash" varchar(64) NOT NULL,
	"evidence_json" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_readiness_snapshots_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "requirement_readiness_snapshots_hash_check" CHECK ("requirement_readiness_snapshots"."template_hash" ~ '^[a-f0-9]{64}$' and "requirement_readiness_snapshots"."body_hash" ~ '^[a-f0-9]{64}$' and "requirement_readiness_snapshots"."readiness_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "requirement_template_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"base_version" varchar(32) NOT NULL,
	"state" varchar(16) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"template_hash" varchar(64) NOT NULL,
	"definitions_json" jsonb NOT NULL,
	"published_by" text,
	"published_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_template_versions_version_check" CHECK ("requirement_template_versions"."version" > 0),
	CONSTRAINT "requirement_template_versions_revision_check" CHECK ("requirement_template_versions"."revision" > 0),
	CONSTRAINT "requirement_template_versions_state_check" CHECK ("requirement_template_versions"."state" in ('DRAFT', 'PUBLISHED')),
	CONSTRAINT "requirement_template_versions_publish_check" CHECK (("requirement_template_versions"."state" = 'DRAFT' and "requirement_template_versions"."published_at" is null and "requirement_template_versions"."published_by" is null)
        or ("requirement_template_versions"."state" = 'PUBLISHED' and "requirement_template_versions"."published_at" is not null and "requirement_template_versions"."published_by" is not null)),
	CONSTRAINT "requirement_template_versions_hash_check" CHECK ("requirement_template_versions"."template_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "ocr_page_results" ADD CONSTRAINT "ocr_page_results_generation_fk" FOREIGN KEY ("workspace_id","project_id","source_generation_id") REFERENCES "public"."source_generations"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_requirement_template_snapshots" ADD CONSTRAINT "project_requirement_template_snapshots_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_requirement_template_snapshots" ADD CONSTRAINT "project_requirement_template_snapshots_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_requirement_template_snapshots" ADD CONSTRAINT "project_requirement_template_snapshots_template_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."requirement_template_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_citations" ADD CONSTRAINT "requirement_citations_generation_fk" FOREIGN KEY ("workspace_id","project_id","source_generation_id") REFERENCES "public"."source_generations"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_citations" ADD CONSTRAINT "requirement_citations_locator_fk" FOREIGN KEY ("workspace_id","project_id","locator_id") REFERENCES "public"."source_locators"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_claim_dispositions" ADD CONSTRAINT "requirement_claim_dispositions_actor_id_auth_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_claim_dispositions" ADD CONSTRAINT "requirement_claim_dispositions_claim_fk" FOREIGN KEY ("workspace_id","project_id","claim_id") REFERENCES "public"."requirement_claims"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_claims" ADD CONSTRAINT "requirement_claims_intake_fk" FOREIGN KEY ("workspace_id","project_id","intake_set_id") REFERENCES "public"."intake_sets"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_conflict_resolutions" ADD CONSTRAINT "requirement_conflict_resolutions_actor_id_auth_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_conflict_resolutions" ADD CONSTRAINT "requirement_conflict_resolutions_conflict_fk" FOREIGN KEY ("workspace_id","project_id","conflict_id") REFERENCES "public"."requirement_conflicts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_conflicts" ADD CONSTRAINT "requirement_conflicts_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_field_revisions" ADD CONSTRAINT "requirement_field_revisions_risk_owner_id_auth_users_id_fk" FOREIGN KEY ("risk_owner_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_field_revisions" ADD CONSTRAINT "requirement_field_revisions_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_field_revisions" ADD CONSTRAINT "requirement_field_revisions_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_gap_dispositions" ADD CONSTRAINT "requirement_gap_dispositions_risk_owner_id_auth_users_id_fk" FOREIGN KEY ("risk_owner_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_gap_dispositions" ADD CONSTRAINT "requirement_gap_dispositions_actor_id_auth_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_gap_dispositions" ADD CONSTRAINT "requirement_gap_dispositions_gap_fk" FOREIGN KEY ("workspace_id","project_id","gap_id") REFERENCES "public"."requirement_gaps"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_gaps" ADD CONSTRAINT "requirement_gaps_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_readiness_snapshots" ADD CONSTRAINT "requirement_readiness_snapshots_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_readiness_snapshots" ADD CONSTRAINT "requirement_readiness_snapshots_review_fk" FOREIGN KEY ("review_snapshot_id") REFERENCES "public"."artifact_review_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_readiness_snapshots" ADD CONSTRAINT "requirement_readiness_snapshots_template_fk" FOREIGN KEY ("workspace_id","project_id","template_snapshot_id") REFERENCES "public"."project_requirement_template_snapshots"("workspace_id","project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_template_versions" ADD CONSTRAINT "requirement_template_versions_published_by_auth_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_template_versions" ADD CONSTRAINT "requirement_template_versions_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_template_versions" ADD CONSTRAINT "requirement_template_versions_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ocr_page_results_dedupe_uidx" ON "ocr_page_results" USING btree ("source_generation_id","page_number","input_hash","renderer_version","model_digest","config_version");--> statement-breakpoint
CREATE UNIQUE INDEX "project_requirement_template_snapshots_version_uidx" ON "project_requirement_template_snapshots" USING btree ("project_id","template_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_claim_dispositions_claim_uidx" ON "requirement_claim_dispositions" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_claims_fingerprint_uidx" ON "requirement_claims" USING btree ("intake_set_id","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_conflict_resolutions_conflict_uidx" ON "requirement_conflict_resolutions" USING btree ("conflict_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_conflicts_fingerprint_uidx" ON "requirement_conflicts" USING btree ("artifact_id","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_field_revisions_number_uidx" ON "requirement_field_revisions" USING btree ("artifact_id","field_key","revision");--> statement-breakpoint
CREATE INDEX "requirement_field_revisions_current_idx" ON "requirement_field_revisions" USING btree ("workspace_id","project_id","artifact_id","field_key","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_gap_dispositions_gap_uidx" ON "requirement_gap_dispositions" USING btree ("gap_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_gaps_fingerprint_uidx" ON "requirement_gaps" USING btree ("artifact_id","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_readiness_snapshots_review_uidx" ON "requirement_readiness_snapshots" USING btree ("review_snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_template_versions_number_uidx" ON "requirement_template_versions" USING btree ("workspace_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_template_versions_hash_uidx" ON "requirement_template_versions" USING btree ("workspace_id","template_hash");--> statement-breakpoint
CREATE INDEX "requirement_template_versions_published_idx" ON "requirement_template_versions" USING btree ("workspace_id","published_at","id") WHERE "requirement_template_versions"."state" = 'PUBLISHED';
--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_one_requirement_per_project_uidx"
  ON "artifacts" ("workspace_id", "project_id")
  WHERE "kind_key" = 'REQUIREMENT';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION m3_reject_immutable_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'M3 immutable evidence rows cannot be updated';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ocr_page_results_immutable
  BEFORE UPDATE ON "ocr_page_results"
  FOR EACH ROW EXECUTE FUNCTION m3_reject_immutable_update();
--> statement-breakpoint
CREATE TRIGGER project_requirement_template_snapshots_immutable
  BEFORE UPDATE OR DELETE ON "project_requirement_template_snapshots"
  FOR EACH ROW EXECUTE FUNCTION m3_reject_immutable_update();
--> statement-breakpoint
CREATE TRIGGER requirement_citations_immutable
  BEFORE UPDATE ON "requirement_citations"
  FOR EACH ROW EXECUTE FUNCTION m3_reject_immutable_update();
--> statement-breakpoint
CREATE TRIGGER requirement_claims_immutable
  BEFORE UPDATE ON "requirement_claims"
  FOR EACH ROW EXECUTE FUNCTION m3_reject_immutable_update();
--> statement-breakpoint
CREATE TRIGGER requirement_claim_dispositions_immutable
  BEFORE UPDATE ON "requirement_claim_dispositions"
  FOR EACH ROW EXECUTE FUNCTION m3_reject_immutable_update();
--> statement-breakpoint
CREATE TRIGGER requirement_conflict_resolutions_immutable
  BEFORE UPDATE ON "requirement_conflict_resolutions"
  FOR EACH ROW EXECUTE FUNCTION m3_reject_immutable_update();
--> statement-breakpoint
CREATE TRIGGER requirement_gap_dispositions_immutable
  BEFORE UPDATE ON "requirement_gap_dispositions"
  FOR EACH ROW EXECUTE FUNCTION m3_reject_immutable_update();
--> statement-breakpoint
CREATE TRIGGER requirement_readiness_snapshots_immutable
  BEFORE UPDATE OR DELETE ON "requirement_readiness_snapshots"
  FOR EACH ROW EXECUTE FUNCTION m3_reject_immutable_update();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION m3_reject_published_template_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'PUBLISHED' THEN
    RAISE EXCEPTION 'Published Requirement templates are immutable';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER requirement_template_versions_published_immutable
  BEFORE UPDATE OR DELETE ON "requirement_template_versions"
  FOR EACH ROW EXECUTE FUNCTION m3_reject_published_template_mutation();
