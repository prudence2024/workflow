import { submitSurveyAction, dismissSurveyAction, remindSurveyAction } from "./survey-actions";

export function WeeklySurvey({ message }: { message?: string }) {
  return (
    <section aria-labelledby="weekly-survey-title" className="rounded-[var(--radius-lg)] border border-[var(--color-accent)]/35 bg-[var(--color-accent-soft)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">Weekly product check-in</p>
          <h2 id="weekly-survey-title" className="mt-1 font-display text-[18px] font-semibold text-[var(--color-ink)]">Help us make Workflow more useful</h2>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">This takes about a minute and appears at most once every seven days.</p>
        </div>
        <form action={remindSurveyAction}><button className="text-[12px] font-medium text-[var(--color-muted)]" type="submit">Remind me later</button></form>
      </div>
      {message && <p className="mt-3 text-[12px] text-[var(--color-danger)]">{message}</p>}
      <form action={submitSurveyAction} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-[12.5px] text-[var(--color-ink-soft)]">Feature used most<select name="featureUsed" className="mt-1 w-full rounded-[var(--radius-sm)] border bg-[var(--color-surface)] px-3 py-2" defaultValue=""><option value="">Choose one</option><option>Contacts</option><option>Forms and automations</option><option>Campaigns</option><option>Communications</option><option>Reports</option></select></label>
        <label className="text-[12.5px] text-[var(--color-ink-soft)]">Satisfaction<select name="satisfaction" className="mt-1 w-full rounded-[var(--radius-sm)] border bg-[var(--color-surface)] px-3 py-2" defaultValue=""><option value="">Choose one</option>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value} / 5</option>)}</select></label>
        <label className="text-[12.5px] text-[var(--color-ink-soft)] sm:col-span-2">What was difficult?<textarea name="challenge" rows={2} className="mt-1 w-full rounded-[var(--radius-sm)] border bg-[var(--color-surface)] px-3 py-2" maxLength={1000} /></label>
        <label className="text-[12.5px] text-[var(--color-ink-soft)] sm:col-span-2">What should we build next?<textarea name="requestedFeature" rows={2} className="mt-1 w-full rounded-[var(--radius-sm)] border bg-[var(--color-surface)] px-3 py-2" maxLength={1000} /></label>
        <label className="text-[12.5px] text-[var(--color-ink-soft)] sm:col-span-2">Did anything fail? <textarea name="bugReport" rows={2} className="mt-1 w-full rounded-[var(--radius-sm)] border bg-[var(--color-surface)] px-3 py-2" maxLength={1000} /></label>
        <fieldset className="text-[12.5px] text-[var(--color-ink-soft)]"><legend>Would you recommend Workflow?</legend><label className="mr-3"><input type="radio" name="wouldRecommend" value="yes" /> Yes</label><label><input type="radio" name="wouldRecommend" value="no" /> Not yet</label></fieldset>
        <div className="flex items-center justify-end gap-2 sm:col-span-2"><button type="submit" className="rounded-[var(--radius-sm)] bg-[var(--color-brand)] px-4 py-2 text-[12px] font-semibold text-white">Send feedback</button><button type="submit" formAction={dismissSurveyAction} className="rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-4 py-2 text-[12px] font-semibold text-[var(--color-ink)]">Dismiss</button></div>
      </form>
    </section>
  );
}
