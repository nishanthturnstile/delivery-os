CREATE TYPE "public"."idempotency_status" AS ENUM('PROCESSING', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'DISPATCHED', 'FAILED');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"actor_id" uuid NOT NULL,
	"agent_client_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"correlation_id" uuid NOT NULL,
	"reason" text,
	"before_summary" jsonb,
	"after_summary" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"workspace_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"status" "idempotency_status" NOT NULL,
	"result" jsonb,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "idempotency_records_workspace_id_idempotency_key_pk" PRIMARY KEY("workspace_id","idempotency_key"),
	CONSTRAINT "idempotency_completion_check" CHECK (("idempotency_records"."status" = 'PROCESSING' and "idempotency_records"."result" is null and "idempotency_records"."completed_at" is null)
        or ("idempotency_records"."status" = 'COMPLETED' and "idempotency_records"."result" is not null and "idempotency_records"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"aggregate_revision" integer NOT NULL,
	"event_type" text NOT NULL,
	"schema_version" text NOT NULL,
	"payload" jsonb NOT NULL,
	"correlation_id" uuid NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"last_error_code" text,
	CONSTRAINT "outbox_attempts_check" CHECK ("outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "platform_probes" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"value" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_probes_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "platform_probes_revision_check" CHECK ("platform_probes"."revision" > 0),
	CONSTRAINT "platform_probes_value_check" CHECK ("platform_probes"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"consumer" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_events_workspace_occurred_idx" ON "audit_events" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_target_idx" ON "audit_events" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idempotency_created_idx" ON "idempotency_records" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_aggregate_revision_uidx" ON "outbox_events" USING btree ("workspace_id","aggregate_type","aggregate_id","aggregate_revision");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "platform_probes_workspace_idx" ON "platform_probes" USING btree ("workspace_id");--> statement-breakpoint
CREATE FUNCTION "prevent_audit_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only_update"
BEFORE UPDATE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_audit_event_mutation"();--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only_delete"
BEFORE DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_audit_event_mutation"();
