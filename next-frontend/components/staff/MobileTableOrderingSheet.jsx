"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  ChevronDown,
  ChevronUp,
  Search,
  Printer,
  Receipt,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  ArrowUpRight,
  QrCode,
} from "lucide-react";
import { getOrderStatusPalette } from "../../lib/orderStatusPalette";
import { apiFetch } from "../../lib/api";
import { authHeaders } from "../../lib/auth";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

/**
 * Mobile-optimized Food Ordering Sheet for Table Dial Pad counter ordering.
 */
export function MobileTableOrderingSheet({
  isOpen,
  onClose,
  tableNumber,
  tableStatus = "free",
  existingOrders = [],
  menuItems = [],
  cafeInfo = null,
  token = "",
  onOrderCreated,
  onPrintReceipt,
  onOpenTableOrders,
  onUpdateOrderStatus,
  onMarkOrderPaid,
  onRejectOrder,
}) {
  const [quantities, setQuantities] = useState({});
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [isCustomerSelected, setIsCustomerSelected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [showExistingOrders, setShowExistingOrders] = useState(false);

  const cafeId = cafeInfo?._id ? String(cafeInfo._id) : "";

  // Reset form when table opens
  useEffect(() => {
    if (isOpen) {
      setQuantities({});
      setCustomerName("");
      setPhone("");
      setNotes("");
      setSelectedCategory("All");
      setSearchQuery("");
      setCollapsedCategories({});
      setCustomerSuggestions([]);
      setShowCustomerSuggestions(false);
      setIsCustomerSelected(false);
      setErrorMsg("");
      setConfirmedOrder(null);
      setShowExistingOrders(true);
    }
  }, [isOpen, tableNumber]);

  // Lock body scroll while open on mobile
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Customer suggestions autofill
  useEffect(() => {
    if (isCustomerSelected || confirmedOrder) {
      setCustomerSuggestions([]);
      setCustomerSearchLoading(false);
      return undefined;
    }
    const query = customerName.trim();
    if (!cafeId || query.length < 2) {
      setCustomerSuggestions([]);
      setCustomerSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCustomerSearchLoading(true);
      try {
        const params = new URLSearchParams({ cafeId, q: query });
        const data = await apiFetch(`/api/customers/search?${params.toString()}`, {
          headers: { ...(token ? authHeaders() : {}) },
        });
        if (!cancelled) {
          const list = Array.isArray(data?.customers) ? data.customers : [];
          setCustomerSuggestions(list);
          if (list.length > 0) setShowCustomerSuggestions(true);
        }
      } catch {
        if (!cancelled) setCustomerSuggestions([]);
      } finally {
        if (!cancelled) setCustomerSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cafeId, customerName, token, confirmedOrder, isCustomerSelected]);

  // Group menu items into categories
  const { categoryList, categoryMap } = useMemo(() => {
    const map = new Map();
    for (const item of menuItems) {
      const cat = String(item?.category || "Other").trim() || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(item);
    }
    const list = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
    return { categoryList: list, categoryMap: map };
  }, [menuItems]);

  // Filtered categories and items based on search and selectedCategory
  const displayedCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const categoriesToConsider =
      selectedCategory === "All"
        ? categoryList
        : categoryList.filter((c) => c === selectedCategory);

    const result = [];
    for (const cat of categoriesToConsider) {
      const items = categoryMap.get(cat) || [];
      const filteredItems = items.filter((item) => {
        if (!q) return true;
        return (
          String(item.name || "").toLowerCase().includes(q) ||
          String(item.description || "").toLowerCase().includes(q) ||
          String(item.category || "").toLowerCase().includes(q)
        );
      });

      if (filteredItems.length > 0) {
        result.push({ name: cat, items: filteredItems });
      }
    }
    return result;
  }, [categoryList, categoryMap, selectedCategory, searchQuery]);

  // Add / remove quantity handlers
  const handleAdd = (itemId) => {
    if (confirmedOrder) setConfirmedOrder(null);
    setQuantities((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || 0) + 1,
    }));
  };

  const handleRemove = (itemId) => {
    if (confirmedOrder) setConfirmedOrder(null);
    setQuantities((prev) => {
      const current = prev[itemId] || 0;
      if (current <= 1) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: current - 1 };
    });
  };

  const handleToggleCategory = (catName) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catName]: !prev[catName],
    }));
  };

  // Calculations
  const menuById = useMemo(() => {
    return new Map(menuItems.map((item) => [String(item._id), item]));
  }, [menuItems]);

  const { totalQuantity, subtotalAmount, totalAmount } = useMemo(() => {
    let count = 0;
    let sum = 0;
    for (const [id, qty] of Object.entries(quantities)) {
      if (qty > 0) {
        count += qty;
        const item = menuById.get(id);
        const price = Number(item?.price || 0);
        sum += price * qty;
      }
    }
    const taxRate = Number(cafeInfo?.taxPercent || 0);
    const tax = sum * (taxRate / 100);
    return {
      totalQuantity: count,
      subtotalAmount: sum,
      totalAmount: sum + tax,
    };
  }, [quantities, menuById, cafeInfo?.taxPercent]);

  // Submit Counter Order
  const handleCreateOrder = async (e) => {
    if (e) e.preventDefault();
    if (!customerName.trim()) {
      setErrorMsg("Customer name is required");
      return;
    }
    if (totalQuantity === 0) {
      setErrorMsg("Please add at least one item to the order");
      return;
    }

    const cleanPhone = phone.trim();
    if (cleanPhone && !/^\d{10}$/.test(cleanPhone)) {
      setErrorMsg("Please enter a valid 10-digit phone number, or leave it blank");
      return;
    }

    const itemsPayload = [];
    for (const [id, qty] of Object.entries(quantities)) {
      if (qty > 0) {
        itemsPayload.push({
          menuItemId: id,
          qty,
        });
      }
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const payload = {
        orderType: "food",
        tableNumber: Number(tableNumber),
        customerName: customerName.trim(),
        phone: cleanPhone,
        notes: notes.trim(),
        paymentMode: "cash",
        status: "pending",
        items: itemsPayload,
      };

      const updated = await apiFetch("/api/orders/staff", {
        method: "POST",
        headers: { ...(token ? authHeaders() : {}) },
        body: JSON.stringify(payload),
      });

      setConfirmedOrder(updated);
      if (onOrderCreated) {
        onOrderCreated(updated);
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to create table order");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-order-sheet-title"
    >
      <div className="flex h-full w-full flex-col bg-slate-50 dark:bg-slate-950 sm:mx-auto sm:max-w-md sm:rounded-t-3xl">
        {/* ── Top Header Bar ── */}
        <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200/90 bg-white/95 px-4 py-3 shadow-xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500 text-sm font-black text-white">
                  {tableNumber}
                </span>
                <h1
                  id="mobile-order-sheet-title"
                  className="text-lg font-black text-slate-900 dark:text-slate-100"
                >
                  Table {tableNumber}
                </h1>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {tableStatus || "Free"}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Counter Manual Order
              </div>
            </div>

            <div className="flex items-center gap-2">
              {existingOrders.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenTableOrders) {
                      onOpenTableOrders(tableNumber);
                    } else {
                      setShowExistingOrders((prev) => !prev);
                    }
                  }}
                  className="flex items-center gap-1 rounded-full border border-orange-300 bg-orange-100 hover:bg-orange-200 px-2.5 py-1 text-xs font-bold text-orange-900 transition dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200"
                  title="Click to view & update order status"
                >
                  <span>{existingOrders.length} active</span>
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                aria-label="Close food ordering interface"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Existing orders preview if toggled */}
          {showExistingOrders && existingOrders.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-orange-200 bg-gradient-to-b from-orange-50/95 to-orange-100/40 p-3 text-xs text-slate-800 dark:border-orange-900/60 dark:from-orange-950/50 dark:to-slate-900 dark:text-slate-200">
              <div className="flex items-center justify-between pb-2 border-b border-orange-200/80 dark:border-orange-900/40">
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-orange-950 dark:text-orange-200">
                    Active orders for Table {tableNumber}:
                  </span>
                  <span className="rounded-full bg-orange-200/80 px-2 py-0.5 text-[10px] font-extrabold text-orange-900 dark:bg-orange-900/60 dark:text-orange-200">
                    {existingOrders.length}
                  </span>
                </div>
                {onOpenTableOrders && (
                  <button
                    type="button"
                    onClick={() => onOpenTableOrders(tableNumber)}
                    className="flex items-center gap-1 text-[11px] font-black text-orange-700 hover:text-orange-800 dark:text-orange-300 hover:underline"
                  >
                    <span>Full View</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-2.5 space-y-2 max-h-60 overflow-y-auto pr-0.5">
                {existingOrders.map((o, idx) => {
                  const palette = getOrderStatusPalette(o.status);
                  const isManual = o.source === "manual";
                  const normStatus = String(o?.status || "").toLowerCase().trim();

                  return (
                    <div
                      key={o._id}
                      onClick={() => onOpenTableOrders && onOpenTableOrders(tableNumber)}
                      className="cursor-pointer rounded-xl border border-orange-200/80 bg-white p-2.5 shadow-xs transition hover:border-orange-400 hover:shadow-sm active:scale-[0.99] dark:border-slate-800 dark:bg-slate-900"
                    >
                      {/* Top Row: Customer Info & Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-extrabold uppercase tracking-wide text-orange-800 dark:text-orange-300">
                              Customer {idx + 1}
                            </span>
                            <span className="font-black text-slate-950 dark:text-slate-100">
                              #{String(o._id).slice(-6).toUpperCase()}
                            </span>
                            {isManual ? (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                                Manual
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-extrabold text-sky-900 dark:bg-sky-950 dark:text-sky-200">
                                <QrCode className="h-2.5 w-2.5" /> QR Order
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400 truncate">
                            {o.customerName || "Guest"} {o.phone && o.phone !== "-" ? `• ${o.phone}` : ""}
                          </div>
                        </div>

                        <div className="flex flex-col items-end shrink-0">
                          <div
                            className={`rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider ${palette.pillClassName || ""}`}
                            style={palette.pillStyle}
                          >
                            {palette.normalized || o.status}
                          </div>
                          <span className="mt-1 font-black text-slate-950 dark:text-slate-100">
                            ₹{Number(o.totalAmount || o.subtotalAmount || 0).toFixed(0)}
                          </span>
                        </div>
                      </div>

                      {/* Items summary */}
                      <div className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 rounded-md p-1.5">
                        {Array.isArray(o.items)
                          ? o.items.map((it) => `${it.name} ×${it.qty}`).join(" • ")
                          : ""}
                      </div>

                      {/* Quick Status Update Action Buttons */}
                      <div
                        className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1.5 flex-wrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {normStatus === "pending" && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => onUpdateOrderStatus && onUpdateOrderStatus(o._id, "accepted")}
                                className="h-7 px-2.5 text-[11px] font-black bg-orange-600 hover:bg-orange-700 text-white"
                              >
                                Accept Order
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => onRejectOrder && onRejectOrder(o._id)}
                                className="h-7 px-2 text-[11px] font-bold text-red-600 border-red-200 hover:bg-red-50"
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {normStatus === "accepted" && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => onUpdateOrderStatus && onUpdateOrderStatus(o._id, "preparing")}
                              className="h-7 px-2.5 text-[11px] font-black bg-amber-600 hover:bg-amber-700 text-white"
                            >
                              Start Preparing
                            </Button>
                          )}
                          {normStatus === "preparing" && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => onUpdateOrderStatus && onUpdateOrderStatus(o._id, "ready")}
                              className="h-7 px-2.5 text-[11px] font-black bg-sky-600 hover:bg-sky-700 text-white"
                            >
                              Mark Ready
                            </Button>
                          )}
                          {normStatus === "ready" && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => onUpdateOrderStatus && onUpdateOrderStatus(o._id, "served")}
                              className="h-7 px-2.5 text-[11px] font-black bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              Mark Served
                            </Button>
                          )}
                          {normStatus === "served" && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => onMarkOrderPaid && onMarkOrderPaid(o._id)}
                              className="h-7 px-2.5 text-[11px] font-black bg-emerald-700 hover:bg-emerald-800 text-white"
                            >
                              Mark Paid
                            </Button>
                          )}
                        </div>

                        {onOpenTableOrders && (
                          <button
                            type="button"
                            onClick={() => onOpenTableOrders(tableNumber)}
                            className="text-[10px] font-bold text-slate-500 hover:text-orange-600 dark:text-slate-400 flex items-center gap-0.5 ml-auto"
                          >
                            <span>Open in Modal</span>
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Search & Category Dropdown Bar ── */}
          <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search food items..."
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-100/80 pl-8 pr-3 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-hidden dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category Dropdown format */}
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 shadow-2xs focus:border-orange-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                aria-label="Filter by category"
              >
                <option value="All">All categories ({menuItems.length})</option>
                {categoryList.map((cat) => {
                  const count = categoryMap.get(cat)?.length || 0;
                  return (
                    <option key={cat} value={cat}>
                      {cat} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </header>

        {/* ── Scrollable Food Menu UI ── */}
        <main className="flex-1 overflow-y-auto px-3.5 py-3.5 pb-72">
          {displayedCategories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
              <Search className="h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-bold">No food items found</p>
              <p className="text-xs text-slate-400">Try adjusting your search or category filter</p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayedCategories.map((cat) => {
                const isCollapsed = Boolean(collapsedCategories[cat.name]);
                // Count items ordered in this category
                const orderedInCat = cat.items.reduce(
                  (sum, item) => sum + (quantities[item._id] || 0),
                  0
                );

                return (
                  <section
                    key={cat.name}
                    className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70 shadow-2xs dark:border-slate-800/80 dark:bg-slate-900/60"
                  >
                    {/* Category Dropdown Accordion Header */}
                    <button
                      type="button"
                      onClick={() => handleToggleCategory(cat.name)}
                      className="flex w-full items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 text-left transition hover:bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/90"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          {cat.name}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-400">
                          ({cat.items.length})
                        </span>
                        {orderedInCat > 0 && (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-800 dark:bg-orange-950/60 dark:text-orange-300">
                            {orderedInCat} added
                          </span>
                        )}
                      </div>
                      <span className="text-slate-500">
                        {isCollapsed ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronUp className="h-4 w-4" />
                        )}
                      </span>
                    </button>

                    {/* Food Items in this Category */}
                    {!isCollapsed && (
                      <div className="divide-y divide-slate-100 p-2 dark:divide-slate-800/60">
                        {cat.items.map((item) => {
                          const currentQty = quantities[item._id] || 0;
                          return (
                            <div
                              key={item._id}
                              className={`flex items-center justify-between gap-3 rounded-xl p-2.5 transition ${
                                currentQty > 0
                                  ? "bg-orange-50/60 ring-1 ring-orange-200/70 dark:bg-orange-950/20 dark:ring-orange-900/50"
                                  : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                              }`}
                            >
                              {/* Left: Item name and price */}
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold leading-snug text-slate-900 dark:text-slate-100">
                                  {item.name}
                                </div>
                                <div className="mt-0.5 text-sm font-extrabold text-slate-700 dark:text-slate-300">
                                  ₹{Number(item.price || 0).toFixed(0)}
                                </div>
                              </div>

                              {/* Right: Quantity controls as per Screenshot 3 */}
                              <div className="inline-flex shrink-0 items-center rounded-xl bg-slate-200/80 p-1 dark:bg-slate-800">
                                <button
                                  type="button"
                                  onClick={() => handleAdd(item._id)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black text-slate-800 transition hover:bg-slate-300 active:scale-95 dark:text-slate-200"
                                  aria-label={`Add 1 ${item.name}`}
                                >
                                  +1
                                </button>
                                <div className="flex h-8 min-w-[32px] items-center justify-center rounded-lg bg-white px-2 text-center text-sm font-black text-slate-900 shadow-2xs dark:bg-slate-950 dark:text-slate-100">
                                  {currentQty}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemove(item._id)}
                                  disabled={currentQty === 0}
                                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black transition active:scale-95 ${
                                    currentQty === 0
                                      ? "cursor-not-allowed text-slate-400 opacity-30"
                                      : "text-slate-800 hover:bg-slate-300 dark:text-slate-200"
                                  }`}
                                  aria-label={`Remove 1 ${item.name}`}
                                >
                                  -1
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </main>

        {/* ── Fixed Bottom Checkout Drawer ── */}
        <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/90 bg-white/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-12px_36px_rgba(0,0,0,0.12)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 sm:mx-auto sm:max-w-md">
          {errorMsg && (
            <div className="mb-2.5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{errorMsg}</span>
            </div>
          )}

          {/* When order has been confirmed successfully */}
          {confirmedOrder ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black">
                    Order #{String(confirmedOrder._id || "").slice(-6).toUpperCase()} Confirmed!
                  </div>
                  <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    Table {tableNumber} • {totalQuantity} items • ₹{totalAmount.toFixed(0)}
                  </div>
                </div>
              </div>

              {/* Printing buttons */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onPrintReceipt && onPrintReceipt(confirmedOrder, "chef")}
                  className="h-11 border-orange-300 text-xs font-black text-orange-900 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-200"
                >
                  <Printer className="mr-1.5 h-4 w-4" />
                  Print KOT
                </Button>
                <Button
                  type="button"
                  onClick={() => onPrintReceipt && onPrintReceipt(confirmedOrder, "customer")}
                  className="h-11 bg-orange-600 text-xs font-black text-white hover:bg-orange-700"
                >
                  <Receipt className="mr-1.5 h-4 w-4" />
                  Print Customer Bill
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onPrintReceipt && onPrintReceipt(confirmedOrder, "both")}
                  className="h-10 flex-1 text-xs font-bold"
                >
                  Print Both
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="h-10 text-xs font-bold"
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            /* Active Ordering State */
            <div className="space-y-2.5">
              {/* Total items & total amount bar */}
              <div className="flex items-center justify-between rounded-xl bg-orange-50/80 px-3 py-2 text-xs font-bold text-orange-950 dark:bg-orange-950/30 dark:text-orange-200">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-orange-600" />
                  <span>
                    Total Items: <strong>{totalQuantity}</strong>
                  </span>
                  <span className="text-orange-300 dark:text-orange-700">|</span>
                  <span>
                    Total: <strong>₹{totalAmount.toFixed(0)}</strong>
                  </span>
                </div>
                {totalQuantity > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuantities({})}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-red-600"
                  >
                    <RotateCcw className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>

              {/* Input entries: Customer name (autofill) & Phone no (optional) */}
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <Input
                    value={customerName}
                    onChange={(e) => {
                      setIsCustomerSelected(false);
                      setShowCustomerSuggestions(true);
                      setCustomerName(e.target.value);
                    }}
                    onFocus={() => {
                      if (!isCustomerSelected && customerSuggestions.length > 0) {
                        setShowCustomerSuggestions(true);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowCustomerSuggestions(false), 200);
                    }}
                    placeholder="Customer name *"
                    required
                    className="h-10 text-xs font-semibold"
                  />
                  {/* Customer Autofill Suggestions */}
                  {showCustomerSuggestions && !isCustomerSelected && (customerSearchLoading || customerSuggestions.length > 0) && (
                    <div className="absolute inset-x-0 bottom-full z-50 mb-1 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      {customerSearchLoading ? (
                        <div className="px-3 py-2 text-[11px] text-slate-400">
                          Searching customers...
                        </div>
                      ) : (
                        customerSuggestions.map((cust) => (
                          <button
                            key={cust.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setIsCustomerSelected(true);
                              setShowCustomerSuggestions(false);
                              setCustomerSuggestions([]);
                              setCustomerName(cust.name || "");
                              if (cust.phone) setPhone(cust.phone);
                            }}
                            className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-orange-50 dark:border-slate-800 dark:hover:bg-slate-800"
                          >
                            <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {cust.name}
                            </div>
                            <div className="text-[10px] text-slate-500">{cust.phone}</div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                    placeholder="Phone no. (optional)"
                    className="h-10 text-xs font-semibold"
                  />
                </div>
              </div>

              {/* Action button */}
              <Button
                type="button"
                onClick={handleCreateOrder}
                disabled={submitting || totalQuantity === 0 || !customerName.trim()}
                className="h-12 w-full bg-orange-600 text-sm font-black text-white shadow-md hover:bg-orange-700 active:scale-[0.99] disabled:opacity-50"
              >
                {submitting
                  ? "Placing Order..."
                  : `Confirm & Place Order (₹${totalAmount.toFixed(0)})`}
              </Button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
