"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";

export default function CafeEntryPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const cafeId = params.cafeId;

  const tableNumber = useMemo(() => {
    const t = searchParams.get("table");
    return t ? parseInt(t, 10) : null;
  }, [searchParams]);

  const [cafe, setCafe] = useState(null);
  const [splash, setSplash] = useState(true);
  const [step, setStep] = useState("landing");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSplash(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiFetch(`/api/cafe/${cafeId}`);
        if (!cancelled) setCafe(data);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load cafe");
      }
    }
    if (cafeId) load();
    return () => {
      cancelled = true;
    };
  }, [cafeId]);

  const handleContinue = (e) => {
    e.preventDefault();
    if (!name.trim()) return setError("Please enter your name");
    if (!phone.trim()) return setError("Please enter your phone number");
    if (!tableNumber) return setError("Missing table number (?table=1)");

    const sessionKey = `customer:${cafeId}:table:${tableNumber}`;
    localStorage.setItem(
      sessionKey,
      JSON.stringify({ cafeId, tableNumber, name: name.trim(), phone: phone.trim() })
    );
    router.replace(`/${cafeId}/menu?table=${tableNumber}`);
  };

  if (splash) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-100 to-amber-200">
        <div className="text-center">
          <div className="text-5xl font-extrabold text-brand mb-2">
            {cafe?.name || "QRDine"}
          </div>
          <div className="text-gray-600 font-semibold">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-cover bg-center"
      style={{ backgroundImage: cafe?.brandImageUrl ? `url(${cafe.brandImageUrl})` : "none" }}
    >
      <div className="min-h-screen bg-white/70 backdrop-blur-sm flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardContent>
            <div className="flex items-center gap-3 mb-4">
              {cafe?.logoUrl ? (
                <img src={cafe.logoUrl} alt={cafe.name} className="w-12 h-12 rounded-xl object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-brand font-extrabold">Q</div>
              )}
              <div>
                <div className="text-xl font-extrabold text-orange-700">{cafe?.name || "Cafe"}</div>
                <div className="text-sm text-gray-600">Table {tableNumber || "?"}</div>
              </div>
            </div>

            {step === "landing" ? (
              <>
                <p className="text-gray-700 mb-6">Scan. Order. Pay at counter.</p>
                <Button className="w-full" onClick={() => setStep("info")}>Get Started</Button>
              </>
            ) : (
              <form onSubmit={handleContinue} className="space-y-4">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" />
                <Button className="w-full" type="submit">Continue to Menu</Button>
              </form>
            )}

            {error && <p className="text-red-600 font-semibold mt-4">{error}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
