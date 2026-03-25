"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Wifi, Clock } from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { connectCafeSocket } from "../../../lib/socket";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import CustomerBottomNav from "../../../components/CustomerBottomNav";
import { CustomerShell } from "../../../components/CustomerShell";
import SoundControl from "../../../components/SoundControl";
import { getOrCreateVisitId, rotateVisitId } from "../../../lib/visitSession";
import { maybeNotifyBrowser, playCustomerStatus, requestNotificationPermission } from "../../../lib/sounds";
import StaffAlertBanner from "../../../components/StaffAlertBanner";
import { AppLoading } from "../../../components/AppLoading";
import { useTableGuard } from "../../../lib/useTableGuard";

const statusSteps = ["pending", "accepted", "preparing", "ready", "served", "paid"];

export default function OrdersPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const cafeId = params.cafeId;
  const tableNumber = useMemo(() => searchParams.get("table"), [searchParams]);
  const tableToken = useMemo(() => searchParams.get("t") || "", [searchParams]);

  const COFFEE_CULTURE_LOGO_URL =
    "https://res.cloudinary.com/cafe-restaurants/image/upload/v1774080951/qrdine/godexhv2hm06cm1epkqo.jpg";

  const [visitId, setVisitId] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [socketState, setSocketState] = useState("disconnected");
  const [cafeInfo, setCafeInfo] = useState(null);
  const [statusToast, setStatusToast] = useState("");
  const tableGuard = useTableGuard({
    cafeId,
    tableNumber,
    token: tableToken,
    router,
    redirectTo: (table, token) => `/${cafeId}/orders?table=${table}&t=${encodeURIComponent(token)}`,
  });

  useEffect(() => {
    if (!cafeId || !tableNumber) return;
    setVisitId(getOrCreateVisitId(cafeId, Number(tableNumber)));
  }, [cafeId, tableNumber]);

  const load = async () => {
    if (!cafeId || !tableNumber || !visitId || tableGuard.status !== "ok") return;
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ visitId });
      const tokenParam = `t=${encodeURIComponent(tableToken)}`;
      const path = `/api/orders/${cafeId}/table/${tableNumber}?${q.toString()}&${tokenParam}`;
      const data = await apiFetch(path);
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cafeId && tableNumber && visitId && tableGuard.status === "ok") load();
  }, [cafeId, tableNumber, visitId, tableGuard.status]);

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
    if (!cafeId || !tableNumber || !visitId || tableGuard.status !== "ok") return;
    const socket = connectCafeSocket(cafeId);
    setSocketState("connecting");

    socket.on("connect", () => setSocketState("connected"));
    socket.on("disconnect", () => setSocketState("disconnected"));

    const onOrder = (payload) => {
      if (!payload?._id) return;
      if (String(payload.tableNumber) !== String(tableNumber)) return;
      const pv = payload.visitId ? String(payload.visitId) : "";
      if (pv && pv !== visitId) return;
      playCustomerStatus();
      setStatusToast(`Order ${String(payload._id).slice(-6)} · ${payload.status || "updated"}`);
      setTimeout(() => setStatusToast(""), 5000);
      maybeNotifyBrowser("Order update", `Table ${tableNumber} — ${payload.status || ""}`);
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o._id === payload._id);
        if (idx === -1) return [payload, ...prev];
        const copy = prev.slice();
        copy[idx] = payload;
        return copy;
      });
    };

    socket.on("NEW_ORDER", onOrder);
    socket.on("ORDER_UPDATED", onOrder);
    socket.on("ORDER_READY", onOrder);
    socket.on("ORDER_PAID", onOrder);

    return () => {
      socket.off("NEW_ORDER", onOrder);
      socket.off("ORDER_UPDATED", onOrder);
      socket.off("ORDER_READY", onOrder);
      socket.off("ORDER_PAID", onOrder);
      socket.disconnect();
    };
  }, [cafeId, tableNumber, visitId, tableGuard.status]);

  useEffect(() => {
    if (!cafeId || !tableNumber || orders.length === 0) return;
    const allPaid = orders.every((o) => o.status === "paid");
    if (!allPaid) return;
    const next = rotateVisitId(cafeId, Number(tableNumber));
    if (next) setVisitId(next);
    setOrders([]);
  }, [orders, cafeId, tableNumber]);

  if (tableGuard.status === "checking") {
    return (
      <CustomerShell bottomInsetClass="pb-36">
        <div className="mx-auto w-full max-w-md px-4 pt-10">
          <div className="text-center text-sm text-slate-600">Validating table link…</div>
        </div>
      </CustomerShell>
    );
  }

  if (tableGuard.status === "error") {
    return (
      <CustomerShell bottomInsetClass="pb-36">
        <div className="mx-auto w-full max-w-md px-4 pt-16 text-center">
          <div className="text-lg font-semibold text-slate-900">Invalid table link</div>
          <div className="mt-2 text-sm text-slate-600">{tableGuard.error}</div>
        </div>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell bottomInsetClass="pb-36">
      <main className="min-h-screen">
        <div className="sticky top-0 z-20 border-b border-white/60 bg-white/85 backdrop-blur">
          <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2 px-4 py-3">
            <button
              type="button"
              onClick={() => router.push(`/${cafeId}/menu?table=${tableNumber}&t=${encodeURIComponent(tableToken)}`)}
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-sm"
              aria-label="Back to menu"
            >
              <img
                src={COFFEE_CULTURE_LOGO_URL}
                alt="Coffee Culture logo"
                className="h-full w-full object-cover"
                loading="eager"
                decoding="async"
              />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <div className="text-xs text-slate-500">Table {tableNumber || "?"}</div>
              <div className="text-sm font-semibold text-slate-900">Your Orders</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <SoundControl />
              <Button variant="outline" className="h-9 rounded-full px-3 text-xs" onClick={load}>
                Refresh
              </Button>
            </div>
          </div>
        </div>

      <div className="mx-auto w-full max-w-md px-4 pt-2">
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Wifi size={14} className={socketState === "connected" ? "text-emerald-600" : "text-slate-400"} />
          <span>Live updates: <span className="font-semibold">{socketState}</span></span>
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-600"
            onClick={() => requestNotificationPermission()}
          >
            Alerts
          </button>
        </div>
        {statusToast && (
          <div className="mt-3">
            <StaffAlertBanner message={statusToast} variant="success" />
          </div>
        )}
        {error && <div className="mt-4 text-sm font-semibold text-red-700">{error}</div>}

        {loading ? (
          <AppLoading label="Loading your orders" className="min-h-[30vh]" />
        ) : orders.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-white/70 bg-white/80 p-6 text-center text-sm text-slate-600 shadow-sm">
            No orders yet for this table.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {orders.map((order) => {
              const activeIndex = statusSteps.indexOf(order.status);
              return (
                <Card key={order._id} className="rounded-3xl border border-white/70 bg-white/85 shadow-sm">
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">Order #{order._id.slice(-6)}</div>
                      <div className="rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-semibold text-orange-700">
                        {order.status}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-6 gap-1">
                      {statusSteps.map((step, idx) => (
                        <div
                          key={step}
                          className={`h-2 rounded-full ${idx <= activeIndex ? "bg-orange-500" : "bg-slate-200"}`}
                        />
                      ))}
                    </div>

                    <div className="mt-3 space-y-2 text-xs text-slate-600">
                      {order.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>{it.name} x {it.qty}</span>
                          <span>INR {(it.price * it.qty).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>

                    {(() => {
                      const lineSum = order.items.reduce(
                        (s, it) => s + Number(it.price || 0) * Number(it.qty || 0),
                        0
                      );
                      const hasServerPricing =
                        typeof order.subtotalAmount === "number" && typeof order.taxAmount === "number";
                      const subtotal = hasServerPricing
                        ? Number(order.subtotalAmount)
                        : Number(order.totalAmount || lineSum);
                      const discount =
                        typeof order.discountAmount === "number" ? Number(order.discountAmount) : 0;
                      const taxRate = Number(cafeInfo?.taxPercent || 0);
                      const taxAmount = hasServerPricing
                        ? Number(order.taxAmount)
                        : subtotal * (taxRate / 100);
                      const totalFinal = hasServerPricing
                        ? Number(order.totalAmount || 0)
                        : subtotal + taxAmount;
                      return (
                        <div className="mt-3 space-y-1 text-sm">
                          <div className="flex justify-between text-slate-600">
                            <span>Subtotal</span>
                            <span>INR {subtotal.toFixed(0)}</span>
                          </div>
                          {discount > 0 && (
                            <div className="flex justify-between text-slate-600">
                              <span>Discount</span>
                              <span>- INR {discount.toFixed(0)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-slate-600">
                            <span>Tax {!hasServerPricing && taxRate ? `(${taxRate}%)` : ""}</span>
                            <span>INR {taxAmount.toFixed(0)}</span>
                          </div>
                          <div className="flex items-center justify-between font-semibold text-slate-900">
                            <span>Total (incl. tax)</span>
                            <span>INR {totalFinal.toFixed(0)}</span>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="mt-3">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => router.push(`/${cafeId}/order/${order._id}?table=${tableNumber}&t=${encodeURIComponent(tableToken)}`)}
                      >
                        Track Order
                      </Button>
                    </div>

                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <Clock size={12} />
                      <span>Status refreshes live. No need to reload.</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      <CustomerBottomNav cafeId={cafeId} tableNumber={tableNumber} tableToken={tableToken} />
    </main>
    </CustomerShell>
  );
}
