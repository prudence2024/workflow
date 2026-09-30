import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentOrg, getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { can, getChannelReadiness, listMessages, listOutbox, listSuppressions, listTemplates, previewAudience } from "@/lib/data";
import { Card, CardBody, CardHeader, EmptyState, Alert } from "@/components/ui/Surfaces";
import { Stat, Table, THead, TH, TD, TR, Avatar } from "@/components/ui/Data";
import { StatusPill } from "@/components/ui/Status";
import { Button, LinkButton } from "@/components/ui/Button";
import { Input, Label, Select, FieldGroup } from "@/components/ui/Field";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { addSuppressionAction, queueSendAction, restoreOutboxAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, string> = {
  pending: "Queued for the next dispatch run",
  processing: "A worker has claimed this event",
  sent: "The provider accepted it (acceptance is not delivery)",
  failed: "Retryable failure — waiting for backoff",
  exhausted: "Retries exhausted — review required",
  ambiguous: "Outcome unknown — never retried automatically",
};

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const orgs = await getUserOrganizations(user);
  if (orgs.length === 0) redirect("/onboarding");
  const org = await getCurrentOrg(user);
  if (!org) redirect("/onboarding");

  const workspace = { user, org };
  const [readiness, outbox, messages, templates, suppressions, maySend] = await Promise.all([
    getChannelReadiness(workspace),
    listOutbox(workspace),
    listMessages(workspace),
    listTemplates(workspace),
    listSuppressions(workspace),
    can(workspace, "messages:send"),
  ]);

  const audience = await Promise.all([
    previewAudience(workspace, "email", 25),
    previewAudience(workspace, "sms", 25),
  ]);

  const unconfigured = readiness.filter((r) => !r.providerConfigured);
  const needsReview = (outbox.counts.ambiguous ?? 0) + (outbox.counts.exhausted ?? 0);

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-accent-strong)]">
            Connect · Automate · Move Forward
          </p>
          <h1 className="mt-1.5 font-display text-[26px] font-semibold text-[var(--color-ink)]">
            Communications Centre
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-[var(--color-muted)]">
            Consent-aware email and SMS for <strong>{org.orgName}</strong>. Every send is queued durably,
            checked against consent and suppression before it leaves, and reported from provider evidence —
            never from an assumption.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LinkButton href="/templates" variant="outline" size="sm">
            Manage templates
          </LinkButton>
        </div>
      </div>

      {params.error && <Alert tone="danger">{params.error}</Alert>}
      {params.queued && (
        <Alert tone="success">
          {params.queued} message{params.queued === "1" ? "" : "s"} queued. Nothing has been sent yet — delivery
          is reported only when a provider confirms it.
          {params.duplicate && params.duplicate !== "0"
            ? ` ${params.duplicate} duplicate(s) were suppressed by the idempotency key.`
            : ""}
        </Alert>
      )}
      {params.suppressed && <Alert tone="success">Address added to the suppression list and consent revoked.</Alert>}
      {params.resolved && <Alert tone="success">Queue item updated and the decision recorded in the audit log.</Alert>}

      {unconfigured.length > 0 && (
        <Alert tone="warning">
          <strong>Provider credentials are missing for {unconfigured.map((u) => u.channel).join(" and ")}.</strong>{" "}
          Messages will queue and then be released without sending — this screen will never report them as
          delivered. Configure{" "}
          {unconfigured.some((u) => u.channel === "email") && (
            <code className="rounded bg-black/[0.05] px-1">RESEND_API_KEY</code>
          )}
          {unconfigured.length === 2 && " and "}
          {unconfigured.some((u) => u.channel === "sms") && (
            <code className="rounded bg-black/[0.05] px-1">TERMII_API_KEY</code>
          )}{" "}
          to enable real dispatch.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {readiness.map((r) => (
          <Card key={r.channel}>
            <CardBody>
              <Stat
                label={`${r.channel === "email" ? "Email" : "SMS"} eligible`}
                value={r.eligible}
                hint={`via ${r.provider}${r.providerConfigured ? "" : " (not configured)"}`}
              />
              <dl className="mt-4 space-y-1.5 text-[12.5px]">
                <div className="flex justify-between text-[var(--color-muted)]">
                  <dt>No consent</dt>
                  <dd className="font-medium text-[var(--color-ink-soft)]">{r.blockedNoConsent}</dd>
                </div>
                <div className="flex justify-between text-[var(--color-muted)]">
                  <dt>Suppressed</dt>
                  <dd className="font-medium text-[var(--color-ink-soft)]">{r.blockedSuppressed}</dd>
                </div>
                <div className="flex justify-between text-[var(--color-muted)]">
                  <dt>Missing address</dt>
                  <dd className="font-medium text-[var(--color-ink-soft)]">{r.blockedMissingAddress}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        ))}
        <Card>
          <CardBody>
            <Stat
              label="Awaited in queue"
              value={(outbox.counts.pending ?? 0) + (outbox.counts.processing ?? 0)}
              hint="durable, survives restarts"
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat
              label="Needs a human"
              value={needsReview}
              hint="ambiguous or exhausted"
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <Card>
          <CardHeader
            title="Queue a send"
            description="The audience below is computed in PostgreSQL using your consent and suppression rules. The browser cannot add or remove a recipient."
          />
          <CardBody>
            {!maySend ? (
              <EmptyState
                title="Your role cannot send in this workspace"
                description={`Sending requires the messages:send permission. You are signed in as ${org.role}. Ask an owner or admin if you need it.`}
              />
            ) : templates.length === 0 ? (
              <EmptyState
                title="No templates yet"
                description="Create an email or SMS template, then come back to queue a send."
                action={<LinkButton href="/templates" size="sm">Create a template</LinkButton>}
              />
            ) : (
              <form action={queueSendAction} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldGroup>
                    <Label htmlFor="channel">Channel</Label>
                    <Select id="channel" name="channel" defaultValue="email">
                      <option value="email">Email — via Resend</option>
                      <option value="sms">SMS — via Termii</option>
                    </Select>
                  </FieldGroup>
                  <FieldGroup>
                    <Label htmlFor="templateId">Template</Label>
                    <Select id="templateId" name="templateId" defaultValue={templates[0]?.id}>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  </FieldGroup>
                </div>
                <FieldGroup>
                  <Label htmlFor="subject" hint="optional — overrides the template subject">
                    Subject line
                  </Label>
                  <Input id="subject" name="subject" placeholder="Use the template subject" />
                </FieldGroup>
                <input type="hidden" name="batchKey" value={`manual-${Date.now().toString(36)}`} />
                <div className="rounded-[var(--radius-sm)] bg-[var(--color-canvas)] p-3 text-[12.5px] leading-relaxed text-[var(--color-muted)]">
                  Queued sends run through the durable outbox and are dispatched by a worker. Retries use
                  exponential backoff; an uncertain provider outcome is parked for human review instead of
                  being retried blindly.
                </div>
                <Button type="submit" className="w-full">
                  Queue send
                </Button>
              </form>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Who would receive this"
            description="First 25 eligible records per channel, evaluated by the same rule the dispatcher applies."
          />
          <CardBody className="space-y-5">
            {(["email", "sms"] as const).map((channel, index) => (
              <div key={channel}>
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  {channel === "email" ? "Email" : "SMS"} · {audience[index].length} eligible
                </p>
                {audience[index].length === 0 ? (
                  <p className="mt-2 text-[13px] text-[var(--color-muted)]">
                    No eligible recipients. Consent must be granted explicitly and the address must not be
                    suppressed.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {audience[index].slice(0, 6).map((r) => (
                      <li key={r.contactId} className="flex items-center gap-2.5">
                        <Avatar name={r.name} size={26} />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-ink-soft)]">
                          {r.name}
                        </span>
                        <span className="truncate text-[12px] text-[var(--color-muted)]">{r.address}</span>
                      </li>
                    ))}
                    {audience[index].length > 6 && (
                      <li className="text-[12px] text-[var(--color-muted)]">
                        +{audience[index].length - 6} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ))}
            <p className="text-[12px] text-[var(--color-muted)]">
              Records appear here only after consent is recorded.{" "}
              <Link href="/contacts" className="font-medium text-[var(--color-brand)]">
                Review consent
              </Link>{" "}
              on each record.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Dispatch queue"
          description="Durable events. A worker claims each row with FOR UPDATE SKIP LOCKED, so nothing is processed twice."
        />
        {outbox.rows.length === 0 ? (
          <CardBody>
            <EmptyState title="Queue is empty" description="Queued email, SMS and Telegram events appear here." />
          </CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Event</TH>
                <TH>Recipient</TH>
                <TH>Status</TH>
                <TH>Attempts</TH>
                <TH>Detail</TH>
                <TH>Created</TH>
                <TH>{""}</TH>
              </TR>
            </THead>
            <tbody>
              {outbox.rows.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <span className="font-medium text-[var(--color-ink)]">{row.eventType}</span>
                    <span className="ml-2 text-[11.5px] text-[var(--color-muted)]">{row.provider}</span>
                  </TD>
                  <TD className="max-w-[220px] truncate text-[12.5px] text-[var(--color-ink-soft)]">
                    {row.to ?? "—"}
                  </TD>
                  <TD>
                    <StatusPill status={row.status} />
                  </TD>
                  <TD className="text-[12.5px] text-[var(--color-muted)]">
                    {row.attemptCount}/{row.maxAttempts}
                  </TD>
                  <TD className="max-w-[280px] truncate text-[12px] text-[var(--color-muted)]">
                    {row.lastError ?? STATUS_COPY[row.status] ?? "—"}
                  </TD>
                  <TD className="whitespace-nowrap text-[12.5px] text-[var(--color-muted)]">
                    {timeAgo(row.createdAt)}
                  </TD>
                  <TD>
                    {(row.status === "ambiguous" || row.status === "failed" || row.status === "exhausted") && (
                      <div className="flex gap-1.5">
                        {row.status === "failed" && (
                          <form action={restoreOutboxAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <input type="hidden" name="decision" value="retry" />
                            <Button size="sm" variant="outline" type="submit">
                              Retry
                            </Button>
                          </form>
                        )}
                        <form action={restoreOutboxAction}>
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="decision" value="resolve" />
                          <Button size="sm" variant="ghost" type="submit">
                            Resolve
                          </Button>
                        </form>
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Recent messages"
            description="Status comes from provider callbacks. 'Sent' means the provider accepted it — delivery proof appears in the events column."
          />
          {messages.length === 0 ? (
            <CardBody>
              <EmptyState title="No messages yet" description="Queued and dispatched messages appear here." />
            </CardBody>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Recipient</TH>
                  <TH>Channel</TH>
                  <TH>Status</TH>
                  <TH>Provider evidence</TH>
                  <TH>When</TH>
                </TR>
              </THead>
              <tbody>
                {messages.map((m) => (
                  <TR key={m.id}>
                    <TD className="text-[13px] text-[var(--color-ink)]">{m.contactName}</TD>
                    <TD className="text-[12.5px] text-[var(--color-muted)]">{m.channel}</TD>
                    <TD>
                      <StatusPill status={m.status} />
                    </TD>
                    <TD className="text-[12px] text-[var(--color-muted)]">
                      {m.lastEvent ? `${m.provider} · ${m.lastEvent}` : `${m.provider} · awaiting callback`}
                    </TD>
                    <TD className="whitespace-nowrap text-[12.5px] text-[var(--color-muted)]">
                      {formatDateTime(m.createdAt)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Suppression list"
            description="Hard blocks. Suppression always wins over consent and is checked immediately before dispatch."
          />
          <CardBody className="space-y-4">
            <form action={addSuppressionAction} className="space-y-3">
              <div className="grid grid-cols-[110px_1fr] gap-3">
                <FieldGroup>
                  <Label htmlFor="channel-s">Channel</Label>
                  <Select id="channel-s" name="channel" defaultValue="email">
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                  </Select>
                </FieldGroup>
                <FieldGroup>
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" name="address" placeholder="person@example.com" required />
                </FieldGroup>
              </div>
              <FieldGroup>
                <Label htmlFor="reason">Reason</Label>
                <Select id="reason" name="reason" defaultValue="unsubscribe">
                  <option value="unsubscribe">Unsubscribe</option>
                  <option value="stop">STOP reply</option>
                  <option value="bounce">Hard bounce</option>
                  <option value="complaint">Complaint</option>
                  <option value="manual">Manual block</option>
                  <option value="invalid">Invalid address</option>
                </Select>
              </FieldGroup>
              <Button type="submit" variant="outline" size="sm" className="w-full">
                Add to suppression list
              </Button>
            </form>

            <div className="border-t border-[var(--color-border)] pt-4">
              {suppressions.length === 0 ? (
                <p className="text-[13px] text-[var(--color-muted)]">Nothing suppressed yet.</p>
              ) : (
                <ul className="space-y-2">
                  {suppressions.slice(0, 6).map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                      <span className="min-w-0 truncate text-[var(--color-ink-soft)]">{s.address}</span>
                      <span className="shrink-0 text-[11.5px] text-[var(--color-muted)]">
                        {s.channel} · {s.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
