"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Input, Textarea } from "../../../components/ui/Input";

function cartKey(cafeId, tableNumber) {
  return `cart:${cafeId}:table:${tableNumber}`;
}

function sessionKey(cafeId, tableNumber) {
  return `customer:${cafeId}:table:${tableNumber}`;
}

export default function CartPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const cafeId = params.cafeId;
  const tableNumber = useMemo(() => {
    const t = searchParams.get("table");
    return t ? parseInt(t, 10) : null;
  }, [searchParams]);

  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!cafeId || !tableNumber) return;
    try {
      const rawCart = localStorage.getItem(cartKey(cafeId, tableNumber));
      setCart(rawCart ? JSON.parse(rawCart) : []);
    } catch {
      setCart([]);
    }

    try {
      const raw = localStorage.getItem(sessionKey(cafeId, tableNumber));
      setCustomer(raw ? JSON.parse(raw) : null);
    } catch {
      setCustomer(null);
    }
  }, [cafeId, tableNumber]);

  useEffect(() => {
    if (!cafeId || !tableNumber) return;
    localStorage.setItem(cartKey(cafeId, tableNumber), JSON.stringify(cart));
  }, [cart, cafeId, tableNumber]);

  const subtotal = cart.reduce((sum, x) => sum + x.price * x.qty, 0);

  const updateQty = (id, delta) => {
    setCart((prev) =>
      prev
        .map((x) => (x._id === id ? { ...x, qty: x.qty + delta } : x))
        .filter((x) => x.qty > 0)
    );
  };

  const placeOrder = async () => {
    if (!cafeId || !tableNumber) return;
    if (!customer?.name || !customer?.phone) {
      setError("Missing customer info. Please go back and enter name/phone.");
      return;
    }
    if (cart.length === 0) return;

    setPlacing(true);
    setError("");
    try {
      const order = await apiFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          cafeId,
          tableNumber,
          customerName: customer.name,
          phone: customer.phone,
          items: cart.map((x) => ({ name: x.name, price: x.price, qty: x.qty, menuItemId: x._id })),
        }),
      });

      localStorage.removeItem(cartKey(cafeId, tableNumber));
      setCart([]);
      router.replace(`/${cafeId}/order/${order._id}?table=${tableNumber}`);
    } catch (e) {
      setError(e.message || "Failed to place order");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand">Your Cart</h1>
          <div className="text-sm text-gray-600">Table {tableNumber || "?"}</div>
        </div>
        <Button variant="outline" onClick={() => router.push(`/${cafeId}/menu?table=${tableNumber}`)}>
          Back to Menu
        </Button>
      </div>

      {cart.length === 0 ? (
        <div className="mt-8 text-gray-700">Cart is empty.</div>
      ) : (
        <div className="mt-6 space-y-3">
          {cart.map((x) => (
            <Card key={x._id}>
              <CardContent>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-bold">{x.name}</div>
                    <div className="text-sm text-gray-600">₹{x.price} each</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" className="px-3" onClick={() => updateQty(x._id, -1)}>-</Button>
                    <div className="min-w-8 text-center font-bold">{x.qty}</div>
                    <Button variant="outline" className="px-3" onClick={() => updateQty(x._id, 1)}>+</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardContent>
              <div className="flex justify-between font-extrabold">
                <span>Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="text-sm text-gray-600 mt-1">Pay at counter after your order is ready.</div>

              <div className="mt-4">
                <label className="text-sm font-semibold text-gray-700">Order notes (optional)</label>
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Less spicy, no onion…" />
              </div>

              {error && <div className="mt-3 text-red-700 font-semibold">{error}</div>}

              <Button className="w-full mt-4" onClick={placeOrder} disabled={placing}>
                {placing ? "Placing…" : "Place Order"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
