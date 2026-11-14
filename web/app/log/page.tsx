"use client";

// Action log: every automatic action and every human decision, newest first.
import { useState } from "react";
import { Button, Card, Loading, PageHeader, Td, Th } from "@/components/ui";
import { api, useApi, useStore } from "@/lib/store";

type Row = { time: string; by: string; action: string; target: string; detail: string };

const isAging = (r: Row) => /Aging|Retention|VP of Claims/.test(r.action) || String(r.target).startsWith("AGING:");
const FILTERS: { key: string; label: string; test: (r: Row) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "human", label: "Human decisions", test: (r) => r.by !== "system" },
  { key: "aging", label: "Aging claim", test: isAging },
  { key: "new", label: "New claims", test: (r) => String(r.target).startsWith("NEW-") },
  { key: "broker", label: "Broker", test: (r) => /Broker|broker/.test(r.action) || String(r.target).startsWith("BROKER:") },
];

export default function LogPage() {
  const { refresh, reload } = useStore();
  const { data } = useApi<{ rows: Row[] }>("/api/log");
  const [filter, setFilter] = useState("all");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!data) return <Loading />;

  async function reset() {
    setBusy(true);
    try {
      await api("/api/reset", { method: "POST" });
      reload();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const rows = data.rows.filter(FILTERS.find((f) => f.key === filter)!.test);
  const tone = (r: Row) => (r.by !== "system" ? "text-ok" : isAging(r) ? "text-amber" : "text-ink");

  return (
    <>
      <PageHeader title="Action log" sub="Every automatic action and every human decision, newest first. Nothing happens off the record." />
      <Card
        title={`${rows.length} of ${data.rows.length} entries`}
        right={
          <div className="flex items-center gap-2">
            <Button onClick={refresh}>Refresh</Button>
            {confirming ? (
              <>
                <span className="text-xs text-mute">Clear log, decisions, test claims and saved rules?</span>
                <Button variant="primary" disabled={busy} onClick={reset}>
                  Yes, reset
                </Button>
                <Button onClick={() => setConfirming(false)}>Cancel</Button>
              </>
            ) : (
              <Button onClick={() => setConfirming(true)}>Reset demo</Button>
            )}
          </div>
        }
      >
        <div className="mb-3 flex w-fit gap-1 rounded-lg border border-line bg-panel2 p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-2.5 py-1 text-xs transition ${
                filter === f.key ? "bg-panel text-ink shadow-sm" : "text-mute hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="max-h-[640px] overflow-auto rounded-xl border border-line">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-panel2">
              <tr>
                <Th>Time</Th>
                <Th>By</Th>
                <Th>Action</Th>
                <Th>Target</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  <Td className="whitespace-nowrap font-mono text-[12px] text-mute">{r.time}</Td>
                  <Td className={r.by === "system" ? "text-mute" : "text-ok"}>{r.by}</Td>
                  <Td className={tone(r)}>{r.action}</Td>
                  <Td className="font-mono text-[13px]">{String(r.target).replace(/^(AGING|BROKER):/, "")}</Td>
                  <Td className="text-mute">{r.detail}</Td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-sm text-mute">
                    No entries of this kind yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
