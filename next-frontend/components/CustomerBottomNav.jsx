"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ShoppingCart, UtensilsCrossed, ClipboardList } from "lucide-react";

export default function CustomerBottomNav({ cafeId, tableNumber, tableToken }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [cartCount, setCartCount] = useState(0);
  const [table, setTable] = useState(() =>
    tableNumber !== undefined && tableNumber !== null && tableNumber !== "" ? String(tableNumber) : ""
  );
  const tokenParam = tableToken ? `&t=${encodeURIComponent(tableToken)}` : "";

  useEffect(() => {
    if (tableNumber !== undefined && tableNumber !== null && tableNumber !== "") {
      setTable(String(tableNumber));
      return;
    }
    const next = searchParams.get("table");
    if (next !== null && next !== undefined) setTable(next);
  }, [searchParams, tableNumber]);

  useEffect(() => {
    if (typeof window === "undefined" || !cafeId || !table) {
      setCartCount(0);
      return;
    }

    const loadCartCount = () => {
      try {
        const raw = window.localStorage.getItem(`cart:${cafeId}:table:${table}`);
        const parsed = raw ? JSON.parse(raw) : [];
        const count = Array.isArray(parsed)
          ? parsed.reduce((sum, item) => sum + Number(item?.qty || 0), 0)
          : 0;
        setCartCount(count);
      } catch {
        setCartCount(0);
      }
    };

    loadCartCount();
    window.addEventListener("storage", loadCartCount);
    window.addEventListener("focus", loadCartCount);
    window.addEventListener("qrdine-cart-updated", loadCartCount);
    return () => {
      window.removeEventListener("storage", loadCartCount);
      window.removeEventListener("focus", loadCartCount);
      window.removeEventListener("qrdine-cart-updated", loadCartCount);
    };
  }, [cafeId, table]);

  const links = [
    { key: "menu", label: "Menu", href: `/${cafeId}/menu?table=${table || ""}${tokenParam}`, icon: UtensilsCrossed },
    { key: "orders", label: "Orders", href: `/${cafeId}/orders?table=${table || ""}${tokenParam}`, icon: ClipboardList },
    { key: "cart", label: "Cart", href: `/${cafeId}/cart?table=${table || ""}${tokenParam}`, icon: ShoppingCart },
  ];

  const isActive = (key) => pathname?.includes(`/${key}`);

  return (
    <nav className="fixed bottom-0 left-1/2 z-30 w-[min(520px,calc(100%-1.5rem))] -translate-x-1/2 pb-4">
      <div className="menu-panel rounded-2xl">
        <div className="grid grid-cols-3 gap-1 p-2 text-xs font-semibold">
          {links.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.key);
            return (
              <a
                key={item.key}
                href={item.href}
                className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 transition ${
                  active ? "bg-venue-gradient text-white shadow" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className={`relative flex h-8 w-8 items-center justify-center rounded-full ${active ? "bg-white/20" : "bg-slate-100"}`}>
                  <Icon size={16} />
                  {item.key === "cart" && cartCount > 0 && (
                    <span className="bg-venue-primary absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white shadow">
                      {cartCount}
                    </span>
                  )}
                </span>
                <span>{item.label}</span>
              </a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
