ALTER TABLE "campaign_records" ADD CONSTRAINT "campaign_record_status_check" CHECK ("campaign_records"."status" in ('queued','processing','successful','failed','retrying','cancelled','human_action_required','needs_attention','unverified','skipped','pending_review','review'));--> statement-breakpoint
ALTER TABLE "campaign_records" ADD CONSTRAINT "campaign_record_success_evidence_check" CHECK ("campaign_records"."status" <> 'successful' or (
      jsonb_typeof("campaign_records"."submission_evidence") = 'object'
      and "campaign_records"."submission_evidence" ? 'provider'
      and "campaign_records"."submission_evidence" ? 'submittedAt'
      and "campaign_records"."submission_evidence" ? 'finalUrl'
      and "campaign_records"."submission_evidence" ? 'confirmationType'
      and "campaign_records"."submission_evidence" ? 'workerRunId'
      and "campaign_records"."submission_evidence" ? 'attemptId'
    ));