CREATE TABLE "ai_budget_months" (
	"workspace_id" uuid NOT NULL,
	"budget_month" date NOT NULL,
	"reserved_microusd" bigint DEFAULT 0 NOT NULL,
	"alert_50_emitted" boolean DEFAULT false NOT NULL,
	"alert_80_emitted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_budget_months_workspace_id_budget_month_pk" PRIMARY KEY("workspace_id","budget_month"),
	CONSTRAINT "ai_budget_months_reserved_check" CHECK ("ai_budget_months"."reserved_microusd" >= 0 and "ai_budget_months"."reserved_microusd" <= 100000000)
);
--> statement-breakpoint
CREATE TABLE "ai_generation_payloads" (
	"generation_id" uuid PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"intake_set_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"provider" varchar(16) NOT NULL,
	"model_id" varchar(120) NOT NULL,
	"prompt_version" varchar(120) NOT NULL,
	"schema_version" varchar(16) NOT NULL,
	"workflow_config_hash" varchar(64) NOT NULL,
	"input_hash" varchar(64) NOT NULL,
	"output_hash" varchar(64) NOT NULL,
	"audience" "artifact_audience" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_generations_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "ai_generations_hash_check" CHECK ("ai_generations"."workflow_config_hash" ~ '^[a-f0-9]{64}$'
        and "ai_generations"."input_hash" ~ '^[a-f0-9]{64}$'
        and "ai_generations"."output_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "ai_run_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"intake_set_id" uuid NOT NULL,
	"provider" varchar(16) NOT NULL,
	"model_id" varchar(120) NOT NULL,
	"workflow_config_hash" varchar(64) NOT NULL,
	"reserved_microusd" bigint NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"state" varchar(16) DEFAULT 'RESERVED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "ai_run_reservations_workspace_project_id_unique" UNIQUE("workspace_id","project_id","id"),
	CONSTRAINT "ai_run_reservations_provider_check" CHECK ("ai_run_reservations"."provider" in ('openai', 'anthropic')),
	CONSTRAINT "ai_run_reservations_hash_check" CHECK ("ai_run_reservations"."workflow_config_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "ai_run_reservations_amount_check" CHECK ("ai_run_reservations"."reserved_microusd" > 0 and "ai_run_reservations"."reserved_microusd" <= 1000000),
	CONSTRAINT "ai_run_reservations_tokens_check" CHECK (("ai_run_reservations"."input_tokens" is null or "ai_run_reservations"."input_tokens" >= 0)
        and ("ai_run_reservations"."output_tokens" is null or "ai_run_reservations"."output_tokens" >= 0)),
	CONSTRAINT "ai_run_reservations_state_check" CHECK ("ai_run_reservations"."state" in ('RESERVED', 'SUCCEEDED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "ai_workflow_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"provider" varchar(16) DEFAULT 'openai' NOT NULL,
	"workflow_config_hash" varchar(64) NOT NULL,
	"global_enabled" boolean DEFAULT false NOT NULL,
	"requirement_extraction_enabled" boolean DEFAULT false NOT NULL,
	"provenance_retention_days" integer DEFAULT 30 NOT NULL,
	"aggregate_quality_metrics_enabled" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_workflow_settings_provider_check" CHECK ("ai_workflow_settings"."provider" in ('openai', 'anthropic')),
	CONSTRAINT "ai_workflow_settings_hash_check" CHECK ("ai_workflow_settings"."workflow_config_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "ai_workflow_settings_retention_check" CHECK ("ai_workflow_settings"."provenance_retention_days" between 0 and 30),
	CONSTRAINT "ai_workflow_settings_revision_check" CHECK ("ai_workflow_settings"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "ai_budget_months" ADD CONSTRAINT "ai_budget_months_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_payloads" ADD CONSTRAINT "ai_generation_payloads_generation_id_ai_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_reservation_fk" FOREIGN KEY ("workspace_id","project_id","reservation_id") REFERENCES "public"."ai_run_reservations"("workspace_id","project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_reservations" ADD CONSTRAINT "ai_run_reservations_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_run_reservations" ADD CONSTRAINT "ai_run_reservations_intake_fk" FOREIGN KEY ("workspace_id","project_id","intake_set_id") REFERENCES "public"."intake_sets"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workflow_settings" ADD CONSTRAINT "ai_workflow_settings_updated_by_auth_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_workflow_settings" ADD CONSTRAINT "ai_workflow_settings_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_generation_payloads_expiry_idx" ON "ai_generation_payloads" USING btree ("expires_at","generation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_generations_reservation_uidx" ON "ai_generations" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "ai_generations_artifact_time_idx" ON "ai_generations" USING btree ("workspace_id","project_id","artifact_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_run_reservations_workspace_time_idx" ON "ai_run_reservations" USING btree ("workspace_id","created_at","id");