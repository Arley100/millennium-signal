"use client";

// Shared state for the whole app: the decision rules (sliders), the headline
// summary, and a "version" number that tells every screen to re-fetch its data
// after a rule changes or a decision is recorded.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type Rules = {
  threshold: number;
  window: number;
  band: number;
  multiple: number;
  aging_days: number;
  reviewer: string;
};

export type Summary = {
  extract_date: string;
  policies: number;
  claims: number;
  policies_ytd_2026: number;
  policies_ytd_2025: number;
  growth: number;
  loss_ratio: number;
  loss_ratio_ex_flagged: number;
  flagged_claims: number;
  flagged_paid: number;
  flagged_brokers: string[];
  aging_claims: number;
  near_threshold_rule_missing: boolean;
  rules: Rules;
};

type Bounds = Record<string, [number, number, number]>;

type Store = {
  rules: Rules | null;
  defaults: Rules | null;
  bounds: Bounds;
  summary: Summary | null;
  version: number;
  error: string | null;
  saving: boolean;
  setRule: (patch: Partial<Rules>) => void;
  refresh: () => void;
};

const Ctx = createContext<Store | null>(null);

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [rules, setRules] = useState<Rules | null>(null);
  const [defaults, setDefaults] = useState<Rules | null>(null);
  const [bounds, setBounds] = useState<Bounds>({});
  const [summary, setSummary] = useState<Summary | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Rules | null>(null);

  const refresh = useCallback(() => {
    api<Summary>("/api/summary")
      .then((s) => {
        setSummary(s);
        setError(null);
        setVersion((v) => v + 1);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    api<{ rules: Rules; bounds: Bounds; defaults: Rules }>("/api/rules")
      .then((r) => {
        setRules(r.rules);
        latest.current = r.rules;
        setBounds(r.bounds);
        setDefaults(r.defaults);
      })
      .catch((e) => setError(String(e.message ?? e)));
    refresh();
  }, [refresh]);

  const setRule = useCallback((patch: Partial<Rules>) => {
    if (!latest.current) return;
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setRules(next);
    setSaving(true);
    if (timer.current) clearTimeout(timer.current);
    // Wait a moment so dragging a slider sends one request, not fifty.
    timer.current = setTimeout(() => {
      api<Summary>("/api/rules", { method: "PUT", body: JSON.stringify(latest.current) })
        .then((s) => {
          setSummary(s);
          setError(null);
          setVersion((v) => v + 1);
        })
        .catch((e) => setError(String(e.message ?? e)))
        .finally(() => setSaving(false));
    }, 180);
  }, []);

  return (
    <Ctx.Provider value={{ rules, defaults, bounds, summary, version, error, saving, setRule, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}

/** Fetch a screen's data and re-fetch whenever the rules or decisions change. */
export function useApi<T>(path: string): { data: T | null; error: string | null } {
  const { version } = useStore();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api<T>(path)
      .then((d) => {
        if (alive) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => alive && setError(String(e.message ?? e)));
    return () => {
      alive = false;
    };
  }, [path, version]);
  return { data, error };
}

export const pct = (x: number | null | undefined, digits = 0) =>
  x == null ? "–" : `${(x * 100).toFixed(digits)}%`;
export const money = (x: number | null | undefined) =>
  x == null ? "–" : `$${Math.round(x).toLocaleString("en-US")}`;
export const int = (x: number | null | undefined) => (x == null ? "–" : Math.round(x).toLocaleString("en-US"));
