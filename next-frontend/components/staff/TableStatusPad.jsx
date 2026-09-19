"use client";

import { useEffect, useState } from "react";
import { getOrderStatusPalette } from "../../lib/orderStatusPalette";

const DEFAULT_TABLE_COUNT = 0;

function toPositiveNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) return null;
  return Math.trunc(numeric);
}

function buildTableStatusMap(groups) {
  const map = new Map();

  for (const group of Array.isArray(groups) ? groups : []) {
    const tableNumber = toPositiveNumber(group?.tableNumber);
    if (!tableNumber) continue;
    map.set(tableNumber, {
      tableKey: group.tableKey || String(tableNumber),
      orderCount: Array.isArray(group.orders) ? group.orders.length : 0,
      orders: Array.isArray(group.orders) ? group.orders : [],
      manualOrderCount: Array.isArray(group.orders)
        ? group.orders.filter((order) => order?.source === "manual").length
        : 0,
    });
  }

  return map;
}

function getTableStatus(group) {
  const statuses = Array.isArray(group?.orders)
    ? group.orders.map((order) => String(order?.status || "").toLowerCase().trim())
    : [];

  const priority = ["pending", "accepted", "preparing", "ready", "served", "paid", "rejected"];
  for (const status of priority) {
    if (statuses.includes(status)) return status;
  }
  return statuses[0] || "";
}

const FREE_STYLE_LIGHT = { backgroundColor: "#f8fafc", borderColor: "#e2e8f0", color: "#334155" };
const FREE_STYLE_DARK = { backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#94a3b8" };
const FREE_LEGEND_LIGHT = { backgroundColor: "#f8fafc", borderColor: "#cbd5e1", color: "#475569" };
const FREE_LEGEND_DARK = { backgroundColor: "#0f172a", borderColor: "#334155", color: "#94a3b8" };

function useIsDarkMode() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    setIsDark(el.classList.contains("dark"));
    const observer = new MutationObserver(() => {
      setIsDark(el.classList.contains("dark"));
    });
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

export function TableStatusPad({
  title = "Table status",
  subtitle = "Each table changes color by its current status.",
  totalTables = 0,
  groups = [],
  expandedTables = {},
  onSelectTable,
  blinkingTableNumbers = {},
  selectedTableNumber = null,
}) {
  const isDark = useIsDarkMode();
  const activeTables = buildTableStatusMap(groups);
  const highestActiveTable = activeTables.size ? Math.max(...activeTables.keys()) : 0;
  const displayCount = Math.max(DEFAULT_TABLE_COUNT, toPositiveNumber(totalTables) || 0, highestActiveTable);

  if (!displayCount) return null;

  return (
    <section className="rounded-3xl border border-slate-200/90 bg-white/85 p-3 shadow-sm ring-1 ring-slate-100/80 backdrop-blur-sm sm:p-4 dark:border-white/[0.06] dark:bg-slate-900/85 dark:ring-white/[0.04]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
        </div>
        <div className="text-xs font-medium text-slate-500">
          {activeTables.size} active of {displayCount} tables
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
        {[
          ["pending", "Pending"],
          ["accepted", "Accepted"],
          ["preparing", "Preparing"],
          ["ready", "Ready"],
          ["served", "Served"],
          ["free", "Free"],
        ].map(([status, label]) => {
          const palette = status === "free" ? null : getOrderStatusPalette(status);
          return (
            <div
              key={status}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1"
              style={
                palette
                  ? {
                      backgroundColor: palette.bodyStyle?.backgroundColor,
                      borderColor: palette.pillStyle?.borderColor || palette.bodyStyle?.backgroundColor,
                      color: palette.titleClassName === "text-stone-950" ? "#111827" : "#ffffff",
                    }
                  : (isDark ? FREE_LEGEND_DARK : FREE_LEGEND_LIGHT)
              }
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-current opacity-80" />
              <span>{label}</span>
            </div>
          );
        })}
      </div>

      <div className="mx-auto mt-4 grid max-w-[22rem] grid-cols-3 gap-2.5 sm:max-w-[24rem] sm:gap-3 lg:max-w-[56rem] lg:grid-cols-6">
        {Array.from({ length: displayCount }, (_, index) => {
          const tableNumber = index + 1;
          const entry = activeTables.get(tableNumber);
          const isActive = Boolean(entry);
          const isExpanded = Boolean(entry?.tableKey && expandedTables?.[entry.tableKey]);
          const tableStatus = isActive ? getTableStatus(entry) : "free";
          const palette = isActive ? getOrderStatusPalette(tableStatus) : null;
          const isDarkTextStatus = tableStatus === "accepted";
          const isBlinking = Boolean(blinkingTableNumbers?.[tableNumber]);
          const isSelected = Number(selectedTableNumber) === tableNumber;
          const hasManualOrders = Number(entry?.manualOrderCount || 0) > 0;

          return (
            <button
              key={tableNumber}
              type="button"
              onClick={() => {
                if (onSelectTable) {
                  onSelectTable({
                    tableKey: entry?.tableKey || String(tableNumber),
                    tableNumber,
                    status: tableStatus,
                    hasOrders: isActive,
                  });
                }
              }}
              className={[
                "relative flex aspect-square min-h-[92px] flex-col items-center justify-center rounded-[1.4rem] border px-1.5 text-center transition sm:min-h-[102px]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900",
                isActive ? "shadow-[0_12px_30px_-14px_rgba(15,23,42,0.35)]" : "shadow-sm",
                isExpanded ? "ring-2 ring-slate-900/20 ring-offset-2" : "",
                isSelected ? "ring-2 ring-slate-950 ring-offset-2" : "",
                isBlinking ? "animate-pulse" : "",
                !isActive ? "hover:border-slate-300 hover:bg-white dark:hover:border-slate-600 dark:hover:bg-slate-800" : "",
              ].join(" ")}
              style={
                isActive
                  ? {
                      backgroundColor: palette?.bodyStyle?.backgroundColor,
                      borderColor: palette?.pillStyle?.borderColor || palette?.bodyStyle?.backgroundColor,
                      color: isDarkTextStatus ? "#111827" : "#ffffff",
                    }
                  : (isDark ? FREE_STYLE_DARK : FREE_STYLE_LIGHT)
              }
              aria-pressed={isExpanded}
            >
              <span className="text-3xl font-black leading-none sm:text-[2.1rem]">{tableNumber}</span>
              {hasManualOrders && (
                <span className="mt-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-amber-900">
                  Manual
                </span>
              )}
              <span className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.22em] opacity-85 sm:text-[10px]">
                {tableStatus}
              </span>
              <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] opacity-80 sm:text-[10px]">
                {isActive ? `${entry.orderCount} order${entry.orderCount === 1 ? "" : "s"}` : "free"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
