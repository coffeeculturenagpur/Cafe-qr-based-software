"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { apiFetch } from "../../../../lib/api";
import { connectCafeSocket } from "../../../../lib/socket";
import { Button } from "../../../../components/ui/Button";
import { Card, CardContent } from "../../../../components/ui/Card";
import CustomerBottomNav from "../../../../components/CustomerBottomNav";

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
  const router = useRouter();

  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [socketState, setSocketState] = useState("disconnected");
  const [cafeInfo, setCafeInfo] = useState(null);

  const load = async () => {
    try {
      // No GET /api/orders/:id yet in backend; fallback: list and find.
      const list = await apiFetch(`/api/orders/${cafeId}`);
      const found = Array.isArray(list) ? list.find((o) => o._id === orderId) : null;
      setOrder(found || null);
    } catch (e) {
      setError(e.message || "Failed to load order");
    }
  };

  useEffect(() => {
    setError("");
    if (cafeId && orderId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafeId, orderId]);

  useEffect(() => {
    if (!cafeId || !orderId) return;

    const socket = connectCafeSocket(cafeId);
    setSocketState("connecting");

    socket.on("connect", () => setSocketState("connected"));
    socket.on("disconnect", () => setSocketState("disconnected"));

    const onOrder = (payload) => {
      if (payload?._id === orderId) setOrder(payload);
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
  }, [cafeId, orderId]);

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

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100 pb-32">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <Button
            variant="outline"
            className="h-9 w-9 rounded-full p-0"
            onClick={() => router.push(`/${cafeId}/menu?table=${tableNumber}`)}
          >
            <ArrowLeft size={18} className="text-slate-900" />
          </Button>
          <div className="text-center">
            <div className="text-xs text-slate-500">Table {tableNumber || "?"}</div>
            <div className="text-sm font-semibold text-slate-900">Your Orders</div>
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
          <Button variant="outline" className="h-9 rounded-full px-3 text-xs" onClick={load}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-4 pt-2">
        <div className="mt-3 text-xs text-slate-500">
          Live updates: <span className="font-semibold">{socketState}</span>
        </div>

        {error ? (
          <div className="mt-6 text-sm font-semibold text-red-700">{error}</div>
        ) : !order ? (
          <div className="mt-6 text-sm text-slate-600">Loading...</div>
        ) : (
          <Card className="mt-4 rounded-3xl border border-slate-100 shadow-sm">
            <CardContent>
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

              <div className="mt-4 flex justify-between text-base font-extrabold text-slate-900">
                <span>Total</span>
                <span>INR {Number(order.totalAmount || 0).toFixed(0)}</span>
              </div>

              <div className="mt-3 text-xs text-slate-500">
                Pay at the counter. Your status updates automatically.
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      <CustomerBottomNav cafeId={cafeId} />
    </main>
  );
}
