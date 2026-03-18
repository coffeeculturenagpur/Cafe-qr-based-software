"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ShoppingCart, Plus, Minus } from "lucide-react";
import { apiFetch } from "../../../lib/api";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";

function cartKey(cafeId, tableNumber) {
  return `cart:${cafeId}:table:${tableNumber}`;
}

export default function MenuPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const cafeId = params.cafeId;
  const tableNumber = useMemo(() => {
    const t = searchParams.get("table");
    return t ? parseInt(t, 10) : null;
  }, [searchParams]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cart, setCart] = useState([]);

  useEffect(() => {
    if (!cafeId || !tableNumber) return;
    try {
      const raw = localStorage.getItem(cartKey(cafeId, tableNumber));
      const parsed = raw ? JSON.parse(raw) : [];
      setCart(Array.isArray(parsed) ? parsed : []);
    } catch {
      setCart([]);
    }
  }, [cafeId, tableNumber]);

  useEffect(() => {
    if (!cafeId || !tableNumber) return;
    localStorage.setItem(cartKey(cafeId, tableNumber), JSON.stringify(cart));
  }, [cart, cafeId, tableNumber]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const data = await apiFetch(`/api/menu/${cafeId}`);
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load menu");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (cafeId) load();
    return () => {
      cancelled = true;
    };
  }, [cafeId]);

  const add = (item) => {
    setCart((prev) => {
      const found = prev.find((x) => x._id === item._id);
      if (found) {
        return prev.map((x) => (x._id === item._id ? { ...x, qty: x.qty + 1 } : x));
      }
      return [...prev, { _id: item._id, name: item.name, price: item.price, qty: 1 }];
    });
  };

  const remove = (item) => {
    setCart((prev) =>
      prev
        .map((x) => (x._id === item._id ? { ...x, qty: x.qty - 1 } : x))
        .filter((x) => x.qty > 0)
    );
  };

  const cartCount = cart.reduce((sum, x) => sum + x.qty, 0);
  const total = cart.reduce((sum, x) => sum + x.price * x.qty, 0);

  const openCart = () => {
    if (!tableNumber) return;
    router.push(`/${cafeId}/cart?table=${tableNumber}`);
  };

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand">Menu</h1>
          <div className="text-sm text-gray-600">Table {tableNumber || "?"}</div>
        </div>
        <Button onClick={openCart} className="gap-2">
          <ShoppingCart size={18} /> Cart ({cartCount})
        </Button>
      </div>

      {loading ? (
        <div className="mt-6 text-gray-700">Loading…</div>
      ) : error ? (
        <div className="mt-6 text-red-700 font-semibold">{error}</div>
      ) : (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((it) => {
            const inCart = cart.find((x) => x._id === it._id);
            return (
              <Card key={it._id}>
                <CardContent>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-bold text-gray-900">{it.name}</div>
                      <div className="text-sm text-gray-600">{it.description}</div>
                      <div className="mt-2 font-extrabold text-orange-700">₹{it.price}</div>
                    </div>

                    {!inCart ? (
                      <Button onClick={() => add(it)} className="shrink-0 gap-2">
                        <Plus size={18} /> Add
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button variant="outline" onClick={() => remove(it)} className="px-3">
                          <Minus size={18} />
                        </Button>
                        <div className="min-w-8 text-center font-bold">{inCart.qty}</div>
                        <Button variant="outline" onClick={() => add(it)} className="px-3">
                          <Plus size={18} />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {cartCount > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[min(720px,calc(100%-2rem))] bg-white border border-orange-100 rounded-2xl shadow-lg p-4 flex items-center justify-between">
          <div>
            <div className="font-extrabold text-gray-900">₹{total.toFixed(2)}</div>
            <div className="text-sm text-gray-600">{cartCount} item(s)</div>
          </div>
          <Button onClick={openCart}>Go to Cart</Button>
        </div>
      )}
    </main>
  );
}
