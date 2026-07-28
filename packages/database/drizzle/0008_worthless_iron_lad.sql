CREATE TABLE "requirement_intake_sets" (
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"intake_set_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requirement_intake_sets_artifact_id_intake_set_id_pk" PRIMARY KEY("artifact_id","intake_set_id")
);
--> statement-breakpoint
ALTER TABLE "requirement_intake_sets" ADD CONSTRAINT "requirement_intake_sets_created_by_auth_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_intake_sets" ADD CONSTRAINT "requirement_intake_sets_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_intake_sets" ADD CONSTRAINT "requirement_intake_sets_intake_fk" FOREIGN KEY ("workspace_id","project_id","intake_set_id") REFERENCES "public"."intake_sets"("workspace_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "requirement_intake_sets_intake_uidx" ON "requirement_intake_sets" USING btree ("intake_set_id");--> statement-breakpoint
CREATE INDEX "requirement_intake_sets_artifact_idx" ON "requirement_intake_sets" USING btree ("workspace_id","project_id","artifact_id","created_at");--> statement-breakpoint
CREATE TRIGGER requirement_intake_sets_immutable
  BEFORE UPDATE ON "requirement_intake_sets"
  FOR EACH ROW EXECUTE FUNCTION m3_reject_immutable_update();
