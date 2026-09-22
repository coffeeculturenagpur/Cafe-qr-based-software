"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { authHeaders } from "../../lib/auth";
import { filterCigaretteMenuItems, getCigaretteSalePrice } from "../../lib/cigaretteMenu";
import { filterCigaretteLiveOrders, isCigaretteOrder } from "../../lib/staffOrderFilters";
import { ordersTodayQueryString } from "../../lib/staffOrderRange";
import { printCigaretteBill } from "../../lib/receiptHtml";
import { connectCafeSocket } from "../../lib/socket";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

function upsertOrder(list, order) {
  const idx = list.findIndex((x) => x._id === order._id);
  if (idx === -1) return [order, ...list];
  const copy = list.slice();
  copy[idx] = order;
  return copy;
}

function createEmptyDraft() {
  return {
    tableNumber: "",
    paymentMode: "cash",
    items: [],
  };
}

/**
 * Counter cigarette sales panel for waiter / kitchen / admin.
 */
export function CigarettePanel({
  cafeId,
  token,
  cafeInfo,
  canCreate = true,
  canMarkPaid = true,
  canManagePrincipal = false,
  id,
  className = "",
  variant = "checkout",
}) {
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [previousOrders, setPreviousOrders] = useState([]);
  const [draft, setDraft] = useState(createEmptyDraft);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [socketState, setSocketState] = useState("disconnected");
  const [principalBalance, setPrincipalBalance] = useState(0);
  const [principalDraft, setPrincipalDraft] = useState("");

  const cigaretteItems = useMemo(
    () => filterCigaretteMenuItems(menuItems, cafeInfo),
    [menuItems, cafeInfo]
  );

  const liveOrders = useMemo(() => filterCigaretteLiveOrders(orders), [orders]);

  const draftTotal = useMemo(() => {
    return draft.items.reduce(
      (sum, line) => sum + Number(line.price || 0) * Number(line.qty || 0),
      0
    );
  }, [draft.items]);

  const load = useCallback(async () => {
    if (!cafeId || !token) return;
    setLoading(true);
    setError("");
    try {
      const qs = ordersTodayQueryString();
      const [menu, list, history, principal] = await Promise.all([
        apiFetch(`/api/menu/${cafeId}/staff`, { headers: { ...authHeaders() } }),
        apiFetch(`/api/orders/${cafeId}?${qs}&orderType=cigarette&scope=cigarette_live`, {
          headers: { ...authHeaders() },
        }),
        apiFetch(`/api/orders/${cafeId}?${qs}&orderType=cigarette&scope=history`, {
          headers: { ...authHeaders() },
        }),
        apiFetch(`/api/menu/cigarette-principal/${cafeId}`, { headers: { ...authHeaders() } }),
      ]);
      setMenuItems(Array.isArray(menu) ? menu : []);
      const nextPrincipalBalance = Number(principal?.principalBalance || 0);
      setPrincipalBalance(nextPrincipalBalance);
      setPrincipalDraft(String(nextPrincipalBalance));
      setOrders(filterCigaretteLiveOrders(Array.isArray(list) ? list : []));
      setPreviousOrders(
        (Array.isArray(history) ? history : []).filter((order) => ["paid", "rejected", "served"].includes(String(order.status || "").toLowerCase()))
      );
    } catch (e) {
      setError(e.message || "Failed to load cigarettes");
    } finally {
      setLoading(false);
    }
  }, [cafeId, token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!cafeId || !token) return undefined;
    const socket = connectCafeSocket(cafeId);
    const onConnect = () => setSocketState("connected");
    const onDisconnect = () => setSocketState("disconnected");
    const onOrder = (payload) => {
      if (!payload || !isCigaretteOrder(payload)) return;
      const status = String(payload.status || "").toLowerCase();
      if (status === "paid" || status === "rejected") {
        setOrders((prev) => prev.filter((o) => o._id !== payload._id));
        if (status === "paid") load();
        return;
      }
      setOrders((prev) => filterCigaretteLiveOrders(upsertOrder(prev, payload)));
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("NEW_ORDER", onOrder);
    socket.on("ORDER_UPDATED", onOrder);
    socket.on("ORDER_PAID", onOrder);
    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("NEW_ORDER", onOrder);
      socket.off("ORDER_UPDATED", onOrder);
      socket.off("ORDER_PAID", onOrder);
    };
  }, [cafeId, token]);

  const addItemToDraft = (menuItem) => {
    const id = String(menuItem._id);
    setDraft((prev) => {
      const existing = prev.items.find((it) => String(it.menuItemId) === id);
      if (existing) {
        return {
          ...prev,
          items: prev.items.map((it) =>
            String(it.menuItemId) === id ? { ...it, qty: Number(it.qty || 0) + 1 } : it
          ),
        };
      }
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            menuItemId: id,
            name: menuItem.name,
            price: getCigaretteSalePrice(menuItem),
            qty: 1,
          },
        ],
      };
    });
    setSuccess("");
    setError("");
  };

  const setDraftQty = (menuItemId, nextQty) => {
    const qty = Math.max(0, Number(nextQty || 0));
    setDraft((prev) => ({
      ...prev,
      items:
        qty < 1
          ? prev.items.filter((it) => String(it.menuItemId) !== String(menuItemId))
          : prev.items.map((it) =>
              String(it.menuItemId) === String(menuItemId) ? { ...it, qty } : it
            ),
    }));
  };

  const draftQtyFor = (menuItemId) => Number(
    draft.items.find((line) => String(line.menuItemId) === String(menuItemId))?.qty || 0
  );

  const cigaretteOrderTotal = (order) => (order?.items || []).reduce((sum, item) => sum + getCigaretteSalePrice(item) * Number(item.qty || 0), 0);

  const savePrincipalBalance = async (nextValue = Number(principalDraft)) => {
    const nextPrincipalBalance = Number(nextValue);
    if (!Number.isFinite(nextPrincipalBalance) || nextPrincipalBalance < 0) {
      setError("Enter a valid principal balance");
      return;
    }
    setSavingId("principal-balance");
    setError("");
    try {
      const result = await apiFetch(`/api/menu/cigarette-principal/${cafeId}`, {
        method: "PATCH",
        headers: { ...authHeaders() },
        body: JSON.stringify({ principalBalance: nextPrincipalBalance }),
      });
      const savedBalance = Number(result?.principalBalance || 0);
      setPrincipalBalance(savedBalance);
      setPrincipalDraft(String(savedBalance));
      setSuccess(
        nextPrincipalBalance === 0
          ? "Cigarette principal reset to zero"
          : "Cigarette principal saved"
      );
    } catch (e) {
      setError(e.message || "Failed to save principal");
    } finally {
      setSavingId("");
    }
  };

  const resetPrincipalBalance = async () => {
    setPrincipalDraft("0");
    await savePrincipalBalance(0);
  };

  const createOrder = async () => {
    if (!canCreate || !cafeId) return;
    if (!draft.items.length) {
      setError("Add at least one cigarette item");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const rawTable = String(draft.tableNumber || "").trim();
      const tableNumber = rawTable ? Number(rawTable) : null;
      if (rawTable && (!tableNumber || tableNumber < 1)) {
        throw new Error("Table number must be 1 or more");
      }
      const body = {
        cafeId,
        orderType: "cigarette",
        tableNumber,
        paymentMode: draft.paymentMode || "cash",
        status: "pending",
        items: draft.items.map((it) => ({
          menuItemId: it.menuItemId,
          qty: Number(it.qty || 1),
        })),
      };
      const order = await apiFetch("/api/orders/staff", {
        method: "POST",
        headers: { ...authHeaders() },
        body: JSON.stringify(body),
      });
      setOrders((prev) => filterCigaretteLiveOrders(upsertOrder(prev, order)));
      setDraft(createEmptyDraft());
      setSuccess(`Cigarette order #${String(order._id).slice(-6).toUpperCase()} created`);
    } catch (e) {
      setError(e.message || "Failed to create cigarette order");
    } finally {
      setLoading(false);
    }
  };

  const updateOrderItems = async (order, nextItems) => {
    if (!nextItems.length) {
      setError("Remove the order with Reject instead of clearing all items");
      return;
    }
    setSavingId(order._id);
    setError("");
    try {
      const updated = await apiFetch(`/api/orders/${order._id}`, {
        method: "PUT",
        headers: { ...authHeaders() },
        body: JSON.stringify({
          items: nextItems.map((it) => ({
            menuItemId: it.menuItemId,
            qty: Number(it.qty || 1),
          })),
        }),
      });
      setOrders((prev) => filterCigaretteLiveOrders(upsertOrder(prev, updated)));
    } catch (e) {
      setError(e.message || "Failed to update quantity");
    } finally {
      setSavingId("");
    }
  };

  const bumpOrderItemQty = (order, menuItemId, delta) => {
    const items = Array.isArray(order.items) ? order.items : [];
    const nextItems = items
      .map((it) => {
        if (String(it.menuItemId) !== String(menuItemId)) return it;
        return { ...it, qty: Number(it.qty || 0) + delta };
      })
      .filter((it) => Number(it.qty || 0) >= 1);
    if (nextItems.length === items.length && delta < 0) {
      // last unit of a line removed — already filtered
    }
    if (!nextItems.length) {
      setError("Use Reject to cancel the order");
      return;
    }
    updateOrderItems(order, nextItems);
  };

  const setStatus = async (order, status) => {
    setSavingId(order._id);
    setError("");
    try {
      const updated = await apiFetch(`/api/orders/${order._id}`, {
        method: "PUT",
        headers: { ...authHeaders() },
        body: JSON.stringify({ status }),
      });
      if (status === "paid" || status === "rejected") {
        setPreviousOrders((prev) => upsertOrder(prev, updated));
      }
      if (status === "paid" || status === "rejected") {
        setOrders((prev) => prev.filter((o) => o._id !== order._id));
      } else {
        setOrders((prev) => filterCigaretteLiveOrders(upsertOrder(prev, updated)));
      }
      if (status === "paid") await load();
    } catch (e) {
      setError(e.message || "Failed to update status");
    } finally {
      setSavingId("");
    }
  };

  const isAdminVariant = variant === "admin";

  return (
    <div
      id={id}
      className={`space-y-4 ${className} ${isAdminVariant ? "rounded-3xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm" : ""}`}
    >
      <div className={`flex flex-wrap items-center justify-between gap-3 ${isAdminVariant ? "rounded-2xl border border-amber-200 bg-white/80 px-3 py-2" : ""}`}>
        <div>
          <h2 className={`text-lg font-bold ${isAdminVariant ? "text-amber-900" : "text-slate-900 dark:text-slate-100"}`}>
            {isAdminVariant ? "Cigarette checkout" : "Cigarettes"}
          </h2>
          <p className={`text-sm ${isAdminVariant ? "text-amber-800" : "text-slate-500"}`}>
            {isAdminVariant ? "Counter sales and live ticket status." : "Counter sales only — not available on the QR menu."} Socket:{" "}
            <span className="font-semibold">{socketState}</span>
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <span className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-bold shadow-sm ${isAdminVariant ? "border-amber-200 bg-amber-100 text-amber-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            {liveOrders.length} open
          </span>
          <span className={`w-full rounded-full border px-5 py-2 text-center text-base font-bold tabular-nums shadow-sm sm:w-auto sm:text-lg ${isAdminVariant ? "border-orange-200 bg-orange-100 text-orange-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            INR {principalBalance.toFixed(2)} balance
          </span>
          <Button type="button" variant="outline" onClick={load} disabled={loading || !cafeId}>
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      {canCreate ? (
        <div className={`rounded-3xl border p-4 shadow-sm ${isAdminVariant ? "border-amber-200 bg-white" : "border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-950/60"}`}>
          <div className={`mb-3 text-sm font-semibold ${isAdminVariant ? "text-amber-900" : "text-slate-800 dark:text-slate-100"}`}>
            {isAdminVariant ? "Checkout for orders" : "Manual cigarette order"}
          </div>
          <p className={`mb-4 text-sm ${isAdminVariant ? "text-amber-800" : "text-slate-500"}`}>
            {isAdminVariant ? "Create and manage walk-in cigarette sales from the counter." : "Choose cigarettes and adjust quantity for a walk-in customer."}
          </p>
          <div className={`mb-4 rounded-2xl border p-3 ${isAdminVariant ? "border-amber-200 bg-amber-50/70" : "border-amber-200 bg-amber-50/70"}`}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-amber-950">Shared cigarette principal</div>
                <div className="mt-1 text-xs text-amber-800">Paid Advance cigarettes deduct ₹30 each; paid American cigarettes deduct ₹25 each.</div>
              </div>
              <div className="text-lg font-black tabular-nums text-amber-950">INR {principalBalance.toFixed(2)}</div>
            </div>
            {canManagePrincipal ? (
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-amber-200 pt-3">
                <label className="min-w-[12rem] flex-1 text-xs font-bold uppercase tracking-wide text-amber-900">
                  Principal balance
                  <Input aria-label="Shared cigarette principal balance" className="mt-1 bg-white" type="number" min="0" step="0.01" value={principalDraft} onChange={(e) => setPrincipalDraft(e.target.value)} />
                </label>
                <Button type="button" variant="outline" disabled={savingId === "principal-balance"} onClick={() => savePrincipalBalance(Number(principalDraft))}>
                  {savingId === "principal-balance" ? "Saving..." : "Save principal"}
                </Button>
                <Button type="button" variant="outline" className="border-red-200 text-red-700" disabled={savingId === "principal-balance"} onClick={resetPrincipalBalance}>
                  {savingId === "principal-balance" ? "Resetting..." : "Reset principal"}
                </Button>
              </div>
            ) : null}
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">
                Table (optional)
              </span>
              <Input
                placeholder="Walk-in"
                value={draft.tableNumber}
                onChange={(e) => setDraft((prev) => ({ ...prev, tableNumber: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">Payment</span>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                value={draft.paymentMode}
                onChange={(e) => setDraft((prev) => ({ ...prev, paymentMode: e.target.value }))}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
              </select>
            </label>
          </div>

          {cigaretteItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No cigarette menu items found. In Admin → Menu items, set the item{" "}
              <strong>Category</strong> to <strong>Cigarette</strong> or{" "}
              <strong>Cigarettes</strong> (same spelling as on the menu card), then click Refresh.
            </div>
          ) : (
            <div className={`rounded-3xl border p-3 ${isAdminVariant ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"}`}>
                <div className="mb-3">
                  <div className={`text-sm font-bold ${isAdminVariant ? "text-amber-900" : "text-emerald-950 dark:text-emerald-100"}`}>Create customer order</div>
                  <div className={`mt-1 text-xs ${isAdminVariant ? "text-amber-700" : "text-emerald-800 dark:text-emerald-300"}`}>Add cigarettes using the cards below.</div>
                </div>
                <div className="space-y-2">
                  {cigaretteItems.map((item) => {
                    const quantity = draftQtyFor(item._id);
                    return (
                      <div key={`order-card-${item._id}`} className="rounded-2xl border border-emerald-200 bg-white p-3 shadow-sm dark:border-emerald-900 dark:bg-slate-950">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.name}</div>
                            <div className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">INR {getCigaretteSalePrice(item).toFixed(2)} each</div>
                          </div>
                          {quantity === 0 ? (
                            <Button type="button" className="px-3 py-1.5 text-xs" onClick={() => addItemToDraft(item)}>Add</Button>
                          ) : (
                            <div className="flex items-center overflow-hidden rounded-xl border border-emerald-300 bg-white dark:bg-slate-900">
                              <button type="button" className="h-8 w-8 text-lg font-bold" onClick={() => setDraftQty(item._id, quantity - 1)}>−</button>
                              <span className="min-w-[2rem] text-center text-sm font-black">{quantity}</span>
                              <button type="button" className="h-8 w-8 text-lg font-bold" onClick={() => addItemToDraft(item)}>+</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
            </div>
          )}

          {draft.items.length > 0 ? (
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              {draft.items.map((line) => (
                <div
                  key={line.menuItemId}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-3 py-2 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{line.name}</div>
                    <div className="text-xs text-slate-500">
                      INR {Number(line.price || 0).toFixed(2)} each
                    </div>
                  </div>
                  <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      className="px-3 py-1 text-lg font-semibold"
                      onClick={() => setDraftQty(line.menuItemId, Number(line.qty) - 1)}
                    >
                      −
                    </button>
                    <span className="min-w-[2rem] text-center text-sm font-bold">{line.qty}</span>
                    <button
                      type="button"
                      className="px-3 py-1 text-lg font-semibold"
                      onClick={() => setDraftQty(line.menuItemId, Number(line.qty) + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Total sum: INR {draftTotal.toFixed(2)}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setDraft(createEmptyDraft())}>
                    Clear
                  </Button>
                  <Button type="button" onClick={createOrder} disabled={loading}>
                    Create order
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Open cigarette tickets</div>
        {liveOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            No open cigarette orders.
          </div>
        ) : (
          liveOrders.map((order) => {
            const orderIdShort = String(order._id).slice(-6).toUpperCase();
            const total = cigaretteOrderTotal(order);
            const busy = savingId === order._id;
            return (
              <div
                key={order._id}
                className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-bold text-slate-900 dark:text-slate-100">
                      #{orderIdShort} ·{" "}
                      {Number(order.tableNumber || 0) > 0 ? `Table ${order.tableNumber}` : "Walk-in"}
                    </div>
                    <div className="text-xs text-slate-500">
                      Counter sale · {String(order.status || "").toUpperCase()} ·{" "}
                      {String(order.paymentMode || "cash").toUpperCase()}
                    </div>
                  </div>
                  <div className="text-right text-sm font-black text-slate-900 dark:text-slate-100">
                    INR {total.toFixed(2)}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {(order.items || []).map((line) => (
                    <div
                      key={`${order._id}-${line.menuItemId}-${line.name}`}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-900"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{line.name}</div>
                        <div className="text-xs text-slate-500">
                          INR {(getCigaretteSalePrice(line) * Number(line.qty || 0)).toFixed(2)}
                        </div>
                      </div>
                      <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                        <button
                          type="button"
                          disabled={busy}
                          className="px-3 py-1 text-lg font-semibold disabled:opacity-50"
                          onClick={() => bumpOrderItemQty(order, line.menuItemId, -1)}
                        >
                          −
                        </button>
                        <span className="min-w-[2rem] text-center text-sm font-bold">{line.qty}</span>
                        <button
                          type="button"
                          disabled={busy}
                          className="px-3 py-1 text-lg font-semibold disabled:opacity-50"
                          onClick={() => bumpOrderItemQty(order, line.menuItemId, 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => printCigaretteBill(order, cafeInfo)}
                  >
                    Print bill
                  </Button>
                  {canMarkPaid ? (
                    <Button type="button" disabled={busy} onClick={() => setStatus(order, "paid")}>
                      Mark paid
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="border-red-200 text-red-700"
                    disabled={busy}
                    onClick={() => setStatus(order, "rejected")}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm font-semibold text-slate-800 dark:text-slate-100">
          <span>Previous cigarette orders</span>
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs">{previousOrders.length}</span>
        </div>
        {previousOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">No previous cigarette orders.</div>
        ) : (
          previousOrders.map((order) => (
            <div key={`history-${order._id}`} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">#{String(order._id).slice(-6).toUpperCase()} · {Number(order.tableNumber || 0) > 0 ? `Table ${order.tableNumber}` : "Walk-in"}</span>
                <span className="text-xs font-bold uppercase text-amber-700">{order.status}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{order.createdAt ? new Date(order.createdAt).toLocaleString() : ""}</div>
              <div className="mt-2 break-words text-xs text-slate-600">{(order.items || []).map((line) => `${line.name} ×${line.qty}`).join(" · ")}</div>
                <div className="mt-2 flex justify-between font-bold"><span>Total</span><span>INR {cigaretteOrderTotal(order).toFixed(2)}</span></div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
