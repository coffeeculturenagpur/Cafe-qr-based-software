"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { authHeaders } from "../../lib/auth";
import { useClientAuth } from "../../lib/useClientAuth";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { Input } from "../ui/Input";
import { StaffShell } from "../StaffShell";
import { AppLoading } from "../AppLoading";
import { formatDatetimeLocal, startOfLocalDay } from "../../lib/datetimeLocal";

export default function StaffOrderHistory({ title, backHref, roleGate, dashboardLabel = "Back to dashboard" }) {
  const { token, user, ready: authReady } = useClientAuth();
  const [cafeIdOverride, setCafeIdOverride] = useState("");
  const cafeId = useMemo(() => cafeIdOverride || user?.cafeId || "", [cafeIdOverride, user?.cafeId]);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");
  const [status, setStatus] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authReady) return;
    if (roleGate && user?.role && user.role !== roleGate && user.role !== "super_admin") {
      window.location.href = backHref || "/";
    }
  }, [authReady, roleGate, user?.role, backHref]);

  useEffect(() => {
    const now = new Date();
    const start = startOfLocalDay(now);
    setFrom(formatDatetimeLocal(start));
    setTo(formatDatetimeLocal(now));
  }, []);

  const load = async () => {
    if (!cafeId) return;
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", new Date(from).toISOString());
      if (to) qs.set("to", new Date(to).toISOString());
      if (minTotal !== "") qs.set("minTotal", String(minTotal));
      if (maxTotal !== "") qs.set("maxTotal", String(maxTotal));
      if (status.trim()) qs.set("status", status.trim());
      qs.set("scope", "history");
      const q = qs.toString();
      const list = await apiFetch(`/api/orders/${cafeId}${q ? `?${q}` : ""}`, {
        headers: { ...(token ? authHeaders() : {}) },
      });
      setOrders(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  if (!authReady) {
    return (
      <StaffShell title={title} subtitle="Loading session…" contentClassName="mx-auto max-w-6xl">
        <AppLoading label="Loading" />
      </StaffShell>
    );
  }

  return (
    <StaffShell
      staffNav={{
        variant: "history",
        dashboardHref: backHref || "/",
        backLabel: dashboardLabel,
        onRefresh: load,
      }}
      title={title}
      subtitle="Filter past orders by date and amount."
      contentClassName="mx-auto max-w-6xl space-y-8 px-4 sm:px-6"
    >
      {!user?.cafeId && (
        <Card className="border border-orange-100 shadow-lg">
          <CardContent>
            <div className="text-sm font-semibold text-slate-800">Venue</div>
            <div className="mt-2 flex gap-2">
              <Input
                value={cafeIdOverride}
                onChange={(e) => setCafeIdOverride(e.target.value)}
                placeholder="cafeId (ObjectId)"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card id="staff-history-filters" className="border border-orange-100 shadow-lg">
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-xs font-semibold text-slate-500">From</div>
              <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">To</div>
              <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">Min total (INR)</div>
              <Input value={minTotal} onChange={(e) => setMinTotal(e.target.value)} placeholder="0" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">Max total (INR)</div>
              <Input value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} placeholder="optional" />
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">Status (comma-separated)</div>
            <Input
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="paid, served, ready"
            />
          </div>
          <Button onClick={load} disabled={!cafeId || loading}>
            {loading ? "Loading…" : "Apply filters"}
          </Button>
          {error && <div className="text-sm font-semibold text-red-700">{error}</div>}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {orders.map((o) => (
          <Card key={o._id} className="border border-slate-200 shadow-sm">
            <CardContent>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-slate-900">
                  #{String(o._id).slice(-6)} · Table {o.tableNumber}
                </div>
                <div className="text-xs font-semibold uppercase text-orange-700">{o.status}</div>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {o.createdAt ? new Date(o.createdAt).toLocaleString() : ""}
              </div>
              <div className="mt-2 text-sm text-slate-700">
                {o.customerName} · {o.phone}
              </div>
              {o.paymentMode && (
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  Payment: {String(o.paymentMode).toUpperCase()}
                </div>
              )}
              <div className="mt-2 flex justify-between text-sm font-semibold text-slate-900">
                <span>Total</span>
                <span>INR {Number(o.totalAmount || 0).toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {!loading && cafeId && orders.length === 0 && (
          <div className="text-sm text-slate-600">No orders match these filters.</div>
        )}
      </div>
    </StaffShell>
  );
}
