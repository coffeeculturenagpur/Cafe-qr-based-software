"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { isOrderInLocalToday, ordersTodayQueryString } from "../../lib/staffOrderRange";
import { filterKitchenLiveOrders, isKitchenLiveOrder } from "../../lib/staffOrderFilters";
import { maybeNotifyBrowser, playKitchenNewOrder, playSuccess, requestNotificationPermission } from "../../lib/sounds";
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
import { Input, Textarea } from "../../components/ui/Input";
import { AppLoading } from "../../components/AppLoading";
import { getCafeWithCache } from "../../lib/cafeClient";
import { getMenuWithCache } from "../../lib/menuClient";
import { getOrderStatusPalette } from "../../lib/orderStatusPalette";
import { groupOrdersByTable } from "../../lib/orderGrouping";
import { ChevronDown, ClipboardList, QrCode } from "lucide-react";

function formatKitchenPhone(phone) {
  const s = String(phone || "").trim();
  if (!s) return "—";
  if (s.startsWith("manual-table-")) return "Walk-in (no phone on file)";
  return s;
}

function lineItemLabel(item) {
  const name = String(item?.name || "").trim();
  return name || "Menu item";
}

function lineItemTotal(item) {
  return Number(item?.price || 0) * Number(item?.qty || 0);
}

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
  const subtotal = hasServerPricing ? Number(order.subtotalAmount) : Number(order?.totalAmount || lineSum);
  const discount = typeof order?.discountAmount === "number" ? Number(order.discountAmount) : 0;
  const taxRate = Number(cafeInfo?.taxPercent || 0);
  const taxAmount = hasServerPricing ? Number(order.taxAmount || 0) : subtotal * (taxRate / 100);
  return hasServerPricing ? Number(order?.totalAmount || 0) : Math.max(0, subtotal + taxAmount - discount);
}

function createEmptyOrderDraft(defaultStatus = "pending") {
  return {
    tableNumber: "",
    customerName: "",
    phone: "",
    notes: "",
    paymentMode: "cash",
    status: defaultStatus,
    items: [],
  };
}

function buildDraftFromOrder(order) {
  return {
    tableNumber: order?.tableNumber ? String(order.tableNumber) : "",
    customerName: order?.customerName || "",
    phone: order?.phone || "",
    notes: order?.notes || "",
    paymentMode: order?.paymentMode || "cash",
    status: order?.status || "pending",
    items: Array.isArray(order?.items)
      ? order.items
          .map((item) => ({
            menuItemId: item?.menuItemId ? String(item.menuItemId) : "",
            qty: Number(item?.qty || 1),
          }))
          .filter((item) => item.menuItemId)
      : [],
  };
}

