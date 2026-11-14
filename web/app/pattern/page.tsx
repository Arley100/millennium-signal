"use client";

// The pattern: why some claims slip through, and the broker scorecard.
import { Bar, BarChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { Badge, Card, COLORS, Loading, PageHeader, RuleMissingBanner, RuleSlider, Td, Th, tooltipStyle } from "@/components/ui";
import { money, pct, useApi } from "@/lib/store";

type Point = { claim_id: string; source: string; claim_type: string; days_from_start: number; claim_amount: number; flagged: boolean };
type Pattern = {
  histogram: { bin: number; other: number; flagged: number }[];
  scatter: Point[];
  scorecard: {
    source: string;
    policies: number;
    claims: number;
    first_sale: string;
    loss_ratio: number;
    claim_rate: number;
    early_share: number;
    flagged_claims: number;
    warning_signs: number;
    broker_flag: boolean;
  }[];
  typical: { loss_ratio: number; claim_rate: number; early_share: number };
  zone: { x1: number; y0: number; y1: number };
  rules: { threshold: number; window: number; band: number; multiple: number };
};

export default function PatternPage() {
  const { data } = useApi<Pattern>("/api/pattern");
  if (!data) return <Loading />;
  const { rules, zone, typical } = data;
  const flagged = data.scatter.filter((p) => p.flagged);
  const others = data.scatter.filter((p) => !p.flagged);
  const thresholdBin = Math.floor(rules.threshold / 500) * 500;
  const hot = (value: number, base: number) => (value / base >= rules.multiple ? "text-accent font-semibold" : "");

  return (
    <>
      <PageHeader
        title="The pattern"
        sub={`Claims under ${money(rules.threshold)} are approved by the adjuster team alone. Claims at or above it go to senior review. Move the sliders to see what each rule catches.`}
      />
      <RuleMissingBanner />

      <Card className="mb-4" title="Try the rules" sub="These are the same sliders as in the left panel. Everything on this page updates as you move them.">
        <div className="grid gap-x-8 gap-y-2 md:grid-cols-2 xl:grid-cols-4">
          <RuleSlider name="threshold" label="Senior-review threshold" format={(v) => money(v)} />
          <RuleSlider name="window" label="Early claim within" format={(v) => `${v} days of policy start`} />
          <RuleSlider name="band" label="Just under the line" format={(v) => `within ${v}%`} />
          <RuleSlider name="multiple" label="Broker flagged at" format={(v) => `≥ ${v}× typical`} />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Claim amounts: is there a pile-up just under the review line?" sub="Number of claims per $500 band (claims under $25,000).">
          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.histogram} margin={{ left: -12, right: 12, top: 20, bottom: 0 }} barCategoryGap={1}>
                <CartesianGrid stroke={COLORS.line} vertical={false} />
                <XAxis dataKey="bin" stroke={COLORS.mute} fontSize={11} tickFormatter={(v) => `$${v / 1000}k`} interval={3} />
                <YAxis stroke={COLORS.mute} fontSize={12} allowDecimals={false} />
                <Tooltip {...tooltipStyle} labelFormatter={(v) => `${money(Number(v))} – ${money(Number(v) + 499)}`} />
                <Bar dataKey="other" name="Other claims" stackId="a" fill={COLORS.grey} isAnimationActive={false} />
                <Bar dataKey="flagged" name="Flagged" stackId="a" fill={COLORS.accent} isAnimationActive={false} />
                {thresholdBin < 25000 && (
                  <ReferenceLine
                    x={thresholdBin}
                    stroke="#ffffff"
                    strokeDasharray="4 4"
                    label={{ value: "senior review starts", fill: COLORS.mute, fontSize: 11, position: "top" }}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Early and just under the line: the flagged zone" sub="Each dot is a claim. The dotted box is what the near-threshold rule looks for.">
          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: 4, right: 12, top: 20, bottom: 16 }}>
                <CartesianGrid stroke={COLORS.line} />
                <XAxis
                  type="number"
                  dataKey="days_from_start"
                  name="Days from policy start"
                  stroke={COLORS.mute}
                  fontSize={12}
                  domain={[0, "dataMax"]}
                  label={{ value: "Days from policy start to loss", fill: COLORS.mute, fontSize: 11, position: "insideBottom", offset: -8 }}
                />
                <YAxis
                  type="number"
                  dataKey="claim_amount"
                  name="Amount"
                  stroke={COLORS.mute}
                  fontSize={12}
                  domain={[0, 25000]}
                  tickFormatter={(v) => `$${v / 1000}k`}
                />
                <ZAxis range={[22, 22]} />
                <Tooltip
                  {...tooltipStyle}
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ payload }) => {
                    const p = payload?.[0]?.payload as Point | undefined;
                    if (!p) return null;
                    return (
                      <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs">
                        <div className="font-mono">{p.claim_id}</div>
                        <div>
                          {p.source} · {p.claim_type}
                        </div>
                        <div>
                          {money(p.claim_amount)} · day {p.days_from_start}
                        </div>
                      </div>
                    );
                  }}
                />
                <ReferenceArea
                  x1={0}
                  x2={zone.x1}
                  y1={zone.y0}
                  y2={Math.min(zone.y1, 25000)}
                  stroke={COLORS.accent}
                  strokeDasharray="4 4"
                  fill={COLORS.accent}
                  fillOpacity={0.08}
                />
                <ReferenceLine y={rules.threshold} stroke="#ffffff" strokeDasharray="4 4" />
                <Scatter name="Other claims" data={others} fill={COLORS.grey} fillOpacity={0.7} isAnimationActive={false} />
                <Scatter name="Flagged" data={flagged} fill={COLORS.accent} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card
        className="mt-4"
        title="Broker scorecard"
        sub={`Typical broker: loss ratio ${pct(typical.loss_ratio)}, claim rate ${pct(typical.claim_rate)}, early claims ${pct(typical.early_share)}. A broker is flagged when 2 of 3 measures are ≥ ${rules.multiple}× typical and it has at least 10 claims.`}
      >
        <div className="overflow-auto rounded-xl border border-line">
          <table className="w-full border-collapse">
            <thead className="bg-panel2">
              <tr>
                <Th>Broker</Th>
                <Th right>Policies</Th>
                <Th>First sale</Th>
                <Th right>Loss ratio</Th>
                <Th right>Policies with a claim</Th>
                <Th right>Early claims</Th>
                <Th right>Near-threshold claims</Th>
                <Th right>Warning signs</Th>
                <Th>Result</Th>
              </tr>
            </thead>
            <tbody>
              {data.scorecard.map((r) => (
                <tr key={r.source} className={`border-t border-line ${r.broker_flag ? "bg-accent/10" : ""}`}>
                  <Td className="font-mono">{r.source}</Td>
                  <Td right>{r.policies}</Td>
                  <Td>{r.first_sale}</Td>
                  <Td right className={hot(r.loss_ratio, typical.loss_ratio)}>
                    {pct(r.loss_ratio)}
                  </Td>
                  <Td right className={hot(r.claim_rate, typical.claim_rate)}>
                    {pct(r.claim_rate)}
                  </Td>
                  <Td right className={hot(r.early_share, typical.early_share)}>
                    {pct(r.early_share)}
                  </Td>
                  <Td right>{r.flagged_claims}</Td>
                  <Td right>{r.warning_signs} of 3</Td>
                  <Td>{r.broker_flag ? <Badge kind="near_threshold">Flagged</Badge> : <Badge kind="wait">OK</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
