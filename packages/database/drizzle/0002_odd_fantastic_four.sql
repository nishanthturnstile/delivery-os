CREATE TYPE "public"."calendar_exception_kind" AS ENUM('WORKING', 'NON_WORKING');--> statement-breakpoint
CREATE TYPE "public"."client_state" AS ENUM('ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."outcome_module_audience" AS ENUM('TEAM_ONLY', 'CLIENT_VISIBLE');--> statement-breakpoint
CREATE TYPE "public"."project_invitation_state" AS ENUM('PENDING', 'DELIVERY_FAILED', 'ACCEPTED', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."project_lifecycle_state" AS ENUM('DRAFT', 'INTAKE', 'PLANNING', 'EXECUTION', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."project_membership_state" AS ENUM('PENDING', 'ACTIVE', 'DEACTIVATED');--> statement-breakpoint
CREATE TYPE "public"."project_role" AS ENUM('PM', 'LEAD', 'CONTRIBUTOR', 'VIEWER', 'CLIENT_STAKEHOLDER');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('INTERNAL', 'EXTERNAL');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"primary_contact_name" text NOT NULL,
	"primary_contact_email" text NOT NULL,
	"industry" text,
	"notes" text,
	"state" "client_state" DEFAULT 'ACTIVE' NOT NULL,
	"archived_by" text,
	"archived_at" timestamp with time zone,
	"archive_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "clients_revision_check" CHECK ("clients"."revision" > 0),
	CONSTRAINT "clients_name_check" CHECK (length(trim("clients"."name")) between 2 and 160),
	CONSTRAINT "clients_contact_email_check" CHECK ("clients"."primary_contact_email" = lower(trim("clients"."primary_contact_email"))),
	CONSTRAINT "clients_archive_metadata_check" CHECK (("clients"."state" = 'ACTIVE' and "clients"."archived_at" is null and "clients"."archived_by" is null)
        or ("clients"."state" = 'ARCHIVED' and "clients"."archived_at" is not null and "clients"."archived_by" is not null and length(trim("clients"."archive_reason")) >= 8))
);
--> statement-breakpoint
CREATE TABLE "member_availability" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date NOT NULL,
	"allocation_percent" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_availability_revision_check" CHECK ("member_availability"."revision" > 0),
	CONSTRAINT "member_availability_allocation_check" CHECK ("member_availability"."allocation_percent" between 0 and 100),
	CONSTRAINT "member_availability_range_check" CHECK ("member_availability"."effective_from" <= "member_availability"."effective_to")
);
--> statement-breakpoint
CREATE TABLE "project_calendar_exceptions" (
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" "calendar_exception_kind" NOT NULL,
	"working_minutes" integer,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_calendar_exceptions_project_id_date_pk" PRIMARY KEY("project_id","date"),
	CONSTRAINT "project_calendar_exceptions_minutes_check" CHECK ("project_calendar_exceptions"."working_minutes" is null or "project_calendar_exceptions"."working_minutes" between 1 and 1440)
);
--> statement-breakpoint
CREATE TABLE "project_health" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lifecycle_state" "project_lifecycle_state" NOT NULL,
	"current_sprint_label" text,
	"blocker_count" integer,
	"next_milestone_name" text,
	"next_milestone_date" date,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_health_blocker_count_check" CHECK ("project_health"."blocker_count" is null or "project_health"."blocker_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "project_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"email" text NOT NULL,
	"state" "project_invitation_state" DEFAULT 'PENDING' NOT NULL,
	"token_digest" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"workspace_invitation_id" uuid,
	"invited_by" text NOT NULL,
	"accepted_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"replaced_by_id" uuid,
	"delivery_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_invitations_revision_check" CHECK ("project_invitations"."revision" > 0),
	CONSTRAINT "project_invitations_email_check" CHECK ("project_invitations"."email" = lower(trim("project_invitations"."email")))
);
--> statement-breakpoint
CREATE TABLE "project_lifecycle_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"from_state" "project_lifecycle_state" NOT NULL,
	"to_state" "project_lifecycle_state" NOT NULL,
	"actor_id" text NOT NULL,
	"reason" text,
	"hold_owner_id" text,
	"hold_review_date" date,
	"correlation_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_membership_roles" (
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "project_role" NOT NULL,
	"assigned_by" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_membership_roles_project_id_user_id_role_pk" PRIMARY KEY("project_id","user_id","role")
);
--> statement-breakpoint
CREATE TABLE "project_memberships" (
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"client_id" uuid,
	"state" "project_membership_state" DEFAULT 'ACTIVE' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"activated_by" text,
	"activated_at" timestamp with time zone,
	"deactivated_by" text,
	"deactivated_at" timestamp with time zone,
	"deactivation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_memberships_project_id_user_id_pk" PRIMARY KEY("project_id","user_id"),
	CONSTRAINT "project_memberships_workspace_project_user_unique" UNIQUE("workspace_id","project_id","user_id"),
	CONSTRAINT "project_memberships_revision_check" CHECK ("project_memberships"."revision" > 0),
	CONSTRAINT "project_memberships_state_metadata_check" CHECK (("project_memberships"."state" = 'PENDING' and "project_memberships"."activated_at" is null and "project_memberships"."deactivated_at" is null)
        or ("project_memberships"."state" = 'ACTIVE' and "project_memberships"."activated_at" is not null and "project_memberships"."deactivated_at" is null)
        or ("project_memberships"."state" = 'DEACTIVATED' and "project_memberships"."deactivated_at" is not null and length(trim("project_memberships"."deactivation_reason")) >= 8))
);
--> statement-breakpoint
CREATE TABLE "project_outcome_modules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"target_start" date NOT NULL,
	"target_end" date NOT NULL,
	"status" text DEFAULT 'OUTLINED' NOT NULL,
	"audience" "outcome_module_audience" NOT NULL,
	"schema_version" text DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_outcome_modules_status_check" CHECK ("project_outcome_modules"."status" = 'OUTLINED'),
	CONSTRAINT "project_outcome_modules_schema_version_check" CHECK ("project_outcome_modules"."schema_version" = '1'),
	CONSTRAINT "project_outcome_modules_target_range_check" CHECK ("project_outcome_modules"."target_start" <= "project_outcome_modules"."target_end")
);
--> statement-breakpoint
CREATE TABLE "project_readiness_facts" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"requirements_baseline_approved" boolean DEFAULT false NOT NULL,
	"technical_baseline_approved_or_waived" boolean DEFAULT false NOT NULL,
	"ux_baseline_approved_or_waived" boolean DEFAULT false NOT NULL,
	"module_map_approved" boolean DEFAULT false NOT NULL,
	"ready_work_item_count" integer DEFAULT 0 NOT NULL,
	"active_sprint_count" integer DEFAULT 0 NOT NULL,
	"active_work_count" integer DEFAULT 0 NOT NULL,
	"last_event_id" uuid,
	"last_event_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_readiness_facts_version_check" CHECK ("project_readiness_facts"."version" > 0),
	CONSTRAINT "project_readiness_facts_counts_check" CHECK ("project_readiness_facts"."ready_work_item_count" >= 0 and "project_readiness_facts"."active_sprint_count" >= 0 and "project_readiness_facts"."active_work_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "project_working_calendars" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"time_zone" text NOT NULL,
	"working_weekdays" jsonb NOT NULL,
	"daily_start" time NOT NULL,
	"daily_end" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_working_calendars_revision_check" CHECK ("project_working_calendars"."revision" > 0),
	CONSTRAINT "project_working_calendars_time_check" CHECK ("project_working_calendars"."daily_start" < "project_working_calendars"."daily_end")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"revision" integer DEFAULT 1 NOT NULL,
	"capacity_revision" integer DEFAULT 1 NOT NULL,
	"type" "project_type" NOT NULL,
	"lifecycle_state" "project_lifecycle_state" DEFAULT 'DRAFT' NOT NULL,
	"pre_hold_state" "project_lifecycle_state",
	"pre_archive_state" "project_lifecycle_state",
	"name" text NOT NULL,
	"short_description" text NOT NULL,
	"target_start" date NOT NULL,
	"target_end" date NOT NULL,
	"completion_summary" text,
	"hold_reason" text,
	"hold_owner_id" text,
	"hold_review_date" date,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "projects_revision_check" CHECK ("projects"."revision" > 0),
	CONSTRAINT "projects_capacity_revision_check" CHECK ("projects"."capacity_revision" > 0),
	CONSTRAINT "projects_name_check" CHECK (length(trim("projects"."name")) between 2 and 160),
	CONSTRAINT "projects_target_range_check" CHECK ("projects"."target_start" <= "projects"."target_end"),
	CONSTRAINT "projects_type_client_check" CHECK (("projects"."type" = 'INTERNAL' and "projects"."client_id" is null)
        or ("projects"."type" = 'EXTERNAL' and "projects"."client_id" is not null)),
	CONSTRAINT "projects_hold_metadata_check" CHECK (("projects"."lifecycle_state" <> 'ON_HOLD')
        or ("projects"."pre_hold_state" is not null and "projects"."hold_reason" is not null and "projects"."hold_owner_id" is not null and "projects"."hold_review_date" is not null)),
	CONSTRAINT "projects_archive_metadata_check" CHECK (("projects"."lifecycle_state" <> 'ARCHIVED')
        or ("projects"."pre_archive_state" in ('COMPLETED', 'CANCELLED')))
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_archived_by_auth_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_availability" ADD CONSTRAINT "member_availability_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_availability" ADD CONSTRAINT "member_availability_membership_fk" FOREIGN KEY ("workspace_id","project_id","user_id") REFERENCES "public"."project_memberships"("workspace_id","project_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_calendar_exceptions" ADD CONSTRAINT "project_calendar_exceptions_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_calendar_exceptions" ADD CONSTRAINT "project_calendar_exceptions_workspace_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_health" ADD CONSTRAINT "project_health_workspace_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_workspace_invitation_id_workspace_invitations_id_fk" FOREIGN KEY ("workspace_invitation_id") REFERENCES "public"."workspace_invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_invited_by_auth_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_accepted_by_auth_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_workspace_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_workspace_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_lifecycle_history" ADD CONSTRAINT "project_lifecycle_history_actor_id_auth_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_lifecycle_history" ADD CONSTRAINT "project_lifecycle_history_hold_owner_id_auth_users_id_fk" FOREIGN KEY ("hold_owner_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_lifecycle_history" ADD CONSTRAINT "project_lifecycle_history_workspace_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_membership_roles" ADD CONSTRAINT "project_membership_roles_assigned_by_auth_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_membership_roles" ADD CONSTRAINT "project_membership_roles_membership_fk" FOREIGN KEY ("workspace_id","project_id","user_id") REFERENCES "public"."project_memberships"("workspace_id","project_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_activated_by_auth_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_deactivated_by_auth_users_id_fk" FOREIGN KEY ("deactivated_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_workspace_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_workspace_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_outcome_modules" ADD CONSTRAINT "project_outcome_modules_workspace_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_readiness_facts" ADD CONSTRAINT "project_readiness_facts_workspace_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_working_calendars" ADD CONSTRAINT "project_working_calendars_workspace_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_hold_owner_id_auth_users_id_fk" FOREIGN KEY ("hold_owner_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_workspace_state_idx" ON "clients" USING btree ("workspace_id","state");--> statement-breakpoint
CREATE INDEX "clients_workspace_name_idx" ON "clients" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "member_availability_project_user_range_idx" ON "member_availability" USING btree ("project_id","user_id","effective_from","effective_to");--> statement-breakpoint
CREATE UNIQUE INDEX "project_invitations_token_digest_uidx" ON "project_invitations" USING btree ("token_digest");--> statement-breakpoint
CREATE INDEX "project_invitations_project_email_idx" ON "project_invitations" USING btree ("project_id","email");--> statement-breakpoint
CREATE INDEX "project_invitations_pending_expiry_idx" ON "project_invitations" USING btree ("state","expires_at");--> statement-breakpoint
CREATE INDEX "project_lifecycle_history_project_occurred_idx" ON "project_lifecycle_history" USING btree ("project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "project_membership_roles_workspace_role_idx" ON "project_membership_roles" USING btree ("workspace_id","role","project_id");--> statement-breakpoint
CREATE INDEX "project_memberships_workspace_user_state_idx" ON "project_memberships" USING btree ("workspace_id","user_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "project_outcome_modules_project_uidx" ON "project_outcome_modules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "projects_workspace_status_updated_idx" ON "projects" USING btree ("workspace_id","lifecycle_state","updated_at","id");--> statement-breakpoint
CREATE INDEX "projects_workspace_client_idx" ON "projects" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "projects_workspace_dates_idx" ON "projects" USING btree ("workspace_id","target_start","target_end");