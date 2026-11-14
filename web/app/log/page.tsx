"use client";

// Action log: every automatic action and every human decision, newest first.
import { useState } from "react";
import { Button, Card, Loading, PageHeader, Td, Th } from "@/components/ui";
import { api, useApi, useStore } from "@/lib/store";

type Row = { time: string; by: string; action: string; target: string; detail: string };

export default function LogPage() {
  const { refresh } = useStore();
  const { data } = useApi<{ rows: Row[] }>("/api/log");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!data) return <Loading />;

  async function reset() {
    setBusy(true);
    try {
      await api("/api/reset", { method: "POST" });
      refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const tone = (r: Row) =>
    r.by !== "system" ? "text-ok" : r.action.includes("Aging") || r.action.includes("Retention") || r.action.includes("VP of Claims") ? "text-amber" : "text-ink";

  return (
    <>
      <PageHeader title="Action log" sub="Every automatic action and every human decision, newest first. Nothing happens off the record." />
      <Card
        title={`${data.rows.length} entries`}
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
              {data.rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  <Td className="whitespace-nowrap font-mono text-[12px] text-mute">{r.time}</Td>
                  <Td className={r.by === "system" ? "text-mute" : "text-ok"}>{r.by}</Td>
                  <Td className={tone(r)}>{r.action}</Td>
                  <Td className="font-mono text-[13px]">{String(r.target).replace(/^(AGING|BROKER):/, "")}</Td>
                  <Td className="text-mute">{r.detail}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
