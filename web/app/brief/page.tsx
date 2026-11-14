"use client";

// CFO brief: the whole answer on one printable page. Every number is read
// live from the API, and every line says whether it is a fact from the data
// or our recommendation.
import { Button, Chip, Loading, Tag } from "@/components/ui";
import { money, pct, useApi, useStore } from "@/lib/store";

type Overview = { by_source: { source: string; loss_ratio: number; kind: string; policies: number; claims: number }[] };
type Delays = {
  settle: Record<string, number | string>[];
  teams: string[];
  renewal: { bucket: string; renewal: number; n: number }[];
  aging_by_team: Record<string, number>;
  aging_days: number;
};

export default function BriefPage() {
  const { summary } = useStore();
  const { data: ov } = useApi<Overview>("/api/overview");
  const { data: dl } = useApi<Delays>("/api/delays");
  if (!summary || !ov || !dl) return <Loading />;

  const flagged = ov.by_source.filter((s) => s.kind === "Flagged broker");
  const mid = dl.renewal.find((r) => r.bucket.startsWith("15"));
  const slow = dl.renewal.find((r) => r.bucket.startsWith(">"));
  const last = dl.settle[dl.settle.length - 1];
  const slowTeam = dl.teams.reduce((a, b) => (Number(last[b]) > Number(last[a]) ? b : a), dl.teams[0]);
  const fastest = dl.teams.reduce((a, b) => (Number(last[b]) < Number(last[a]) ? b : a), dl.teams[0]);
  const worstTeam = Object.entries(dl.aging_by_team).sort((a, b) => b[1] - a[1])[0];
  const names = summary.flagged_brokers.join(", ") || "none";

  return (
    <article className="brief mx-auto max-w-[900px] rounded-2xl border border-line bg-panel p-10">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Millennium Mutual · CFO brief</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-mute">State as of {summary.extract_date}</span>
          <span className="no-print">
            <Button onClick={() => window.print()}>Print</Button>
          </span>
        </div>
      </div>

      <dl className="divide-y divide-line text-sm leading-relaxed">
        <Line label="The question">
          “We’re writing more business than ever and making less money on it. Where is the money going?”
        </Line>

        <Line label="Headline" tag="fact">
          For every $1 of premium earned, {pct(summary.loss_ratio)} is paid back out in claims. Without broker {names} it
          is {pct(summary.loss_ratio_ex_flagged)}.
          <Chips items={[`${summary.policies.toLocaleString()} policies`, `${summary.claims.toLocaleString()} claims`, "earned premium basis"]} />
        </Line>

        <Line label="1 · One broker" tag="fact">
          {flagged.length ? (
            flagged.map((f) => (
              <span key={f.source}>
                {f.source} sold {f.policies} policies and pays out {pct(f.loss_ratio)} of the premium it earns ({f.claims}{" "}
                claims).{" "}
              </span>
            ))
          ) : (
            <span>No broker is flagged with the current rules. </span>
          )}
          The other brokers perform like the company&apos;s own channels, so the broker channel itself is not the problem.
          <Chips items={["broker scorecard", `flag at ≥ ${summary.rules.multiple}× typical`, "2 of 3 measures"]} />
        </Line>

        <Line label="2 · Slow claims" tag="fact">
          {slowTeam} now takes a median {String(last[slowTeam])} days to settle ({fastest}: {String(last[fastest])} days).
          Customers who waited 15–30 days renewed {pct(mid?.renewal)} of the time; past 30 days, {pct(slow?.renewal)}.{" "}
          {summary.aging_claims} claims are open more than {dl.aging_days} days
          {worstTeam ? `, ${worstTeam[1]} of them with ${worstTeam[0]}` : ""}.
          <Chips items={[`${mid?.n ?? 0} + ${slow?.n ?? 0} renewal decisions`, `aging rule N = ${dl.aging_days}`]} />
        </Line>

        <Line label="What the system does" tag="fact">
          Three detections run on every claim: the Aging Claim Alert (ours), the near-threshold claim rule and the broker
          scorecard. Each hit creates a review task with the messages already drafted, and every step is logged.{" "}
          {summary.near_threshold_rule_missing ? (
            <b className="text-amber">The near-threshold rule is not written yet and currently flags 0 claims.</b>
          ) : (
            <>
              The near-threshold rule flags {summary.flagged_claims} claims ({money(summary.flagged_paid)} paid).
            </>
          )}
        </Line>

        <Line label="Priorities" tag="reco">
          1) Route {names === "none" ? "any flagged broker" : names}&apos;s new policies and claims through senior review
          until the account is audited; keep selling through the other brokers. 2) Move aging claims from the slowest
          team to the team with capacity, and have Retention call those customers. 3) Keep the 30-day alert running: it
          sits exactly where renewals fall off.
        </Line>

        <Line label="Limits">
          A flag asks for a second look; it is not a fraud finding. Earned premium is estimated from start dates. Claims
          with no recorded amount cannot be checked against the review line. Thresholds are choices, shown in Decision
          rules, and a person confirms every action.
        </Line>
      </dl>

      <p className="mt-6 text-xs text-mute">
        Print this page (Ctrl+P): it fits on one page. Lines marked “Our recommendation” are proposals by our team; lines
        marked “From the data” are computed from the two exports as of {summary.extract_date}.
      </p>
    </article>
  );
}

function Line({ label, tag, children }: { label: string; tag?: "fact" | "reco"; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[170px_1fr] gap-6 py-4">
      <dt>
        <div className="font-semibold">{label}</div>
        {tag && (
          <div className="mt-1.5">
            <Tag kind={tag} />
          </div>
        )}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <span className="mt-1.5 flex flex-wrap gap-1">
      {items.map((i) => (
        <Chip key={i}>{i}</Chip>
      ))}
    </span>
  );
}
