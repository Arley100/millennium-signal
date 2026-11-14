"use client";

// Claim delays (insight 2) and the team-written Aging Claim Alert with its justification.
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Card, COLORS, Insight, Loading, PageHeader, RuleSlider, Td, Th, tooltipStyle } from "@/components/ui";
import { money, pct, useApi } from "@/lib/store";

type Delays = {
  settle: Record<string, number | string>[];
  teams: string[];
  renewal: { bucket: string; renewal: number; n: number }[];
  aging: {
    claim_id: string;
    adjuster_team: string;
    city: string;
    claim_type: string;
    claim_amount: number | null;
    days_open: number;
    status: string;
    customer_id: string;
  }[];
  aging_by_team: Record<string, number>;
  aging_days: number;
};

const TEAM_COLORS = [COLORS.grey, COLORS.sky, COLORS.accent];

export default function DelaysPage() {
  const { data } = useApi<Delays>("/api/delays");
  if (!data) return <Loading />;
  const mid = data.renewal.find((r) => r.bucket.startsWith("15"));
  const slow = data.renewal.find((r) => r.bucket.startsWith(">"));

  return (
    <>
      <PageHeader
        title="Claim delays"
        sub="The VP of Claims and the Head of Retention may be describing the same problem: long waits go together with lost renewals."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Aging Claim Alert" sub="The detection our team wrote: aging_open_claims() in detect.py." right={<Badge kind="aging">Aging claim</Badge>}>
          <div className="rounded-xl border border-line bg-panel2 p-4 text-sm leading-relaxed">
            <div className="text-xs uppercase tracking-wider text-mute">The rule</div>
            <p className="mt-1">
              A claim is aging when its status is <b>Open</b> or <b>Under Review</b> and more than{" "}
              <b className="text-amber">{data.aging_days} days</b> have passed since it was reported, as of the data
              extract date (Oct 31, 2026).
            </p>
          </div>
          <div className="mt-4">
            <RuleSlider name="aging_days" label="Alert when a claim has waited more than" format={(v) => `${v} days`} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-line bg-panel2 p-3">
              <div className="text-xs text-mute">Aging claims now</div>
              <div data-testid="aging-count" className="text-3xl font-semibold tabular-nums text-amber">
                {data.aging.length}
              </div>
            </div>
            <div className="col-span-2 rounded-xl border border-line bg-panel2 p-3">
              <div className="text-xs text-mute">By adjuster team</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {Object.entries(data.aging_by_team).map(([t, n]) => (
                  <span key={t}>
                    {t}: <b className="tabular-nums">{n}</b>
                  </span>
                ))}
                {data.aging.length === 0 && <span className="text-mute">none</span>}
              </div>
            </div>
          </div>
          <div className="mt-4 text-sm leading-relaxed">
            <div className="text-xs uppercase tracking-wider text-mute">What happens automatically</div>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>A review task with the “Aging claim” badge is created in the review queue.</li>
              <li>An alert to the VP of Claims is drafted, suggesting reassignment to a team with capacity.</li>
              <li>A note to Retention is drafted, asking them to contact the customer.</li>
              <li>Each step is written to the action log.</li>
            </ol>
            <Link href="/queue" className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
              Open the review queue →
            </Link>
          </div>
        </Card>

        <Card
          title="Why 30 days: renewal rate by how long the customer waited"
          sub="Policies that reached renewal, grouped by their longest claim wait."
        >
          <div className="h-[330px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.renewal} margin={{ left: -8, right: 8, top: 24, bottom: 0 }}>
                <CartesianGrid stroke={COLORS.line} vertical={false} />
                <XAxis dataKey="bucket" stroke={COLORS.mute} fontSize={12} />
                <YAxis stroke={COLORS.mute} fontSize={12} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v, _n, item) => [`${pct(Number(v))} renewed (${item?.payload?.n} policies)`, "Renewal"]}
                />
                <Bar dataKey="renewal" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  {data.renewal.map((r) => (
                    <Cell key={r.bucket} fill={r.bucket.startsWith(">") ? COLORS.accent : COLORS.grey} />
                  ))}
                  <LabelList dataKey="renewal" position="top" formatter={(v) => pct(Number(v))} fill={COLORS.ink} fontSize={13} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 rounded-xl border border-amber/30 bg-amber/10 p-3 text-sm">
            Customers who waited <b>15–30 days</b> renewed <b>{pct(mid?.renewal)}</b> of the time. Past <b>30 days</b> the
            rate was <b className="text-accent">{pct(slow?.renewal)}</b>. That gap is why we set the alert at 30 days. It is an association, not proof that the wait caused the customer to leave.
          </p>
        </Card>
      </div>

      <Card className="mt-4" title="Median days to settle a claim, by adjuster team" sub="By the quarter the claim was reported.">
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.settle} margin={{ left: -12, right: 16, top: 12, bottom: 0 }}>
              <CartesianGrid stroke={COLORS.line} vertical={false} />
              <XAxis dataKey="quarter" stroke={COLORS.mute} fontSize={12} />
              <YAxis stroke={COLORS.mute} fontSize={12} />
              <Tooltip {...tooltipStyle} cursor={{ stroke: COLORS.line }} formatter={(v) => `${v} days`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {data.teams.map((t, i) => (
                <Line
                  key={t}
                  type="monotone"
                  dataKey={t}
                  stroke={TEAM_COLORS[i % 3]}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="mt-4" title={`Open claims waiting more than ${data.aging_days} days: ${data.aging.length}`}>
        <div className="max-h-[360px] overflow-auto rounded-xl border border-line">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-panel2">
              <tr>
                <Th>Claim</Th>
                <Th>Team</Th>
                <Th>City</Th>
                <Th>Type</Th>
                <Th right>Amount</Th>
                <Th right>Days open</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {data.aging.map((r) => (
                <tr key={r.claim_id} className="border-t border-line">
                  <Td className="whitespace-nowrap font-mono text-[13px]">{r.claim_id}</Td>
                  <Td>{r.adjuster_team}</Td>
                  <Td>{r.city}</Td>
                  <Td>{r.claim_type}</Td>
                  <Td right>{money(r.claim_amount)}</Td>
                  <Td right className="text-amber">
                    {r.days_open}
                  </Td>
                  <Td>{r.status}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4">
        <Insight label="Insight 2.">
          One team&apos;s settlement time has roughly doubled in 2026, and customers who wait over 30 days renew far less
          often. <b>Do:</b> rebalance claims away from that team before hiring everywhere, and alert when a claim passes{" "}
          {data.aging_days} days open.
        </Insight>
      </div>
    </>
  );
}
