"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AppShell } from "../components/AppShell";
import { ShowcaseMenu } from "../components/coffee-culture/ShowcaseMenu";
import { useMounted } from "../lib/useMounted";
import { apiFetch, getApiBaseUrl } from "../lib/api";
import { getShowcaseCafeId } from "../lib/showcaseCafe";
import {
  Bean,
  Coffee,
  Clock,
  Instagram,
  Leaf,
  MapPin,
  Menu,
  QrCode,
  Sparkles,
  Star,
  Wind,
} from "lucide-react";

const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const cloudBase = cloudName
  ? `https://res.cloudinary.com/${cloudName}/image/upload`
  : "https://res.cloudinary.com/demo/image/upload";
const demoCloudBase = "https://res.cloudinary.com/demo/image/upload";

const buildImage = (publicId, transforms = "f_auto,q_auto") =>
  `${publicId.startsWith("samples/") ? demoCloudBase : cloudBase}/${transforms}/${publicId}`;


const moments = [
  { title: "Morning light", copy: "First cups pulled while the city wakes — aroma over the bar." },
  { title: "Shared tables", copy: "Laptops, dates, and regulars. Coffee as the excuse to stay a little longer." },
  { title: "Evening wind-down", copy: "Decaf and small bites — same craft, softer landing." },
];

const signatureSips = [
  {
    name: "House Espresso",
    note: "Cocoa, burnt sugar, plum finish",
    tag: "Bestseller",
    price: "180",
    image: buildImage("samples/food/coffee", "f_auto,q_auto,c_fill,w_720,h_900"),
  },
  {
    name: "Salted Caramel Latte",
    note: "Silky milk, house caramel, sea salt",
    tag: "Seasonal",
    price: "240",
    image: buildImage("samples/food/dessert", "f_auto,q_auto,c_fill,w_720,h_900"),
  },
  {
    name: "Citrus Cold Brew",
    note: "Slow steep, orange peel, clean finish",
    tag: "Cold bar",
    price: "220",
    image: buildImage("samples/food/ice-cream", "f_auto,q_auto,c_fill,w_720,h_900"),
  },
  {
    name: "Honey Oat Cappuccino",
    note: "Microfoam, local honey, toasted oat",
    tag: "Guest fave",
    price: "230",
    image: buildImage("samples/food/coffee", "f_auto,q_auto,c_fill,w_720,h_900"),
  },
  {
    name: "Matcha Cream",
    note: "Ceremonial matcha, vanilla cloud",
    tag: "Zero coffee",
    price: "210",
    image: buildImage("samples/food/pancakes", "f_auto,q_auto,c_fill,w_720,h_900"),
  },
];

const communityNotes = [
  {
    quote: "Best flat white in town. The vibe is warm and easy to sink into.",
    name: "Priya S.",
    tag: "Regular since 2021",
  },
  {
    quote: "I come for the slow bar. You can taste the care in every pour.",
    name: "Jared K.",
    tag: "Pour-over fan",
  },
  {
    quote: "Perfect for meetups - great playlists, kind staff, fast service.",
    name: "Nikita M.",
    tag: "Community host",
  },
];

const communityShots = [
  buildImage("samples/food/coffee", "f_auto,q_auto,c_fill,w_640,h_640"),
  buildImage("samples/food/pot-mussels", "f_auto,q_auto,c_fill,w_640,h_640"),
  buildImage("samples/food/dessert", "f_auto,q_auto,c_fill,w_640,h_640"),
  buildImage("samples/food/pancakes", "f_auto,q_auto,c_fill,w_640,h_640"),
];

const nonSmokingGallery = [
  {
    src: "/non-smoking1.jpeg",
    alt: "Coffee Culture non-smoking area seating",
  },
  {
    src: "/non-smoking-2.jpeg",
    alt: "Coffee Culture non-smoking area interior",
  },
  {
    src: "/non-smoking3.jpeg",
    alt: "Coffee Culture non-smoking area lounge",
  },
];

