"use client";

import { Button } from "../ui/Button";

export function MenuFloatingCart({ cartCount, total, onViewCart }) {
  if (cartCount <= 0) return null;

  return (
    <div className="fixed bottom-[7rem] left-1/2 z-30 w-[min(500px,calc(100%-1.5rem))] -translate-x-1/2">
      <div className="rounded-2xl border border-orange-200/80 bg-white/95 px-4 py-3 shadow-[0_16px_46px_-20px_rgba(249,115,22,0.5)] backdrop-blur-md ring-1 ring-orange-100/70">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-600/90">
              {cartCount} {cartCount === 1 ? "ITEM" : "ITEMS"}
            </div>
            <div className="text-xl font-black tracking-tight text-slate-900">
              ₹ {total.toFixed(0)}
            </div>
          </div>
          <Button
            onClick={onViewCart}
            className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-2 font-bold shadow-lg shadow-orange-500/25"
          >
            Place Order
          </Button>
        </div>
      </div>
    </div>
  );
}
