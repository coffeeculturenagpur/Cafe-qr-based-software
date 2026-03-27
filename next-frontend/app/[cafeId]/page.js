"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { setTableSession } from "../../lib/tableSession";
import { getCafeWithCache } from "../../lib/cafeClient";

export default function CafeEntryPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const cafeId = params.cafeId;

  const tableNumber = useMemo(() => {
    const t = searchParams.get("table");
    return t ? parseInt(t, 10) : null;
  }, [searchParams]);
  const tableToken = useMemo(() => searchParams.get("t") || "", [searchParams]);

  const [cafe, setCafe] = useState(null);
  const [splash, setSplash] = useState(true);
  const [minDelayDone, setMinDelayDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setMinDelayDone(true), 2200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!minDelayDone) return;
    // Keep the splash until cafe metadata is available so we don't show fallback branding.
    if (cafe || error) setSplash(false);
  }, [minDelayDone, cafe, error]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getCafeWithCache(cafeId);
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

  useEffect(() => {
    if (splash) return;
    if (!tableNumber) {
      setError("Missing table number (?table=1)");
      return;
    }
    if (!tableToken) {
      setError("Invalid table link. Please scan the table QR again.");
      return;
    }
    if (!cafeId) return;
    (async () => {
      try {
        await apiFetch(
          `/api/qr/verify?cafeId=${encodeURIComponent(cafeId)}&tableNumber=${encodeURIComponent(
            tableNumber
          )}&t=${encodeURIComponent(tableToken)}`
        );
        setTableSession(cafeId, tableNumber, tableToken);
        router.replace(`/${cafeId}/menu?table=${tableNumber}&t=${encodeURIComponent(tableToken)}`);
      } catch (e) {
        setError(e?.message || "Invalid table link. Please scan the table QR again.");
      }
    })();
  }, [splash, cafeId, tableNumber, tableToken, router]);

  if (splash) {
    return (
      <div className="min-h-screen customer-shell flex items-center justify-center px-6">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: cafe?.brandImageUrl ? `url(${cafe.brandImageUrl})` : "none",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black/70" />
        <div className="relative z-10 w-full max-w-sm text-center text-white">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-white/15 shadow-2xl shadow-black/40 backdrop-blur">
            {cafe?.logoUrl ? (
              <Image
                src={cafe.logoUrl}
                alt={cafe?.name || "Cafe"}
                width={80}
                height={80}
                unoptimized
                priority
                className="h-20 w-20 rounded-2xl border border-white/30 object-cover"
              />
            ) : (
              <div className="text-3xl font-extrabold">Q</div>
            )}
          </div>
          <div className="mt-4 text-4xl font-extrabold">{cafe?.name || ""}</div>
          <div className="mt-2 text-sm font-semibold text-white/80">Preparing your menu experience…</div>
          <div className="mt-6 rounded-full bg-white/20 p-1">
            <div className="h-2 w-2/3 rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 shadow-lg shadow-orange-500/40 animate-glow" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-orange-50">
      <div className="text-center">
        <div className="text-lg font-semibold text-gray-700">Redirecting to menu…</div>
        {error && <div className="mt-3 text-red-600 font-semibold">{error}</div>}
      </div>
    </div>
  );
}
