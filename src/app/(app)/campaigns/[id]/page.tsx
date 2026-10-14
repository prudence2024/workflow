import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getRequestWorkspaceContext } from "@/lib/requestContext";
import { getCampaignDetail } from "@/lib/data";
import {
  analyzeFormAction,
  archiveCampaignAction,
  cancelCampaignAction,
  parkRecordAction,
  pauseCampaignAction,
  retryFailedAction,
  saveFieldMappingAction,
  sendConfirmationEmailsAction,
  unarchiveCampaignAction,
} from "@/app/(app)/campaigns/actions";
import { Card, CardBody, CardHeader, Alert, EmptyState } from "@/components/ui/Surfaces";
import { Button, LinkButton } from "@/components/ui/Button";
import { FieldGroup, HelpText, Input, Label, Select } from "@/components/ui/Field";
import { StatusPill } from "@/components/ui/Status";
import { DistributionBar, Stat, TD, TH, THead, TR, Table } from "@/components/ui/Data";
import { formatDateTime } from "@/lib/utils";
import { analysisStatusMessage } from "@/lib/formAnalysisJobs";
import type { FormField } from "@/db/schema";
import { CampaignStatusRefresh } from "@/components/runtime/CampaignStatusRefresh";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { MappingEditor } from "@/components/campaigns/MappingEditor";
import { RunCampaignButton } from "@/components/campaigns/RunCampaignButton";
import { campaignPresentation } from "@/lib/campaignStatus";
import { safeErrorDiagnostic } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

function evidenceTitle(r: { evidence: Record<string, unknown> | null }): string | undefined {
  if (r.evidence == null) return undefined;
  const excerpt = typeof r.evidence.confirmationExcerpt === "string" ? r.evidence.confirmationExcerpt : "";
  const url = typeof r.evidence.finalUrl === "string" ? r.evidence.finalUrl : "";
  return `Destination confirmation: ${excerpt}${url ? ` (${url})` : ""}`.slice(0, 300) || undefined;
}

