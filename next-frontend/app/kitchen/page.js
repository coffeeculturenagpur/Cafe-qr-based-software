"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { isOrderInLocalToday, ordersTodayQueryString } from "../../lib/staffOrderRange";
import { filterKitchenLiveOrders, isKitchenLiveOrder } from "../../lib/staffOrderFilters";
import { maybeNotifyBrowser, playKitchenNewOrder, requestNotificationPermission } from "../../lib/sounds";
import { motion, useReducedMotion } from "framer-motion";
import StaffAlertBanner from "../../components/StaffAlertBanner";
import { StaffShell } from "../../components/StaffShell";
import SoundControl from "../../components/SoundControl";
import { authHeaders } from "../../lib/auth";
import { useClientAuth } from "../../lib/useClientAuth";
import { useMounted } from "../../lib/useMounted";
import { connectCafeSocket } from "../../lib/socket";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { AppLoading } from "../../components/AppLoading";

function upsertOrder(list, order) {
  const idx = list.findIndex((x) => x._id === order._id);
  if (idx === -1) return [order, ...list];
  const copy = list.slice();
  copy[idx] = order;
  return copy;
}

export default function KitchenPage() {
  const { token, user, ready: authReady } = useClientAuth();
  const role = user?.role || "";
  const mounted = useMounted();
  const reducedMotion = useReducedMotion();

  const [cafeIdOverride, setCafeIdOverride] = useState("");
  const cafeId = useMemo(() => cafeIdOverride || user?.cafeId || "", [cafeIdOverride, user?.cafeId]);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [socketState, setSocketState] = useState("disconnected");
  const [cafeInfo, setCafeInfo] = useState(null);
  const [alertMsg, setAlertMsg] = useState("");

  const stats = useMemo(() => {
    const total = orders.length;
    const queue = orders.filter((o) => ["pending", "accepted"].includes(o.status)).length;
    const preparing = orders.filter((o) => ["preparing", "baking"].includes(o.status)).length;
    return { total, queue, preparing };
  }, [orders]);

  const load = async () => {
    if (!cafeId) return;
    setLoading(true);
    setError("");
    try {
      const qs = ordersTodayQueryString();
      const list = await apiFetch(`/api/orders/${cafeId}?${qs}`, { headers: { ...(token ? authHeaders() : {}) } });
      setOrders(filterKitchenLiveOrders(Array.isArray(list) ? list : []));
    } catch (e) {
      setError(e.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authReady) return;
    if (!token) {
      window.location.href = "/chef/login";
      return;
    }
    if (role && role !== "kitchen") {
      window.location.href = "/chef/login";
    }
  }, [authReady, token, role]);

  useEffect(() => {
    if (cafeId) load();
  }, [cafeId]);

  useEffect(() => {
    let cancelled = false;
    const loadCafe = async () => {
      if (!cafeId) return;
      try {
        const data = await apiFetch(`/api/cafe/${cafeId}`);
        if (!cancelled) setCafeInfo(data || null);
      } catch {
        if (!cancelled) setCafeInfo(null);
      }
    };
    loadCafe();
    return () => {
      cancelled = true;
    };
  }, [cafeId]);

  useEffect(() => {
    if (!cafeId) return;

    const socket = connectCafeSocket(cafeId);
    setSocketState("connecting");

    socket.on("connect", () => setSocketState("connected"));
    socket.on("disconnect", () => setSocketState("disconnected"));

    const merge = (order) => {
      if (!isOrderInLocalToday(order)) return;
      if (!isKitchenLiveOrder(order)) {
        setOrders((prev) => prev.filter((o) => o._id !== order._id));
        return;
      }
      setOrders((prev) => upsertOrder(prev, order));
    };
    const onNewOrder = (order) => {
      if (!isOrderInLocalToday(order)) return;
      if (!isKitchenLiveOrder(order)) return;
      playKitchenNewOrder();
      const line = order?.items?.map((i) => `${i.name}×${i.qty}`).join(", ") || "";
      setAlertMsg(`New order · Table ${order.tableNumber}${line ? ` · ${line.slice(0, 80)}` : ""}`);
      setTimeout(() => setAlertMsg(""), 8000);
      maybeNotifyBrowser("New kitchen order", `Table ${order.tableNumber}`);
      merge(order);
    };
    socket.on("NEW_ORDER", onNewOrder);
    socket.on("ORDER_UPDATED", merge);

    return () => {
      socket.off("NEW_ORDER", onNewOrder);
      socket.off("ORDER_UPDATED", merge);
      socket.disconnect();
    };
  }, [cafeId]);

  const setStatus = async (orderId, status) => {
    setLoading(true);
    setError("");
    try {
      const updated = await apiFetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { ...(token ? authHeaders() : {}) },
        body: JSON.stringify({ status }),
      });
      setOrders((prev) => {
        const next = prev.map((o) => (o._id === updated._id ? updated : o));
        return filterKitchenLiveOrders(next);
      });
    } catch (e) {
      setError(e.message || "Failed to update order");
    } finally {
      setLoading(false);
    }
  };

  const motionInitial = mounted && !reducedMotion ? { opacity: 0, y: 10 } : false;

  if (!authReady) {
    return (
      <StaffShell title="Kitchen dashboard" subtitle="Loading…">
        <AppLoading label="Authenticating" />
      </StaffShell>
    );
  }

  return (
    <StaffShell
      staffNav={{
        variant: "kitchen",
        onRefresh: load,
        historyHref: "/kitchen/history",
      }}
      badge={
        <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-orange-700 shadow">
          Kitchen Operations
        </span>
      }
      title="Kitchen dashboard"
      subtitle="Live orders, prep status, and handoff tracking."
      actions={
        <>
          <SoundControl />
          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold text-slate-900">{stats.total}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Active</div>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold text-slate-900">{stats.queue}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Queue</div>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold text-slate-900">{stats.preparing}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Preparing</div>
            </div>
          </div>
          <div className="text-xs text-slate-600 mt-2">Prepared = Ready</div>
        </>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="text-sm text-slate-600">
          Socket: <span className="font-semibold">{socketState}</span>
        </div>
        <Button variant="outline" onClick={load} disabled={!cafeId || loading}>
          Refresh
        </Button>
        <Button type="button" variant="outline" className="text-xs" onClick={() => requestNotificationPermission()}>
          Enable alerts
        </Button>
        <Link
          href="/kitchen/history"
          className="inline-flex items-center rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-800 shadow-sm hover:bg-orange-50"
        >
          History
        </Link>
      </div>

      {!user?.cafeId && (
        <Card className="mb-6 border border-orange-100 shadow-xl">
          <CardContent>
            <div className="font-bold">Cafe scope</div>
            <div className="mt-1 text-sm text-gray-600">Enter a cafeId to view orders.</div>
            <div className="mt-3 flex gap-2">
              <Input
                value={cafeIdOverride}
                onChange={(e) => setCafeIdOverride(e.target.value)}
                placeholder="cafeId (ObjectId)"
              />
              <Button variant="outline" onClick={load} disabled={!cafeIdOverride || loading}>
                Load
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {alertMsg && <StaffAlertBanner message={alertMsg} variant="warn" />}

      {error && <div className="text-red-700 font-semibold">{error}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {orders.map((o) => (
          <motion.div key={o._id} initial={motionInitial} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Card className="border border-orange-100 shadow-lg">
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-extrabold text-slate-900">Table {o.tableNumber}</div>
                    <div className="text-sm text-gray-600">
                      {o.customerName} - {o.phone}
                    </div>
                  </div>
                  <div className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase text-orange-700">
                    {o.status === "baking" ? "preparing" : o.status}
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-sm">
                  {o.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>
                        {it.name} x {it.qty}
                      </span>
                      <span>INR {(it.price * it.qty).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {o.paymentMode && (
                  <div className="mt-2 text-xs font-semibold text-slate-600">
                    Payment: {String(o.paymentMode).toUpperCase()}
                  </div>
                )}

                {(() => {
                  const lineSum = o.items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0);
                  const hasServerPricing = typeof o.subtotalAmount === "number" && typeof o.taxAmount === "number";
                  const subtotal = hasServerPricing ? Number(o.subtotalAmount) : Number(o.totalAmount || lineSum);
                  const discount = typeof o.discountAmount === "number" ? Number(o.discountAmount) : 0;
                  const taxRate = Number(cafeInfo?.taxPercent || 0);
                  const taxAmount = hasServerPricing ? Number(o.taxAmount) : subtotal * (taxRate / 100);
                  const totalFinal = hasServerPricing ? Number(o.totalAmount || 0) : subtotal + taxAmount;
                  return (
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal</span>
                        <span>INR {subtotal.toFixed(2)}</span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Discount</span>
                          <span>- INR {discount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600">
                        <span>Tax {!hasServerPricing && taxRate ? `(${taxRate}%)` : ""}</span>
                        <span>INR {taxAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-extrabold text-slate-900">
                        <span>Total</span>
                        <span>INR {totalFinal.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setStatus(o._id, "accepted")} disabled={loading}>
                    Accepted
                  </Button>
                  <Button variant="outline" onClick={() => setStatus(o._id, "preparing")} disabled={loading}>
                    Preparing
                  </Button>
                  <Button variant="outline" onClick={() => setStatus(o._id, "ready")} disabled={loading}>
                    Ready
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {!loading && cafeId && orders.length === 0 && <div className="text-gray-700">No orders yet.</div>}
    </StaffShell>
  );
}
