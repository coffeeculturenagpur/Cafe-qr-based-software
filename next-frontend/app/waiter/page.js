"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { isOrderInLocalToday, ordersTodayQueryString } from "../../lib/staffOrderRange";
import { filterWaiterLiveOrders, isWaiterLiveOrder } from "../../lib/staffOrderFilters";
import { maybeNotifyBrowser, playWaiterReady, requestNotificationPermission } from "../../lib/sounds";
import { motion, useReducedMotion } from "framer-motion";
import { authHeaders } from "../../lib/auth";
import { useClientAuth } from "../../lib/useClientAuth";
import { useMounted } from "../../lib/useMounted";
import { StaffShell } from "../../components/StaffShell";
import SoundControl from "../../components/SoundControl";
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

export default function WaiterPage() {
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
  const [readyNotice, setReadyNotice] = useState(null);
  const [cafeInfo, setCafeInfo] = useState(null);

  const stats = useMemo(() => {
    const total = orders.length;
    const ready = orders.filter((o) => o.status === "ready").length;
    const served = orders.filter((o) => o.status === "served").length;
    return { total, ready, served };
  }, [orders]);

  useEffect(() => {
    if (!authReady) return;
    if (!token) {
      window.location.href = "/waiter/login";
      return;
    }
    if (role && role !== "staff") {
      window.location.href = "/waiter/login";
    }
  }, [authReady, token, role]);

  const load = async () => {
    if (!cafeId) return;
    setLoading(true);
    setError("");
    try {
      const qs = ordersTodayQueryString();
      const list = await apiFetch(`/api/orders/${cafeId}?${qs}`, { headers: { ...(token ? authHeaders() : {}) } });
      setOrders(filterWaiterLiveOrders(Array.isArray(list) ? list : []));
    } catch (e) {
      setError(e.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

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

    const onOrder = (order) => {
      if (!isOrderInLocalToday(order)) return;
      if (!isWaiterLiveOrder(order)) {
        setOrders((prev) => prev.filter((o) => o._id !== order._id));
        return;
      }
      setOrders((prev) => upsertOrder(prev, order));
    };

    socket.on("NEW_ORDER", onOrder);
    socket.on("ORDER_UPDATED", onOrder);
    socket.on("ORDER_READY", (order) => {
      onOrder(order);
      playWaiterReady();
      maybeNotifyBrowser("Order ready to serve", `Table ${order?.tableNumber}`);
      setReadyNotice({
        id: order?._id,
        tableNumber: order?.tableNumber,
        customerName: order?.customerName,
      });
      setTimeout(() => setReadyNotice(null), 6000);
    });
    socket.on("ORDER_PAID", onOrder);

    return () => {
      socket.off("NEW_ORDER", onOrder);
      socket.off("ORDER_UPDATED", onOrder);
      socket.off("ORDER_READY");
      socket.off("ORDER_PAID", onOrder);
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
        const next = upsertOrder(prev, updated);
        return filterWaiterLiveOrders(next);
      });
    } catch (e) {
      setError(e.message || "Failed to update order");
    } finally {
      setLoading(false);
    }
  };

  const downloadReceiptPdf = (order) => {
    const itemsRows = order.items
      .map(
        (it) => `
          <tr>
            <td>${it.name}</td>
            <td class="qty">${it.qty}</td>
            <td class="price">INR ${(Number(it.price || 0) * Number(it.qty || 0)).toFixed(2)}</td>
          </tr>
        `
      )
      .join("");

    const orderIdShort = String(order._id).slice(-6);
    const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleString() : new Date().toLocaleString();
    const lineSum = order.items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0);
    const hasServerPricing = typeof order.subtotalAmount === "number" && typeof order.taxAmount === "number";
    const taxRate = Number(cafeInfo?.taxPercent || 0);
    const discountType = cafeInfo?.discountType || "percent";
    const discountValue = Number(cafeInfo?.discountValue || 0);
    const subtotal = hasServerPricing ? Number(order.subtotalAmount) : Number(order.totalAmount || lineSum);
    const tax = hasServerPricing ? Number(order.taxAmount) : (subtotal * taxRate) / 100;
    const discount = hasServerPricing
      ? Number(order.discountAmount || 0)
      : discountType === "fixed"
        ? discountValue
        : (subtotal * discountValue) / 100;
    const total = hasServerPricing ? Number(order.totalAmount || 0) : Math.max(0, subtotal + tax - discount);
    const cafeName = cafeInfo?.name || "QRDine";
    const cafeLogo = cafeInfo?.logoUrl || "";

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt #${orderIdShort}</title>
          <style>
            @page { size: 80mm auto; margin: 8mm; }
            body { font-family: "Arial", sans-serif; color: #111827; }
            h1 { font-size: 16px; margin: 0 0 6px; }
            .meta { font-size: 12px; margin-bottom: 10px; color: #374151; }
            .meta div { margin: 2px 0; }
            .logo { display: block; margin: 0 auto 8px; max-width: 120px; max-height: 60px; object-fit: contain; }
            .cafe-name { text-align: center; font-weight: 700; margin-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { padding: 6px 0; border-bottom: 1px dashed #e5e7eb; }
            th { text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280; }
            td.qty { text-align: center; width: 24px; }
            td.price { text-align: right; width: 70px; }
            .total { margin-top: 10px; display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; }
            .line { margin-top: 6px; display: flex; justify-content: space-between; font-size: 12px; color: #374151; }
            .footer { margin-top: 8px; font-size: 11px; color: #6b7280; text-align: center; }
          </style>
        </head>
        <body>
          ${cafeLogo ? `<img class="logo" src="${cafeLogo}" alt="Cafe logo" />` : ""}
          <div class="cafe-name">${cafeName}</div>
          <h1>Receipt</h1>
          <div class="meta">
            <div>Order: #${orderIdShort}</div>
            <div>Table: ${order.tableNumber}</div>
            <div>Customer: ${order.customerName || "Guest"}</div>
            <div>Phone: ${order.phone || "-"}</div>
            <div>Date: ${createdAt}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th class="qty">Qty</th>
                <th class="price">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>
          <div class="line">
            <span>Subtotal</span>
            <span>INR ${subtotal.toFixed(2)}</span>
          </div>
          <div class="line">
            <span>Tax (${taxRate.toFixed(2)}%)</span>
            <span>INR ${tax.toFixed(2)}</span>
          </div>
          <div class="line">
            <span>Discount (${discountType === "fixed" ? "INR" : `${discountValue.toFixed(2)}%`})</span>
            <span>INR ${discount.toFixed(2)}</span>
          </div>
          <div class="total">
            <span>Total</span>
            <span>INR ${total.toFixed(2)}</span>
          </div>
          <div class="footer">Generated by QRDine</div>
        </body>
      </html>
    `;

    const receiptWindow = window.open("", "_blank", "width=480,height=640");
    if (!receiptWindow) return;
    receiptWindow.document.open();
    receiptWindow.document.write(html);
    receiptWindow.document.close();
    receiptWindow.focus();
    setTimeout(() => receiptWindow.print(), 250);
  };

  const motionInitial = mounted && !reducedMotion ? { opacity: 0, y: 10 } : false;

  if (!authReady) {
    return (
      <StaffShell title="Waiter dashboard" subtitle="Loading…">
        <AppLoading label="Authenticating" />
      </StaffShell>
    );
  }

  return (
    <StaffShell
      staffNav={{
        variant: "waiter",
        onRefresh: load,
        historyHref: "/waiter/history",
      }}
      badge={
        <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-orange-700 shadow">
          Waiter Operations
        </span>
      }
      title="Waiter dashboard"
      subtitle="Track ready orders and update service status."
      actions={
        <>
          <SoundControl />
          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold text-slate-900">{stats.total}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Total</div>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold text-slate-900">{stats.ready}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Ready</div>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold text-slate-900">{stats.served}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Served</div>
            </div>
          </div>
          <div className="text-xs text-slate-600 mt-2">
            Paid orders move to History automatically.
          </div>
          <div className="text-xs text-slate-600 mt-1">Prepared = Ready</div>
        </>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={load} disabled={!cafeId || loading}>
          Refresh
        </Button>
        <div className="text-sm text-slate-600">
          Socket: <span className="font-semibold">{socketState}</span>
        </div>
        <Link
          href="/waiter/history"
          className="inline-flex items-center rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-800 shadow-sm hover:bg-orange-50"
        >
          History
        </Link>
        <Button type="button" variant="outline" className="text-xs" onClick={() => requestNotificationPermission()}>
          Enable alerts
        </Button>
      </div>

      {readyNotice && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow">
          Order ready for Table {readyNotice.tableNumber}{" "}
          {readyNotice.customerName ? `(${readyNotice.customerName})` : ""}
        </div>
      )}

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
                    {o.status}
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
                  <Button variant="outline" onClick={() => setStatus(o._id, "served")} disabled={loading}>
                    Served
                  </Button>
                  <Button variant="outline" onClick={() => setStatus(o._id, "paid")} disabled={loading}>
                    Paid
                  </Button>
                  <Button variant="outline" onClick={() => downloadReceiptPdf(o)} disabled={loading}>
                    Download PDF
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
