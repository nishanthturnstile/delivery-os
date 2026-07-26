ALTER TABLE "requirement_intake_sets" ADD CONSTRAINT "requirement_intake_sets_scope_unique" UNIQUE("workspace_id","project_id","artifact_id","intake_set_id");--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_artifact_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id") REFERENCES "public"."artifacts"("workspace_id","project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_intake_scope_fk" FOREIGN KEY ("workspace_id","project_id","artifact_id","intake_set_id") REFERENCES "public"."requirement_intake_sets"("workspace_id","project_id","artifact_id","intake_set_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_provider_check" CHECK ("ai_generations"."provider" in ('openai', 'anthropic'));--> statement-breakpoint
CREATE TRIGGER ai_generations_immutable
  BEFORE UPDATE ON "ai_generations"
  FOR EACH ROW EXECUTE FUNCTION m3_reject_immutable_update();--> statement-breakpoint
CREATE TRIGGER ai_generation_payloads_no_update
  BEFORE UPDATE ON "ai_generation_payloads"
  FOR EACH ROW EXECUTE FUNCTION m3_reject_immutable_update();--> statement-breakpoint
CREATE OR REPLACE FUNCTION m3_guard_ai_run_reservation_update()
RETURNS trigger AS $$
BEGIN
  IF (NEW.id, NEW.workspace_id, NEW.project_id, NEW.artifact_id, NEW.intake_set_id,
      NEW.provider, NEW.model_id, NEW.workflow_config_hash, NEW.reserved_microusd, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.workspace_id, OLD.project_id, OLD.artifact_id, OLD.intake_set_id,
      OLD.provider, OLD.model_id, OLD.workflow_config_hash, OLD.reserved_microusd, OLD.created_at)
     OR OLD.state <> 'RESERVED'
     OR NEW.state NOT IN ('SUCCEEDED', 'FAILED') THEN
    RAISE EXCEPTION 'AI run reservation provenance is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER ai_run_reservations_guarded_update
  BEFORE UPDATE ON "ai_run_reservations"
  FOR EACH ROW EXECUTE FUNCTION m3_guard_ai_run_reservation_update();
