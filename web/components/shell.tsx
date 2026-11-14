"use client";

// The frame around every screen: navigation on the left, with the decision
// rules (sliders) and a live count of what they catch always visible.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Clock, Database, LayoutDashboard, ListChecks, Radio, ScrollText, SlidersHorizontal } from "lucide-react";
import { ErrorBox, RuleSlider } from "@/components/ui";
import { money, useStore } from "@/lib/store";

// Remove a screen from this list to take it out of the navigation.
const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/pattern", label: "The pattern", icon: Activity },
  { href: "/queue", label: "Review queue", icon: ListChecks },
  { href: "/delays", label: "Claim delays", icon: Clock },
  { href: "/rules", label: "Decision rules", icon: SlidersHorizontal },
  { href: "/log", label: "Action log", icon: ScrollText },
  { href: "/data", label: "Data & cleaning", icon: Database },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { summary, error, saving } = useStore();
  return (
    <div className="flex h-screen">
      <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-line bg-panel/60 p-4">
        <div className="mb-1 flex items-center gap-2 px-1">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
            <Radio className="h-4 w-4" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Millennium Signal</span>
        </div>
        <p className="mb-4 px-1 text-[11px] text-mute">
          {summary
            ? `Data extracted ${summary.extract_date} · ${summary.policies.toLocaleString()} policies · ${summary.claims.toLocaleString()} claims`
            : "Loading data…"}
        </p>

        <nav className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                  active ? "bg-accent/15 font-medium text-ink" : "text-mute hover:bg-white/5 hover:text-ink"
                }`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
                {label}
                {href === "/queue" && summary && (
                  <span className="ml-auto rounded-full bg-white/10 px-1.5 text-[11px] tabular-nums text-ink">
                    {summary.flagged_claims + summary.aging_claims}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-mute">Decision rules</span>
            <span className={`text-[10px] text-mute transition-opacity ${saving ? "opacity-100" : "opacity-0"}`}>
              updating…
            </span>
          </div>
          <div className="space-y-2 px-1">
            <RuleSlider compact name="threshold" label="Senior-review threshold" format={(v) => money(v)} />
            <RuleSlider compact name="window" label="Early claim within" format={(v) => `${v} days`} />
            <RuleSlider compact name="band" label="Just under the line" format={(v) => `${v}% below`} />
            <RuleSlider compact name="multiple" label="Broker vs typical" format={(v) => `≥ ${v}×`} />
            <RuleSlider compact name="aging_days" label="Aging claim after" format={(v) => `${v} days`} />
          </div>
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-mute">
            What these rules catch
          </div>
          <dl className="space-y-1.5 px-1 text-sm">
            <Row label="Near-threshold claims" value={summary ? String(summary.flagged_claims) : "–"} color="text-accent" />
            <Row label="Aging claims" value={summary ? String(summary.aging_claims) : "–"} color="text-amber" />
            <Row
              label="Brokers flagged"
              value={summary ? summary.flagged_brokers.join(", ") || "none" : "–"}
              color="text-sky"
            />
          </dl>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1280px] p-8">
          <ErrorBox error={error} />
          {children}
        </div>
      </main>
    </div>
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
