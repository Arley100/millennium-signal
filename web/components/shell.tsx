"use client";

// The frame around every screen: a dark navigation rail on the left (grouped
// links, the decision-rule sliders and a live count of what they catch) and a
// top bar that always shows whether the system and its detections are running.
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  Clock,
  Database,
  FileText,
  LayoutDashboard,
  ListChecks,
  Radio,
  ScrollText,
  SlidersHorizontal,
} from "lucide-react";
import { ErrorBox, RuleSlider } from "@/components/ui";
import { money, useStore } from "@/lib/store";

// Remove a line here to take a screen out of the navigation.
const NAV = [
  {
    group: "Insights",
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/brief", label: "CFO brief", icon: FileText },
      { href: "/pattern", label: "The pattern", icon: Activity },
      { href: "/delays", label: "Claim delays", icon: Clock },
    ],
  },
  {
    group: "Operations",
    items: [
      { href: "/queue", label: "Review queue", icon: ListChecks },
      { href: "/rules", label: "Decision rules", icon: SlidersHorizontal },
      { href: "/log", label: "Action log", icon: ScrollText },
    ],
  },
  {
    group: "Support",
    items: [
      { href: "/data", label: "Data & cleaning", icon: Database },
      { href: "/guide", label: "Usage guide", icon: BookOpen },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { summary, error, saving, rules } = useStore();
  const active = summary ? 3 - (summary.near_threshold_rule_missing ? 1 : 0) : null;

  return (
    <div className="shell h-screen p-3">
      <div className="flex h-full overflow-hidden rounded-[22px] border border-line bg-panel shadow-sm">
        <aside className="rail no-print flex w-[252px] shrink-0 flex-col overflow-y-auto px-3 py-5">
          <div className="mb-5 flex items-center gap-2.5 px-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/15 text-brand">
              <Radio className="h-[18px] w-[18px]" />
            </span>
            <div>
              <div className="text-[15px] font-semibold leading-tight tracking-tight">Millennium Signal</div>
              <div className="text-[10.5px] text-mute">Where the money goes, and what to do</div>
            </div>
          </div>

          <nav>
            {NAV.map(({ group, items }) => (
              <div key={group} className="mb-3">
                <div className="eyebrow mb-1 px-2.5">{group}</div>
                {items.map(({ href, label, icon: Icon }) => {
                  const on = href === "/" ? path === "/" : path.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={on ? "page" : undefined}
                      className={`relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition ${
                        on ? "bg-panel2 font-medium text-ink" : "text-mute hover:bg-panel2 hover:text-ink"
                      }`}
                    >
                      {on && <span className="absolute -left-3 top-2 h-5 w-1 rounded-r bg-brand" />}
                      <Icon className={`h-4 w-4 ${on ? "text-brand" : ""}`} />
                      {label}
                      {href === "/queue" && summary && (
                        <span className="ml-auto rounded-full bg-line px-1.5 text-[11px] tabular-nums text-ink">
                          {summary.flagged_claims + summary.aging_claims}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="mt-1 border-t border-line pt-4">
            <div className="mb-2 flex items-center justify-between px-2.5">
              <span className="eyebrow">Decision rules</span>
              <span className={`text-[10px] text-mute transition-opacity ${saving ? "opacity-100" : "opacity-0"}`}>
                updating…
              </span>
            </div>
            <div className="space-y-2 px-2.5">
              <RuleSlider compact name="threshold" label="Senior-review threshold" format={(v) => money(v)} />
              <RuleSlider compact name="window" label="Early claim within" format={(v) => `${v} days`} />
              <RuleSlider compact name="band" label="Just under the line" format={(v) => `${v}% below`} />
              <RuleSlider compact name="multiple" label="Broker vs typical" format={(v) => `≥ ${v}×`} />
              <RuleSlider compact name="aging_days" label="Aging claim after" format={(v) => `${v} days`} />
            </div>
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <div className="eyebrow mb-2 px-2.5">What these rules catch</div>
            <dl className="space-y-1.5 px-2.5 text-sm">
              <Row label="Near-threshold claims" value={summary ? String(summary.flagged_claims) : "–"} color="text-accent" />
              <Row label="Aging claims" value={summary ? String(summary.aging_claims) : "–"} color="text-amber" />
              <Row label="Brokers flagged" value={summary ? summary.flagged_brokers.join(", ") || "none" : "–"} color="text-sky" />
            </dl>
          </div>

          <div className="mt-auto px-2.5 pt-6">
            <div className="eyebrow">Data reference</div>
            <div className="mt-1 text-xs">Extract · {summary?.extract_date ?? "…"}</div>
            <div className="text-[11px] text-mute">
              {summary ? `${summary.policies.toLocaleString()} policies · ${summary.claims.toLocaleString()} claims` : ""}
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="no-print flex items-center justify-between gap-4 border-b border-line px-8 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Pill ok={!error} label={error ? "API not reachable" : "API connected"} />
              {active !== null && (
                <Pill ok={active === 3} label={`${active} of 3 detections active`} />
              )}
              <Pill ok label="Human decides · nothing is denied automatically" />
            </div>
            <div className="text-right text-xs">
              <div className="font-semibold">Data as of {summary?.extract_date ?? "…"}</div>
              <div className="text-mute">Reviewer: {rules?.reviewer ?? "…"}</div>
            </div>
          </div>
          <main className="shell-main min-w-0 flex-1 overflow-y-auto bg-[#fafcfc]">
            <div className="mx-auto max-w-[1280px] p-8">
              <ErrorBox error={error} />
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-mute">
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-ok" : "bg-amber"}`} />
      {label}
    </span>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-mute">{label}</dt>
      <dd data-stat={label} className={`font-semibold tabular-nums ${color}`}>
        {value}
      </dd>
    </div>
  );
}
