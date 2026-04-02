"use client";

import { Button } from "../ui/Button";

export function MenuFloatingCart({ cartCount, total, onViewCart }) {
  if (cartCount <= 0) return null;

  return (
    <div className="fixed left-1/2 z-40 w-[min(500px,calc(100%-1.5rem))] -translate-x-1/2 bottom-[calc(6.75rem+env(safe-area-inset-bottom))] sm:bottom-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="menu-panel border-venue-accent rounded-2xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-venue-primary text-[11px] font-semibold uppercase tracking-wider">
              {cartCount} {cartCount === 1 ? "ITEM" : "ITEMS"}
            </div>
            <div className="menu-text text-xl font-black tracking-tight">
              INR {total.toFixed(0)}
            </div>
          </div>
          <Button
            onClick={onViewCart}
            className="rounded-xl px-6 py-2 font-bold"
          >
            Place Order
          </Button>
        </div>
      </div>
    </div>
  );
}
