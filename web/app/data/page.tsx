"use client";

// Data & cleaning: what we changed in the raw exports, and why.
import { Card, Loading, PageHeader, Td, Th } from "@/components/ui";
import { useApi } from "@/lib/store";

type Step = { Step: string; "Rows affected": number; Why: string; "Effect on findings": string };

export default function DataPage() {
  const { data } = useApi<{ steps: Step[] }>("/api/cleaning");
  if (!data) return <Loading />;
  return (
    <>
      <PageHeader
        title="Data & cleaning"
        sub="Raw exports: policies.csv and claims.csv, pulled from Millennium Mutual's systems on Oct 31, 2026. No data dictionary was provided; meanings were inferred from the values."
      />
      <Card title="What we changed in the data, and why">
        <div className="overflow-auto rounded-xl border border-line">
          <table className="w-full border-collapse">
            <thead className="bg-panel2">
              <tr>
                <Th>Step</Th>
                <Th right>Rows affected</Th>
                <Th>Why</Th>
                <Th>Effect on findings</Th>
              </tr>
            </thead>
            <tbody>
              {data.steps.map((s) => (
                <tr key={s.Step} className="border-t border-line align-top">
                  <Td className="font-medium">{s.Step}</Td>
                  <Td right>{s["Rows affected"].toLocaleString()}</Td>
                  <Td className="text-mute">{s.Why}</Td>
                  <Td className="text-mute">{s["Effect on findings"]}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