const STATUS_COLORS: Record<string, string> = {
  successful: "#1a7f4e",
  failed: "#b3261e",
  human_action_required: "#a15c07",
  retrying: "#a15c07",
  queued: "#94a3b8",
  skipped: "#94a3b8",
  cancelled: "#94a3b8",
};

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; analyze?: string; analysis?: string; page?: string; saved?: string; queued?: string }>;
}) {
  console.info("[campaign-route] entry route=/campaigns/[id] paramsPromise=true");
  const { user, currentOrg: org } = await getRequestWorkspaceContext();
  if (!user) {
    console.warn("[campaign-route] redirect destination=login userPresent=false orgPresent=" + String(Boolean(org)));
    redirect("/login");
  }
  if (!org) {
    console.warn("[campaign-route] redirect destination=onboarding userPresent=true orgPresent=false");
    redirect("/onboarding");
  }

  const { id } = await params;
  console.info("[campaign-route] params resolved campaignIdPresent=" + String(Boolean(id)));
  const { error, analyze, analysis, page, saved, queued } = await searchParams;
  const recordPage = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  // Tenant-scoped read: campaign, records, templates and custom fields all in
  // one transaction as the restricted role. A campaign from another workspace
  // simply resolves to null here (RLS), which becomes a 404.
  let detail;
  try {
    detail = await getCampaignDetail({ user, org }, id, { page: recordPage });
  } catch (error) {
    console.error("[campaign-route] campaign lookup failed", safeErrorDiagnostic(error));
    throw error;
  }
  console.info("[campaign-route] campaign lookup campaignIdPresent=" + String(Boolean(id)) + " orgPresent=true campaignFound=" + String(Boolean(detail.campaign)));
  if (!detail.campaign) {
    console.warn("[campaign-route] not found campaignIdPresent=" + String(Boolean(id)) + " orgPresent=true");
    notFound();
  }

  const campaign = detail.campaign;
  const fields = (campaign.formDefinition as FormField[]) ?? [];
  const mapping = campaign.fieldMapping;
  const stats = campaign.stats;
  const presentation = campaignPresentation(campaign.status, stats);

  const contactFieldOptions = [
    { key: "fullName", label: "Full name" },
    { key: "firstName", label: "First name" },
    { key: "lastName", label: "Last name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "company", label: "Company" },
    { key: "address", label: "Address" },
    ...detail.customFields.map((d) => ({ key: `custom__${d.key}`, label: d.label })),
  ];

  const total = stats.total ?? 0;
  const hasFailed = (stats.failed ?? 0) > 0;
  // Queued rows are an editable audience until the explicit Queue run action
  // changes the campaign to running. Only a running campaign or records that
  // have been claimed/retried are execution-active and lock mapping.
  const activeRecordCount = (stats.retrying ?? 0) + (stats.processing ?? 0);
  const activeRun = campaign.status === "running" || activeRecordCount > 0;
  const canReanalyzeForm = !activeRun && ["draft", "ready"].includes(campaign.status);
  const canChangeForm = canReanalyzeForm && total === 0;
  const missingRequiredMapping = fields.some((field) => field.required && !mapping[field.name]);
  const canRun = campaign.status !== "archived" && (stats.queued ?? 0) + (stats.retrying ?? 0) > 0 && !activeRun && !missingRequiredMapping;
  const queueButtonLabel = activeRun
    ? campaign.status === "running" ? "Running…" : "Queued…"
    : campaign.status === "completed" ? "Run again" : "Queue run";
  const hasActiveWork =
    campaign.formAnalysisStatus === "queued" ||
    campaign.formAnalysisStatus === "processing" ||
    (campaign.status === "running" &&
      (stats.queued ?? 0) + (stats.retrying ?? 0) + (stats.processing ?? 0) > 0);

  console.info("[campaign-route] run control render status=" + campaign.status + " canRun=" + String(canRun) + " queued=" + String((stats.queued ?? 0) + (stats.retrying ?? 0)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-[20px] font-semibold text-[var(--color-ink)]">{campaign.name}</h1>
            <StatusPill status={presentation.key} label={presentation.label} />
          </div>
          <p className="mt-0.5 text-[13px] text-[var(--color-muted)] capitalize">{campaign.type.replace(/_/g, " ")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/campaigns/${id}/add-contacts`} variant="outline" size="sm">
            Add contacts
          </LinkButton>
          {hasFailed && (
            <form action={retryFailedAction}>
              <input type="hidden" name="campaignId" value={id} />
              <Button type="submit" variant="outline" size="sm">
                Retry failed
              </Button>
            </form>
          )}
          {campaign.status === "running" && (
            <form action={pauseCampaignAction}>
              <input type="hidden" name="campaignId" value={id} />
              <Button type="submit" variant="outline" size="sm">
                Pause
              </Button>
            </form>
          )}
          {(campaign.status === "running" || campaign.status === "paused") && (
            <form action={cancelCampaignAction}>
              <input type="hidden" name="campaignId" value={id} />
              <Button type="submit" variant="outline" size="sm">
                Cancel
              </Button>
            </form>
          )}
          <RunCampaignButton campaignId={id} disabled={!canRun} label={queueButtonLabel} />
          {campaign.status === "archived" ? (
            <form action={unarchiveCampaignAction}>
              <input type="hidden" name="campaignId" value={id} />
              <ConfirmSubmit message="Restore this campaign to draft? It will remain paused until you queue it." className="inline-flex h-8 items-center justify-center rounded-[var(--radius-sm)] px-3 text-[13px] font-medium text-[var(--color-brand)] hover:bg-[var(--color-brand-soft)]">Restore</ConfirmSubmit>
            </form>
          ) : (
            <form action={archiveCampaignAction}>
              <input type="hidden" name="campaignId" value={id} />
              <ConfirmSubmit message="Archive this campaign? Its history will be preserved and it will not be runnable until restored." className="inline-flex h-8 items-center justify-center rounded-[var(--radius-sm)] px-3 text-[13px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-canvas)]">Archive</ConfirmSubmit>
            </form>
          )}
        </div>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {queued === "1" && <Alert tone="success" title="Run queued">The campaign is running and its queued records are ready for the submission worker.</Alert>}
      <Alert tone={presentation.key === "completed" ? "success" : presentation.key === "failed" || presentation.key === "needs_attention" ? "warning" : presentation.key === "archived" ? "warning" : "info"} title={presentation.label}>
        {presentation.message}
      </Alert>
      {analysis === "queued" && campaign.formAnalysisStatus === "queued" && <Alert tone="info" title="Analysis queued">A Node browser worker will inspect the rendered form shortly.</Alert>}
      {analysis === "schema_changed" && <Alert tone="warning" title="Form fields changed">The destination form schema changed. Review new or unresolved fields before saving the mapping; existing matching selections were preserved.</Alert>}
      {campaign.formAnalysisStatus !== "idle" && campaign.formAnalysisStatus !== "ready" && campaign.formAnalysisStatus !== "queued" && (
        <Alert tone={campaign.formAnalysisStatus === "needs_attention" ? "warning" : "danger"} title={campaign.formAnalysisStatus === "needs_attention" ? "Needs attention" : "Analysis failed"}>
          {analysisStatusMessage(campaign.formAnalysisStatus, campaign.formAnalysisError)}
        </Alert>
      )}
      {campaign.formAnalysisStatus === "processing" && <Alert tone="info">{analysisStatusMessage("processing")}</Alert>}
      {campaign.formAnalysisStatus === "ready" && fields.length > 0 && <Alert tone="success">Rendered form analyzed: {fields.length} field(s) detected.</Alert>}

      <CampaignStatusRefresh campaignId={id} active={hasActiveWork} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total records" value={total} />
        <Stat label="Successful" value={stats.successful ?? 0} hint="destination-confirmed only" />
        <Stat label="Needs attention" value={(stats.failed ?? 0) + (stats.human_action_required ?? 0) + (stats.needs_attention ?? 0)} />
        <Stat label="Unverified" value={stats.unverified ?? 0} hint="never submitted" />
        <Stat label={campaign.status === "running" ? "In execution" : "Awaiting execution"} value={(stats.queued ?? 0) + (stats.retrying ?? 0) + (stats.processing ?? 0)} />
      </div>

      {total > 0 && (
        <Card>
          <CardBody>
            <DistributionBar
              segments={[
                { value: stats.successful ?? 0, color: STATUS_COLORS.successful, label: "Successful" },
                { value: stats.failed ?? 0, color: STATUS_COLORS.failed, label: "Failed" },
                { value: stats.human_action_required ?? 0, color: STATUS_COLORS.human_action_required, label: "Human action required" },
                { value: stats.needs_attention ?? 0, color: STATUS_COLORS.human_action_required, label: "Needs attention" },
                { value: stats.unverified ?? 0, color: STATUS_COLORS.skipped, label: "Unverified" },
                { value: (stats.queued ?? 0) + (stats.retrying ?? 0), color: STATUS_COLORS.queued, label: "Queued / retrying" },
                { value: stats.skipped ?? 0, color: STATUS_COLORS.skipped, label: "Skipped" },
              ]}
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Form configuration"
          description="Keep the authorized destination visible while you review and prepare this campaign."
        />
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-3 text-[13px]">
            <div className="min-w-0">
              <p className="font-medium text-[var(--color-ink)]">Target form</p>
              {campaign.formUrl ? (
                <a href={campaign.formUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-[var(--color-brand)] hover:underline">
                  {campaign.formUrl}
                </a>
              ) : (
                <p className="mt-1 text-[var(--color-muted)]">No form selected yet.</p>
              )}
            </div>
            {campaign.formUrl && (
              <a href={campaign.formUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-3 py-2 font-medium text-[var(--color-brand)] hover:bg-[var(--color-surface)]">
                Open form
              </a>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-[var(--color-muted)]">
            <span>Analysis: <strong className="font-medium text-[var(--color-ink-soft)]">{analysisStatusMessage(campaign.formAnalysisStatus, campaign.formAnalysisError) || "Not started"}</strong></span>
            <span>Detected fields: <strong className="font-medium text-[var(--color-ink-soft)]">{fields.length}</strong></span>
          </div>
          {canReanalyzeForm ? (
            <form action={analyzeFormAction} className="mt-4 flex flex-wrap items-end gap-3">
              <input type="hidden" name="campaignId" value={id} />
              <FieldGroup className="max-w-md flex-1">
                <Label htmlFor="formUrl">{campaign.formUrl && canChangeForm ? "Change form URL" : "Form URL"}</Label>
                <Input id="formUrl" name="formUrl" type="url" defaultValue={campaign.formUrl ?? ""} placeholder="https://forms.example.org/registration" readOnly={!canChangeForm} required />
                <HelpText>The platform performs a single authorized fetch — no CAPTCHA or anti-bot bypass is ever attempted.</HelpText>
              </FieldGroup>
              <Button type="submit">{campaign.formUrl && fields.length > 0 ? "Re-analyze form" : "Analyze form"}</Button>
            </form>
          ) : (
            <p className="mt-4 text-[12px] text-[var(--color-muted)]">The form target is locked while execution is active.</p>
          )}
        </CardBody>
      </Card>

      {fields.length > 0 && (
        <Card>
          <CardHeader title="Field mapping" description="Map detected form fields to contact data." />
          <CardBody>
            <MappingEditor campaignId={id} fields={fields} initialMapping={mapping} options={contactFieldOptions} active={activeRun} saved={saved === "1"} saveAction={saveFieldMappingAction} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Send confirmation emails"
          description="Sends to contacts with a successful submission that don't yet have a confirmation logged."
        />
        <CardBody>
          {detail.templates.length === 0 ? (
            <p className="text-[13px] text-[var(--color-muted)]">
              Create an email template first from <Link href="/templates" className="font-medium text-[var(--color-brand)]">Templates</Link>.
            </p>
          ) : (
            <form action={sendConfirmationEmailsAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="campaignId" value={id} />
              <FieldGroup className="max-w-xs flex-1">
                <Label htmlFor="templateId">Template</Label>
                <Select id="templateId" name="templateId">
                  {detail.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </FieldGroup>
              <Button type="submit" variant="outline">
                Send confirmations
              </Button>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Records" description={`${detail.recordsTotal} total · ${detail.records.length} shown`} />
        <CardBody className="p-0">
          {detail.records.length === 0 ? (
            <EmptyState title="No contacts in this campaign yet" description="Add contacts to start queuing submissions." action={<LinkButton href={`/campaigns/${id}/add-contacts`} size="sm">Add contacts</LinkButton>} />
          ) : (
            <Table>
              <THead>
                <TH>Contact</TH>
                <TH>Status</TH>
                <TH>Attempts</TH>
                <TH>Result</TH>
                <TH>Updated</TH>
              </THead>
              <tbody>
                {detail.records.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/contacts/${r.contactId}`} className="font-medium text-[var(--color-ink)]">
                        {r.contactName}
                      </Link>
                      <p className="text-[11.5px] text-[var(--color-muted)]">{r.email ?? "—"}</p>
                    </TD>
                    <TD>
                      <StatusPill status={r.status} />
                    </TD>
                    <TD className="font-mono-data">{r.attempts}</TD>
                    <TD className="max-w-xs truncate text-[var(--color-muted)]">
                      <span title={evidenceTitle(r)}>
                        {r.resultMessage ?? "—"}
                      </span>
                      {r.status === "successful" && r.evidence != null && (
                        <span className="mt-0.5 block truncate text-[11px] text-[var(--color-success)]">
                          Confirmed {String((r.evidence as Record<string, unknown>).submittedAt ?? "").slice(0, 10) || "by destination"}
                        </span>
                      )}
                      {r.status === "successful" && r.evidence == null && (
                        <span className="mt-0.5 block text-[11px] font-medium text-[var(--color-warning)]">
                          No confirmation evidence — treat as unverified
                        </span>
                      )}
                    </TD>
                    <TD className="text-[var(--color-muted)]">{formatDateTime(r.updatedAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
          {detail.recordsTotal > detail.recordsPageSize && (
            <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3 text-[12px] text-[var(--color-muted)]">
              <span>Page {detail.recordsPage}</span>
              <div className="flex gap-2">
                {detail.recordsPage > 1 && (
                  <Link
                    href={`/campaigns/${id}?page=${detail.recordsPage - 1}`}
                    className="font-medium text-[var(--color-brand)] hover:underline"
                  >
                    Previous
                  </Link>
                )}
                {detail.recordsPage * detail.recordsPageSize < detail.recordsTotal && (
                  <Link
                    href={`/campaigns/${id}?page=${detail.recordsPage + 1}`}
                    className="font-medium text-[var(--color-brand)] hover:underline"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
