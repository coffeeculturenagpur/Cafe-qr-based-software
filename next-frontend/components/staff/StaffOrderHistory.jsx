"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";
import { authHeaders } from "../../lib/auth";
import { useClientAuth } from "../../lib/useClientAuth";
import { isCigaretteOrder } from "../../lib/staffOrderFilters";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { Input } from "../ui/Input";
import { StaffShell } from "../StaffShell";
import { AppLoading } from "../AppLoading";
import { formatDatetimeLocal, startOfLocalDay } from "../../lib/datetimeLocal";
import { getCigaretteSalePrice } from "../../lib/cigaretteMenu";

function cigaretteHistoryTotal(order) {
  return (order?.items || []).reduce(
    (sum, item) => sum + getCigaretteSalePrice(item) * Number(item?.qty || 0),
    0
  );
}

function HistoryOrderCard({ order }) {
  const cigarette = isCigaretteOrder(order);
  const manual = String(order.source || "").toLowerCase() === "manual";
  const tableLabel = Number(order.tableNumber || 0) > 0 ? `Table ${order.tableNumber}` : "Walk-in";

  return (
    <Card className="min-w-0 border border-slate-200 shadow-sm">
      <CardContent>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 break-words font-bold text-slate-900">
            #{String(order._id).slice(-6)} · {tableLabel}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cigarette ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              {cigarette ? "Cigarette" : "Food"}
            </span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${manual ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
              {manual ? "Manual order" : "QR scanned"}
            </span>
            <div className="text-xs font-semibold uppercase text-orange-700">{order.status}</div>
          </div>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {order.createdAt ? new Date(order.createdAt).toLocaleString() : ""}
        </div>
        {!cigarette && (
          <div className="mt-2 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
            <div><span className="font-semibold text-slate-500">Customer:</span> {order.customerName || "-"}</div>
            <div><span className="font-semibold text-slate-500">Phone:</span> {order.phone || "-"}</div>
          </div>
        )}
        {Array.isArray(order.items) && order.items.length > 0 ? (
          <div className="mt-2 break-words text-xs text-slate-600">
            {order.items.map((item) => `${item.name} ×${item.qty}`).join(" · ")}
          </div>
        ) : null}
        {order.paymentMode ? (
          <div className="mt-1 text-xs font-semibold text-slate-500">
            Payment: {String(order.paymentMode).toUpperCase()}
          </div>
        ) : null}
        {order.notes ? (
          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Order note</div>
            <div className="mt-1 break-words">{order.notes}</div>
          </div>
        ) : null}
        <div className="mt-2 flex justify-between gap-2 text-sm font-semibold text-slate-900">
          <span>Total</span>
          <span className="shrink-0">INR {(cigarette ? cigaretteHistoryTotal(order) : Number(order.totalAmount || 0)).toFixed(2)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StaffOrderHistory({ title, backHref, roleGate, dashboardLabel = "Back to dashboard", showPaymentNotes = false }) {
  const { token, user, ready: authReady } = useClientAuth();
  const autoLoadedRef = useRef("");
  const [cafeIdOverride, setCafeIdOverride] = useState("");
  const cafeId = useMemo(() => cafeIdOverride || user?.cafeId || "", [cafeIdOverride, user?.cafeId]);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");
  const [status, setStatus] = useState("");
  /** @type {"all" | "food" | "cigarette"} */
  const [orderType, setOrderType] = useState("all");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paidNotes, setPaidNotes] = useState([]);
  const regularOrders = useMemo(() => orders.filter((order) => !isCigaretteOrder(order)), [orders]);
  const cigaretteOrders = useMemo(() => orders.filter(isCigaretteOrder), [orders]);

  useEffect(() => {
    if (!showPaymentNotes || !cafeId || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`chef-customer-notes:${cafeId}`);
      const notes = raw ? JSON.parse(raw) : [];
      setPaidNotes(Array.isArray(notes) ? notes.filter((note) => note?.status === "paid") : []);
    } catch {
      setPaidNotes([]);
    }
  }, [cafeId, showPaymentNotes]);

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
      qs.set("orderType", orderType || "all");
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

  useEffect(() => {
    if (!authReady || !cafeId || !from || !to) return;
    const key = `${cafeId}:${from}:${to}:${orderType}`;
    if (autoLoadedRef.current === key) return;
    autoLoadedRef.current = key;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, cafeId, from, to, orderType]);

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
      subtitle="Filter past orders by date, type, and amount."
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-slate-500">Order type</div>
              <select
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 p-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300/70 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100"
                value={orderType}
                onChange={(e) => setOrderType(e.target.value)}
              >
                <option value="all">All orders</option>
                <option value="food">Food only</option>
                <option value="cigarette">Cigarettes only</option>
              </select>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">Status (comma-separated)</div>
              <Input
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="paid, served, ready"
              />
            </div>
          </div>
          <Button onClick={load} disabled={!cafeId || loading}>
            {loading ? "Loading…" : "Apply filters"}
          </Button>
          {error && <div className="text-sm font-semibold text-red-700">{error}</div>}
        </CardContent>
      </Card>

      {showPaymentNotes ? (
        <Card className="border border-emerald-100 shadow-lg">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-lg font-bold text-slate-900">Paid payment notes</div>
                <div className="mt-1 text-sm text-slate-500">Notes marked as paid by the chef.</div>
              </div>
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                {paidNotes.length} paid
              </div>
            </div>
            {paidNotes.length ? (
              <div className="mt-4 space-y-3">
                {paidNotes.map((note) => (
                  <div key={note.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900">{note.customerName}</div>
                        <div className="mt-1 text-xs text-slate-500">{note.phone || "No phone number"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-semibold uppercase text-emerald-700">Paid</div>
                        <div className="font-black text-slate-900">INR {Number(note.amountDue || 0).toFixed(2)}</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-slate-700">{note.note}</div>
                    <div className="mt-2 text-xs text-slate-500">
                      Added {note.createdAt ? new Date(note.createdAt).toLocaleString() : ""}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                No paid payment notes yet.
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm lg:col-start-1 lg:row-start-1">
          <h2 className="font-black text-slate-900">Regular item orders</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{regularOrders.length}</span>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 shadow-sm lg:col-start-2 lg:row-start-1">
          <h2 className="font-black text-amber-950">Cigarette orders</h2>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-amber-800">{cigaretteOrders.length}</span>
        </div>
        <div className="col-span-full grid min-w-0 gap-5 lg:grid-cols-2">
          <div className="min-w-0 space-y-3">
            {regularOrders.map((order) => <HistoryOrderCard key={order._id} order={order} />)}
            {!loading && cafeId && regularOrders.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600">No regular orders match these filters.</div>
            )}
          </div>
          <div className="min-w-0 space-y-3">
            {cigaretteOrders.map((order) => <HistoryOrderCard key={order._id} order={order} />)}
            {!loading && cafeId && cigaretteOrders.length === 0 && (
              <div className="rounded-2xl border border-dashed border-amber-300 px-4 py-8 text-center text-sm text-amber-800">No cigarette orders match these filters.</div>
            )}
          </div>
        </div>
        {/* Legacy single-grid renderer retained below for reference; independent columns render above. */}
        {[].map((o) => {
          const cigarette = isCigaretteOrder(o);
          const manual = String(o.source || "").toLowerCase() === "manual";
          const tableLabel =
            Number(o.tableNumber || 0) > 0 ? `Table ${o.tableNumber}` : "Walk-in";
          return (
            <Card key={o._id} className={`min-w-0 border border-slate-200 shadow-sm ${cigarette ? "lg:col-start-2" : "lg:col-start-1"}`}>
              <CardContent>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-slate-900">
                    #{String(o._id).slice(-6)} · {tableLabel}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {cigarette ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                        Cigarette
                      </span>
                    ) : (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        Food
                      </span>
                    )}
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${manual ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
                      {manual ? "Manual order" : "QR scanned"}
                    </span>
                    <div className="text-xs font-semibold uppercase text-orange-700">{o.status}</div>
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {o.createdAt ? new Date(o.createdAt).toLocaleString() : ""}
                </div>
                {!cigarette && (
                  <div className="mt-2 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                  <div><span className="font-semibold text-slate-500">Customer:</span> {o.customerName || "-"}</div>
                  <div><span className="font-semibold text-slate-500">Phone:</span> {o.phone || "-"}</div>
                </div>
                )}
                {Array.isArray(o.items) && o.items.length > 0 ? (
                  <div className="mt-2 text-xs text-slate-600">
                    {o.items
                      .map((it) => `${it.name} ×${it.qty}`)
                      .join(" · ")}
                  </div>
                ) : null}
                {o.paymentMode && (
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    Payment: {String(o.paymentMode).toUpperCase()}
                  </div>
                )}
                {o.notes ? (
                  <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Order note</div>
                    <div className="mt-1 break-words">{o.notes}</div>
                  </div>
                ) : null}
                <div className="mt-2 flex justify-between text-sm font-semibold text-slate-900">
                  <span>Total</span>
                  <span>INR {(cigarette ? cigaretteHistoryTotal(o) : Number(o.totalAmount || 0)).toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </StaffShell>
  );
}
