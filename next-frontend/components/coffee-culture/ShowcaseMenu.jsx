"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Coffee, QrCode, AlertCircle, Loader2 } from "lucide-react";
import { apiFetch, getApiBaseUrl } from "../../lib/api";
import { getShowcaseCafeId } from "../../lib/showcaseCafe";
import { useMounted } from "../../lib/useMounted";

const FALLBACK_ITEMS = [
  {
    _id: "demo-1",
    name: "House espresso",
    description: "Connect NEXT_PUBLIC_SHOWCASE_CAFE_ID to load your real menu.",
    price: 120,
    category: "Coffee",
    type: "veg",
    image: "",
  },
  {
    _id: "demo-2",
    name: "Pour-over single origin",
    description: "This is a preview. Ordering opens only at the café.",
    price: 180,
    category: "Coffee",
    type: "veg",
    image: "",
  },
  {
    _id: "demo-3",
    name: "Cold brew",
    description: "Scan the table QR when you visit us.",
    price: 160,
    category: "Coffee",
    type: "veg",
    image: "",
  },
];

export function ShowcaseMenu() {
  const mounted = useMounted();
  const reducedMotion = useReducedMotion();
  const cafeId = getShowcaseCafeId();
  const hasApi = Boolean(getApiBaseUrl());

  const [items, setItems] = useState([]);
  const [cafeName, setCafeName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [usedFallback, setUsedFallback] = useState(false);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(items.map((it) => it.category).filter(Boolean)));
    return ["All", ...unique];
  }, [items]);

  const [cat, setCat] = useState("All");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    if (cat === "All") return items;
    return items.filter((it) => it.category === cat);
  }, [items, cat]);
  const visibleItems = showAll ? filtered : filtered.slice(0, 3);

  useEffect(() => {
    setShowAll(false);
  }, [cat, items.length]);

  useEffect(() => {
    if (!cafeId || !hasApi) {
      setItems(FALLBACK_ITEMS);
      setUsedFallback(true);
      setCafeName("Coffee Culture");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [menuData, cafeData] = await Promise.all([
          apiFetch(`/api/menu/${cafeId}`),
          apiFetch(`/api/cafe/${cafeId}`).catch(() => null),
        ]);
        if (cancelled) return;
        const list = Array.isArray(menuData) ? menuData : [];
        setItems(list.length ? list : FALLBACK_ITEMS);
        setUsedFallback(list.length === 0);
        setCafeName(cafeData?.name || "Our café");
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || "Could not load menu");
        setItems(FALLBACK_ITEMS);
        setUsedFallback(true);
        setCafeName("Coffee Culture");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cafeId, hasApi]);

  const motionProps = (i) => {
    if (!mounted || reducedMotion) return { initial: false, animate: { opacity: 1 } };
    return {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
      transition: { delay: i * 0.04, duration: 0.35 },
    };
  };

  return (
    <section id="menu" className="relative scroll-mt-24">
      <div className="mx-auto max-w-6xl px-6 pb-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/40 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-950">
              <Coffee className="h-3.5 w-3.5" aria-hidden />
              Menu
            </div>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
              {cafeName ? `${cafeName} — browse` : "What we pour"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-stone-600">
              Same items you&apos;ll order at the table. <strong className="text-stone-800">Ordering is disabled here</strong> — when
              you&apos;re here, scan the QR on your table to send to the kitchen.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-xs text-amber-950 shadow-sm">
            <QrCode className="h-5 w-5 shrink-0" aria-hidden />
            <span className="max-w-[220px] font-medium leading-snug">
              In-café ordering only — scan the QR at your seat.
            </span>
          </div>
        </div>

        {!hasApi && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              Set <code className="rounded bg-white/80 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_API_BASE_URL</code> in{" "}
              <code className="rounded bg-white/80 px-1.5 py-0.5 text-xs">.env.local</code> to load your live menu.
            </span>
          </div>
        )}

        {hasApi && !cafeId && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 text-sm text-stone-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <span>
              Add <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SHOWCASE_CAFE_ID</code> (your café
              MongoDB id) to mirror the real menu here.
            </span>
          </div>
        )}

        {error && !usedFallback && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}

        {loading && (
          <div className="mt-10 flex items-center justify-center gap-2 text-stone-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading menu…
          </div>
        )}

        {!loading && (
          <>
            <div className="mt-8 flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCat(c)}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                    cat === c
                      ? "bg-stone-900 text-white shadow-md"
                      : "bg-white/90 text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {filtered.length === 0 && !usedFallback && (
              <p className="mt-8 text-center text-sm text-stone-500">No dishes in this category.</p>
            )}

            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {visibleItems.map((it, i) => (
                <motion.article
                  key={it._id}
                  {...motionProps(i)}
                  className="group relative overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-md shadow-stone-200/40"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-amber-100 to-stone-200">
                    {it.image ? (
                      <Image
                        src={it.image}
                        alt=""
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Coffee className="h-16 w-16 text-amber-800/30" />
                      </div>
                    )}
                    <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
                      View only
                    </div>
                    {it.isSpecial && (
                      <div className="absolute right-3 top-3 rounded-full bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white">
                        Special
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-lg font-bold text-stone-900">{it.name}</h3>
                      <span className="shrink-0 text-sm font-bold text-amber-800">₹{Number(it.price || 0).toFixed(0)}</span>
                    </div>
                    {it.description && (
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-stone-600">{it.description}</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                      {it.category && (
                        <span className="rounded-md bg-stone-100 px-2 py-0.5 font-medium text-stone-700">{it.category}</span>
                      )}
                      {it.type === "veg" && (
                        <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">Veg</span>
                      )}
                      {it.type === "non-veg" && (
                        <span className="rounded-md bg-rose-100 px-2 py-0.5 font-medium text-rose-800">Non-veg</span>
                      )}
                    </div>
                    <div className="mt-4 flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-[11px] font-semibold text-stone-600">
                      <QrCode className="h-4 w-4 text-stone-500" aria-hidden />
                      Order at the café via table QR
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>

            {filtered.length > 3 && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowAll((prev) => !prev)}
                  className="rounded-full border-2 border-stone-300 bg-white px-6 py-2 text-sm font-bold text-stone-800 shadow-sm transition hover:border-stone-400 hover:bg-stone-50"
                >
                  {showAll ? "Show less" : "Show more"}
                </button>
              </div>
            )}

            {usedFallback && (
              <p className="mt-6 text-center text-xs text-stone-500">
                Showing sample items. Configure your café id to sync the live menu.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