export default function KitchenPage() {
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
  const [cafeInfo, setCafeInfo] = useState(null);
  const [alertMsg, setAlertMsg] = useState("");
  const [menuItems, setMenuItems] = useState([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  /** @type {"all" | "manual" | "qr"} */
  const [sourceFilter, setSourceFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const [editorMode, setEditorMode] = useState("create");
  const [editingOrderId, setEditingOrderId] = useState("");
  const [orderDraft, setOrderDraft] = useState(() => createEmptyOrderDraft());
  const [editorSaving, setEditorSaving] = useState(false);
  const [expandedTables, setExpandedTables] = useState({});

  const stats = useMemo(() => {
    const total = orders.length;
    const queue = orders.filter((o) => ["pending", "accepted"].includes(o.status)).length;
    const preparing = orders.filter((o) => ["preparing", "baking"].includes(o.status)).length;
    const todayTotalOrders = todayOrders.length;
    const todayRevenue = todayOrders
      .filter((o) => String(o?.status || "").toLowerCase() !== "rejected")
      .reduce((sum, order) => sum + getOrderTotal(order, cafeInfo), 0);
    return { total, queue, preparing, todayTotalOrders, todayRevenue };
  }, [orders, todayOrders, cafeInfo]);

  const menuById = useMemo(
    () => new Map(menuItems.map((item) => [String(item._id), item])),
    [menuItems]
  );

  const filteredOrders = useMemo(() => {
    let list = orders;
    const query = tableFilter.trim().toLowerCase();
    if (query) {
      list = list.filter((order) => {
        const tableValue = String(order?.tableNumber || "");
        const customerValue = String(order?.customerName || "").toLowerCase();
        const phoneValue = String(order?.phone || "").toLowerCase();
        return (
          tableValue.includes(query) ||
          customerValue.includes(query) ||
          phoneValue.includes(query)
        );
      });
    }
    if (sourceFilter === "manual") list = list.filter((o) => o.source === "manual");
    if (sourceFilter === "qr") list = list.filter((o) => o.source !== "manual");
    return list;
  }, [orders, tableFilter, sourceFilter]);

  const filteredMenuItems = useMemo(() => {
    const query = menuSearch.trim().toLowerCase();
    if (!query) return menuItems;
    return menuItems.filter((item) =>
      [item?.name, item?.category, item?.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [menuItems, menuSearch]);

  const groupedFilteredOrders = useMemo(() => groupOrdersByTable(filteredOrders), [filteredOrders]);

  const draftEstimate = useMemo(() => {
    const lineSubtotal = orderDraft.items.reduce((sum, line) => {
      const menuItem = menuById.get(String(line.menuItemId));
      return sum + Number(menuItem?.price || 0) * Number(line.qty || 0);
    }, 0);
    const taxPct = Number(cafeInfo?.taxPercent || 0);
    const discountType = cafeInfo?.discountType || "percent";
    const discountValue = Number(cafeInfo?.discountValue || 0);

    let discountAmount = 0;
    let afterDiscount = lineSubtotal;
    if (discountType === "percent") {
      discountAmount = Math.min(lineSubtotal, lineSubtotal * (Math.min(Math.max(discountValue, 0), 100) / 100));
      afterDiscount = lineSubtotal - discountAmount;
    } else {
      discountAmount = Math.min(lineSubtotal, Math.max(discountValue, 0));
      afterDiscount = lineSubtotal - discountAmount;
    }
    const taxAmount = afterDiscount * (taxPct / 100);
    const total = afterDiscount + taxAmount;

    return { subtotal: lineSubtotal, discountAmount, taxAmount, total };
  }, [cafeInfo, menuById, orderDraft.items]);

  /** Orders always fetched; cafe + menu use session cache unless forceStatic (e.g. Refresh). */
  const loadKitchenData = useCallback(
    async (options = {}) => {
      const { forceStatic = false } = options;
      if (!cafeId) {
        setMenuItems([]);
        setCafeInfo(null);
        return;
      }
      setLoading(true);
      setMenuLoading(true);
      setError("");
      setMenuError("");
      try {
        const qs = ordersTodayQueryString();
        const [list, cafeData, menuData] = await Promise.all([
          apiFetch(`/api/orders/${cafeId}?${qs}`, { headers: { ...(token ? authHeaders() : {}) } }),
          getCafeWithCache(cafeId, { force: forceStatic }),
          getMenuWithCache(cafeId, { force: forceStatic }),
        ]);
        const normalizedList = Array.isArray(list) ? list : [];
        setTodayOrders(normalizedList);
        setOrders(filterKitchenLiveOrders(normalizedList));
        setCafeInfo(cafeData || null);
        setMenuItems(Array.isArray(menuData) ? menuData : []);
      } catch (e) {
        setError(e.message || "Failed to load kitchen data");
        setMenuError(e.message || "Failed to load menu");
      } finally {
        setLoading(false);
        setMenuLoading(false);
      }
    },
    [cafeId, token]
  );

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
    if (cafeId) loadKitchenData();
  }, [cafeId, loadKitchenData]);

  useEffect(() => {
    if (!cafeId) return;

    const socket = connectCafeSocket(cafeId);
    setSocketState("connecting");

    socket.on("connect", () => setSocketState("connected"));
    socket.on("disconnect", () => setSocketState("disconnected"));

    const merge = (order) => {
      if (!isOrderInLocalToday(order)) return;
      setTodayOrders((prev) => upsertOrder(prev, order));
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
      setTodayOrders((prev) => upsertOrder(prev, updated));
      playSuccess();
    } catch (e) {
      setError(e.message || "Failed to update order");
    } finally {
      setLoading(false);
    }
  };

  const openNewOrderEditor = () => {
    setEditorOpen(true);
    setEditorMode("create");
    setMenuSearch("");
    setEditingOrderId("");
    setOrderDraft(createEmptyOrderDraft("pending"));
  };

  const openEditOrderEditor = (order) => {
    setEditorOpen(true);
    setEditorMode("edit");
    setMenuSearch("");
    setEditingOrderId(order?._id || "");
    setOrderDraft(buildDraftFromOrder(order));
  };

  const closeOrderEditor = () => {
    setEditorOpen(false);
    setMenuSearch("");
    setEditorMode("create");
    setEditingOrderId("");
    setOrderDraft(createEmptyOrderDraft("pending"));
  };

  const updateDraftField = (field, value) => {
    setOrderDraft((prev) => ({ ...prev, [field]: value }));
  };

  const toggleTableExpanded = (tableKey) => {
    setExpandedTables((prev) => ({ ...prev, [tableKey]: !prev[tableKey] }));
  };

  const addDraftItem = () => {
    const firstMenuItemId = filteredMenuItems[0]?._id
      ? String(filteredMenuItems[0]._id)
      : menuItems[0]?._id
        ? String(menuItems[0]._id)
        : "";
    if (!firstMenuItemId) return;
    setOrderDraft((prev) => ({
      ...prev,
      items: [...prev.items, { menuItemId: firstMenuItemId, qty: 1 }],
    }));
  };

  const updateDraftItem = (index, patch) => {
    setOrderDraft((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        return { ...item, ...patch };
      }),
    }));
  };

  const removeDraftItem = (index) => {
    setOrderDraft((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const submitOrderDraft = async (event) => {
    event.preventDefault();
    const parsedTableNumber = Number(orderDraft.tableNumber);
    if (!parsedTableNumber || parsedTableNumber < 1) {
      setError("Table number must be 1 or more");
      return;
    }
    if (!orderDraft.items.length) {
      setError("Add at least one item to the order");
      return;
    }

    setEditorSaving(true);
    setError("");
    try {
      const payload = {
        tableNumber: parsedTableNumber,
        customerName: orderDraft.customerName.trim() || "Walk-in guest",
        phone: orderDraft.phone.trim() || `manual-table-${parsedTableNumber}`,
        notes: orderDraft.notes.trim(),
        paymentMode: orderDraft.paymentMode,
        status: orderDraft.status,
        items: orderDraft.items.map((item) => ({
          menuItemId: item.menuItemId,
          qty: Number(item.qty || 1),
        })),
      };

      const updated =
        editorMode === "edit" && editingOrderId
          ? await apiFetch(`/api/orders/${editingOrderId}`, {
              method: "PUT",
              headers: { ...(token ? authHeaders() : {}) },
              body: JSON.stringify(payload),
            })
          : await apiFetch("/api/orders/staff", {
              method: "POST",
              headers: { ...(token ? authHeaders() : {}) },
              body: JSON.stringify(payload),
            });

      setTodayOrders((prev) => upsertOrder(prev, updated));
      if (isKitchenLiveOrder(updated)) {
        setOrders((prev) => upsertOrder(prev, updated));
      } else {
        setOrders((prev) => prev.filter((order) => order._id !== updated._id));
      }
      closeOrderEditor();
    } catch (e) {
      setError(e.message || "Failed to save order");
    } finally {
      setEditorSaving(false);
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
        onRefresh: () => loadKitchenData({ forceStatic: true }),
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
        </>
      }
      contentClassName="mx-auto w-full max-w-7xl pb-10"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-orange-50/40 px-4 py-3 text-center shadow-sm ring-1 ring-orange-100/80">
              <div className="text-xl font-bold tabular-nums text-slate-900">{stats.todayTotalOrders}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Today&apos;s orders</div>
            </div>
            <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-emerald-50/30 px-4 py-3 text-center shadow-sm ring-1 ring-emerald-100/60">
              <div className="text-xl font-bold tabular-nums text-slate-900">₹{stats.todayRevenue.toFixed(0)}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Today&apos;s revenue</div>
            </div>
            <div className="rounded-2xl border border-orange-200/80 bg-white/90 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold tabular-nums text-orange-900">{stats.total}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Active on board</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold tabular-nums text-slate-900">{stats.queue}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Queue</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold tabular-nums text-slate-900">{stats.preparing}</div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Preparing</div>
            </div>
          </div>
          <div className="min-w-0 text-sm text-slate-600">
            Socket: <span className="font-semibold">{socketState}</span>
          </div>
          <Button
            variant="outline"
            onClick={() => loadKitchenData({ forceStatic: true })}
            disabled={!cafeId || loading}
            className="min-w-[110px]"
          >
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-w-[140px] text-xs sm:text-sm"
            onClick={() => requestNotificationPermission()}
          >
            Enable alerts
          </Button>
          <Link
            href="/kitchen/history"
            className="inline-flex items-center rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-800 shadow-sm hover:bg-orange-50"
          >
            History
          </Link>
          <Button onClick={openNewOrderEditor} disabled={!cafeId || menuLoading}>
            New manual order
          </Button>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white/70 p-4 shadow-sm ring-1 ring-slate-100/80 backdrop-blur-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="w-full max-w-md space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search live queue</div>
              <Input
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                placeholder="Table number, customer name, or phone"
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order source</div>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "all", label: "All" },
                  { id: "manual", label: "Walk-in / manual", icon: ClipboardList },
                  { id: "qr", label: "QR / guest", icon: QrCode },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSourceFilter(id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      sourceFilter === id
                        ? "border-orange-400 bg-orange-50 text-orange-900 shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden /> : null}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <span>
              <strong className="text-slate-800">Ready</strong> = hand off to service.
            </span>
            <span>Updates sync automatically.</span>
            <span className="font-medium text-slate-800">
              Showing {groupedFilteredOrders.length} table cards for {filteredOrders.length} active orders
              {tableFilter || sourceFilter !== "all" ? " (filtered)" : ""}.
            </span>
          </div>
        </div>

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
                <Button variant="outline" onClick={() => loadKitchenData()} disabled={!cafeIdOverride || loading}>
                  Load
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {alertMsg && <StaffAlertBanner message={alertMsg} variant="warn" />}

        {error && <div className="text-red-700 font-semibold">{error}</div>}
        {menuError && <div className="text-red-700 font-semibold">{menuError}</div>}

        <div className="grid grid-cols-1 items-start gap-2.5 xl:grid-cols-2 2xl:grid-cols-3">
          {groupedFilteredOrders.map((group) => {
            const latestOrder = group.latestOrder;
            const groupedStatus =
              group.orders.find((order) => String(order?.status || "").toLowerCase() === "pending")?.status ||
              latestOrder?.status;
            const statusPalette = getOrderStatusPalette(groupedStatus);
            const needsAttention = group.orders.some((order) => String(order?.status || "").toLowerCase() === "pending");
            const manualCount = group.orders.filter((order) => order.source === "manual").length;
            const qrCount = group.orders.length - manualCount;
            const isExpanded = Boolean(expandedTables[group.tableKey]);
            return (
              <motion.div
                key={group.tableKey}
                initial={motionInitial}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`min-w-0 ${needsAttention ? "kitchen-order-attention" : ""}`}
              >
                <Card className={`overflow-hidden shadow-md transition ${statusPalette.cardClassName || ""}`} style={statusPalette.cardStyle}>
                  <CardContent className="p-0" style={statusPalette.bodyStyle}>
                    <button
                      type="button"
                      onClick={() => toggleTableExpanded(group.tableKey)}
                      className="flex w-full flex-wrap items-start justify-between gap-2 border-b border-slate-200/80 px-2.5 py-2 text-left sm:px-3"
                      style={statusPalette.headerStyle}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className={`text-[18px] font-black leading-none ${statusPalette.titleClassName || "text-slate-900"}`}>Table {group.tableNumber}</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                            {group.orders.length} orders
                          </span>
                          {manualCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                              <ClipboardList className="h-3 w-3" aria-hidden />
                              {manualCount} manual
                            </span>
                          )}
                          {qrCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900">
                              <QrCode className="h-3 w-3" aria-hidden />
                              {qrCount} qr
                            </span>
                          )}
                        </div>
                        <div className={`mt-0.5 space-y-0 text-[11px] ${statusPalette.mutedTextClassName || "text-slate-600"}`}>
                          <div className={`break-words font-extrabold ${statusPalette.textClassName || "text-slate-800"}`}>
                            {group.customerNames.length ? group.customerNames.join(", ") : "Guest"}
                          </div>
                          <div className={`text-[11px] font-semibold ${statusPalette.mutedTextClassName || "text-slate-500"}`}>
                            {group.phones.length ? group.phones.map((phone) => formatKitchenPhone(phone)).join(" • ") : "-"}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide shadow-sm ${statusPalette.pillClassName || ""}`}
                          style={statusPalette.pillStyle}
                        >
                          {statusPalette.normalized || groupedStatus}
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          {isExpanded ? "Hide" : "Show"}
                        </span>
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="space-y-1.5 px-2 pb-2 pt-1.5 sm:px-2.5">
                        {group.orders.map((o) => {
                          const orderPalette = getOrderStatusPalette(o.status);
                          return (
                            <div key={o._id} className="rounded-md border border-slate-200 bg-white/60 p-2">
                              <div className="flex flex-wrap items-start justify-between gap-1.5">
                                <div className="min-w-0">
                                  <div className={`text-[14px] font-black leading-tight ${orderPalette.titleClassName || "text-slate-900"}`}>Order #{String(o._id).slice(-6)}</div>
                                  <div className={`mt-0.5 text-[11px] font-bold leading-tight ${orderPalette.mutedTextClassName || "text-slate-600"}`}>
                                    {o.customerName || "Guest"} • {formatKitchenPhone(o.phone)}
                                  </div>
                                </div>
                                <div className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase ${orderPalette.pillClassName || ""}`} style={orderPalette.pillStyle}>
                                  {orderPalette.normalized || o.status}
                                </div>
                              </div>

                              <div className="mt-1.5 max-h-[min(8rem,20vh)] space-y-1 overflow-y-auto overscroll-contain rounded-md border p-1.5 text-[12px] [scrollbar-gutter:stable]">
                                {(Array.isArray(o.items) ? o.items : []).map((it, idx) => (
                                  <div key={idx} className="flex items-start justify-between gap-2 border-b border-slate-100/90 pb-1 last:border-0 last:pb-0">
                                    <span className="min-w-0 flex-1 break-words leading-snug text-slate-900">
                                      <span className="font-extrabold">{lineItemLabel(it)}</span>
                                      <span className="font-semibold text-slate-600"> x {Number(it?.qty || 0)}</span>
                                    </span>
                                    <span className="shrink-0 tabular-nums font-extrabold text-slate-900">Rs {lineItemTotal(it).toFixed(0)}</span>
                                  </div>
                                ))}
                              </div>

                              {o.paymentMode && (
                                <div className={`mt-1.5 text-[11px] font-extrabold ${orderPalette.textClassName || "text-slate-700"}`}>
                                  Payment: {String(o.paymentMode).toUpperCase()}
                                </div>
                              )}

                              {o.notes ? (
                                <div className="mt-1.5 max-h-20 overflow-y-auto rounded-md border border-amber-200/90 bg-amber-50/90 px-2 py-1.5 text-[11px] text-amber-950">
                                  <div className="text-[10px] font-extrabold uppercase tracking-wide text-amber-800">Note</div>
                                  <div className="mt-0.5 whitespace-pre-wrap break-words font-semibold">{o.notes}</div>
                                </div>
                              ) : null}

                              {(() => {
                                const lineSum = (Array.isArray(o.items) ? o.items : []).reduce(
                                  (s, it) => s + Number(it.price || 0) * Number(it.qty || 0),
                                  0
                                );
                                const hasServerPricing = typeof o.subtotalAmount === "number" && typeof o.taxAmount === "number";
                                const subtotal = hasServerPricing ? Number(o.subtotalAmount) : Number(o.totalAmount || lineSum);
                                const discount = typeof o.discountAmount === "number" ? Number(o.discountAmount) : 0;
                                const taxRate = Number(cafeInfo?.taxPercent || 0);
                                const taxAmount = hasServerPricing ? Number(o.taxAmount) : subtotal * (taxRate / 100);
                                const totalFinal = hasServerPricing ? Number(o.totalAmount || 0) : subtotal + taxAmount;
                                return (
                                  <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 rounded-md border px-2 py-1.5 text-[11px]">
                                    <div className="font-semibold text-slate-700">Subtotal</div>
                                    <div className="text-right tabular-nums font-bold text-slate-800">Rs {subtotal.toFixed(0)}</div>
                                    {discount > 0 && (
                                      <>
                                        <div className="font-semibold text-slate-700">Discount</div>
                                        <div className="text-right tabular-nums font-bold text-slate-800">- Rs {discount.toFixed(0)}</div>
                                      </>
                                    )}
                                    <div className="font-semibold text-slate-700">Tax {!hasServerPricing && taxRate ? `(${taxRate}%)` : ""}</div>
                                    <div className="text-right tabular-nums font-bold text-slate-800">Rs {taxAmount.toFixed(0)}</div>
                                    <div className="border-t border-slate-100 pt-1 font-extrabold text-slate-900">Total</div>
                                    <div className="border-t border-slate-100 pt-1 text-right tabular-nums font-extrabold text-slate-900">Rs {totalFinal.toFixed(0)}</div>
                                  </div>
                                );
                              })()}

                              <div className="mt-1.5 grid grid-cols-3 gap-1 sm:grid-cols-5">
                                <Button variant="outline" size="sm" className="w-full justify-center px-1.5 py-1 text-[11px] font-extrabold" type="button" onClick={() => openEditOrderEditor(o)} disabled={loading || editorSaving}>
                                  Edit
                                </Button>
                                <Button variant="outline" size="sm" className="w-full justify-center px-1.5 py-1 text-[11px] font-extrabold" onClick={() => setStatus(o._id, "accepted")} disabled={loading}>
                                  Accept
                                </Button>
                                <Button variant="outline" size="sm" className="w-full justify-center px-1.5 py-1 text-[11px] font-extrabold" onClick={() => setStatus(o._id, "preparing")} disabled={loading}>
                                  Prep
                                </Button>
                                <Button variant="outline" size="sm" className="w-full justify-center px-1.5 py-1 text-[11px] font-extrabold" onClick={() => setStatus(o._id, "ready")} disabled={loading}>
                                  Ready
                                </Button>
                                <Button variant="danger" size="sm" className="w-full justify-center px-1.5 py-1 text-[11px] font-extrabold" onClick={() => setStatus(o._id, "rejected")} disabled={loading}>
                                  Reject
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}

          {false && filteredOrders.map((o) => {
            const isManual = o.source === "manual";
            const statusPalette = getOrderStatusPalette(o.status);
            const needsAttention = statusPalette.normalized === "pending";
            return (
            <motion.div
              key={o._id}
              initial={motionInitial}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`min-w-0 ${needsAttention ? "kitchen-order-attention" : ""}`}
            >
              <Card
                className={`overflow-hidden shadow-lg transition ${statusPalette.cardClassName || ""}`}
                style={statusPalette.cardStyle}
              >
                <CardContent className="p-0" style={statusPalette.bodyStyle}>
                  <div
                    className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-4 sm:px-5"
                    style={statusPalette.headerStyle}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-extrabold ${statusPalette.titleClassName || "text-slate-900"}`}>Table {o.tableNumber}</span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            isManual ? "bg-amber-100 text-amber-900" : "bg-slate-200/80 text-slate-700"
                          }`}
                        >
                          {isManual ? (
                            <>
                              <ClipboardList className="h-3 w-3" aria-hidden />
                              Manual
                            </>
                          ) : (
                            <>
                              <QrCode className="h-3 w-3" aria-hidden />
                              QR
                            </>
                          )}
                        </span>
                      </div>
                      <div className={`mt-1.5 space-y-0.5 text-sm ${statusPalette.mutedTextClassName || "text-slate-600"}`}>
                        <div className={`break-words font-medium ${statusPalette.textClassName || "text-slate-800"}`}>{o.customerName || "Guest"}</div>
                        <div className={`text-xs ${statusPalette.mutedTextClassName || "text-slate-500"}`}>{formatKitchenPhone(o.phone)}</div>
                      </div>
                    </div>
                    <div
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide shadow-sm ${statusPalette.pillClassName || ""}`}
                      style={statusPalette.pillStyle}
                    >
                      {statusPalette.normalized || o.status}
                    </div>
                  </div>

                  <div className="px-4 pb-3 pt-3 sm:px-5">
                  <div
                    className={`max-h-[min(22rem,50vh)] space-y-2 overflow-y-auto overscroll-contain rounded-xl border p-3 text-sm [scrollbar-gutter:stable] ${statusPalette.panelClassName || "border-slate-100"} ${statusPalette.panelTextClassName || "text-slate-900"}`}
                    style={statusPalette.panelStyle}
                  >
                    {(Array.isArray(o.items) ? o.items : []).map((it, idx) => (
                      <div
                        key={idx}
                        className={`flex items-start justify-between gap-3 border-b border-slate-100/90 pb-2 last:border-0 last:pb-0 ${statusPalette.panelTextClassName || "text-slate-900"}`}
                      >
                        <span className="min-w-0 flex-1 break-words leading-snug text-slate-800">
                          <span className="font-semibold">{lineItemLabel(it)}</span>
                          <span className="text-slate-500"> × {Number(it?.qty || 0)}</span>
                        </span>
                        <span className="shrink-0 tabular-nums font-medium text-slate-900">
                          ₹{lineItemTotal(it).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {o.paymentMode && (
                    <div className={`mt-3 text-xs font-semibold ${statusPalette.textClassName || "text-slate-600"}`}>
                      Payment: {String(o.paymentMode).toUpperCase()}
                    </div>
                  )}

                  {o.notes ? (
                    <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">Order note</div>
                      <div className="mt-1 whitespace-pre-wrap break-words">{o.notes}</div>
                    </div>
                  ) : null}

                  {(() => {
                    const lineSum = (Array.isArray(o.items) ? o.items : []).reduce(
                      (s, it) => s + Number(it.price || 0) * Number(it.qty || 0),
                      0
                    );
                    const hasServerPricing = typeof o.subtotalAmount === "number" && typeof o.taxAmount === "number";
                    const subtotal = hasServerPricing ? Number(o.subtotalAmount) : Number(o.totalAmount || lineSum);
                    const discount = typeof o.discountAmount === "number" ? Number(o.discountAmount) : 0;
                    const taxRate = Number(cafeInfo?.taxPercent || 0);
                    const taxAmount = hasServerPricing ? Number(o.taxAmount) : subtotal * (taxRate / 100);
                    const totalFinal = hasServerPricing ? Number(o.totalAmount || 0) : subtotal + taxAmount;
                    return (
                      <div
                        className={`mt-3 space-y-1 rounded-xl border px-3 py-2 text-sm ${statusPalette.panelClassName || "border-slate-100"} ${statusPalette.panelTextClassName || "text-slate-900"}`}
                        style={statusPalette.panelStyle}
                      >
                        <div className={`flex justify-between ${statusPalette.panelMutedTextClassName || "text-slate-600"}`}>
                          <span>Subtotal</span>
                          <span className="tabular-nums">₹{subtotal.toFixed(2)}</span>
                        </div>
                        {discount > 0 && (
                          <div className={`flex justify-between ${statusPalette.panelMutedTextClassName || "text-slate-600"}`}>
                            <span>Discount</span>
                            <span className="tabular-nums">− ₹{discount.toFixed(2)}</span>
                          </div>
                        )}
                        <div className={`flex justify-between ${statusPalette.panelMutedTextClassName || "text-slate-600"}`}>
                          <span>Tax {!hasServerPricing && taxRate ? `(${taxRate}%)` : ""}</span>
                          <span className="tabular-nums">₹{taxAmount.toFixed(2)}</span>
                        </div>
                        <div className={`flex justify-between border-t border-slate-100 pt-1 font-extrabold ${statusPalette.panelTextClassName || "text-slate-900"}`}>
                          <span>Total</span>
                          <span className="tabular-nums">₹{totalFinal.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Button
                      variant="outline"
                      className="w-full justify-center"
                      type="button"
                      onClick={() => openEditOrderEditor(o)}
                      disabled={loading || editorSaving}
                    >
                      Edit order
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-center"
                      onClick={() => setStatus(o._id, "accepted")}
                      disabled={loading}
                    >
                      Accepted
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-center"
                      onClick={() => setStatus(o._id, "preparing")}
                      disabled={loading}
                    >
                      Preparing
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-center"
                      onClick={() => setStatus(o._id, "ready")}
                      disabled={loading}
                    >
                      Ready
                    </Button>
                    <Button
                      variant="danger"
                      className="w-full justify-center"
                      onClick={() => setStatus(o._id, "rejected")}
                      disabled={loading}
                    >
                      Reject
                    </Button>
                  </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
            );
          })}
        </div>

        {!loading && cafeId && groupedFilteredOrders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-slate-700">
            {tableFilter || sourceFilter !== "all"
              ? "No orders match your search or source filter. Try clearing filters or refresh."
              : "No active orders on the board yet."}
          </div>
        )}
      </div>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
          <button
            type="button"
            aria-label="Close order editor"
            className="min-w-0 flex-1 cursor-default"
            onClick={closeOrderEditor}
          />
          <div className="flex h-[100dvh] max-h-[100dvh] w-full min-w-0 max-w-2xl flex-col border-l border-slate-200/80 bg-white shadow-[-12px_0_40px_-8px_rgba(15,23,42,0.18)]">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0 pr-2">
                <div className="font-bold text-slate-900">
                  {editorMode === "edit" ? "Edit order" : "Create manual order"}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Add walk-in orders by table or update the items already in the kitchen queue. Scroll the panel to see all
                  lines and totals.
                </div>
              </div>
              <Button variant="outline" onClick={closeOrderEditor} disabled={editorSaving}>
                Close
              </Button>
            </div>

            <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={submitOrderDraft}>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-5 py-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input
                    value={orderDraft.tableNumber}
                    onChange={(e) => updateDraftField("tableNumber", e.target.value)}
                    placeholder="Table number"
                    type="number"
                    min="1"
                    required
                  />
                  <Input
                    value={orderDraft.customerName}
                    onChange={(e) => updateDraftField("customerName", e.target.value)}
                    placeholder="Customer name"
                  />
                  <Input
                    value={orderDraft.phone}
                    onChange={(e) => updateDraftField("phone", e.target.value)}
                    placeholder="Phone (optional for manual orders)"
                  />
                  <select
                    value={orderDraft.paymentMode}
                    onChange={(e) => updateDraftField("paymentMode", e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white/90 p-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300/70"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                  </select>
                  <select
                    value={orderDraft.status}
                    onChange={(e) => updateDraftField("status", e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white/90 p-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300/70"
                  >
                    <option value="pending">Pending</option>
                    <option value="accepted">Accepted</option>
                    <option value="preparing">Preparing</option>
                    <option value="ready">Ready</option>
                    <option value="served">Served</option>
                  </select>
                </div>

                <Textarea
                  value={orderDraft.notes}
                  onChange={(e) => updateDraftField("notes", e.target.value)}
                  placeholder="Order notes"
                  rows={3}
                />

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Order items</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Search the menu, then add items quickly to the order.
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addDraftItem}
                      disabled={menuLoading || !menuItems.length}
                    >
                      Add item
                    </Button>
                  </div>

                  <div className="mt-3">
                    <Input
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      placeholder="Search menu items by name, category, or description"
                    />
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Menu list is cached briefly (same as admin). Use <strong>Refresh</strong> above to reload menu and
                      pricing from the server.
                    </p>
                  </div>

                  {menuLoading ? <div className="mt-3 text-sm text-slate-500">Loading menu...</div> : null}
                  {!menuLoading && menuSearch && filteredMenuItems.length === 0 ? (
                    <div className="mt-3 text-sm text-slate-500">No menu items match this search.</div>
                  ) : null}

                  <div className="mt-4 max-h-[min(50vh,24rem)] space-y-4 overflow-y-auto overscroll-contain rounded-xl border border-slate-200/90 bg-white p-3 sm:max-h-[min(55vh,28rem)] sm:p-4">
                    {orderDraft.items.map((item, index) => {
                      const selectedItem = menuById.get(String(item.menuItemId));
                      const qty = Math.max(1, Number(item.qty || 1));
                      const lineTotal = Number(selectedItem?.price || 0) * qty;
                      const optionsSource = menuSearch ? filteredMenuItems : menuItems;
                      return (
                        <div
                          key={`${item.menuItemId}-${index}`}
                          className="rounded-2xl border border-slate-200 bg-slate-50/40 p-4 shadow-sm"
                        >
                          <div className="space-y-4">
                            <div>
                              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Dish
                              </label>
                              <select
                                value={item.menuItemId}
                                onChange={(e) => updateDraftItem(index, { menuItemId: e.target.value })}
                                className="w-full min-h-[48px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-900 shadow-sm focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-200/80"
                              >
                                {optionsSource.map((menuItem) => (
                                  <option key={menuItem._id} value={menuItem._id}>
                                    {menuItem.name} · {menuItem.category} · ₹{Number(menuItem.price || 0).toFixed(0)}
                                  </option>
                                ))}
                                {selectedItem &&
                                !optionsSource.some((menuItem) => String(menuItem._id) === String(item.menuItemId)) ? (
                                  <option value={item.menuItemId}>
                                    {selectedItem.name} · {selectedItem.category} · ₹
                                    {Number(selectedItem.price || 0).toFixed(0)}
                                  </option>
                                ) : null}
                              </select>
                            </div>

                            <div className="flex flex-col gap-4 border-t border-slate-200/80 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                              <div className="w-full sm:w-auto">
                                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:mb-0 sm:mr-3 sm:inline">
                                  Quantity
                                </span>
                                <div className="inline-flex h-12 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                                  <button
                                    type="button"
                                    className="flex w-12 shrink-0 items-center justify-center border-r border-slate-200 bg-slate-50 text-lg font-semibold text-slate-700 transition hover:bg-slate-100 active:bg-slate-200"
                                    aria-label="Decrease quantity"
                                    onClick={() =>
                                      updateDraftItem(index, {
                                        qty: Math.max(1, qty - 1),
                                      })
                                    }
                                  >
                                    −
                                  </button>
                                  <input
                                    type="number"
                                    min={1}
                                    inputMode="numeric"
                                    value={qty}
                                    onChange={(e) => {
                                      const n = Number(e.target.value);
                                      updateDraftItem(index, {
                                        qty: Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1,
                                      });
                                    }}
                                    className="w-[4.5rem] min-w-[4.5rem] shrink-0 border-0 bg-white px-1 text-center text-base font-semibold tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-200/90"
                                  />
                                  <button
                                    type="button"
                                    className="flex w-12 shrink-0 items-center justify-center border-l border-slate-200 bg-slate-50 text-lg font-semibold text-slate-700 transition hover:bg-slate-100 active:bg-slate-200"
                                    aria-label="Increase quantity"
                                    onClick={() =>
                                      updateDraftItem(index, {
                                        qty: qty + 1,
                                      })
                                    }
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                                <div className="text-sm sm:text-right">
                                  <span className="text-slate-500">Line total </span>
                                  <span className="font-bold tabular-nums text-slate-900">₹{lineTotal.toFixed(2)}</span>
                                </div>
                                <Button type="button" variant="danger" size="sm" onClick={() => removeDraftItem(index)}>
                                  Remove
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {!orderDraft.items.length ? (
                    <div className="mt-3 text-sm text-slate-500">No items added yet.</div>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-2 rounded-2xl border border-orange-100 bg-orange-50/70 p-4 text-sm text-slate-700 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Subtotal</div>
                    <div className="mt-1 font-bold text-slate-900">₹{draftEstimate.subtotal.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Discount</div>
                    <div className="mt-1 font-bold text-slate-900">₹{draftEstimate.discountAmount.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Tax</div>
                    <div className="mt-1 font-bold text-slate-900">₹{draftEstimate.taxAmount.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Estimated total</div>
                    <div className="mt-1 font-bold text-slate-900">₹{draftEstimate.total.toFixed(2)}</div>
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.12)]">
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={editorSaving || menuLoading || !menuItems.length}>
                    {editorSaving ? "Saving..." : editorMode === "edit" ? "Save order changes" : "Create manual order"}
                  </Button>
                  <Button type="button" variant="outline" onClick={closeOrderEditor} disabled={editorSaving}>
                    Cancel
                  </Button>
                  {editorMode === "edit" ? (
                    <Button type="button" variant="outline" onClick={openNewOrderEditor} disabled={editorSaving}>
                      New order instead
                    </Button>
                  ) : null}
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </StaffShell>
  );
}
