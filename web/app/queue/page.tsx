"use client";

// Review queue: every detected item becomes a task with drafted messages.
// A person makes the final call; nothing is denied by the system.
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Kpi, Loading, PageHeader, RuleMissingBanner, Td, Th } from "@/components/ui";
import { api, money, useApi, useStore } from "@/lib/store";

type Task = {
  task_id: string;
  kind: "near_threshold" | "aging";
  badge: string;
  claim_id: string;
  policy_id: string;
  customer_id: string;
  source: string;
  city: string;
  claim_type: string;
  claim_amount: number | null;
  status: string;
  adjuster_team: string;
  days_from_start: number | null;
  days_open: number | null;
  decision: string;
  reason: string;
  action: string;
  options: string[];
  alerts: { to: string; body: string }[];
};

type Queue = {
  tasks: Task[];
  broker_alerts: { task_id: string; broker: string; body: string; decision: string }[];
  counts: { waiting: number; near_threshold: number; aging: number; decided: number };
  intake: {
    policies: { policy_id: string; source: string; start_date: string }[];
    default_policy: string;
    default_loss_date: string;
    default_amount: number;
    claim_types: string[];
  };
};

type Result = {
  claim_id: string;
  outcome: "flagged" | "senior" | "clear";
  message: string;
  aging: boolean;
  alert: string | null;
  near_threshold_rule_missing: boolean;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "near_threshold", label: "Near threshold" },
  { key: "aging", label: "Aging claim" },
] as const;

