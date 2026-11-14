"use client";

// Usage guide: how to read the app, the demo path, and what it cannot tell you.
import Link from "next/link";
import { Card, PageHeader, Tag } from "@/components/ui";
import { useStore } from "@/lib/store";

const L = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="font-medium text-sky hover:underline">
    {children}
  </Link>
);

export default function GuidePage() {
  const { summary } = useStore();
  return (
    <>
      <PageHeader title="Usage guide" sub="Start with the overview, look at the evidence, then act in the review queue." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="How it works" sub="DATA → DETECT → DECIDE → ACT">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            <li>
              <b>Data.</b> Two exports are cleaned; every change is listed in <L href="/data">Data &amp; cleaning</L>.
            </li>
            <li>
              <b>Detect.</b> Four rules run: the Aging Claim Alert, the senior queue monitor, the broker scorecard and the near-threshold claim rule
              (<L href="/pattern">The pattern</L>, <L href="/delays">Claim delays</L>).
            </li>
            <li>
              <b>Decide.</b> People set the thresholds in <L href="/rules">Decision rules</L> or the left panel. Nothing is
              hard-coded to a broker or a team.
            </li>
            <li>
              <b>Act.</b> Each hit becomes a task in the <L href="/queue">Review queue</L> with its messages drafted. A
              person confirms or dismisses; the <L href="/log">Action log</L> keeps everything.
            </li>
          </ol>
        </Card>

        <Card title="Five-minute demo path">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            <li>
              <L href="/log">Action log</L> → Reset demo (start clean).
            </li>
            <li>
              <L href="/">Overview</L>: the loss ratio with and without the flagged broker.
            </li>
            <li>
              <L href="/pattern">The pattern</L>: the scorecard, then move a slider and watch it change.
            </li>
            <li>
              <L href="/queue">Review queue</L>: open a task, read the drafted messages, confirm.
            </li>
            <li>Submit the pre-filled new claim at the bottom of the queue.</li>
            <li>
              <L href="/log">Action log</L>: the decision and the new claim are at the top.
            </li>
            <li>
              <L href="/brief">CFO brief</L>: the one-page answer, printable.
            </li>
          </ol>
        </Card>

        <Card title="How to read the labels">
          <ul className="space-y-3 text-sm leading-relaxed">
            <li className="flex items-start gap-3">
              <Tag kind="fact" />
              <span>Computed from policies.csv and claims.csv as of {summary?.extract_date ?? "the extract date"}.</span>
            </li>
            <li className="flex items-start gap-3">
              <Tag kind="reco" />
              <span>A proposal by our team (who to reassign to, what to tell a customer). Never applied without a person.</span>
            </li>
            <li className="flex items-start gap-3">
              <Tag kind="human" />
              <span>Recorded when a reviewer clicks a button; signed with the reviewer name and kept in the log.</span>
            </li>
          </ul>
        </Card>

        <Card title="Limits and uncertainties">
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
            <li>A flag asks for a second look. It is not a fraud finding, and the system never denies a claim.</li>
            <li>Earned premium is estimated from each policy&apos;s start date; no data dictionary came with the files.</li>
            <li>Paid claims with no recorded amount count in money paid but cannot be tested against the review line.</li>
            <li>The renewal comparison is a correlation in one year of data, not proof that delay causes non-renewal.</li>
            <li>“Team with capacity” means fewest open claims, then fastest settlement this year. It ignores staffing we cannot see.</li>
            <li>Messages are drafts on screen and in the log. Nothing is emailed.</li>
            {summary?.near_threshold_rule_missing && (
              <li className="text-amber">
                The near-threshold rule in detect.py is not written yet, so 3 of 4 detections are active.
              </li>
            )}
          </ul>
        </Card>
      </div>
    </>
  );
}
