"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { Button } from "../../../components/ui/Button";
import { ArrowLeft, Minus, Plus, Sparkles, Receipt } from "lucide-react";
import { Card, CardContent } from "../../../components/ui/Card";
import CustomerBottomNav from "../../../components/CustomerBottomNav";
import { CustomerShell } from "../../../components/CustomerShell";
import SoundControl from "../../../components/SoundControl";
import { Input, Textarea } from "../../../components/ui/Input";
import { playSoftError, playSuccess } from "../../../lib/sounds";
import { getOrCreateVisitId } from "../../../lib/visitSession";
import { setCssVarsFromCafe } from "../../../lib/theme";
import { formatIndianMobileInput, normalizeIndianMobile } from "../../../lib/phoneIn";
import { useTableGuard } from "../../../lib/useTableGuard";
import { motion, useReducedMotion } from "framer-motion";

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
  const tableToken = useMemo(() => searchParams.get("t") || "", [searchParams]);

  const [cart, setCart] = useState([]);
  const [cafeInfo, setCafeInfo] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMode] = useState("cash");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const reducedMotion = useReducedMotion();
  const tableGuard = useTableGuard({
    cafeId,
    tableNumber,
    token: tableToken,
    router,
    redirectTo: (table, token) => `/${cafeId}/cart?table=${table}&t=${encodeURIComponent(token)}`,
  });

  useEffect(() => {
    if (cafeInfo) setCssVarsFromCafe(cafeInfo);
  }, [cafeInfo]);

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
      setCustomerPhone(formatIndianMobileInput(parsed?.phone || ""));
    } catch {
      setCustomer(null);
      setCustomerName("");
      setCustomerPhone("");
    }
    setHydrated(true);
  }, [cafeId, tableNumber]);

  useEffect(() => {
    if (!hydrated || !cafeId) return;
    (async () => {
      try {
        const me = await apiFetch("/api/customers/me");
        if (me?.name) setCustomerName((prev) => (prev && prev.trim() ? prev : me.name));
        if (me?.phone) {
          setCustomerPhone((prev) =>
            prev && prev.trim() ? prev : formatIndianMobileInput(me.phone)
          );
        }
      } catch {
        // no saved session
      }
    })();
  }, [hydrated, cafeId]);

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
  const taxRate = Number(cafeInfo?.taxPercent || 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;
  const canPlace = cart.length > 0 && !placing;
  const totalItems = cart.reduce((sum, x) => sum + x.qty, 0);

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
    const phoneDigits = normalizeIndianMobile(customerPhone);
    if (!nameToUse || !customerPhone?.trim()) {
      setShowDetails(true);
      setError("");
      setPhoneError("");
      return;
    }
    if (!phoneDigits) {
      setPhoneError("Enter a valid 10-digit Indian mobile number (starts with 6–9).");
      setShowDetails(true);
      setError("");
      return;
    }
    setPhoneError("");
    if (cart.length === 0) return;

    setShowDetails(false);
    setPlacing(true);
    setError("");
    try {
      const visitId = getOrCreateVisitId(cafeId, tableNumber);
      if (!visitId) {
        setError("Could not start visit session. Please refresh the page.");
        setPlacing(false);
        return;
      }

      let customerLat;
      let customerLng;
      const needGeo =
        cafeInfo &&
        typeof cafeInfo.latitude === "number" &&
        typeof cafeInfo.longitude === "number" &&
        Number(cafeInfo.serviceRadiusMeters) > 0;
      if (needGeo) {
        try {
          const pos = await new Promise((resolve, reject) => {
            if (typeof navigator === "undefined" || !navigator.geolocation) {
              reject(new Error("Location not available"));
              return;
            }
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 12000, enableHighAccuracy: true });
          });
          customerLat = pos.coords.latitude;
          customerLng = pos.coords.longitude;
        } catch {
          setError("Location access is required to order from this venue. Enable GPS and try again.");
          setPlacing(false);
          return;
        }
      }

      const order = await apiFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          cafeId,
          tableNumber,
          visitId,
          tableToken,
          customerName: nameToUse,
          phone: phoneDigits,
          customerLat,
          customerLng,
          paymentMode,
          items: cart.map((x) => ({ name: x.name, price: x.price, qty: x.qty, menuItemId: x._id })),
        }),
      });

      localStorage.removeItem(cartKey(cafeId, tableNumber));
      setCart([]);
      playSuccess();
      router.replace(`/${cafeId}/order/${order._id}?table=${tableNumber}&t=${encodeURIComponent(tableToken)}`);
    } catch (e) {
      playSoftError();
      setError(e.message || "Failed to place order");
    } finally {
      setPlacing(false);
    }
  };

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

  const itemMotion = reducedMotion
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2 } };

  return (
    <CustomerShell bottomInsetClass="pb-44">
    <main className="min-h-screen">
      <div className="sticky top-0 z-20 border-b border-white/60 bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2 px-4 py-3">
          <Button variant="outline" className="h-9 w-9 shrink-0 rounded-full p-0" onClick={() => router.push(`/${cafeId}/menu?table=${tableNumber}&t=${encodeURIComponent(tableToken)}`)}>
            <ArrowLeft size={18} className="text-slate-900" />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <div className="text-xs text-slate-500">Table {tableNumber || "?"}</div>
            <div className="text-sm font-semibold text-slate-900">Review your order</div>
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
          <div className="flex shrink-0 justify-end">
            <SoundControl />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-4 pt-2">
        {cart.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-white/70 bg-white/80 p-6 text-center text-sm text-slate-600 shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
              <Receipt size={20} />
            </div>
            <div className="mt-3 text-base font-semibold text-slate-900">Your cart is empty</div>
            <div className="mt-1 text-xs text-slate-500">Add a few favorites to get started.</div>
            <Button className="mt-4 w-full rounded-full" onClick={() => router.push(`/${cafeId}/menu?table=${tableNumber}&t=${encodeURIComponent(tableToken)}`)}>
              Browse Menu
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {cart.map((x) => (
              <motion.div key={x._id} {...itemMotion}>
                <Card className="rounded-3xl border border-white/70 bg-white/85 shadow-sm">
                  <CardContent>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{x.name}</div>
                        <div className="text-xs text-slate-500">INR {Number(x.price || 0).toFixed(0)}</div>
                      </div>
                      <div className="flex items-center rounded-full border border-orange-200 bg-white px-1 py-1 shadow-sm">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 w-8 rounded-full p-0"
                          onClick={() => updateQty(x._id, -1)}
                        >
                          <Minus size={16} />
                        </Button>
                        <div className="min-w-8 text-center text-sm font-semibold">{x.qty}</div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 w-8 rounded-full p-0"
                          onClick={() => updateQty(x._id, 1)}
                        >
                          <Plus size={16} />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            <Card className="rounded-3xl border border-white/70 bg-white/85 shadow-sm">
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-slate-400">Step 2</div>
                    <div className="text-sm font-semibold text-slate-700">Bill summary</div>
                  </div>
                  <div className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                    <Sparkles size={12} /> Fast checkout
                  </div>
                </div>
                <div className="space-y-2 text-sm text-slate-600">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>INR {subtotal.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax {taxRate ? `(${taxRate}%)` : ""}</span>
                    <span>INR {taxAmount.toFixed(0)}</span>
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

                <Button className="mt-4 w-full rounded-full" onClick={placeOrder} disabled={!canPlace}>
                  {placing ? "Placing..." : "Place Order"}
                </Button>
                <div className="mt-2 text-xs text-slate-500">
                  Add items and confirm quantity before placing your order.
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {showDetails && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 px-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/70 bg-white p-5 shadow-2xl">
            <div className="text-xs uppercase tracking-widest text-slate-400">Customer details</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">Tell us who you are</div>
            <div className="mt-1 text-xs text-slate-500">We’ll attach this to your order.</div>

            <div className="mt-4 grid gap-3">
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your name" autoComplete="name" />
              <div>
                <Input
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(formatIndianMobileInput(e.target.value));
                    setPhoneError("");
                  }}
                  placeholder="10-digit mobile"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                  className={phoneError ? "border-red-400" : ""}
                />
                <p className="mt-1 text-[11px] text-slate-500">Indian mobile: 10 digits, starting with 6–9.</p>
                {phoneError && <div className="mt-1 text-xs font-semibold text-red-600">{phoneError}</div>}
              </div>
            </div>

            {error && <div className="mt-3 text-sm font-semibold text-red-700">{error}</div>}

            <div className="mt-5 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowDetails(false)} disabled={placing}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={() => placeOrder()} disabled={placing}>
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      <CustomerBottomNav cafeId={cafeId} tableNumber={tableNumber} tableToken={tableToken} />
    </main>
    </CustomerShell>
  );
}
