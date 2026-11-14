"use client";

// Overview: where the money goes (insight 1).
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, COLORS, Insight, Kpi, Loading, PageHeader, RuleMissingBanner, tooltipStyle } from "@/components/ui";
import { money, pct, useApi, useStore } from "@/lib/store";

type Overview = {
  by_source: { source: string; loss_ratio: number; kind: string; policies: number; claims: number }[];
  quarterly: { quarter: string; others: number; flagged: number }[];
  flagged_brokers: string[];
};

const KIND_COLOR: Record<string, string> = {
  "Flagged broker": COLORS.accent,
  Broker: COLORS.grey,
  "Own channel": COLORS.sky,
};

export default function OverviewPage() {
  const { summary } = useStore();
  const { data } = useApi<Overview>("/api/overview");
  if (!summary || !data) return <Loading />;
  const brokers = summary.flagged_brokers.join(", ") || "flagged brokers";
  const diff = summary.loss_ratio_ex_flagged - summary.loss_ratio;

  return (
    <>
      <PageHeader
        title="Where the money goes"
        sub="“We’re writing more business than ever and making less money on it. I want to know where the money is going.” — CFO, Millennium Mutual"
      />
      <RuleMissingBanner />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Kpi
          label="Policies · claims in the data"
          value={`${summary.policies.toLocaleString()}`}
          note={`${summary.claims.toLocaleString()} claims · ${summary.policies_ytd_2026.toLocaleString()} sold Jan–Oct 2026`}
        />
        <Kpi label="Claims paid ÷ premium earned" value={pct(summary.loss_ratio)} note="Loss ratio, all business" tone="bad" />
        <Kpi
          label={`Same, without ${brokers}`}
          value={pct(summary.loss_ratio_ex_flagged)}
          note={`${(diff * 100).toFixed(0)} points`}
          tone="good"
        />
        <Kpi
          label="Near-threshold claims flagged"
          value={String(summary.flagged_claims)}
          note={`${money(summary.flagged_paid)} paid on them`}
          tone="bad"
        />
        <Kpi
          label="Aging claims"
          value={String(summary.aging_claims)}
          note={`Open more than ${summary.rules.aging_days} days`}
          tone="warn"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card
          className="xl:col-span-3"
          title="Claims paid for every $1 of premium earned"
          sub="By who sold the policy. Above 100% means more paid out than earned, before any costs."
        >
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.by_source} layout="vertical" margin={{ left: 8, right: 48, top: 16, bottom: 0 }}>
                <CartesianGrid stroke={COLORS.line} horizontal={false} />
                <XAxis type="number" domain={[0, (max: number) => Math.ceil(max + 0.4)]} tickCount={6} tickFormatter={(v) => `${Math.round(v * 100)}%`} stroke={COLORS.mute} fontSize={12} />
                <YAxis type="category" dataKey="source" stroke={COLORS.mute} fontSize={12} width={56} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v, _n, item) => [
                    `${pct(Number(v))} · ${item?.payload?.policies} policies, ${item?.payload?.claims} claims`,
                    item?.payload?.kind,
                  ]}
                />
                <ReferenceLine
                  x={1}
                  stroke="#ffffff"
                  strokeDasharray="4 4"
                  label={{ value: "break-even before costs", fill: COLORS.mute, fontSize: 11, position: "top" }}
                />
                <Bar dataKey="loss_ratio" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                  {data.by_source.map((r) => (
                    <Cell key={r.source} fill={KIND_COLOR[r.kind]} />
                  ))}
                  <LabelList
                    dataKey="loss_ratio"
                    position="right"
                    formatter={(v) => pct(Number(v))}
                    fill={COLORS.ink}
                    fontSize={12}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-mute">
            {Object.entries(KIND_COLOR).map(([k, c]) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />
                {k}
              </span>
            ))}
          </div>
        </Card>

        <Card className="xl:col-span-2" title="Policies sold per quarter" sub="Growth is real; part of it comes from one new broker.">
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.quarterly} margin={{ left: -8, right: 8, top: 16, bottom: 0 }}>
                <CartesianGrid stroke={COLORS.line} vertical={false} />
                <XAxis dataKey="quarter" stroke={COLORS.mute} fontSize={11} />
                <YAxis stroke={COLORS.mute} fontSize={12} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="others" name="Everyone else" stackId="a" fill={COLORS.grey} isAnimationActive={false} />
                <Bar
                  dataKey="flagged"
                  name={`Flagged broker (${brokers})`}
                  stackId="a"
                  fill={COLORS.accent}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Insight label="Insight 1.">
          Growth is real, but one new broker partner ({summary.flagged_brokers.join(", ") || "—"}) pays out far more than it
          brings in. The other brokers perform like the company&apos;s own agents, so the broker channel itself is not the
          problem. <b>Do:</b> review that account, not the whole channel.
        </Insight>
      </div>
    </>
  );
}
