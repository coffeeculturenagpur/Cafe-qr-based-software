"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { connectCafeSocket } from "../../../lib/socket";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import CustomerBottomNav from "../../../components/CustomerBottomNav";

const statusSteps = ["pending", "accepted", "preparing", "ready", "served", "paid"];

export default function OrdersPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const cafeId = params.cafeId;
  const tableNumber = useMemo(() => searchParams.get("table"), [searchParams]);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [socketState, setSocketState] = useState("disconnected");
  const [cafeInfo, setCafeInfo] = useState(null);

  const load = async () => {
    if (!cafeId || !tableNumber) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(`/api/orders/${cafeId}/table/${tableNumber}`);
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cafeId && tableNumber) load();
  }, [cafeId, tableNumber]);

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
    if (!cafeId || !tableNumber) return;
    const socket = connectCafeSocket(cafeId);
    setSocketState("connecting");

    socket.on("connect", () => setSocketState("connected"));
    socket.on("disconnect", () => setSocketState("disconnected"));

    const onOrder = (payload) => {
      if (!payload?._id) return;
      if (String(payload.tableNumber) !== String(tableNumber)) return;
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
  }, [cafeId, tableNumber]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100 pb-32">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <Button variant="outline" className="h-9 w-9 rounded-full p-0" onClick={() => router.push(`/${cafeId}/menu?table=${tableNumber}`)}>
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
        <div className="mt-3 text-xs text-slate-500">Live updates: <span className="font-semibold">{socketState}</span></div>
        {error && <div className="mt-4 text-sm font-semibold text-red-700">{error}</div>}

        {loading ? (
          <div className="mt-6 text-sm text-slate-600">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="mt-6 text-sm text-slate-600">No orders yet for this table.</div>
        ) : (
          <div className="mt-4 space-y-4">
            {orders.map((order) => {
              const activeIndex = statusSteps.indexOf(order.status);
              return (
                <Card key={order._id} className="rounded-3xl border border-slate-100 shadow-sm">
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

                    <div className="mt-3 flex items-center justify-between text-sm font-semibold text-slate-900">
                      <span>Total</span>
                      <span>INR {Number(order.totalAmount || 0).toFixed(0)}</span>
                    </div>

                    <div className="mt-3">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => router.push(`/${cafeId}/order/${order._id}?table=${tableNumber}`)}
                      >
                        Track Order
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      <CustomerBottomNav cafeId={cafeId} />
    </main>
  );
}
