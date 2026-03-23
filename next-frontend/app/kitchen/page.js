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

  const groupedOrders = useMemo(() => {
    const map = new Map();
    for (const o of orders) {
      const tableNumber = o?.tableNumber;
      const customerName = (o?.customerName || "").trim();
      const phone = (o?.phone || "").trim();
      const key = `${tableNumber}||${customerName}||${phone}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          tableNumber,
          customerName,
          phone,
          orderIds: [],
          orders: [],
          itemsMap: new Map(),
          lineSubtotal: 0,
        });
      }

      const g = map.get(key);
      g.orderIds.push(o._id);
      g.orders.push(o);

      for (const it of o.items || []) {
        const unitPrice = Number(it.price || 0);
        const qty = Number(it.qty || 0);
        const itemKey = it.menuItemId ? String(it.menuItemId) : `${it.name}__${unitPrice}`;

        const existing = g.itemsMap.get(itemKey);
        if (existing) {
          existing.qty += qty;
        } else {
          g.itemsMap.set(itemKey, { name: it.name, unitPrice, qty });
        }
      }
    }

    return Array.from(map.values()).map((g) => {
      let lineSubtotal = 0;
      const items = Array.from(g.itemsMap.values()).map((it) => {
        const lineTotal = Number(it.unitPrice) * Number(it.qty);
        lineSubtotal += lineTotal;
        return { ...it, lineTotal };
      });

      const allServedOrPaid = g.orders.length > 0 && g.orders.every((o) => ["served", "paid"].includes(o.status));
      const overallStatus = g.orders.some((o) => o.status === "served" || o.status === "paid")
        ? "served"
        : g.orders.some((o) => ["preparing", "baking"].includes(o.status))
          ? "preparing"
          : "accepted";

      return {
        ...g,
        items,
        lineSubtotal,
        allServedOrPaid,
        overallStatus,
      };
    });
  }, [orders]);

  const computeTotals = (lineSubtotal) => {
    const round2 = (n) => Math.round(Number(n) * 100) / 100;
    const subtotalAmount = round2(lineSubtotal);
    const taxPct = Number(cafeInfo?.taxPercent || 0);
    const discType = cafeInfo?.discountType || "percent";
    const discVal = Number(cafeInfo?.discountValue || 0);

    let discountAmount = 0;
    let afterDiscount = subtotalAmount;

    if (discType === "percent") {
      const pct = Math.min(Math.max(discVal, 0), 100);
      discountAmount = round2(subtotalAmount * (pct / 100));
      afterDiscount = round2(subtotalAmount - discountAmount);
    } else {
      discountAmount = round2(Math.min(discVal, subtotalAmount));
      afterDiscount = round2(subtotalAmount - discountAmount);
    }

    const taxAmount = round2(afterDiscount * (taxPct / 100));
    const totalAmount = round2(afterDiscount + taxAmount);
    return { subtotalAmount, discountAmount, taxAmount, totalAmount };
  };

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

  const setGroupStatus = async (orderIds, status) => {
    if (!Array.isArray(orderIds) || orderIds.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const updatedOrders = await Promise.all(
        orderIds.map((orderId) =>
          apiFetch(`/api/orders/${orderId}`, {
            method: "PUT",
            headers: { ...(token ? authHeaders() : {}) },
            body: JSON.stringify({ status }),
          })
        )
      );

      setOrders((prev) => {
        const next = updatedOrders.reduce((acc, updated) => upsertOrder(acc, updated), prev);
        return filterKitchenLiveOrders(next);
      });
    } catch (e) {
      setError(e.message || "Failed to update orders");
    } finally {
      setLoading(false);
    }
  };

  const downloadBillPdf = (bill) => {
    const itemsRows = (bill.items || [])
      .map(
        (it) => `
          <tr>
            <td>${it.name}</td>
            <td class="qty">${it.qty}</td>
            <td class="price">INR ${(Number(it.unitPrice || 0) * Number(it.qty || 0)).toFixed(2)}</td>
          </tr>
        `
      )
      .join("");

    const totals = bill.totals || { subtotalAmount: 0, discountAmount: 0, taxAmount: 0, totalAmount: 0 };
    const cafeName = cafeInfo?.name || "QRDine";
    const cafeLogo = cafeInfo?.logoUrl || "";
    const createdAt = new Date().toLocaleString();

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Bill</title>
          <style>
            @page { size: 80mm auto; margin: 8mm; }
            body { font-family: "Arial", sans-serif; color: #111827; }
            .logo { display: block; margin: 0 auto 8px; max-width: 120px; max-height: 60px; object-fit: contain; }
            .cafe-name { text-align: center; font-weight: 700; margin-bottom: 6px; }
            h1 { font-size: 16px; margin: 0 0 6px; }
            .meta { font-size: 12px; margin-bottom: 10px; color: #374151; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { padding: 6px 0; border-bottom: 1px dashed #e5e7eb; }
            th { text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280; }
            td.qty { text-align: center; width: 24px; }
            td.price { text-align: right; width: 70px; }
            .line { margin-top: 6px; display: flex; justify-content: space-between; font-size: 12px; color: #374151; }
            .total { margin-top: 10px; display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; }
            .footer { margin-top: 8px; font-size: 11px; color: #6b7280; text-align: center; }
          </style>
        </head>
        <body>
          ${cafeLogo ? `<img class="logo" src="${cafeLogo}" alt="Cafe logo" />` : ""}
          <div class="cafe-name">${cafeName}</div>
          <h1>Bill</h1>
          <div class="meta">
            <div>Table: ${bill.tableNumber}</div>
            <div>Customer: ${bill.customerName || "Guest"}</div>
            <div>Phone: ${bill.phone || "-"}</div>
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
            <tbody>${itemsRows}</tbody>
          </table>
          <div class="line">
            <span>Subtotal</span>
            <span>INR ${Number(totals.subtotalAmount || 0).toFixed(2)}</span>
          </div>
          ${Number(totals.discountAmount || 0) > 0 ? `
          <div class="line">
            <span>Discount</span>
            <span>INR -${Number(totals.discountAmount || 0).toFixed(2)}</span>
          </div>
          ` : ""}
          <div class="line">
            <span>Tax</span>
            <span>INR ${Number(totals.taxAmount || 0).toFixed(2)}</span>
          </div>
          <div class="total">
            <span>Total</span>
            <span>INR ${Number(totals.totalAmount || 0).toFixed(2)}</span>
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
        {groupedOrders.map((g) => {
          const totals = computeTotals(g.lineSubtotal);
          const groupReadyForBill = g.allServedOrPaid;
          return (
            <motion.div key={g.key} initial={motionInitial} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <Card className="border border-orange-100 shadow-lg">
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-extrabold text-slate-900">Table {g.tableNumber}</div>
                      <div className="text-sm text-gray-600">
                        {g.customerName} - {g.phone}
                      </div>
                    </div>
                    <div className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase text-orange-700">
                      {g.overallStatus}
                    </div>
                  </div>

                  <div className="mt-3 space-y-1 text-sm">
                    {g.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>
                          {it.name} x {it.qty}
                        </span>
                        <span>INR {Number(it.lineTotal || 0).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {g.orders?.[0]?.paymentMode && (
                    <div className="mt-2 text-xs font-semibold text-slate-600">
                      Payment: {String(g.orders[0].paymentMode).toUpperCase()}
                    </div>
                  )}

                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal</span>
                      <span>INR {totals.subtotalAmount.toFixed(2)}</span>
                    </div>
                    {totals.discountAmount > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>Discount</span>
                        <span>- INR {totals.discountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-600">
                      <span>Tax</span>
                      <span>INR {totals.taxAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-extrabold text-slate-900">
                      <span>Total</span>
                      <span>INR {totals.totalAmount.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {groupReadyForBill ? (
                      <Button
                        variant="outline"
                        onClick={() =>
                          downloadBillPdf({
                            tableNumber: g.tableNumber,
                            customerName: g.customerName,
                            phone: g.phone,
                            items: g.items,
                            totals,
                          })
                        }
                        disabled={loading}
                      >
                        Generate Bill
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => setGroupStatus(g.orders.filter((o) => o.status === "pending").map((o) => o._id), "accepted")}
                          disabled={loading}
                        >
                          Accepted
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setGroupStatus(g.orders.filter((o) => o.status === "accepted").map((o) => o._id), "preparing")}
                          disabled={loading}
                        >
                          Preparing
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setGroupStatus(g.orders.filter((o) => ["preparing", "baking"].includes(o.status)).map((o) => o._id), "ready")}
                          disabled={loading}
                        >
                          Ready
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {!loading && cafeId && groupedOrders.length === 0 && <div className="text-gray-700">No orders yet.</div>}
    </StaffShell>
  );
}
