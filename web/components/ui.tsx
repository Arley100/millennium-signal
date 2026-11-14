"use client";

// Small building blocks used by every screen (cards, KPI tiles, badges, buttons, sliders).
import { AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";

export const COLORS = {
  accent: "#e5484d",
  grey: "#b4bcc8",
  sky: "#2f7fe0",
  ok: "#17936c",
  amber: "#e09a2b",
  ink: "#1f2433",
  mute: "#667085",
  line: "#e2e9e9",
};

export const tooltipStyle = {
  contentStyle: { background: "#ffffff", border: "1px solid #e2e9e9", borderRadius: 10, color: "#1f2433", fontSize: 13, boxShadow: "0 6px 20px rgba(18,45,63,.10)" },
  itemStyle: { color: "#1f2433" },
  labelStyle: { color: "#667085" },
  cursor: { fill: "rgba(31,36,51,0.04)" },
};

export function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-6">
      <p className="eyebrow mb-2">Millennium Mutual / Claims signal</p>
      <h1 className="text-[28px] font-semibold tracking-tight">{title}</h1>
      {sub && <p className="mt-1 max-w-3xl text-sm text-mute">{sub}</p>}
    </header>
  );
}

export function Card({
  title,
  sub,
  children,
  className = "",
  right,
}: {
  title?: string;
  sub?: string;
  children: React.ReactNode;
  className?: string;
  right?: React.ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-panel p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {sub && <p className="mt-0.5 text-xs text-mute">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  label,
  value,
  note,
  tone = "plain",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "plain" | "bad" | "good" | "warn";
}) {
  const color = { plain: "text-ink", bad: "text-accent", good: "text-ok", warn: "text-amber" }[tone];
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="eyebrow">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums ${color}`}>{value}</div>
      {note && <div className="mt-1 text-xs text-mute">{note}</div>}
    </div>
  );
}

export function Badge({ kind, children }: { kind: string; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    aging: "bg-amber/15 text-amber border-amber/40",
    near_threshold: "bg-accent/15 text-accent border-accent/40",
    broker: "bg-sky/15 text-sky border-sky/40",
    done: "bg-ok/15 text-ok border-ok/40",
    wait: "bg-panel2 text-mute border-line",
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles[kind] ?? styles.wait}`}
    >
      {children}
    </span>
  );
}

/** Says whether a statement comes straight from the data or is our own suggestion. */
export function Tag({ kind }: { kind: "fact" | "reco" | "human" }) {
  const map = {
    fact: ["From the data", "border-line bg-panel2 text-mute"],
    reco: ["Our recommendation", "border-brand/40 bg-brand/10 text-ok"],
    human: ["Human decision", "border-sky/30 bg-sky/10 text-sky"],
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium ${map[kind][1]}`}>
      <span className="h-1 w-1 rounded-full bg-current" />
      {map[kind][0]}
    </span>
  );
}

/** Evidence chip: the exact field and value a statement rests on. */
export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-sky/30 bg-sky/5 px-1.5 py-0.5 font-mono text-[11px] font-medium text-sky">
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const v =
    variant === "primary"
      ? "bg-ink text-white hover:opacity-90"
      : "border border-line bg-panel text-ink hover:bg-panel2";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${v}`}
    >
      {children}
    </button>
  );
}

export function Insight({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-sky/30 bg-sky/10 p-4 text-sm leading-relaxed">
      <span className="mr-2 font-semibold text-sky">{label}</span>
      {children}
    </div>
  );
}

/** Yellow banner shown while detect.flag_suspicious_claims is still the unwritten stub. */
export function RuleMissingBanner() {
  const { summary } = useStore();
  if (!summary?.near_threshold_rule_missing) return null;
  return (
    <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber/40 bg-amber/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
      <div>
        <span className="font-semibold text-amber">The near-threshold claim rule is flagging 0 claims.</span>{" "}
        <code className="rounded bg-panel2 px-1">flag_suspicious_claims()</code> in{" "}
        <code className="rounded bg-panel2 px-1">detect.py</code> has not been written yet. The aging-claim alert
        and the broker scorecard are working.
      </div>
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="mb-5 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-sm">
      <span className="font-semibold text-accent">Could not reach the API.</span> {error}. Is{" "}
      <code className="rounded bg-panel2 px-1">uvicorn api:app --port 8000</code> running?
    </div>
  );
}

export function Loading() {
  return <div className="py-16 text-center text-sm text-mute">Loading…</div>;
}

export function RuleSlider({
  name,
  label,
  format,
  compact,
}: {
  name: "threshold" | "window" | "band" | "multiple" | "aging_days";
  label: string;
  format: (v: number) => string;
  compact?: boolean;
}) {
  const { rules, bounds, setRule } = useStore();
  if (!rules || !bounds[name]) return null;
  const [min, max, step] = bounds[name];
  return (
    <label className="block">
      <div className={`flex items-baseline justify-between gap-2 ${compact ? "text-xs" : "text-sm"}`}>
        <span className="text-mute">{label}</span>
        <span className="font-semibold tabular-nums text-ink">{format(rules[name])}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={rules[name]}
        onChange={(e) => setRule({ [name]: Number(e.target.value) })}
      />
    </label>
  );
}

export function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`whitespace-nowrap px-3 py-2 text-xs font-medium text-mute ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

export function Td({
  children,
  right,
  className = "",
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 text-sm ${right ? "text-right tabular-nums" : "text-left"} ${className}`}>{children}</td>
  );
}
