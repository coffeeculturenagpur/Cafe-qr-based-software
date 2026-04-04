"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { getOrderStatusPalette } from "../../lib/orderStatusPalette";

function upsertOrder(list, order) {
  const idx = list.findIndex((x) => x._id === order._id);
  if (idx === -1) return [order, ...list];
  const copy = list.slice();
  copy[idx] = order;
  return copy;
}

function getOrderTotal(order, cafeInfo) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const lineSum = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  const hasServerPricing = typeof order?.subtotalAmount === "number" && typeof order?.taxAmount === "number";
  const taxRate = Number(cafeInfo?.taxPercent || 0);
  const subtotal = hasServerPricing ? Number(order.subtotalAmount) : Number(order?.totalAmount || lineSum);
  const discount = typeof order?.discountAmount === "number" ? Number(order.discountAmount) : 0;
  const tax = hasServerPricing ? Number(order.taxAmount || 0) : subtotal * (taxRate / 100);
  return hasServerPricing ? Number(order?.totalAmount || 0) : Math.max(0, subtotal + tax - discount);
}

export default function WaiterPage() {
  const { token, user, ready: authReady } = useClientAuth();
  const role = user?.role || "";
  const mounted = useMounted();
  const reducedMotion = useReducedMotion();

  const [cafeIdOverride, setCafeIdOverride] = useState("");
  const cafeId = useMemo(() => cafeIdOverride || user?.cafeId || "", [cafeIdOverride, user?.cafeId]);

  const [orders, setOrders] = useState([]);
  const [todayOrders, setTodayOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [socketState, setSocketState] = useState("disconnected");
  const [readyNotice, setReadyNotice] = useState(null);
  const [cafeInfo, setCafeInfo] = useState(null);

  const stats = useMemo(() => {
    const total = orders.length;
    const ready = orders.filter((o) => o.status === "ready").length;
    const served = orders.filter((o) => o.status === "served").length;
    const todayTotalOrders = todayOrders.length;
    const todayRevenue = todayOrders
      .filter((o) => String(o?.status || "").toLowerCase() !== "rejected")
      .reduce((sum, order) => sum + getOrderTotal(order, cafeInfo), 0);
    return { total, ready, served, todayTotalOrders, todayRevenue };
  }, [orders, todayOrders, cafeInfo]);

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

  const load = useCallback(async () => {
    if (!cafeId) return;
    setLoading(true);
    setError("");
    try {
      const qs = ordersTodayQueryString();
      const list = await apiFetch(`/api/orders/${cafeId}?${qs}`, { headers: { ...(token ? authHeaders() : {}) } });
      const normalizedList = Array.isArray(list) ? list : [];
      setTodayOrders(normalizedList);
      setOrders(filterWaiterLiveOrders(normalizedList));
    } catch (e) {
      setError(e.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [cafeId, token]);

  useEffect(() => {
    if (cafeId) load();
  }, [cafeId, load]);

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
      setTodayOrders((prev) => upsertOrder(prev, order));
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
      setTodayOrders((prev) => upsertOrder(prev, updated));
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
            <td class="item-name">${it.name}</td>
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
    const orderNote = typeof order?.notes === "string" ? order.notes.trim() : "";

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Receipt #${orderIdShort}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 3mm;
            }

            * {
              box-sizing: border-box;
            }

            html, body {
              margin: 0;
              padding: 0;
              background: #fff;
              color: #111827;
              font-family: "Courier New", Courier, monospace;
              font-size: 11px;
              line-height: 1.35;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            body {
              width: 74mm;
              margin: 0 auto;
              padding: 2mm 0;
            }

            h1 {
              margin: 0;
              font-size: 15px;
              text-align: center;
              letter-spacing: 0.04em;
            }

            .center {
              text-align: center;
            }

            .logo {
              display: block;
              margin: 0 auto 6px;
              max-width: 110px;
              max-height: 48px;
              object-fit: contain;
            }

            .cafe-name {
              margin-bottom: 4px;
              font-size: 14px;
              font-weight: 700;
              text-align: center;
              text-transform: uppercase;
              word-break: break-word;
            }

            .meta {
              margin-top: 8px;
            }

            .meta div {
              margin: 1px 0;
              word-break: break-word;
            }

            .divider {
              margin: 8px 0;
              border-top: 1px dashed #111827;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }

            th, td {
              padding: 4px 0;
              vertical-align: top;
            }

            th {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.04em;
              text-align: left;
              border-bottom: 1px dashed #111827;
            }

            .item-name {
              width: 58%;
              padding-right: 6px;
              word-break: break-word;
            }

            .qty {
              width: 12%;
              text-align: center;
            }

            .price {
              width: 30%;
              text-align: right;
              white-space: nowrap;
            }

            .summary {
              margin-top: 8px;
            }

            .line {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 12px;
              margin-top: 4px;
            }

            .line span:first-child {
              flex: 1 1 auto;
            }

            .line span:last-child {
              flex: 0 0 auto;
              white-space: nowrap;
              text-align: right;
            }

            .total {
              margin-top: 6px;
              padding-top: 6px;
              border-top: 1px dashed #111827;
              font-size: 13px;
              font-weight: 700;
            }

            .note-box {
              margin-top: 8px;
              padding-top: 6px;
              border-top: 1px dashed #111827;
            }

            .note-title {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.04em;
            }

            .note-text {
              margin-top: 3px;
              word-break: break-word;
              white-space: pre-wrap;
            }

            .footer {
              margin-top: 10px;
              padding-top: 6px;
              border-top: 1px dashed #111827;
              text-align: center;
              font-size: 10px;
            }

            @media print {
              html, body {
                width: 80mm;
              }

              body {
                width: 74mm;
              }
            }
          </style>
        </head>
        <body>
          ${cafeLogo ? `<img class="logo" src="${cafeLogo}" alt="Cafe logo" />` : ""}
          <div class="cafe-name">${cafeName}</div>
          <h1>Receipt</h1>
          <div class="center">--------------------------------</div>
          <div class="meta">
            <div>Order: #${orderIdShort}</div>
            <div>Table: ${order.tableNumber}</div>
            <div>Customer: ${order.customerName || "Guest"}</div>
            <div>Phone: ${order.phone || "-"}</div>
            <div>Date: ${createdAt}</div>
          </div>
          <div class="divider"></div>
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
          <div class="summary">
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
            <div class="line total">
              <span>Total</span>
              <span>INR ${total.toFixed(2)}</span>
            </div>
          </div>
          ${orderNote ? `
            <div class="note-box">
              <div class="note-title">Order note</div>
              <div class="note-text">${orderNote}</div>
            </div>
          ` : ""}
          <div class="footer">
            <div>Payment: ${String(order.paymentMode || "cash").toUpperCase()}</div>
            <div>Generated by Coffee Culture</div>
          </div>
        </body>
      </html>
    `;

    const receiptWindow = window.open("", "_blank", "width=420,height=720");
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
        </>
      }
      contentClassName="mx-auto w-full max-w-6xl"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold text-slate-900">{stats.todayTotalOrders}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Today's Orders</div>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold text-slate-900">INR {stats.todayRevenue.toFixed(0)}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Today's Revenue</div>
            </div>
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
          <Button variant="outline" onClick={load} disabled={!cafeId || loading} className="min-w-[110px]">
            Refresh
          </Button>
          <div className="min-w-0 text-sm text-slate-600">
            Socket: <span className="font-semibold">{socketState}</span>
          </div>
          <Link
            href="/waiter/history"
            className="inline-flex items-center rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-800 shadow-sm hover:bg-orange-50"
          >
            History
          </Link>
          <Button
            type="button"
            variant="outline"
            className="min-w-[140px] text-xs sm:text-sm"
            onClick={() => requestNotificationPermission()}
          >
            Enable alerts
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
          <span>Paid orders move to History automatically.</span>
          <span>Prepared = Ready.</span>
        </div>

        {readyNotice && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow">
            Order ready for Table {readyNotice.tableNumber}{" "}
            {readyNotice.customerName ? `(${readyNotice.customerName})` : ""}
          </div>
        )}

        {!user?.cafeId && (
          <Card className="border border-orange-100 shadow-xl">
            <CardContent>
              <div className="font-bold">Cafe scope</div>
              <div className="mt-1 text-sm text-gray-600">Enter a cafeId to view orders.</div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
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
          {orders.map((o) => {
            const statusPalette = getOrderStatusPalette(o.status);
            return (
            <motion.div key={o._id} initial={motionInitial} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <Card className={`shadow-lg ${statusPalette.card}`}>
                <CardContent>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-extrabold text-slate-900">Table {o.tableNumber}</div>
                      <div className="break-words text-sm text-gray-600">
                        {o.customerName} - {o.phone}
                      </div>
                    </div>
                    <div className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${statusPalette.pill}`}>
                      {statusPalette.normalized || o.status}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 text-sm">
                    {o.items.map((it, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-3">
                        <span className="min-w-0 break-words">
                          {it.name} x {it.qty}
                        </span>
                        <span className="shrink-0">INR {(it.price * it.qty).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {o.paymentMode && (
                    <div className="mt-2 text-xs font-semibold text-slate-600">
                      Payment: {String(o.paymentMode).toUpperCase()}
                    </div>
                  )}

                  {o.notes ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Order note</div>
                      <div className="mt-1 break-words">{o.notes}</div>
                    </div>
                  ) : null}

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
                    <Button variant="outline" onClick={() => setStatus(o._id, "rejected")} disabled={loading}>
                      Reject
                    </Button>
                    <Button variant="outline" onClick={() => downloadReceiptPdf(o)} disabled={loading}>
                      Download PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
            );
          })}
        </div>

        {!loading && cafeId && orders.length === 0 && <div className="text-gray-700">No orders yet.</div>}
      </div>
    </StaffShell>
  );
}
