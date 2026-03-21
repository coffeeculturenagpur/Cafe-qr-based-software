"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { Button } from "../../../components/ui/Button";
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { Card, CardContent } from "../../../components/ui/Card";
import CustomerBottomNav from "../../../components/CustomerBottomNav";
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
  const [cafeInfo, setCafeInfo] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

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
      const parsed = raw ? JSON.parse(raw) : null;
      setCustomer(parsed);
      setCustomerName(parsed?.name || "");
      setCustomerPhone(parsed?.phone || "");
    } catch {
      setCustomer(null);
      setCustomerName("");
      setCustomerPhone("");
    }
    setHydrated(true);
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
    if (!customerName && !customerPhone) return;
    localStorage.setItem(
      sessionKey(cafeId, tableNumber),
      JSON.stringify({ cafeId, tableNumber, name: customerName.trim(), phone: customerPhone.trim() })
    );
  }, [cafeId, tableNumber, customerName, customerPhone]);

  useEffect(() => {
    if (!cafeId || !tableNumber) return;
    if (!hydrated) return;
    localStorage.setItem(cartKey(cafeId, tableNumber), JSON.stringify(cart));
  }, [cart, cafeId, tableNumber, hydrated]);

  const subtotal = cart.reduce((sum, x) => sum + x.price * x.qty, 0);
  const gst = 0;
  const total = subtotal + gst;

  const updateQty = (id, delta) => {
    setCart((prev) =>
      prev
        .map((x) => (x._id === id ? { ...x, qty: x.qty + delta } : x))
        .filter((x) => x.qty > 0)
    );
  };

  const placeOrder = async () => {
    if (!cafeId || !tableNumber) return;
    const nameToUse = customerName?.trim();
    const phoneToUse = customerPhone?.trim();
    if (!nameToUse || !phoneToUse) {
      setError("Please enter your name and phone number.");
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
          customerName: nameToUse,
          phone: phoneToUse,
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
    <main className="min-h-screen bg-gradient-to-b from-white via-slate-50 to-slate-100 pb-32">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <Button variant="outline" className="h-9 w-9 rounded-full p-0" onClick={() => router.push(`/${cafeId}/menu?table=${tableNumber}`)}>
            <ArrowLeft size={18} className="text-slate-900" />
          </Button>
          <div className="text-center">
            <div className="text-xs text-slate-500">Table {tableNumber || "?"}</div>
            <div className="text-sm font-semibold text-slate-900">Your Cart</div>
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
          <div className="h-9 w-9" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-4 pt-2">
        {cart.length === 0 ? (
          <div className="mt-8 text-sm text-slate-600">Cart is empty.</div>
        ) : (
          <div className="mt-4 space-y-4">
            <Card className="rounded-3xl border border-slate-100 shadow-sm">
              <CardContent>
                <div className="text-sm font-semibold text-slate-700">Customer details</div>
                <div className="mt-3 grid grid-cols-1 gap-3">
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your name" />
                  <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number (e.g. +91XXXXXXXXXX)" />
                </div>
              </CardContent>
            </Card>

            {cart.map((x) => (
              <Card key={x._id} className="rounded-3xl border border-slate-100 shadow-sm">
                <CardContent>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{x.name}</div>
                      <div className="text-xs text-slate-500">INR {Number(x.price || 0).toFixed(0)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" className="h-8 w-8 rounded-full p-0 text-lg font-bold" onClick={() => updateQty(x._id, -1)}>
                        -
                      </Button>
                      <div className="min-w-6 text-center text-sm font-semibold">{x.qty}</div>
                      <Button variant="outline" className="h-8 w-8 rounded-full p-0 text-lg font-bold" onClick={() => updateQty(x._id, 1)}>
                        +
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            <Card className="rounded-3xl border border-slate-100 shadow-sm">
              <CardContent>
                <div className="space-y-2 text-sm text-slate-600">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>INR {subtotal.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST</span>
                    <span>INR {gst.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between text-base font-extrabold text-slate-900">
                    <span>Total</span>
                    <span>INR {total.toFixed(0)}</span>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="text-xs font-semibold text-slate-600">Order notes (optional)</label>
                  <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Less spicy, no onion..." />
                </div>

                {error && <div className="mt-3 text-sm font-semibold text-red-700">{error}</div>}

                <Button className="mt-4 w-full rounded-full" onClick={placeOrder} disabled={placing}>
                  {placing ? "Placing..." : "Place Order"}
                </Button>
                <div className="mt-2 text-xs text-slate-500">Pay at counter after your order is ready.</div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      <CustomerBottomNav cafeId={cafeId} />
    </main>
  );
}
