"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { authHeaders, getToken, getUser } from "../../lib/auth";
import { connectCafeSocket } from "../../lib/socket";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";

function upsertOrder(list, order) {
  const idx = list.findIndex((x) => x._id === order._id);
  if (idx === -1) return [order, ...list];
  const copy = list.slice();
  copy[idx] = order;
  return copy;
}

export default function KitchenPage() {
  const token = getToken();
  const user = getUser();

  const [cafeIdOverride, setCafeIdOverride] = useState("");
  const cafeId = useMemo(() => cafeIdOverride || user?.cafeId || "", [cafeIdOverride, user?.cafeId]);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [socketState, setSocketState] = useState("disconnected");

  const load = async () => {
    if (!cafeId) return;
    setLoading(true);
    setError("");
    try {
      const list = await apiFetch(`/api/orders/${cafeId}`, { headers: { ...(token ? authHeaders() : {}) } });
      setOrders(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      window.location.href = "/admin/login";
    }
  }, [token]);

  useEffect(() => {
    if (cafeId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafeId]);

  useEffect(() => {
    if (!cafeId) return;

    const socket = connectCafeSocket(cafeId);
    setSocketState("connecting");

    socket.on("connect", () => setSocketState("connected"));
    socket.on("disconnect", () => setSocketState("disconnected"));

    socket.on("NEW_ORDER", (order) => setOrders((prev) => upsertOrder(prev, order)));
    socket.on("ORDER_UPDATED", (order) => setOrders((prev) => upsertOrder(prev, order)));

    return () => {
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
      setOrders((prev) => prev.map((o) => (o._id === updated._id ? updated : o)));
    } catch (e) {
      setError(e.message || "Failed to update order");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-brand">Kitchen Dashboard</h1>
          <div className="text-sm text-gray-600 mt-1">Live updates: <span className="font-semibold">{socketState}</span></div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={!cafeId || loading}>Refresh</Button>
        </div>
      </div>

      {!user?.cafeId && (
        <Card className="mt-6">
          <CardContent>
            <div className="font-bold">Cafe scope</div>
            <div className="text-sm text-gray-600 mt-1">Your user token does not include a <code className="font-mono">cafeId</code>. Enter one to view orders.</div>
            <div className="mt-3 flex gap-2">
              <Input value={cafeIdOverride} onChange={(e) => setCafeIdOverride(e.target.value)} placeholder="cafeId (ObjectId)" />
              <Button variant="outline" onClick={load} disabled={!cafeIdOverride || loading}>Load</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && <div className="mt-4 text-red-700 font-semibold">{error}</div>}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {orders.map((o) => (
          <Card key={o._id}>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-extrabold">Table {o.tableNumber}</div>
                  <div className="text-sm text-gray-600">{o.customerName} · {o.phone}</div>
                </div>
                <div className="px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 font-semibold">
                  {o.status}
                </div>
              </div>

              <div className="mt-3 space-y-1 text-sm">
                {o.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{it.name} × {it.qty}</span>
                    <span>₹{(it.price * it.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex justify-between font-extrabold">
                <span>Total</span>
                <span>₹{Number(o.totalAmount || 0).toFixed(2)}</span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setStatus(o._id, "preparing")} disabled={loading}>Preparing</Button>
                <Button variant="outline" onClick={() => setStatus(o._id, "ready")} disabled={loading}>Ready</Button>
                <Button variant="outline" onClick={() => setStatus(o._id, "served")} disabled={loading}>Served</Button>
                <Button variant="outline" onClick={() => setStatus(o._id, "paid")} disabled={loading}>Paid</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && cafeId && orders.length === 0 && (
        <div className="mt-6 text-gray-700">No orders yet.</div>
      )}
    </main>
  );
}