export default function Home() {
  const reducedMotion = useReducedMotion();
  const mounted = useMounted();
  const motionOn = mounted && !reducedMotion;
  const [highlightItems, setHighlightItems] = useState(signatureSips);
  const [communityReviewNotes, setCommunityReviewNotes] = useState(communityNotes);
  const [communityReviewShots, setCommunityReviewShots] = useState(communityShots);
  const [nonSmokingShots, setNonSmokingShots] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const activeNonSmokingGallery = nonSmokingShots.length > 0
    ? nonSmokingShots.map((shot, index) => ({
        src: shot,
        alt: `Coffee Culture non-smoking area ${index + 1}`,
      }))
    : nonSmokingGallery;

  const [showcaseMenuPrefetch, setShowcaseMenuPrefetch] = useState(() => {
    const baseUrl = getApiBaseUrl();
    const cafeId = getShowcaseCafeId();
    if (!baseUrl || !cafeId) return undefined;
    return null;
  });

  useEffect(() => {
    const baseUrl = getApiBaseUrl();
    const cafeId = getShowcaseCafeId();
    if (!baseUrl || !cafeId) {
      setShowcaseMenuPrefetch(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [cafeData, menuData] = await Promise.all([
          apiFetch(`/api/cafe/${cafeId}`),
          apiFetch(`/api/menu/${cafeId}`),
        ]);
        if (cancelled) return;
        const data = cafeData;
        if (Array.isArray(data?.showcaseHighlights) && data.showcaseHighlights.length > 0) {
          const mapped = data.showcaseHighlights.map((it) => ({
            name: it?.name || "Signature",
            note: it?.note || "",
            tag: it?.tag || "Special",
            price: typeof it?.price === "number" ? String(it.price) : String(Number(it?.price || 0)),
            image: it?.image || "",
          }));
          setHighlightItems(mapped);
        }
        if (Array.isArray(data?.showcaseCommunityNotes) && data.showcaseCommunityNotes.length > 0) {
          const mapped = data.showcaseCommunityNotes.map((it) => ({
            quote: it?.quote || "",
            name: it?.name || "",
            tag: it?.tag || "",
          }));
          setCommunityReviewNotes(mapped);
        }
        if (Array.isArray(data?.showcaseCommunityShots) && data.showcaseCommunityShots.length > 0) {
          const mapped = data.showcaseCommunityShots.filter(Boolean);
          if (mapped.length) setCommunityReviewShots(mapped);
        }
        if (Array.isArray(data?.showcaseNonSmokingShots) && data.showcaseNonSmokingShots.length > 0) {
          const mapped = data.showcaseNonSmokingShots.filter(Boolean);
          if (mapped.length) setNonSmokingShots(mapped);
        }
        setShowcaseMenuPrefetch({
          cafe: cafeData,
          menu: Array.isArray(menuData) ? menuData : [],
        });
      } catch {
        if (!cancelled) {
          setShowcaseMenuPrefetch({ cafe: null, menu: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell fullBleed className="coffee-culture-root relative overflow-hidden bg-[#faf7f2]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-stone-900 focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-50 border-b border-stone-200/60 bg-[#faf7f2]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-stone-200">
              <Image
                src="https://res.cloudinary.com/cafe-restaurants/image/upload/v1774080951/qrdine/godexhv2hm06cm1epkqo.jpg"
                alt="Coffee Culture logo"
                fill
                className="object-cover"
                sizes="44px"
                priority
              />
            </span>
            <div>
              <div className="font-display text-lg font-bold tracking-tight text-stone-900">Coffee Culture</div>
              <div className="text-[11px] font-medium uppercase tracking-widest text-amber-800/80">Roast · Brew · Gather</div>
            </div>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-stone-700 md:flex">
            <a href="#story" className="transition hover:text-amber-800">
              Story
            </a>
            <a href="#menu" className="transition hover:text-amber-800">
              Menu
            </a>
            <a href="#visit" className="transition hover:text-amber-800">
              Visit
            </a>
            <a
              href="/login"
              className="rounded-full bg-stone-900 px-5 py-2 text-white shadow-md transition hover:bg-stone-800"
            >
              Team login
            </a>
          </nav>
          <div className="md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-800 shadow-sm transition hover:bg-stone-50"
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-stone-200/60 bg-[#faf7f2] md:hidden">
            <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-4 text-sm font-semibold text-stone-700">
              <a href="#story" className="transition hover:text-amber-800" onClick={() => setMobileMenuOpen(false)}>
                Story
              </a>
              <a href="#menu" className="transition hover:text-amber-800" onClick={() => setMobileMenuOpen(false)}>
                Menu
              </a>
              <a href="#visit" className="transition hover:text-amber-800" onClick={() => setMobileMenuOpen(false)}>
                Visit
              </a>
              <a
                href="/login"
                className="mt-2 inline-flex items-center justify-center rounded-full bg-stone-900 px-5 py-2 text-white shadow-md transition hover:bg-stone-800"
                onClick={() => setMobileMenuOpen(false)}
              >
                Team login
              </a>
            </div>
          </div>
        )}
      </header>

      <main id="main">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(180,83,9,0.18),transparent)]" />
          <div className="coffee-culture-motif pointer-events-none absolute inset-0 opacity-70" />
          <div className="absolute -right-20 top-20 h-96 w-96 rounded-full bg-amber-400/25 blur-3xl" />
          <div className="absolute -left-10 bottom-0 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
          <motion.div
            className="pointer-events-none absolute left-16 top-10 hidden h-32 w-32 rounded-full border border-amber-300/40 bg-white/40 blur-sm md:block"
            initial={motionOn ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2 }}
          />
          <motion.div
            className="pointer-events-none absolute bottom-10 right-16 hidden h-40 w-40 rounded-full border border-amber-300/30 bg-white/30 blur-sm md:block animate-floaty"
            initial={motionOn ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.2 }}
          />

          <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 pb-20 pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <motion.div
                initial={motionOn ? { opacity: 0, y: 24 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-white/70 px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-900 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Not for ordering — experience first
                </div>
                <h1 className="mt-6 font-display text-4xl font-bold leading-[1.1] tracking-tight text-stone-900 sm:text-5xl lg:text-6xl">
                  Where every cup
                  <span className="block bg-gradient-to-r from-amber-800 via-amber-600 to-amber-800 bg-clip-text text-transparent">
                    tells a story
                  </span>
                </h1>
                <p className="mt-6 max-w-lg text-lg leading-relaxed text-stone-600">
                  We&apos;re a coffee-first house: sourcing, roasting, and brewing with intention. Explore our menu online —{" "}
                  <strong className="text-stone-800">orders only happen in-café</strong> when you scan the QR at your table.
                </p>
                <div className="mt-8 flex flex-wrap gap-4">
                  <a
                    href="#menu"
                    className="inline-flex items-center justify-center rounded-full bg-stone-900 px-8 py-3.5 text-sm font-bold text-amber-50 shadow-xl shadow-stone-900/15 transition hover:-translate-y-0.5"
                  >
                    Browse menu
                  </a>
                  <a
                    href="#visit"
                    className="inline-flex items-center justify-center rounded-full border-2 border-stone-300 bg-white px-8 py-3.5 text-sm font-bold text-stone-800 transition hover:border-stone-400"
                  >
                    Find us
                  </a>
                </div>
                <div className="mt-10 flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 text-sm text-amber-950">
                  <QrCode className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
                  <div>
                    <div className="font-bold">Ordering at the café</div>
                    <p className="mt-1 text-amber-950/90">
                      Take a seat, scan the code on your table, and your order goes straight to the bar — not from this website.
                    </p>
                  </div>
                </div>
                              <div className="mt-6 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-widest text-stone-500">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2">
                    <Coffee className="h-4 w-4 text-amber-700" aria-hidden />
                    House roasted
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2">
                    <Bean className="h-4 w-4 text-amber-700" aria-hidden />
                    Origin rotated
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2">
                    <Wind className="h-4 w-4 text-amber-700" aria-hidden />
                    Slow bar
                  </span>
                </div></motion.div>
            </div>

            <motion.div
              className="relative"
              initial={motionOn ? { opacity: 0, scale: 0.96 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.55, delay: 0.08 }}
            >
              <div className="coffee-steam-ring relative overflow-hidden rounded-[2rem] border border-stone-200/80 bg-stone-900 shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-transparent to-transparent" />
                <div className="relative aspect-[4/5] w-full">
                  <Image
                    src="/cc_hero.webp"
                    alt="Coffee Culture hero"
                    fill
                    className="object-cover opacity-95"
                    priority
                  />
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-200/90">
                    <span className="relative h-7 w-7 overflow-hidden rounded-full ring-1 ring-white/50">
                      <Image
                        src="https://res.cloudinary.com/cafe-restaurants/image/upload/v1774080951/qrdine/godexhv2hm06cm1epkqo.jpg"
                        alt="Coffee Culture logo"
                        fill
                        className="object-cover"
                        sizes="28px"
                      />
                    </span>
                    Live menu sync
                  </div>
                  <p className="mt-2 text-sm text-white/90">
                    The section below pulls from your café when configured — read-only for guests browsing from home.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="border-y border-stone-200/60 bg-white/70 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50 px-4 py-2 text-xs font-bold uppercase tracking-widest text-emerald-900">
                  <Leaf className="h-3.5 w-3.5" aria-hidden />
                  Non-smoking area
                </div>
                <h2 className="mt-4 font-display text-3xl font-bold text-stone-900 sm:text-4xl">
                  Fresh air, calmer conversations
                </h2>
                <p className="mt-3 max-w-2xl text-stone-600">
                  A dedicated non-smoking zone designed for slow coffee, relaxed meetups, and a cleaner cafe experience.
                </p>
              </div>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {activeNonSmokingGallery.map((image, index) => (
                <motion.div
                  key={image.src}
                  initial={motionOn ? { opacity: 0, y: 18 } : false}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: index * 0.08 }}
                  className="group overflow-hidden rounded-[2rem] border border-stone-200 bg-[#faf7f2] p-3 shadow-sm"
                >
                  <div className="relative aspect-[4/3] overflow-hidden rounded-[1.5rem]">
                    <Image
                      src={image.src}
                      alt={image.alt}
                      fill
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="story" className="scroll-mt-24 border-y border-stone-200/60 bg-white/50 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl font-bold text-stone-900 sm:text-4xl">Third place, first sip</h2>
              <p className="mt-4 text-stone-600">
                Coffee Culture is built around slow moments: the hiss of steam, the weight of a ceramic cup, conversations that
                run longer than the drink. We treat the menu as a living board — seasonal, honest, never rushed.
              </p>
            </div>
            <div className="mx-auto mt-10 w-full max-w-3xl overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
              <div className="relative aspect-[16/9] w-full">
                <Image
                  src="/cc_atmosphere.webp"
                  alt="Coffee Culture atmosphere"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {moments.map((m, i) => (
                <motion.div
                  key={m.title}
                  initial={motionOn ? { opacity: 0, y: 16 } : false}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded-2xl border border-stone-200 bg-[#faf7f2] p-6 shadow-sm"
                >
                  <h3 className="font-display text-xl font-bold text-stone-900">{m.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-stone-600">{m.copy}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>


        <section id="highlights" className="scroll-mt-24 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-amber-50/70 px-4 py-2 text-xs font-bold uppercase tracking-widest text-amber-900">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Signature pours
                </div>
                <h2 className="mt-4 font-display text-3xl font-bold text-stone-900 sm:text-4xl">Highlights worth the detour</h2>
                <p className="mt-3 max-w-xl text-stone-600">
                  A rotating board of crowd favorites built for Coffee Culture nights and long mornings.
                </p>
              </div>
              <div className="text-sm font-semibold text-stone-600">Swipe to explore -&gt;</div>
            </div>
            <div className="mt-10 flex gap-6 overflow-x-auto pb-4 no-scrollbar snap-x snap-mandatory">
              {highlightItems.map((item) => (
                <div
                  key={item.name}
                  className="group relative min-w-[260px] snap-start overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-lg"
                >
                  <div className="relative h-64 w-full">
                    <Image src={item.image} alt={item.name} fill className="object-cover transition duration-500 group-hover:scale-105" />
                  </div>
                  <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-amber-800">
                    {item.tag}
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-lg font-bold text-stone-900">{item.name}</h3>
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">INR {item.price}</span>
                    </div>
                    <p className="mt-2 text-sm text-stone-600">{item.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>


        <ShowcaseMenu prefetchedShowcase={showcaseMenuPrefetch} />


        <section id="community" className="scroll-mt-24 border-y border-stone-200/60 bg-white/60 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-stone-200/70 bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-stone-700">
                  <Instagram className="h-3.5 w-3.5" aria-hidden />
                  Coffee Culture community
                </div>
                <h2 className="mt-4 font-display text-3xl font-bold text-stone-900 sm:text-4xl">Regulars, rituals, reviews</h2>
                <p className="mt-3 max-w-xl text-stone-600">
                  The cafe is a slow, steady rhythm. Here is what the people in the room are saying.
                </p>
              </div>
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="grid gap-4 md:grid-cols-3">
                {communityReviewNotes.map((note) => (
                  <div key={note.name} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-amber-700">
                      <Star className="h-4 w-4 fill-amber-500 text-amber-500" aria-hidden />
                      <Star className="h-4 w-4 fill-amber-500 text-amber-500" aria-hidden />
                      <Star className="h-4 w-4 fill-amber-500 text-amber-500" aria-hidden />
                      <Star className="h-4 w-4 fill-amber-500 text-amber-500" aria-hidden />
                      <Star className="h-4 w-4 fill-amber-500 text-amber-500" aria-hidden />
                    </div>
                    <p className="mt-3 text-sm leading-snug text-stone-700">"{note.quote}"</p>
                    <div className="mt-3 text-xs font-semibold uppercase tracking-widest text-stone-400">{note.name}</div>
                    <div className="text-xs text-stone-500">{note.tag}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {communityReviewShots.map((shot, index) => (
                  <div key={`${shot}-${index}`} className="relative aspect-square overflow-hidden rounded-2xl border border-stone-200">
                    <Image src={shot} alt="Coffee Culture moment" fill className="object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-br from-transparent to-stone-900/20" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="visit" className="scroll-mt-24 border-t border-stone-200/60 bg-stone-900 py-20 text-amber-50">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <h2 className="font-display text-3xl font-bold sm:text-4xl">Visit the café</h2>
                <p className="mt-4 text-amber-100/85">
                  This site is your window into our coffee — not a checkout. When you walk in, grab a table, scan, and we&apos;ll
                  make it fresh. Same menu you previewed here, tied to your seat.
                </p>
                <div className="mt-8 grid gap-4 text-sm sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-2 text-amber-300">
                      <MapPin className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-widest">Location</span>
                    </div>
                    <p className="mt-2 text-amber-50">Shop no 8, Pioneer Regency, near RR Nursing home, KT Nagar, Nagpur, Maharashtra 440013</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center gap-2 text-amber-300">
                      <Clock className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-widest">Hours</span>
                    </div>
                    <p className="mt-2 text-amber-50">Add today&apos;s hours in your venue profile.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:col-span-2">
                    <div className="flex items-center gap-2 text-amber-300">
                      <QrCode className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-widest">In-cafe ordering</span>
                    </div>
                    <p className="mt-2 text-amber-50">QR ordering keeps the kitchen in sync - no phone orders from this page.</p>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10">
                  <Image
                    src="/cc.webp"
                    alt="Coffee Culture interior"
                    fill
                    className="object-cover opacity-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-900/80 to-transparent" />
                </div>
                <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-6">
                  <div className="text-xs font-semibold uppercase tracking-widest text-amber-300">Today&apos;s vibe</div>
                  <h3 className="mt-2 font-display text-2xl font-bold">Slow jazz, warm light, plenty of seats</h3>
                  <p className="mt-2 text-sm text-amber-100/85">
                    Designed for working mornings, late-afternoon resets, and catch-ups that run long.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-stone-200 bg-[#faf7f2] py-10">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-6 text-center text-sm text-stone-600 md:flex-row md:text-left">
            <div className="flex items-center gap-2 text-stone-800">
              <span className="relative h-7 w-7 overflow-hidden rounded-xl ring-1 ring-stone-200">
                <Image
                  src="https://res.cloudinary.com/cafe-restaurants/image/upload/v1774080951/qrdine/godexhv2hm06cm1epkqo.jpg"
                  alt="Coffee Culture logo"
                  fill
                  className="object-cover"
                  sizes="28px"
                />
              </span>
              <span className="font-display text-lg font-bold">Coffee Culture</span>
              <span className="text-stone-400">·</span>
              <span>Powered by QRDine</span>
            </div>
            <div className="flex flex-wrap justify-center gap-6 font-medium">
              <a href="#menu" className="hover:text-amber-800">
                Menu
              </a>
              <a href="/login" className="hover:text-amber-800">
                Staff
              </a>
            </div>
          </div>
        </footer>
      </main>
    </AppShell>
  );
}















