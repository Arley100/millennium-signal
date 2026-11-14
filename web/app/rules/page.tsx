"use client";

// Decision rules: every threshold the detections use, in one place.
import { Badge, Button, Card, Loading, PageHeader, RuleMissingBanner, RuleSlider } from "@/components/ui";
import { money, useStore } from "@/lib/store";

export default function RulesPage() {
  const { rules, defaults, summary, setRule } = useStore();
  if (!rules || !summary) return <Loading />;
  const low = rules.threshold * (1 - rules.band / 100);

  return (
    <>
      <PageHeader
        title="Decision rules"
        sub="People set the rules; the system applies them. Changes take effect immediately on every screen and in the review queue."
      />
      <RuleMissingBanner />

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Aging Claim Alert" sub="Written by our team (aging_open_claims)." right={<Badge kind="aging">Aging claim</Badge>}>
          <p className="mb-4 text-sm leading-relaxed">
            Flags a claim that is <b>Open</b> or <b>Under Review</b> more than <b>{rules.aging_days} days</b> after it was
            reported, as of Oct 31, 2026.
          </p>
          <RuleSlider name="aging_days" label="N: days a claim may wait (7–90)" format={(v) => `${v} days`} />
          <Catch label="Aging claims caught" value={String(summary.aging_claims)} color="text-amber" />
        </Card>

        <Card title="Near-threshold claim rule" sub="Early claims just under the senior-review line." right={<Badge kind="near_threshold">Near threshold</Badge>}>
          <p className="mb-4 text-sm leading-relaxed">
            Flags a claim when the loss is within <b>{rules.window} days</b> of the policy start and the amount is between{" "}
            <b>{money(low)}</b> and just under <b>{money(rules.threshold)}</b>.
          </p>
          <div className="space-y-2">
            <RuleSlider name="threshold" label="Senior-review threshold" format={(v) => money(v)} />
            <RuleSlider name="window" label="Early claim = loss within" format={(v) => `${v} days`} />
            <RuleSlider name="band" label="Just under the line = within" format={(v) => `${v}% below`} />
          </div>
          <Catch label="Claims caught" value={String(summary.flagged_claims)} color="text-accent" />
        </Card>

        <Card title="Senior queue monitor" sub="From Wanlin's pipeline (rule R2)." right={<Badge kind="senior">Senior queue</Badge>}>
          <p className="mb-4 text-sm leading-relaxed">
            Claims of <b>{money(rules.threshold)}</b> or more already go to senior review. This rule does not re-route
            them: it lists the ones still <b>Open</b> or <b>Under Review</b>, so a stalled senior review gets a decision.
          </p>
          <RuleSlider name="threshold" label="Senior-review threshold" format={(v) => money(v)} />
          <Catch label={`Stalled senior reviews (${money(summary.senior_value)} recorded)`} value={String(summary.senior_claims)} color="text-ink" />
        </Card>

        <Card title="Broker scorecard" sub="Compares each broker with the typical broker." right={<Badge kind="broker">Broker</Badge>}>
          <p className="mb-4 text-sm leading-relaxed">
            Flags a broker when at least 2 of its 3 measures (claims paid ÷ premium earned, share of policies with a claim, share of early
            claims) are <b>{rules.multiple}×</b> the typical broker or more, and it has at least 10 claims.
          </p>
          <RuleSlider name="multiple" label="Flag when measures are" format={(v) => `≥ ${v}× typical`} />
          <Catch label="Brokers caught" value={summary.flagged_brokers.join(", ") || "none"} color="text-sky" />
        </Card>
      </div>

      <Card className="mt-4" title="Reviewer" sub="The name written next to each human decision in the action log.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-mute">
            Reviewer name
            <input
              value={rules.reviewer}
              onChange={(e) => setRule({ reviewer: e.target.value })}
              className="mt-1 block w-72 rounded-lg border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>
          <Button onClick={() => defaults && setRule({ ...defaults, reviewer: rules.reviewer })}>Reset rules to defaults</Button>
        </div>
      </Card>
    </>
  );
}

function Catch({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="mt-4 flex items-baseline justify-between rounded-xl border border-line bg-panel2 px-4 py-3">
      <span className="text-xs text-mute">{label}</span>
      <span className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