export default function QueuePage() {
  const { refresh, rules } = useStore();
  const { data } = useApi<Queue>("/api/queue");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const tasks = useMemo(
    () => (data ? data.tasks.filter((t) => filter === "all" || t.kind === filter) : []),
    [data, filter],
  );
  const current = tasks.find((t) => t.task_id === picked) ?? tasks[0] ?? null;

  async function decide(task_id: string, decision: string) {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/decision", { method: "POST", body: JSON.stringify({ task_id, decision, note }) });
      setMsg(`Recorded “${decision}” for ${task_id.replace(/^(AGING|BROKER):/, "")} and wrote it to the action log.`);
      setNote("");
      refresh();
    } catch (e) {
      setMsg(`Could not record the decision: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Loading />;

  return (
    <>
      <PageHeader
        title="Review queue"
        sub="Every detected item is routed here automatically with its messages already drafted. A person makes the final call; nothing is denied by the system."
      />
      <RuleMissingBanner />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Awaiting review" value={String(data.counts.waiting)} />
        <Kpi label="Near-threshold tasks" value={String(data.counts.near_threshold)} tone="bad" />
        <Kpi label="Aging claim tasks" value={String(data.counts.aging)} tone="warn" />
        <Kpi label="Decided" value={String(data.counts.decided)} tone="good" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Card
          className="xl:col-span-3"
          title="Tasks"
          right={
            <div className="flex gap-1 rounded-lg border border-line bg-black/20 p-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => {
                    setFilter(f.key);
                    setPicked(null);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs transition ${
                    filter === f.key ? "bg-accent/20 text-ink" : "text-mute hover:text-ink"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="max-h-[470px] overflow-auto rounded-xl border border-line">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-panel2">
                <tr>
                  <Th>Why</Th>
                  <Th>Claim</Th>
                  <Th>Sold by</Th>
                  <Th>Type</Th>
                  <Th right>Amount</Th>
                  <Th right>Days open</Th>
                  <Th>Decision</Th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr
                    key={t.task_id}
                    onClick={() => {
                      setPicked(t.task_id);
                      setMsg(null);
                    }}
                    className={`cursor-pointer border-t border-line transition hover:bg-white/5 ${
                      current?.task_id === t.task_id ? "bg-accent/10" : ""
                    }`}
                  >
                    <Td>
                      <Badge kind={t.kind}>{t.badge}</Badge>
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-[13px]">{t.claim_id}</Td>
                    <Td className="whitespace-nowrap">
                      {t.source} · {t.city}
                    </Td>
                    <Td className="whitespace-nowrap">{t.claim_type}</Td>
                    <Td right>{money(t.claim_amount)}</Td>
                    <Td right>{t.days_open ?? "–"}</Td>
                    <Td>
                      <Badge kind={t.decision === "Awaiting review" ? "wait" : "done"}>{t.decision}</Badge>
                    </Td>
                  </tr>
                ))}
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-sm text-mute">
                      No tasks of this kind with the current rules.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="xl:col-span-2" title={current ? `Task: ${current.claim_id}` : "Task"}>
          {current ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge kind={current.kind}>{current.badge}</Badge>
                <Badge kind={current.decision === "Awaiting review" ? "wait" : "done"}>{current.decision}</Badge>
              </div>
              <p className="text-sm">
                <span className="text-mute">Why: </span>
                {current.reason}.
              </p>
              <p className="text-sm">
                <span className="text-mute">Automatic action: </span>
                {current.action}
              </p>
              {current.alerts.map((a) => (
                <details key={a.to} open className="rounded-xl border border-line bg-black/20">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-mute">
                    Drafted message → {a.to}
                  </summary>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap px-3 pb-3 font-sans text-[13px] leading-relaxed">
                    {a.body}
                  </pre>
                </details>
              ))}
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reviewer note (optional)"
                aria-label="Reviewer note"
                className="w-full rounded-lg border border-line bg-black/20 px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <div className="flex gap-2">
                <Button variant="primary" disabled={busy} onClick={() => decide(current.task_id, current.options[0])}>
                  {current.options[0]}
                </Button>
                <Button disabled={busy} onClick={() => decide(current.task_id, current.options[1])}>
                  {current.options[1]}
                </Button>
              </div>
              {msg && <p className="text-xs text-ok">{msg}</p>}
              <p className="text-xs text-mute">
                Signed as “{rules?.reviewer}”. If the system is wrong, the reviewer says so and the decision is logged, so
                the rule can be tuned.
              </p>
            </div>
          ) : (
            <p className="text-sm text-mute">Nothing to review with the current rules.</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Broker alerts" sub="Drafted for the Head of Distribution and the VP of Claims.">
          {data.broker_alerts.length === 0 && <p className="text-sm text-mute">No broker is flagged with the current rules.</p>}
          {data.broker_alerts.map((b) => (
            <div key={b.task_id} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge kind="broker">Broker scorecard</Badge>
                <span className="font-mono text-sm">{b.broker}</span>
                <Badge kind={b.decision === "Awaiting review" ? "wait" : "done"}>{b.decision}</Badge>
              </div>
              <pre className="whitespace-pre-wrap rounded-xl border border-line bg-black/20 p-3 font-sans text-[13px] leading-relaxed">
                {b.body}
              </pre>
              <div className="flex gap-2">
                <Button variant="primary" disabled={busy} onClick={() => decide(b.task_id, "Confirm broker review")}>
                  Confirm broker review
                </Button>
                <Button disabled={busy} onClick={() => decide(b.task_id, "Dismiss")}>
                  Dismiss broker alert
                </Button>
              </div>
            </div>
          ))}
        </Card>

        <Intake intake={data.intake} onDone={refresh} />
      </div>
    </>
  );
}

function Intake({ intake, onDone }: { intake: Queue["intake"]; onDone: () => void }) {
  const [policy, setPolicy] = useState(intake.default_policy);
  const [loss, setLoss] = useState(intake.default_loss_date);
  const [amount, setAmount] = useState(String(intake.default_amount));
  const [type, setType] = useState(intake.claim_types[0]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!intake.policies.some((p) => p.policy_id === policy)) setPolicy(intake.default_policy);
  }, [intake, policy]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api<Result>("/api/claims", {
        method: "POST",
        body: JSON.stringify({ policy_id: policy, loss_date: loss, amount: Number(amount), claim_type: type }),
      });
      setResult(r);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded-lg border border-line bg-black/20 px-3 py-2 text-sm outline-none focus:border-accent";
  const tone = { flagged: "border-accent/40 bg-accent/10", senior: "border-amber/40 bg-amber/10", clear: "border-ok/40 bg-ok/10" };

  return (
    <Card title="Try it: a new claim comes in" sub="The same rules run on the claim the moment it is submitted.">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-xs text-mute">
          Policy (newest first)
          <select value={policy} onChange={(e) => setPolicy(e.target.value)} className={`${field} mt-1 text-ink`}>
            {intake.policies.map((p) => (
              <option key={p.policy_id} value={p.policy_id}>
                {p.policy_id} · {p.source} · started {p.start_date}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-mute">
          Date of loss
          <input type="date" value={loss} onChange={(e) => setLoss(e.target.value)} className={`${field} mt-1 text-ink`} required />
        </label>
        <label className="text-xs text-mute">
          Claim amount ($)
          <input
            type="number"
            min={100}
            max={200000}
            step={100}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${field} mt-1 text-ink`}
            required
          />
        </label>
        <label className="text-xs text-mute">
          Type
          <select value={type} onChange={(e) => setType(e.target.value)} className={`${field} mt-1 text-ink`}>
            {intake.claim_types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" variant="primary" disabled={busy}>
            Submit claim
          </Button>
        </div>
      </form>

      {error && <p className="mt-3 rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">{error}</p>}
      {result && (
        <div data-testid="intake-result" className={`mt-3 rounded-xl border p-3 text-sm ${tone[result.outcome]}`}>
          <div className="font-semibold">
            {result.claim_id}: {result.message}
          </div>
          {result.aging && <div className="mt-1">Also created an Aging claim task (reported long before today).</div>}
          {result.outcome === "clear" && result.near_threshold_rule_missing && (
            <div className="mt-1 text-xs text-amber">
              Note: the near-threshold rule in detect.py is not written yet, so it cannot flag any claim.
            </div>
          )}
          {result.alert && (
            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-black/25 p-3 font-sans text-[13px] leading-relaxed">
              {result.alert}
            </pre>
          )}
          <div className="mt-1 text-xs text-mute">Logged in the action log.</div>
        </div>
      )}
    </Card>
  );
}
