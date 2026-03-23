"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Wifi, Sparkles } from "lucide-react";
import { apiFetch } from "../../../../lib/api";
import { connectCafeSocket } from "../../../../lib/socket";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import CustomerBottomNav from "../../../../components/CustomerBottomNav";
import { CustomerShell } from "../../../../components/CustomerShell";
import SoundControl from "../../../../components/SoundControl";
import { maybeNotifyBrowser, playCustomerStatus } from "../../../../lib/sounds";
import { AppLoading } from "../../../../components/AppLoading";
import { useTableGuard } from "../../../../lib/useTableGuard";

const displaySteps = [
  { key: "accepted", label: "Order Accepted" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "served", label: "Served" },
];

const statusRank = (status) => {
  if (!status || status === "pending") return -1;
  if (status === "accepted") return 0;
  if (status === "baking" || status === "preparing") return 1;
  if (status === "ready") return 2;
  if (status === "served" || status === "paid") return 3;
  return 0;
};

export default function OrderStatusPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const cafeId = params.cafeId;
  const orderId = params.orderId;
  const tableNumber = useMemo(() => searchParams.get("table"), [searchParams]);
  const tableToken = useMemo(() => searchParams.get("t") || "", [searchParams]);
  const router = useRouter();

  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [socketState, setSocketState] = useState("disconnected");
  const [cafeInfo, setCafeInfo] = useState(null);
  const [paymentChoice, setPaymentChoice] = useState("cash");
  const paymentTouched = useRef(false);
  const skipFirstStatusFx = useRef(true);
  const tableGuard = useTableGuard({
    cafeId,
    tableNumber,
    token: tableToken,
    router,
    redirectTo: (table, token) => `/${cafeId}/order/${orderId}?table=${table}&t=${encodeURIComponent(token)}`,
  });

  const load = async () => {
    if (tableGuard.status !== "ok") return;
    try {
      const found = await apiFetch(`/api/orders/${cafeId}/id/${orderId}`);
      setOrder(found || null);
    } catch (e) {
      setError(e.message || "Failed to load order");
    }
  };

  useEffect(() => {
    skipFirstStatusFx.current = true;
    paymentTouched.current = false;
  }, [orderId]);

  useEffect(() => {
    setError("");
    if (cafeId && orderId && tableGuard.status === "ok") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafeId, orderId, tableGuard.status]);

  useEffect(() => {
    if (!cafeId || !orderId || tableGuard.status !== "ok") return;

    const socket = connectCafeSocket(cafeId);
    setSocketState("connecting");

    socket.on("connect", () => setSocketState("connected"));
    socket.on("disconnect", () => setSocketState("disconnected"));

    const onOrder = (payload) => {
      if (payload?._id === orderId) {
        setOrder(payload);
      }
    };

    socket.on("ORDER_UPDATED", onOrder);
    socket.on("ORDER_READY", onOrder);
    socket.on("ORDER_PAID", onOrder);

    return () => {
      socket.off("ORDER_UPDATED", onOrder);
      socket.off("ORDER_READY", onOrder);
      socket.off("ORDER_PAID", onOrder);
      socket.disconnect();
    };
  }, [cafeId, orderId, tableGuard.status]);

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
    if (!order?.status) return;
    if (skipFirstStatusFx.current) {
      skipFirstStatusFx.current = false;
      return;
    }
    playCustomerStatus();
    maybeNotifyBrowser("Order update", order.status);
  }, [order?.status]);

  useEffect(() => {
    if (paymentTouched.current) return;
    if (order?.paymentMode) {
      setPaymentChoice(order.paymentMode);
    }
  }, [order?.paymentMode]);

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
          <Button
            variant="outline"
            className="h-9 w-9 shrink-0 rounded-full p-0"
            onClick={() => router.push(`/${cafeId}/menu?table=${tableNumber}&t=${encodeURIComponent(tableToken)}`)}
          >
            <ArrowLeft size={18} className="text-slate-900" />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <div className="text-xs text-slate-500">Table {tableNumber || "?"}</div>
            <div className="text-sm font-semibold text-slate-900">Order Tracker</div>
            <div className="mt-2 flex items-center justify-center">
              <div className="h-10 w-10 rounded-full bg-white shadow ring-2 ring-white overflow-hidden">
                {cafeInfo?.logoUrl ? (
                  <img src={cafeInfo.logoUrl} alt={cafeInfo?.name || "Cafe"} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-orange-200 to-amber-200" />
                )}
              </div>
            </div>
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
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Wifi size={14} className={socketState === "connected" ? "text-emerald-600" : "text-slate-400"} />
          <span>Live updates: <span className="font-semibold">{socketState}</span></span>
        </div>

        {error ? (
          <div className="mt-6 text-sm font-semibold text-red-700">{error}</div>
        ) : !order ? (
          <AppLoading label="Tracking your order" className="min-h-[30vh]" />
        ) : (
          <Card className="mt-4 rounded-3xl border border-white/70 bg-white/85 shadow-sm">
            <CardContent>
              {(() => {
                const lineSum = order.items.reduce(
                  (sum, it) => sum + Number(it.price || 0) * Number(it.qty || 0),
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
                const totalWithTax = hasServerPricing
                  ? Number(order.totalAmount || 0)
                  : subtotal + taxAmount;
                return (
                  <>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">
                  Order #{order._id.slice(-6)} - Table {order.tableNumber}
                </div>
                <div className="rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-semibold text-orange-700">
                  {order.status}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2">
                {displaySteps.map((step, idx) => {
                  const active = idx <= statusRank(order.status);
                  return (
                    <div
                      key={step.key}
                      className={`h-2 rounded-full ${active ? "bg-orange-500" : "bg-slate-200"}`}
                    />
                  );
                })}
              </div>

              <div className="mt-3 space-y-2 text-xs text-slate-600">
                {displaySteps.map((step, idx) => {
                  const active = idx <= statusRank(order.status);
                  return (
                    <div key={step.key} className="flex items-center gap-2">
                      <div
                        className={`h-3 w-3 rounded-full border ${
                          active ? "bg-orange-500 border-orange-500" : "border-slate-300"
                        }`}
                      />
                      <span className={active ? "text-slate-900 font-semibold" : ""}>{step.label}</span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 space-y-2">
                {order.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span>
                      {it.name} x {it.qty}
                    </span>
                    <span>INR {(it.price * it.qty).toFixed(0)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>INR {subtotal.toFixed(0)}</span>
                </div>
                {discount > 0 && (
                  <div className="mt-2 flex justify-between">
                    <span>Discount</span>
                    <span>- INR {discount.toFixed(0)}</span>
                  </div>
                )}
                <div className="mt-2 flex justify-between">
                  <span>Tax {!hasServerPricing && taxRate ? `(${taxRate}%)` : ""}</span>
                  <span>INR {taxAmount.toFixed(0)}</span>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <div className="text-[10px] uppercase tracking-widest text-slate-400">Customer details</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] text-slate-400">Name</div>
                    <div className="text-sm font-semibold text-slate-900">{order.customerName || "Guest"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Phone</div>
                    <div className="text-sm font-semibold text-slate-900">{order.phone || "-"}</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-between text-base font-extrabold text-slate-900">
                <span>Total (incl. tax)</span>
                <span>INR {totalWithTax.toFixed(0)}</span>
              </div>

              {["served", "paid"].includes(order.status) && (
                <div className="mt-4">
                  <div className="text-sm font-semibold text-slate-900">Payment mode</div>
                  <div className="mt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        paymentTouched.current = true;
                        setPaymentChoice("cash");
                      }}
                      className={`flex-1 rounded-full border px-4 py-2 text-center text-sm font-semibold ${
                        paymentChoice === "cash"
                          ? "border-orange-300 bg-gradient-to-r from-orange-500 to-amber-400 text-white"
                          : "border-slate-300 text-slate-700"
                      }`}
                    >
                      Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        paymentTouched.current = true;
                        setPaymentChoice("upi");
                      }}
                      className={`flex-1 rounded-full border px-4 py-2 text-center text-sm font-semibold ${
                        paymentChoice === "upi"
                          ? "border-orange-300 bg-gradient-to-r from-orange-500 to-amber-400 text-white"
                          : "border-slate-300 text-slate-700"
                      }`}
                    >
                      UPI
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    {paymentChoice === "cash"
                      ? "Cash will be collected by the waiter."
                      : "Scan the QR to pay via UPI."}
                  </div>
                  {paymentChoice === "upi" && (
                    <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                      <div className="text-xs font-semibold text-emerald-700">UPI QR</div>
                      {cafeInfo?.upiQrUrl ? (
                        <div className="mt-2 flex flex-col items-center gap-2">
                          <img
                            src={cafeInfo.upiQrUrl}
                            alt="UPI QR"
                            className="h-44 w-44 rounded-xl border border-emerald-200 object-cover"
                          />
                          <div className="text-[11px] text-emerald-700">
                            Scan to pay. Show confirmation to the waiter.
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-emerald-700">
                          UPI QR not set. Please ask the staff for payment details.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2">
                <Sparkles size={12} />
                Pay at the counter. Your status updates automatically.
              </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}
      </div>
      <CustomerBottomNav cafeId={cafeId} tableNumber={tableNumber} tableToken={tableToken} />
    </main>
    </CustomerShell>
  );
}
