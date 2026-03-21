"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ShoppingCart, UtensilsCrossed, ClipboardList } from "lucide-react";

export default function CustomerBottomNav({ cafeId }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const table = searchParams.get("table");

  const links = [
    { key: "menu", label: "Menu", href: `/${cafeId}/menu?table=${table || ""}`, icon: UtensilsCrossed },
    { key: "orders", label: "Orders", href: `/${cafeId}/orders?table=${table || ""}`, icon: ClipboardList },
    { key: "cart", label: "Cart", href: `/${cafeId}/cart?table=${table || ""}`, icon: ShoppingCart },
  ];

  const isActive = (key) => pathname?.includes(`/${key}`);

  return (
    <nav className="fixed bottom-0 left-1/2 z-30 w-[min(520px,calc(100%-1.5rem))] -translate-x-1/2 pb-4">
      <div className="rounded-2xl border border-white/60 bg-white/90 shadow-xl shadow-slate-200/60 backdrop-blur">
        <div className="grid grid-cols-3 gap-1 p-2 text-xs font-semibold">
          {links.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.key);
            return (
              <a
                key={item.key}
                href={item.href}
                className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 transition ${
                  active ? "bg-orange-100 text-orange-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
