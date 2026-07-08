"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";
import { ordersBusinessDayQueryString } from "../../lib/staffOrderRange";
import {
  filterKitchenLiveOrders,
  isKitchenLiveOrder,
} from "../../lib/staffOrderFilters";
import {
  maybeNotifyBrowser,
  playSuccess,
  requestNotificationPermission,
  startKitchenOrderAlertLoop,
  stopKitchenOrderAlertLoop,
} from "../../lib/sounds";
import { motion, useReducedMotion } from "framer-motion";
import StaffAlertBanner from "../../components/StaffAlertBanner";
import { StaffShell } from "../../components/StaffShell";
import SoundControl from "../../components/SoundControl";
import { authHeaders } from "../../lib/auth";
import { useClientAuth } from "../../lib/useClientAuth";
import { useMounted } from "../../lib/useMounted";
import { connectCafeSocket } from "../../lib/socket";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { Input, Textarea } from "../../components/ui/Input";
import { AppLoading } from "../../components/AppLoading";
import { getCafeUpdateSignalKey, getCafeWithCache } from "../../lib/cafeClient";
import { getMenuUpdateSignalKey, getMenuWithCache } from "../../lib/menuClient";
import { getOrderStatusPalette } from "../../lib/orderStatusPalette";
import { groupOrdersByTable } from "../../lib/orderGrouping";
import {
  formatOrderAcceptedAt,
  formatOrderAcceptToServe,
  formatOrderServedAt,
} from "../../lib/orderTiming";
import { TableStatusPad } from "../../components/staff/TableStatusPad";
import { ChevronDown, ClipboardList, QrCode, X, Check, Printer } from "lucide-react";
import {
  buildQuickOrderCategoryLookup,
  canonicalizeQuickOrderCategory,
  resolveQuickOrderCategories,
} from "../../lib/quickOrderCategories";

function formatKitchenPhone(phone) {
  const s = String(phone || "").trim();
  if (!s) return "—";
  if (s.startsWith("manual-table-")) return "Walk-in (no phone on file)";
  if (s.startsWith("manual-walk-in")) return "Walk-in (no phone on file)";
  return s;
}

function formatKitchenTableLabel(value) {
  const tableNumber = Number(value || 0);
  return tableNumber > 0 ? `Table ${tableNumber}` : "Walk-in";
}

function lineItemLabel(item) {
  const name = String(item?.name || "").trim();
  return name || "Menu item";
}

function lineItemTotal(item) {
  return Number(item?.price || 0) * Number(item?.qty || 0);
}

function formatMenuItemMeta(item) {
  const category = String(item?.category || "").trim();
  const price = Number(item?.price || 0).toFixed(0);
  return category ? `${category} - Rs ${price}` : `Rs ${price}`;
}

function kitchenActionButtonClass(kind) {
  const shared =
    "min-h-[42px] w-full justify-center border font-black tracking-[0.02em] shadow-sm";
  if (kind === "edit") {
    return `${shared} border-slate-300 bg-white text-slate-900 hover:bg-slate-100`;
  }
  if (kind === "accepted") {
    return `${shared} border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100`;
  }
  if (kind === "preparing") {
    return `${shared} border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100`;
  }
  if (kind === "ready") {
    return `${shared} border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100`;
  }
  if (kind === "rejected") {
    return `${shared} border-red-200 bg-red-50 text-red-800 hover:bg-red-100`;
  }
  return shared;
}

function upsertOrder(list, order) {
  const orderId = String(order?._id || "");
  const idx = list.findIndex((x) => String(x?._id || "") === orderId);
  if (idx === -1) return [order, ...list];
  const copy = list.slice();
  copy[idx] = order;
  return copy;
}

function getOrderTotal(order, cafeInfo) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const lineSum = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0),
    0,
  );
  const hasServerPricing =
    typeof order?.subtotalAmount === "number" &&
    typeof order?.taxAmount === "number";
  const subtotal = hasServerPricing
    ? Number(order.subtotalAmount)
    : Number(order?.totalAmount || lineSum);
  const discount =
    typeof order?.discountAmount === "number"
      ? Number(order.discountAmount)
      : 0;
  const taxRate = Number(cafeInfo?.taxPercent || 0);
  const taxAmount = hasServerPricing
    ? Number(order.taxAmount || 0)
    : subtotal * (taxRate / 100);
  return hasServerPricing
    ? Number(order?.totalAmount || 0)
    : Math.max(0, subtotal + taxAmount - discount);
}

function createEmptyOrderDraft(defaultStatus = "pending") {
  return {
    tableNumber: "",
    customerName: "",
    phone: "",
    notes: "",
    paymentMode: "cash",
    status: defaultStatus,
    items: [],
  };
}

function buildDraftFromOrder(order) {
  return {
    tableNumber: order?.tableNumber ? String(order.tableNumber) : "",
    customerName: order?.customerName || "",
    phone: order?.phone || "",
    notes: order?.notes || "",
    paymentMode: order?.paymentMode || "cash",
    status: order?.status || "pending",
    items: Array.isArray(order?.items)
      ? order.items
          .map((item) => ({
            menuItemId: item?.menuItemId ? String(item.menuItemId) : "",
            qty: Number(item?.qty || 1),
          }))
          .filter((item) => item.menuItemId)
      : [],
  };
}

export default function KitchenPage() {
  const { token, user, ready: authReady } = useClientAuth();
  const role = user?.role || "";
  const mounted = useMounted();
  const reducedMotion = useReducedMotion();

  const [cafeIdOverride, setCafeIdOverride] = useState("");
  const cafeId = useMemo(
    () => {
      const raw = cafeIdOverride || user?.cafeId || "";
      const normalized = typeof raw === "string" ? raw : String(raw);
      return normalized.trim();
    },
    [cafeIdOverride, user?.cafeId],
  );

  const [orders, setOrders] = useState([]);
  const [todayOrders, setTodayOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [socketState, setSocketState] = useState("disconnected");
  const [cafeInfo, setCafeInfo] = useState(null);
  const [alertMsg, setAlertMsg] = useState("");
  const [menuItems, setMenuItems] = useState([]);
  const [popularMenuItems, setPopularMenuItems] = useState([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  /** @type {"all" | "manual" | "qr"} */
  const [sourceFilter, setSourceFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const [quickOrderCategory, setQuickOrderCategory] = useState("All");
  const [quickOrderCategoryModal, setQuickOrderCategoryModal] = useState("");
  const [lastCreatedOrder, setLastCreatedOrder] = useState(null);
  const [editorMode, setEditorMode] = useState("create");
  const [editingOrderId, setEditingOrderId] = useState("");
  const [orderDraft, setOrderDraft] = useState(() => createEmptyOrderDraft());
  const [quickOrderDraft, setQuickOrderDraft] = useState(() => createEmptyOrderDraft());
  const [editorSaving, setEditorSaving] = useState(false);
  const [expandedTables, setExpandedTables] = useState({});
  const [selectedTableKey, setSelectedTableKey] = useState("");
  const [blinkingTables, setBlinkingTables] = useState({});
  const tableCardRefs = useRef({});
  const pendingAlertOrderIdsRef = useRef(new Set());

  const stats = useMemo(() => {
    const total = orders.length;
    const queue = orders.filter((o) =>
      ["pending", "accepted"].includes(o.status),
    ).length;
    const preparing = orders.filter((o) =>
      ["preparing", "baking"].includes(o.status),
    ).length;
    const todayTotalOrders = todayOrders.length;
    const todayRevenue = todayOrders
      .filter((o) => String(o?.status || "").toLowerCase() !== "rejected")
      .reduce((sum, order) => sum + getOrderTotal(order, cafeInfo), 0);
    return { total, queue, preparing, todayTotalOrders, todayRevenue };
  }, [orders, todayOrders, cafeInfo]);

  const menuById = useMemo(
    () => new Map(menuItems.map((item) => [String(item._id), item])),
    [menuItems],
  );

  const filteredOrders = useMemo(() => {
    let list = orders;
    const query = tableFilter.trim().toLowerCase();
    if (query) {
      list = list.filter((order) => {
        const tableValue = String(order?.tableNumber || "");
        const customerValue = String(order?.customerName || "").toLowerCase();
        const phoneValue = String(order?.phone || "").toLowerCase();
        return (
          tableValue.includes(query) ||
          customerValue.includes(query) ||
          phoneValue.includes(query)
        );
      });
    }
    if (sourceFilter === "manual")
      list = list.filter((o) => o.source === "manual");
    if (sourceFilter === "qr") list = list.filter((o) => o.source !== "manual");
    return list;
  }, [orders, tableFilter, sourceFilter]);

  const filteredMenuItems = useMemo(() => {
    const query = menuSearch.trim().toLowerCase();
    if (!query) return menuItems;
    return menuItems.filter((item) =>
      [item?.name, item?.category, item?.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [menuItems, menuSearch]);

  const quickOrderCategoryLookup = useMemo(() => {
    return buildQuickOrderCategoryLookup(resolveQuickOrderCategories(cafeInfo));
  }, [cafeInfo?.quickOrderCategories]);

  const quickOrderShortcutItems = useMemo(() => {
    const seen = new Set();
    const result = [];
    const pushItem = (item, source, score = 0) => {
      if (!item?._id) return;
      const id = String(item._id);
      if (seen.has(id)) return;
      seen.add(id);
      result.push({
        ...item,
        menuItemId: id,
        shortcutSource: source,
        shortcutScore: score,
      });
    };

    const quickOrderCategoryOrder = resolveQuickOrderCategories(cafeInfo);
    const categoryItems = menuItems
      .map((item) => ({
        ...item,
        quickOrderCategory: canonicalizeQuickOrderCategory(item?.category, quickOrderCategoryLookup),
      }))
      .filter((item) => item.quickOrderCategory)
      .slice()
      .sort((left, right) => {
        const leftCategoryIndex = quickOrderCategoryOrder.indexOf(left.quickOrderCategory);
        const rightCategoryIndex = quickOrderCategoryOrder.indexOf(right.quickOrderCategory);
        if (leftCategoryIndex !== rightCategoryIndex) return leftCategoryIndex - rightCategoryIndex;
        return String(left?.name || "").localeCompare(String(right?.name || ""));
      });
    categoryItems.forEach((item, index) => pushItem(item, "Category", 2000 - index));

    const adminIds = Array.isArray(cafeInfo?.quickOrderItemIds)
      ? cafeInfo.quickOrderItemIds.map((id) => String(id || "")).filter(Boolean)
      : [];
    adminIds.forEach((id, index) => {
      const menuItem = menuById.get(id);
      if (menuItem) pushItem(menuItem, "Admin", 1000 - index);
    });

    menuItems
      .filter((item) => item?.isSpecial)
      .forEach((item, index) => pushItem(item, "Star", 500 - index));

    popularMenuItems.forEach((item, index) => {
      const menuItem = menuById.get(String(item?.menuItemId || ""));
      if (menuItem)
        pushItem(
          menuItem,
          "Popular",
          Number(item?.totalQty || item?.quantity || 0) - index,
        );
    });

    return result
      .sort((left, right) => right.shortcutScore - left.shortcutScore)
  }, [cafeInfo?.quickOrderItemIds, menuById, menuItems, popularMenuItems]);

  const cigaretteShortcutBuckets = useMemo(() => {
    const buckets = { 25: [], 30: [] };
    const cigar25Ids = Array.isArray(cafeInfo?.quickOrderCigarette25Ids)
      ? cafeInfo.quickOrderCigarette25Ids.map((id) => String(id || "")).filter(Boolean)
      : [];
    const cigar30Ids = Array.isArray(cafeInfo?.quickOrderCigarette30Ids)
      ? cafeInfo.quickOrderCigarette30Ids.map((id) => String(id || "")).filter(Boolean)
      : [];

    cigar25Ids.forEach((id, index) => {
      const menuItem = menuById.get(id);
      if (!menuItem || buckets[25].some((existing) => existing.menuItemId === id)) return;
      buckets[25].push({
        ...menuItem,
        menuItemId: id,
        shortcutSource: "Admin",
        shortcutScore: 1000 - index,
      });
    });
    cigar30Ids.forEach((id, index) => {
      const menuItem = menuById.get(id);
      if (!menuItem || buckets[30].some((existing) => existing.menuItemId === id)) return;
      buckets[30].push({
        ...menuItem,
        menuItemId: id,
        shortcutSource: "Admin",
        shortcutScore: 1000 - index,
      });
    });
    return buckets;
  }, [cafeInfo?.quickOrderCigarette25Ids, cafeInfo?.quickOrderCigarette30Ids, menuById]);

  const regularShortcutItems = useMemo(() => {
    const cigaretteIds = new Set([
      ...cigaretteShortcutBuckets[25].map((item) => item.menuItemId),
      ...cigaretteShortcutBuckets[30].map((item) => item.menuItemId),
    ]);
    return quickOrderShortcutItems.filter((item) => !cigaretteIds.has(item.menuItemId));
  }, [cigaretteShortcutBuckets, quickOrderShortcutItems]);

  const quickOrderCategoryTabs = useMemo(() => {
    return ["All", ...resolveQuickOrderCategories(cafeInfo)];
  }, [cafeInfo?.quickOrderCategories]);

  // All-categories map: every category from the full menu, including cigarettes.
  const allCategoryItemsMap = useMemo(() => {
    const excluded = new Set(["uncategorized"]);
    const grouped = new Map();
    for (const item of menuItems) {
      const raw = String(item?.category || "").trim();
      const key = raw || "Uncategorized";
      if (excluded.has(key.toLowerCase())) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push({ ...item, menuItemId: String(item._id || "") });
    }
    for (const items of grouped.values()) {
      items.sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
    }
    return grouped;
  }, [menuItems]);

  const allQuickOrderCategories = useMemo(() => {
    const entries = Array.from(allCategoryItemsMap.entries())
      .map(([name, items]) => ({ name, count: items.length }));
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return entries;
  }, [allCategoryItemsMap]);

  const selectedCategoryModalItems = useMemo(() => {
    if (!quickOrderCategoryModal) return [];
    return allCategoryItemsMap.get(quickOrderCategoryModal) || [];
  }, [quickOrderCategoryModal, allCategoryItemsMap]);

  useEffect(() => {
    if (quickOrderCategoryModal && !allCategoryItemsMap.has(quickOrderCategoryModal)) {
      setQuickOrderCategoryModal("");
    }
  }, [quickOrderCategoryModal, allCategoryItemsMap]);

  const quickOrderItemsByCategory = useMemo(() => {
    return regularShortcutItems.reduce((acc, item) => {
      const category = canonicalizeQuickOrderCategory(item?.category, quickOrderCategoryLookup) || "Uncategorized";
      if (!acc.has(category)) acc.set(category, []);
      acc.get(category).push(item);
      return acc;
    }, new Map());
  }, [regularShortcutItems, quickOrderCategoryLookup]);

  const visibleRegularShortcutItems = useMemo(() => {
    if (quickOrderCategory === "All") return regularShortcutItems;
    return regularShortcutItems.filter((item) => {
      const category = canonicalizeQuickOrderCategory(item?.category, quickOrderCategoryLookup) || "Uncategorized";
      return category === quickOrderCategory;
    });
  }, [quickOrderCategory, quickOrderCategoryLookup, regularShortcutItems]);

  const visibleRegularShortcutGroups = useMemo(() => {
    if (quickOrderCategory !== "All") {
      return [[quickOrderCategory, quickOrderItemsByCategory.get(quickOrderCategory) || []]];
    }

    return quickOrderCategoryTabs
      .filter((category) => category !== "All")
      .map((category) => [category, quickOrderItemsByCategory.get(category) || []])
      .filter(([, items]) => items.length > 0);
  }, [quickOrderCategory, quickOrderCategoryTabs, quickOrderItemsByCategory]);

  useEffect(() => {
    if (!quickOrderCategoryTabs.includes(quickOrderCategory)) {
      setQuickOrderCategory("All");
    }
  }, [quickOrderCategory, quickOrderCategoryTabs]);

  const draftItemsDetailed = useMemo(() => {
    return orderDraft.items
      .map((item, index) => {
        const menuItem = menuById.get(String(item.menuItemId));
        if (!menuItem) return null;
        const qty = Math.max(1, Number(item.qty || 1));
        return {
          index,
          menuItemId: String(item.menuItemId),
          qty,
          menuItem,
          lineTotal: Number(menuItem?.price || 0) * qty,
        };
      })
      .filter(Boolean);
  }, [menuById, orderDraft.items]);

  const quickOrderDraftItemsDetailed = useMemo(() => {
    return quickOrderDraft.items
      .map((item, index) => {
        const menuItem = menuById.get(String(item.menuItemId));
        if (!menuItem) return null;
        const qty = Math.max(1, Number(item.qty || 1));
        return {
          index,
          menuItemId: String(item.menuItemId),
          qty,
          menuItem,
          lineTotal: Number(menuItem?.price || 0) * qty,
        };
      })
      .filter(Boolean);
  }, [menuById, quickOrderDraft.items]);

  const groupedFilteredOrders = useMemo(
    () => groupOrdersByTable(filteredOrders),
    [filteredOrders],
  );
  const groupedOrders = useMemo(() => groupOrdersByTable(orders), [orders]);
  const selectedGroup = useMemo(
    () =>
      groupedOrders.find((group) => group.tableKey === selectedTableKey) ||
      null,
    [groupedOrders, selectedTableKey],
  );

  const draftEstimate = useMemo(() => {
    const lineSubtotal = orderDraft.items.reduce((sum, line) => {
      const menuItem = menuById.get(String(line.menuItemId));
      return sum + Number(menuItem?.price || 0) * Number(line.qty || 0);
    }, 0);
    const taxPct = Number(cafeInfo?.taxPercent || 0);
    const discountType = cafeInfo?.discountType || "percent";
    const discountValue = Number(cafeInfo?.discountValue || 0);

    let discountAmount = 0;
    let afterDiscount = lineSubtotal;
    if (discountType === "percent") {
      discountAmount = Math.min(
        lineSubtotal,
        lineSubtotal * (Math.min(Math.max(discountValue, 0), 100) / 100),
      );
      afterDiscount = lineSubtotal - discountAmount;
    } else {
      discountAmount = Math.min(lineSubtotal, Math.max(discountValue, 0));
      afterDiscount = lineSubtotal - discountAmount;
    }
    const taxAmount = afterDiscount * (taxPct / 100);
    const total = afterDiscount + taxAmount;

    return { subtotal: lineSubtotal, discountAmount, taxAmount, total };
  }, [cafeInfo, menuById, orderDraft.items]);

  const quickOrderEstimate = useMemo(() => {
    const lineSubtotal = quickOrderDraft.items.reduce((sum, line) => {
      const menuItem = menuById.get(String(line.menuItemId));
      return sum + Number(menuItem?.price || 0) * Number(line.qty || 0);
    }, 0);
    const taxPct = Number(cafeInfo?.taxPercent || 0);
    const discountType = cafeInfo?.discountType || "percent";
    const discountValue = Number(cafeInfo?.discountValue || 0);

    let discountAmount = 0;
    let afterDiscount = lineSubtotal;
    if (discountType === "percent") {
      discountAmount = Math.min(lineSubtotal, lineSubtotal * (Math.min(Math.max(discountValue, 0), 100) / 100));
      afterDiscount = lineSubtotal - discountAmount;
    } else {
      discountAmount = Math.min(lineSubtotal, Math.max(discountValue, 0));
      afterDiscount = lineSubtotal - discountAmount;
    }
    const taxAmount = afterDiscount * (taxPct / 100);
    const total = afterDiscount + taxAmount;

    return { subtotal: lineSubtotal, discountAmount, taxAmount, total };
  }, [cafeInfo, menuById, quickOrderDraft.items]);

  /** Orders always fetched; cafe + menu use session cache unless forceStatic (e.g. Refresh). */
  const loadKitchenData = useCallback(
    async (options = {}) => {
      const { forceStatic = false } = options;
      if (!cafeId) {
        setMenuItems([]);
        setCafeInfo(null);
        return;
      }
      setLoading(true);
      setMenuLoading(true);
      setError("");
      setMenuError("");
      try {
        const qs = ordersBusinessDayQueryString({ startHour: 1 });
        const [liveList, todayList, cafeData, menuData, popularItemsData] =
          await Promise.all([
            // Use server-time scoped query so the reset is independent of device clock.
            apiFetch(`/api/orders/${cafeId}?scope=kitchen_live`, {
              headers: { ...(token ? authHeaders() : {}) },
            }),
            apiFetch(`/api/orders/${cafeId}?${qs}`, {
              headers: { ...(token ? authHeaders() : {}) },
            }),
            getCafeWithCache(cafeId, { force: forceStatic }),
            getMenuWithCache(cafeId, { force: forceStatic }),
            apiFetch(`/api/orders/${cafeId}/popular-items`, {
              headers: { ...(token ? authHeaders() : {}) },
            }).catch(() => []),
          ]);
        const normalizedLiveList = Array.isArray(liveList) ? liveList : [];
        const normalizedTodayList = Array.isArray(todayList) ? todayList : [];
        setTodayOrders(normalizedTodayList);
        setOrders(filterKitchenLiveOrders(normalizedLiveList));
        setCafeInfo(cafeData || null);
        setMenuItems(Array.isArray(menuData) ? menuData : []);
        setPopularMenuItems(
          Array.isArray(popularItemsData) ? popularItemsData : [],
        );
      } catch (e) {
        setError(e.message || "Failed to load kitchen data");
        setMenuError(e.message || "Failed to load menu");
        setPopularMenuItems([]);
      } finally {
        setLoading(false);
        setMenuLoading(false);
      }
    },
    [cafeId, token],
  );

  useEffect(() => {
    if (!authReady) return;
    if (!token) {
      window.location.href = "/chef/login";
      return;
    }
    if (role && role !== "kitchen") {
      window.location.href = "/chef/login";
    }
  }, [authReady, token, role]);

  useEffect(() => {
    if (cafeId) loadKitchenData();
  }, [cafeId, loadKitchenData]);

  useEffect(() => {
    if (!cafeId || typeof window === "undefined") return;

    const cafeUpdateKey = getCafeUpdateSignalKey(cafeId);
    const menuUpdateKey = getMenuUpdateSignalKey(cafeId);
    const handleStorage = (event) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key !== cafeUpdateKey && event.key !== menuUpdateKey) return;
      loadKitchenData({ forceStatic: true });
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [cafeId, loadKitchenData]);

  useEffect(() => {
    // IMPORTANT: kitchen sockets must join the role room, which requires an auth token.
    // If we connect before the token is available, the server will treat this socket as a guest
    // and it won't receive kitchen-only events like NEW_ORDER.
    if (!cafeId || !token) return;

    const syncPendingAlertLoop = () => {
      if (pendingAlertOrderIdsRef.current.size > 0) {
        startKitchenOrderAlertLoop();
      } else {
        stopKitchenOrderAlertLoop();
      }
    };

    const socket = connectCafeSocket(cafeId);
    setSocketState("connecting");

    socket.on("connect", () => setSocketState("connected"));
    socket.on("disconnect", () => setSocketState("disconnected"));
    socket.on("connect_error", (err) => {
      const message = err?.message ? String(err.message) : "Socket connect failed";
      setSocketState(`connect_error: ${message}`);
    });
    socket.on("JOIN_ERROR", (payload) => {
      const message = payload?.message ? String(payload.message) : "Join failed";
      setSocketState(`join_error: ${message}`);
    });

    const merge = (order) => {
      const orderId = String(order?._id || "");
      const normalizedStatus = String(order?.status || "").toLowerCase();
      if (normalizedStatus !== "pending") {
        pendingAlertOrderIdsRef.current.delete(orderId);
      }
      setTodayOrders((prev) => upsertOrder(prev, order));
      if (!isKitchenLiveOrder(order)) {
        pendingAlertOrderIdsRef.current.delete(orderId);
        syncPendingAlertLoop();
        setOrders((prev) => prev.filter((o) => String(o?._id || "") !== orderId));
        return;
      }
      const tableNumber = Number(order?.tableNumber || 0);
      if (tableNumber > 0) {
        setBlinkingTables((prev) => ({ ...prev, [tableNumber]: true }));
      }
      syncPendingAlertLoop();
      setOrders((prev) => upsertOrder(prev, order));
    };
    const onNewOrder = (order) => {
      if (!isKitchenLiveOrder(order)) return;
      if (
        String(order?.status || "").toLowerCase() === "pending" &&
        order?._id
      ) {
        pendingAlertOrderIdsRef.current.add(String(order._id));
      }
      syncPendingAlertLoop();
      const line =
        order?.items?.map((i) => `${i.name}×${i.qty}`).join(", ") || "";
      setAlertMsg(
        `New order · ${formatKitchenTableLabel(order.tableNumber)}${line ? ` · ${line.slice(0, 80)}` : ""}`,
      );
      setTimeout(() => setAlertMsg(""), 8000);
      maybeNotifyBrowser("New kitchen order", formatKitchenTableLabel(order.tableNumber));
      merge(order);
    };
    socket.on("NEW_ORDER", onNewOrder);
    socket.on("ORDER_UPDATED", merge);

    return () => {
      pendingAlertOrderIdsRef.current.clear();
      stopKitchenOrderAlertLoop();
      socket.off("NEW_ORDER", onNewOrder);
      socket.off("ORDER_UPDATED", merge);
      socket.off("JOIN_ERROR");
      socket.disconnect();
    };
  }, [cafeId, token]);

  useEffect(() => {
    if (selectedTableKey && !selectedGroup) {
      setSelectedTableKey("");
    }
  }, [selectedGroup, selectedTableKey]);

  const setStatus = async (orderId, status) => {
    setLoading(true);
    setError("");
    try {
      const updated = await apiFetch(`/api/orders/${orderId}`, {
        method: "PUT",
        headers: { ...(token ? authHeaders() : {}) },
        body: JSON.stringify({ status }),
      });
      setOrders((prev) => {
        const updatedId = String(updated?._id || "");
        const next = prev.map((o) =>
          String(o?._id || "") === updatedId ? updated : o,
        );
        return filterKitchenLiveOrders(next);
      });
      setTodayOrders((prev) => upsertOrder(prev, updated));
      if (String(updated?.status || status).toLowerCase() !== "pending") {
        pendingAlertOrderIdsRef.current.delete(String(orderId));
        if (pendingAlertOrderIdsRef.current.size > 0) {
          startKitchenOrderAlertLoop();
        } else {
          stopKitchenOrderAlertLoop();
        }
      }
      playSuccess();
    } catch (e) {
      setError(e.message || "Failed to update order");
    } finally {
      setLoading(false);
    }
  };

  const openNewOrderEditor = () => {
    setEditorOpen(true);
    setEditorMode("create");
    setMenuSearch("");
    setEditingOrderId("");
    setOrderDraft(createEmptyOrderDraft("pending"));
  };

  const openEditOrderEditor = (order) => {
    setEditorOpen(true);
    setEditorMode("edit");
    setMenuSearch("");
    setEditingOrderId(order?._id || "");
    setOrderDraft(buildDraftFromOrder(order));
  };

  const closeOrderEditor = () => {
    setEditorOpen(false);
    setMenuSearch("");
    setEditorMode("create");
    setEditingOrderId("");
    setOrderDraft(createEmptyOrderDraft("pending"));
  };

  const addQuickOrderItem = (menuItemId) => {
    const resolvedMenuItemId = menuItemId ? String(menuItemId) : "";
    if (!resolvedMenuItemId) return;
    setQuickOrderDraft((prev) => {
      const existingIndex = prev.items.findIndex((item) => String(item.menuItemId) === resolvedMenuItemId);
      if (existingIndex >= 0) {
        return {
          ...prev,
          items: prev.items.map((item, itemIndex) =>
            itemIndex === existingIndex ? { ...item, qty: Math.max(1, Number(item.qty || 1)) + 1 } : item
          ),
        };
      }
      return {
        ...prev,
        items: [...prev.items, { menuItemId: resolvedMenuItemId, qty: 1 }],
      };
    });
  };

  const updateQuickOrderItem = (index, patch) => {
    setQuickOrderDraft((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const removeQuickOrderItem = (index) => {
    setQuickOrderDraft((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const clearQuickOrderDraft = () => {
    setQuickOrderDraft(createEmptyOrderDraft("pending"));
  };

  const printReceipt = (order) => {
    if (!order) return;
    const cafeName = cafeInfo?.name || "Coffee Culture";
    const cafeLogo = cafeInfo?.logoUrl || "";
    const taxRate = Number(cafeInfo?.taxPercent || 0);
    const discountType = cafeInfo?.discountType || "percent";
    const discountValue = Number(cafeInfo?.discountValue || 0);

    const items = Array.isArray(order?.items) ? order.items : [];
    const tableLabel = Number(order?.tableNumber || 0) > 0 ? `Table ${order.tableNumber}` : "Walk-in";
    const orderIdShort = String(order?._id || "").slice(-6).toUpperCase();
    const orderId = String(order?._id || "").slice(-8).toUpperCase();
    const payMode = String(order?.paymentMode || "cash").toUpperCase();
    
    const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleString() : new Date().toLocaleString();
    const updatedAt = order.updatedAt ? new Date(order.updatedAt).toLocaleString() : createdAt;
    
    // Pricing
    const hasServerPricing = typeof order?.subtotalAmount === "number" && typeof order?.taxAmount === "number";
    const lineSum = items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0);
    const subtotal = hasServerPricing ? Number(order.subtotalAmount) : lineSum;
    const tax = hasServerPricing ? Number(order.taxAmount) : (subtotal * taxRate) / 100;
    const discount = hasServerPricing
      ? Number(order.discountAmount || 0)
      : discountType === "fixed"
        ? discountValue
        : (subtotal * discountValue) / 100;
    const total = hasServerPricing ? Number(order.totalAmount || 0) : Math.max(0, subtotal + tax - discount);
    const orderNote = typeof order?.notes === "string" ? order.notes.trim() : "";

    const itemsRows = items.map(it => `
      <tr>
        <td class="item-name">${String(it.name || "Item")}</td>
        <td class="qty">${Number(it.qty || 1)}</td>
        <td class="price">INR ${(Number(it.price || 0) * Number(it.qty || 1)).toFixed(2)}</td>
      </tr>
    `).join("");

    const kitchenRowsHtml = items.map(it => `
      <tr>
        <td style="padding: 6px 0; font-size: 16px; font-weight: bold; width: 80%;">${String(it.name || "Item")}</td>
        <td style="padding: 6px 0; text-align: right; font-size: 16px; font-weight: bold; width: 20%; white-space: nowrap;">x ${Number(it.qty || 1)}</td>
      </tr>
    `).join("");

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Receipt #${orderIdShort}</title>
          <style>
            @page {
              size: 80mm auto;
              margin: 3mm;
            }

            * {
              box-sizing: border-box;
            }

            html, body {
              margin: 0;
              padding: 0;
              background: #fff;
              color: #111827;
              font-family: "Courier New", Courier, monospace;
              font-size: 11px;
              line-height: 1.35;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            body {
              width: 74mm;
              margin: 0 auto;
              padding: 2mm 0;
            }

            h1 {
              margin: 0;
              font-size: 15px;
              text-align: center;
              letter-spacing: 0.04em;
            }

            .center {
              text-align: center;
            }

            .logo {
              display: block;
              margin: 0 auto 6px;
              max-width: 110px;
              max-height: 48px;
              object-fit: contain;
            }

            .cafe-name {
              margin-bottom: 4px;
              font-size: 14px;
              font-weight: 700;
              text-align: center;
              text-transform: uppercase;
              word-break: break-word;
            }

            .meta {
              margin-top: 8px;
            }

            .meta div {
              margin: 1px 0;
              word-break: break-word;
            }

            .divider {
              margin: 8px 0;
              border-top: 1px dashed #111827;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              table-layout: fixed;
            }

            th, td {
              padding: 4px 0;
              vertical-align: top;
            }

            th {
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.04em;
              text-align: left;
              border-bottom: 1px dashed #111827;
            }

            .item-name {
              width: 58%;
              padding-right: 6px;
              word-break: break-word;
            }

            .qty {
              width: 12%;
              text-align: center;
            }

            .price {
              width: 30%;
              text-align: right;
              white-space: nowrap;
            }

            .summary {
              margin-top: 8px;
            }

            .line {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 12px;
              margin-top: 4px;
            }

            .line span:first-child {
              flex: 1 1 auto;
            }

            .line span:last-child {
              flex: 0 0 auto;
              white-space: nowrap;
              text-align: right;
            }

            .total {
              margin-top: 6px;
              padding-top: 6px;
              border-top: 1px dashed #111827;
              font-size: 13px;
              font-weight: 700;
            }

            .note-box {
              margin-top: 8px;
              padding-top: 6px;
              border-top: 1px dashed #111827;
            }

            .note-title {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.04em;
            }

            .note-text {
              margin-top: 3px;
              word-break: break-word;
              white-space: pre-wrap;
            }

            .footer {
              margin-top: 10px;
              padding-top: 6px;
              border-top: 1px dashed #111827;
              text-align: center;
              font-size: 10px;
            }

            .tag {
              display: inline-block;
              border: 1px solid #111827;
              padding: 2px 8px;
              font-size: 10px;
              font-weight: bold;
              letter-spacing: 1px;
              text-transform: uppercase;
              margin-top: 4px;
            }

            .page-break {
              page-break-before: always;
              padding-top: 12px;
              border-top: 2px dashed #111827;
              margin-top: 20px;
            }

            .kitchen-header {
              font-size: 18px;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
          </style>
        </head>
        <body>
          <!-- ═══════════ CUSTOMER COPY ═══════════ -->
          ${cafeLogo ? `<img class="logo" src="${cafeLogo}" alt="Cafe logo" />` : ""}
          <div class="cafe-name">${cafeName}</div>
          <h1>Final Bill</h1>
          <div class="center"><span class="tag">Customer Copy</span></div>
          <div class="meta">
            <div>Order: #${orderIdShort}</div>
            <div>Table: ${order.tableNumber || "Walk-in"}</div>
            <div>Customer: ${order.customerName || "Guest"}</div>
            <div>Phone: ${formatKitchenPhone(order.phone)}</div>
            <div>Opened: ${createdAt}</div>
            <div>Last updated: ${updatedAt}</div>
            <div>Bill type: Combined final bill</div>
          </div>
          <div class="divider"></div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th class="qty">Qty</th>
                <th class="price">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>
          <div class="summary">
            <div class="line">
              <span>Subtotal</span>
              <span>INR ${subtotal.toFixed(2)}</span>
            </div>
            <div class="line">
              <span>Tax (${taxRate.toFixed(2)}%)</span>
              <span>INR ${tax.toFixed(2)}</span>
            </div>
            <div class="line">
              <span>Discount (${discountType === "fixed" ? "INR" : `${discountValue.toFixed(2)}%`})</span>
              <span>INR ${discount.toFixed(2)}</span>
            </div>
            <div class="line total">
              <span>Total</span>
              <span>INR ${total.toFixed(2)}</span>
            </div>
          </div>
          ${orderNote ? `
            <div class="note-box">
              <div class="note-title">Order note</div>
              <div class="note-text">${orderNote}</div>
            </div>
          ` : ""}
          <div class="footer">
            <div>Payment: ${payMode}</div>
            <div>Status: ${String(order.status || "pending").toUpperCase()}</div>
            <div>Thank you for visiting!</div>
          </div>

          <!-- ═══════════ KITCHEN COPY ═══════════ -->
          <div class="page-break">
            <div class="center">
              <div class="kitchen-header">Kitchen Order</div>
              <span class="tag">Kitchen Copy</span>
            </div>
            <div class="meta">
              <div>Order: #${orderIdShort}</div>
              <div>Table: ${order.tableNumber || "Walk-in"}</div>
              <div>Time: ${new Date().toLocaleTimeString()}</div>
            </div>
            <div class="divider"></div>
            <table>
              <thead>
                <tr>
                  <th style="font-size: 12px; font-weight: bold; width: 80%;">Item</th>
                  <th style="font-size: 12px; font-weight: bold; text-align: right; width: 20%;">Qty</th>
                </tr>
              </thead>
              <tbody>
                ${kitchenRowsHtml}
              </tbody>
            </table>
            <div class="divider"></div>
            <div class="center" style="font-size:10px; margin-top: 6px;">— Prepare promptly —</div>
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 800);
            };
          <\/script>
        </body>
      </html>
    `;

    const w = window.open("", "_blank", "width=420,height=680,scrollbars=yes");
    if (!w) {
      alert("Pop-up blocked! Please allow pop-ups for this site and try again.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const buildOrderPayloadFromDraft = (draft) => {
    const rawTableNumber = String(draft.tableNumber || "").trim();
    const parsedTableNumber = rawTableNumber ? Number(rawTableNumber) : null;
    if (rawTableNumber && (!parsedTableNumber || parsedTableNumber < 1)) {
      return { error: "Table number must be 1 or more" };
    }
    if (!Array.isArray(draft.items) || draft.items.length === 0) {
      return { error: "Add at least one item to the order" };
    }

    return {
      payload: {
        tableNumber: parsedTableNumber,
        customerName: String(draft.customerName || "").trim() || "Walk-in guest",
        phone: String(draft.phone || "").trim() || (parsedTableNumber ? `manual-table-${parsedTableNumber}` : "manual-walk-in"),
        notes: String(draft.notes || "").trim(),
        paymentMode: draft.paymentMode,
        status: draft.status,
        items: draft.items.map((item) => ({
          menuItemId: item.menuItemId,
          qty: Number(item.qty || 1),
        })),
      },
    };
  };

  const updateDraftField = (field, value) => {
    setOrderDraft((prev) => ({ ...prev, [field]: value }));
  };

  const toggleTableExpanded = (tableKey) => {
    setExpandedTables((prev) => ({ ...prev, [tableKey]: !prev[tableKey] }));
  };

  const openTableOrders = useCallback((tableSelection) => {
    const tableKey = tableSelection?.tableKey;
    const tableNumber = Number(tableSelection?.tableNumber || 0);
    if (!tableKey || !tableSelection?.hasOrders) return;

    setSelectedTableKey(tableKey);
    setExpandedTables((prev) => ({ ...prev, [tableKey]: true }));
    if (tableNumber > 0) {
      setBlinkingTables((prev) => ({ ...prev, [tableNumber]: false }));
    }

    window.setTimeout(() => {
      const node = tableCardRefs.current?.[tableKey];
      if (node && typeof node.scrollIntoView === "function") {
        node.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 160);
  }, []);

  const addDraftItem = (menuItemId) => {
    const resolvedMenuItemId = menuItemId
      ? String(menuItemId)
      : filteredMenuItems[0]?._id
        ? String(filteredMenuItems[0]._id)
        : menuItems[0]?._id
          ? String(menuItems[0]._id)
          : "";
    if (!resolvedMenuItemId) return;
    setOrderDraft((prev) => {
      const existingIndex = prev.items.findIndex(
        (item) => String(item.menuItemId) === resolvedMenuItemId,
      );
      if (existingIndex >= 0) {
        return {
          ...prev,
          items: prev.items.map((item, itemIndex) =>
            itemIndex === existingIndex
              ? { ...item, qty: Math.max(1, Number(item.qty || 1)) + 1 }
              : item,
          ),
        };
      }
      return {
        ...prev,
        items: [...prev.items, { menuItemId: resolvedMenuItemId, qty: 1 }],
      };
    });
  };

  const updateDraftItem = (index, patch) => {
    setOrderDraft((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        return { ...item, ...patch };
      }),
    }));
  };

  const removeDraftItem = (index) => {
    setOrderDraft((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const submitOrderDraft = async (event) => {
    event.preventDefault();
    const result = buildOrderPayloadFromDraft(orderDraft);
    if (result.error) {
      setError(result.error);
      return;
    }

    setEditorSaving(true);
    setError("");
    try {
      const payload = result.payload;

      const updated =
        editorMode === "edit" && editingOrderId
          ? await apiFetch(`/api/orders/${editingOrderId}`, {
              method: "PUT",
              headers: { ...(token ? authHeaders() : {}) },
              body: JSON.stringify(payload),
            })
          : await apiFetch("/api/orders/staff", {
              method: "POST",
              headers: { ...(token ? authHeaders() : {}) },
              body: JSON.stringify(payload),
            });

      setTodayOrders((prev) => upsertOrder(prev, updated));
      if (isKitchenLiveOrder(updated)) {
        setOrders((prev) => upsertOrder(prev, updated));
      } else {
        const updatedId = String(updated?._id || "");
        setOrders((prev) =>
          prev.filter((order) => String(order?._id || "") !== updatedId),
        );
      }
      closeOrderEditor();
    } catch (e) {
      setError(e.message || "Failed to save order");
    } finally {
      setEditorSaving(false);
    }
  };

  const submitQuickOrderPreview = async () => {
    const result = buildOrderPayloadFromDraft(quickOrderDraft);
    if (result.error) {
      setError(result.error);
      return;
    }

    setEditorSaving(true);
    setError("");
    try {
      const updated = await apiFetch("/api/orders/staff", {
        method: "POST",
        headers: { ...(token ? authHeaders() : {}) },
        body: JSON.stringify(result.payload),
      });

      setTodayOrders((prev) => upsertOrder(prev, updated));
      if (isKitchenLiveOrder(updated)) {
        setOrders((prev) => upsertOrder(prev, updated));
      } else {
        const updatedId = String(updated?._id || "");
        setOrders((prev) =>
          prev.filter((order) => String(order?._id || "") !== updatedId),
        );
      }
      // Store the completed order so chef can print the bill
      setLastCreatedOrder(updated);
      clearQuickOrderDraft();
      playSuccess();
    } catch (e) {
      setError(e.message || "Failed to create quick order");
    } finally {
      setEditorSaving(false);
    }
  };

  const motionInitial =
    mounted && !reducedMotion ? { opacity: 0, y: 10 } : false;

  if (!authReady) {
    return (
      <StaffShell title="Kitchen dashboard" subtitle="Loading…">
        <AppLoading label="Authenticating" />
      </StaffShell>
    );
  }

  return (
    <StaffShell
      staffNav={{
        variant: "kitchen",
        onRefresh: () => loadKitchenData({ forceStatic: true }),
        historyHref: "/kitchen/history",
      }}
      badge={
        <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-orange-700 shadow">
          Kitchen Operations
        </span>
      }
      title="Kitchen dashboard"
      subtitle="Live orders, prep status, and handoff tracking."
      actions={
        <>
          <SoundControl />
        </>
      }
      contentClassName="mx-auto w-full max-w-7xl pb-10"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-orange-50/40 px-4 py-3 text-center shadow-sm ring-1 ring-orange-100/80">
              <div className="text-xl font-bold tabular-nums text-slate-900">
                {stats.todayTotalOrders}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Today&apos;s orders
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white to-emerald-50/30 px-4 py-3 text-center shadow-sm ring-1 ring-emerald-100/60">
              <div className="text-xl font-bold tabular-nums text-slate-900">
                ₹{stats.todayRevenue.toFixed(0)}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Today&apos;s revenue
              </div>
            </div>
            <div className="rounded-2xl border border-orange-200/80 bg-white/90 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold tabular-nums text-orange-900">
                {stats.total}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Active on board
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold tabular-nums text-slate-900">
                {stats.queue}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Queue
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold tabular-nums text-slate-900">
                {stats.preparing}
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Preparing
              </div>
            </div>
          </div>
          <div className="min-w-0 text-sm text-slate-600">
            Socket: <span className="font-semibold">{socketState}</span>
          </div>
          <Button
            variant="outline"
            onClick={() => loadKitchenData({ forceStatic: true })}
            disabled={!cafeId || loading}
            className="min-w-[110px]"
          >
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-w-[140px] text-xs sm:text-sm"
            onClick={() => requestNotificationPermission()}
          >
            Enable alerts
          </Button>
          <Link
            href="/kitchen/history"
            className="inline-flex items-center rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-800 shadow-sm hover:bg-orange-50"
          >
            History
          </Link>
          <Button
            onClick={openNewOrderEditor}
            disabled={!cafeId || menuLoading}
          >
            Manual order
          </Button>
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Quick order
          </h2>
          <div className="mt-1 text-sm text-slate-600">
            Tap a category to browse and add items to the bill.
          </div>
        </div>

        {/* ── Last Created Order / Success Notification Banner ── */}
        {lastCreatedOrder && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm ring-1 ring-emerald-100/60 backdrop-blur-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                <Check className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-emerald-950">Order Taken Successfully!</div>
                <div className="text-xs font-medium text-emerald-700">
                  Order #{String(lastCreatedOrder._id || "").slice(-6).toUpperCase()} • Table {lastCreatedOrder.tableNumber || "Walk-in"} • Total: Rs {Number(lastCreatedOrder.totalAmount || lastCreatedOrder.subtotalAmount || 0).toFixed(0)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-2 border-0"
                onClick={() => printReceipt(lastCreatedOrder)}
              >
                <Printer className="h-4 w-4" />
                Print Bill & KOT
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-emerald-200 text-emerald-800 hover:bg-emerald-100/70"
                onClick={() => setLastCreatedOrder(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {/* ── Category grid ── */}
        <div className="rounded-2xl border border-dashed border-orange-200/70 bg-white/55 px-4 py-4 shadow-sm backdrop-blur-sm dark:border-white/[0.06] dark:bg-slate-900/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800 dark:border-orange-500/20 dark:bg-orange-950/30 dark:text-orange-400">
              {allQuickOrderCategories.length
                ? `${allQuickOrderCategories.length} categor${allQuickOrderCategories.length === 1 ? "y" : "ies"}`
                : "No categories yet"}
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              {menuItems.length} menu item{menuItems.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-orange-100 bg-white/80 p-4 shadow-sm dark:border-white/[0.06] dark:bg-slate-900/70">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {menuLoading ? (
                Array.from({ length: 15 }).map((_, i) => (
                  <div
                    key={`ql-${i}`}
                    className="aspect-[1.1] animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50"
                  />
                ))
              ) : allQuickOrderCategories.length ? (
                allQuickOrderCategories.map((cat) => (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => setQuickOrderCategoryModal(cat.name)}
                    className="group flex aspect-[1.1] min-h-[7rem] flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 px-3 py-4 text-center shadow-sm transition hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 active:scale-[0.98] dark:border-slate-800 dark:from-slate-900/90 dark:to-slate-950/80 dark:hover:border-orange-500/40 dark:hover:bg-orange-950/10 dark:hover:from-slate-900 dark:hover:to-slate-900"
                  >
                    <div className="line-clamp-2 text-base font-black leading-tight text-slate-900 transition group-hover:text-orange-800 md:text-lg dark:text-slate-100 dark:group-hover:text-orange-400">
                      {cat.name}
                    </div>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {cat.count} item{cat.count === 1 ? "" : "s"}
                    </div>
                  </button>
                ))
              ) : (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  No menu categories found for this cafe.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Category item popup ── */}
        {quickOrderCategoryModal ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-3 py-5 backdrop-blur-sm sm:px-6"
            role="dialog"
            aria-modal="true"
            aria-label={`${quickOrderCategoryModal} items`}
            onClick={(e) => { if (e.target === e.currentTarget) setQuickOrderCategoryModal(""); }}
          >
            <div className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
              {/* Modal header */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800/60">
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Category</div>
                  <div className="mt-1 break-words text-xl font-black leading-tight text-slate-900 dark:text-slate-100">
                    {quickOrderCategoryModal}
                  </div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {selectedCategoryModalItems.length} item{selectedCategoryModalItems.length === 1 ? "" : "s"} available
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickOrderCategoryModal("")}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal item list */}
              <div className="max-h-[58vh] overflow-y-auto px-4 py-4 [scrollbar-width:thin]">
                {menuLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-16 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50" />
                    ))}
                  </div>
                ) : selectedCategoryModalItems.length ? (
                  <div className="space-y-2">
                    {selectedCategoryModalItems.map((item) => {
                      const draftQty = quickOrderDraftItemsDetailed.find(
                        (d) => d.menuItemId === item.menuItemId,
                      )?.qty;
                      return (
                        <button
                          key={item.menuItemId}
                          type="button"
                          onClick={() => addQuickOrderItem(item.menuItemId)}
                          className="flex min-h-[4.5rem] w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-left shadow-sm transition hover:border-orange-200 hover:bg-orange-50/80 active:scale-[0.99] dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-orange-500/40 dark:hover:bg-orange-950/15"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="break-words text-base font-bold leading-snug text-slate-900 dark:text-slate-100">
                              {item.name}
                            </div>
                            <div className="mt-1 text-sm font-semibold tabular-nums text-slate-600 dark:text-slate-400">
                              Rs {Number(item.price || 0).toFixed(0)}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {draftQty ? (
                              <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-800 dark:bg-orange-950/60 dark:text-orange-400">
                                ×{draftQty}
                              </span>
                            ) : null}
                            <span className="rounded-full bg-orange-500 px-3 py-1.5 text-xs font-black text-white shadow-sm">
                              Add
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-850 dark:bg-slate-950 dark:text-slate-400">
                    No items found in this category.
                  </div>
                )}
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-orange-50/60 px-5 py-4 dark:border-slate-800 dark:bg-orange-950/20">
                <div className="text-sm text-slate-700">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Bill total</div>
                  <div className="font-black tabular-nums text-slate-900 dark:text-slate-200">Rs {quickOrderEstimate.total.toFixed(0)}</div>
                </div>
                <Button type="button" variant="outline" onClick={() => setQuickOrderCategoryModal("")}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {quickOrderDraftItemsDetailed.length ? (
          <div className="rounded-2xl border border-orange-100/80 bg-white/90 p-4 shadow-sm ring-1 ring-orange-50/80 backdrop-blur-sm dark:border-white/[0.06] dark:bg-slate-900/95 dark:ring-white/[0.04]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Quick order preview
                </div>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Table number is optional. Blank quick orders are saved as walk-in.
                </div>
              </div>
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-400">
                {quickOrderDraftItemsDetailed.reduce((sum, item) => sum + item.qty, 0)} item
                {quickOrderDraftItemsDetailed.reduce((sum, item) => sum + item.qty, 0) === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,16rem)_1fr]">
              <Input
                value={quickOrderDraft.tableNumber}
                onChange={(e) => setQuickOrderDraft((prev) => ({ ...prev, tableNumber: e.target.value }))}
                placeholder="Table number"
                type="number"
                min="1"
              />
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800/80 dark:bg-slate-950/50">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-800">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-200">Selected items</div>
                  <button
                    type="button"
                    onClick={clearQuickOrderDraft}
                    className="text-xs font-semibold text-slate-500 transition hover:text-red-600 dark:text-slate-400"
                  >
                    Clear
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {quickOrderDraftItemsDetailed.map((item) => (
                    <div
                      key={`${item.menuItemId}-${item.index}`}
                      className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
                            {item.menuItem.name}
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatMenuItemMeta(item.menuItem)}</div>
                        </div>
                        <Button type="button" variant="danger" size="sm" onClick={() => removeQuickOrderItem(item.index)}>
                          Remove
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-3 dark:border-slate-800">
                        <div className="inline-flex h-11 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                          <button
                            type="button"
                            className="flex w-11 items-center justify-center border-r border-slate-200 bg-slate-50 text-lg font-semibold text-slate-700 transition hover:bg-slate-100 active:bg-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                            aria-label="Decrease quantity"
                            onClick={() => updateQuickOrderItem(item.index, { qty: Math.max(1, item.qty - 1) })}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            value={item.qty}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              updateQuickOrderItem(item.index, {
                                qty: Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1,
                              });
                            }}
                            className="w-16 border-0 bg-white px-1 text-center text-base font-semibold tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-200/90 dark:bg-slate-950 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            className="flex w-11 items-center justify-center border-l border-slate-200 bg-slate-50 text-lg font-semibold text-slate-700 transition hover:bg-slate-100 active:bg-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                            aria-label="Increase quantity"
                            onClick={() => updateQuickOrderItem(item.index, { qty: item.qty + 1 })}
                          >
                            +
                          </button>
                        </div>
                        <div className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">Rs {item.lineTotal.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-orange-50/70 px-4 py-3 dark:border-orange-500/20 dark:bg-orange-950/20">
              <div className="text-sm text-slate-700 dark:text-slate-400">
                <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total</div>
                <div className="font-bold text-slate-900 dark:text-slate-100">₹{quickOrderEstimate.total.toFixed(2)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={submitQuickOrderPreview} disabled={editorSaving || !quickOrderDraftItemsDetailed.length}>
                  {editorSaving ? "Saving..." : "Confirm"}
                </Button>
                <Button type="button" variant="outline" onClick={clearQuickOrderDraft} disabled={editorSaving}>
                  Clear
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200/90 bg-white/70 p-4 shadow-sm ring-1 ring-slate-100/80 backdrop-blur-sm dark:border-white/[0.06] dark:bg-slate-900/75 dark:ring-white/[0.04]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="w-full max-w-md space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Search live queue
              </div>
              <Input
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                placeholder="Table number, customer name, or phone"
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Order source
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "all", label: "All" },
                  {
                    id: "manual",
                    label: "Walk-in / manual",
                    icon: ClipboardList,
                  },
                  { id: "qr", label: "QR / guest", icon: QrCode },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSourceFilter(id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      sourceFilter === id
                        ? "border-orange-400 bg-orange-50 text-orange-900 shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {Icon ? (
                      <Icon
                        className="h-3.5 w-3.5 shrink-0 opacity-80"
                        aria-hidden
                      />
                    ) : null}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <span>
              <strong className="text-slate-800">Ready</strong> = hand off to
              service.
            </span>
            <span>Updates sync automatically.</span>
            <span className="font-medium text-slate-800">
              Showing {groupedFilteredOrders.length} table cards for{" "}
              {filteredOrders.length} active orders
              {tableFilter || sourceFilter !== "all" ? " (filtered)" : ""}.
            </span>
          </div>
        </div>

        {!user?.cafeId && (
          <Card className="border border-orange-100 shadow-xl">
            <CardContent>
              <div className="font-bold">Cafe scope</div>
              <div className="mt-1 text-sm text-gray-600">
                Enter a cafeId to view orders.
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={cafeIdOverride}
                  onChange={(e) => setCafeIdOverride(e.target.value)}
                  placeholder="cafeId (ObjectId)"
                />
                <Button
                  variant="outline"
                  onClick={() => loadKitchenData()}
                  disabled={!cafeIdOverride || loading}
                >
                  Load
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {alertMsg && <StaffAlertBanner message={alertMsg} variant="warn" />}

        {error && <div className="text-red-700 font-semibold">{error}</div>}
        {menuError && (
          <div className="text-red-700 font-semibold">{menuError}</div>
        )}

        <TableStatusPad
          title="Table dial pad"
          subtitle="Blinking tables have new activity. Click a table number to open its orders in a popup."
          totalTables={cafeInfo?.numberOfTables}
          groups={groupedOrders}
          expandedTables={expandedTables}
          onSelectTable={openTableOrders}
          blinkingTableNumbers={blinkingTables}
          selectedTableNumber={selectedGroup?.tableNumber}
        />

        {false && (
          <div className="grid grid-cols-1 items-start gap-2.5 xl:grid-cols-2 2xl:grid-cols-3">
            {groupedFilteredOrders.map((group) => {
              const latestOrder = group.latestOrder;
              const groupedStatus =
                group.orders.find(
                  (order) =>
                    String(order?.status || "").toLowerCase() === "pending",
                )?.status || latestOrder?.status;
              const statusPalette = getOrderStatusPalette(groupedStatus);
              const needsAttention = group.orders.some(
                (order) =>
                  String(order?.status || "").toLowerCase() === "pending",
              );
              const manualCount = group.orders.filter(
                (order) => order.source === "manual",
              ).length;
              const qrCount = group.orders.length - manualCount;
              const isExpanded = Boolean(expandedTables[group.tableKey]);
              return (
                <motion.div
                  key={group.tableKey}
                  ref={(node) => {
                    if (node) tableCardRefs.current[group.tableKey] = node;
                  }}
                  initial={motionInitial}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`min-w-0 ${needsAttention ? "kitchen-order-attention" : ""}`}
                >
                  <Card
                    className={`overflow-hidden shadow-md transition ${statusPalette.cardClassName || ""}`}
                    style={statusPalette.cardStyle}
                  >
                    <CardContent
                      className="p-0"
                      style={statusPalette.bodyStyle}
                    >
                      <button
                        type="button"
                        onClick={() => toggleTableExpanded(group.tableKey)}
                        className="flex w-full flex-wrap items-start justify-between gap-2 border-b border-slate-200/80 px-2.5 py-2 text-left sm:px-3"
                        style={statusPalette.headerStyle}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1">
                            <span
                              className={`text-[18px] font-black leading-none ${statusPalette.titleClassName || "text-slate-900"}`}
                            >
                              {formatKitchenTableLabel(group.tableNumber)}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                              {group.orders.length} orders
                            </span>
                            {manualCount > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                                <ClipboardList
                                  className="h-3 w-3"
                                  aria-hidden
                                />
                                {manualCount} manual
                              </span>
                            )}
                            {qrCount > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-900">
                                <QrCode className="h-3 w-3" aria-hidden />
                                {qrCount} qr
                              </span>
                            )}
                          </div>
                          <div
                            className={`mt-0.5 space-y-0 text-[11px] ${statusPalette.mutedTextClassName || "text-slate-600"}`}
                          >
                            <div
                              className={`break-words font-extrabold ${statusPalette.textClassName || "text-slate-800"}`}
                            >
                              {group.customerNames.length
                                ? group.customerNames.join(", ")
                                : "Guest"}
                            </div>
                            <div
                              className={`text-[11px] font-semibold ${statusPalette.mutedTextClassName || "text-slate-500"}`}
                            >
                              {group.phones.length
                                ? group.phones
                                    .map((phone) => formatKitchenPhone(phone))
                                    .join(" • ")
                                : "-"}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div
                            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide shadow-sm ${statusPalette.pillClassName || ""}`}
                            style={statusPalette.pillStyle}
                          >
                            {statusPalette.normalized || groupedStatus}
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            />
                            {isExpanded ? "Hide" : "Show"}
                          </span>
                        </div>
                      </button>

                      {isExpanded ? (
                        <div className="space-y-1.5 px-2 pb-2 pt-1.5 sm:px-2.5">
                          {group.orders.map((o) => {
                            const orderPalette = getOrderStatusPalette(
                              o.status,
                            );
                            return (
                              <div
                                key={o._id}
                                className="rounded-md border border-slate-200 bg-white/60 p-2"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-1.5">
                                  <div className="min-w-0">
                                    <div
                                      className={`text-[14px] font-black leading-tight ${orderPalette.titleClassName || "text-slate-900"}`}
                                    >
                                      Order #{String(o._id).slice(-6)}
                                    </div>
                                    <div
                                      className={`mt-0.5 text-[11px] font-bold leading-tight ${orderPalette.mutedTextClassName || "text-slate-600"}`}
                                    >
                                      {o.customerName || "Guest"} •{" "}
                                      {formatKitchenPhone(o.phone)}
                                    </div>
                                  </div>
                                  <div
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase ${orderPalette.pillClassName || ""}`}
                                    style={orderPalette.pillStyle}
                                  >
                                    {orderPalette.normalized || o.status}
                                  </div>
                                </div>

                                <div className="mt-1.5 max-h-[5.5rem] space-y-1 overflow-y-auto overscroll-contain rounded-md border p-1.5 text-[12px] [scrollbar-gutter:stable]">
                                  {(Array.isArray(o.items) ? o.items : []).map(
                                    (it, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-start justify-between gap-2 border-b border-slate-100/90 pb-1 last:border-0 last:pb-0"
                                      >
                                        <span className="min-w-0 flex-1 break-words leading-snug text-slate-900">
                                          <span className="font-extrabold">
                                            {lineItemLabel(it)}
                                          </span>
                                          <span className="font-semibold text-slate-600">
                                            {" "}
                                            x {Number(it?.qty || 0)}
                                          </span>
                                        </span>
                                        <span className="shrink-0 tabular-nums font-extrabold text-slate-900">
                                          Rs {lineItemTotal(it).toFixed(0)}
                                        </span>
                                      </div>
                                    ),
                                  )}
                                </div>

                                {o.paymentMode && (
                                  <div
                                    className={`mt-1.5 text-[11px] font-extrabold ${orderPalette.textClassName || "text-slate-700"}`}
                                  >
                                    Payment:{" "}
                                    {String(o.paymentMode).toUpperCase()}
                                  </div>
                                )}
                                <div
                                  className={`mt-1 text-[11px] font-semibold ${orderPalette.mutedTextClassName || "text-slate-600"}`}
                                >
                                  A: {formatOrderAcceptedAt(o)} | S:{" "}
                                  {formatOrderServedAt(o)} | A-S:{" "}
                                  {formatOrderAcceptToServe(o)}
                                </div>

                                {o.notes ? (
                                  <div className="mt-1.5 max-h-20 overflow-y-auto rounded-md border border-amber-200/90 bg-amber-50/90 px-2 py-1.5 text-[11px] text-amber-950">
                                    <div className="text-[10px] font-extrabold uppercase tracking-wide text-amber-800">
                                      Note
                                    </div>
                                    <div className="mt-0.5 whitespace-pre-wrap break-words font-semibold">
                                      {o.notes}
                                    </div>
                                  </div>
                                ) : null}

                                {(() => {
                                  const lineSum = (
                                    Array.isArray(o.items) ? o.items : []
                                  ).reduce(
                                    (s, it) =>
                                      s +
                                      Number(it.price || 0) *
                                        Number(it.qty || 0),
                                    0,
                                  );
                                  const hasServerPricing =
                                    typeof o.subtotalAmount === "number" &&
                                    typeof o.taxAmount === "number";
                                  const subtotal = hasServerPricing
                                    ? Number(o.subtotalAmount)
                                    : Number(o.totalAmount || lineSum);
                                  const discount =
                                    typeof o.discountAmount === "number"
                                      ? Number(o.discountAmount)
                                      : 0;
                                  const taxRate = Number(
                                    cafeInfo?.taxPercent || 0,
                                  );
                                  const taxAmount = hasServerPricing
                                    ? Number(o.taxAmount)
                                    : subtotal * (taxRate / 100);
                                  const totalFinal = hasServerPricing
                                    ? Number(o.totalAmount || 0)
                                    : subtotal + taxAmount;
                                  return (
                                    <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 rounded-md border px-2 py-1.5 text-[11px]">
                                      <div className="font-semibold text-slate-700">
                                        Subtotal
                                      </div>
                                      <div className="text-right tabular-nums font-bold text-slate-800">
                                        Rs {subtotal.toFixed(0)}
                                      </div>
                                      {discount > 0 && (
                                        <>
                                          <div className="font-semibold text-slate-700">
                                            Discount
                                          </div>
                                          <div className="text-right tabular-nums font-bold text-slate-800">
                                            - Rs {discount.toFixed(0)}
                                          </div>
                                        </>
                                      )}
                                      <div className="font-semibold text-slate-700">
                                        Tax{" "}
                                        {!hasServerPricing && taxRate
                                          ? `(${taxRate}%)`
                                          : ""}
                                      </div>
                                      <div className="text-right tabular-nums font-bold text-slate-800">
                                        Rs {taxAmount.toFixed(0)}
                                      </div>
                                      <div className="border-t border-slate-100 pt-1 font-extrabold text-slate-900">
                                        Total
                                      </div>
                                      <div className="border-t border-slate-100 pt-1 text-right tabular-nums font-extrabold text-slate-900">
                                        Rs {totalFinal.toFixed(0)}
                                      </div>
                                    </div>
                                  );
                                })()}

                                <div className="mt-1.5 grid grid-cols-3 gap-1 sm:grid-cols-5">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full justify-center px-1.5 py-1 text-[11px] font-extrabold"
                                    type="button"
                                    onClick={() => openEditOrderEditor(o)}
                                    disabled={loading || editorSaving}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full justify-center px-1.5 py-1 text-[11px] font-extrabold"
                                    onClick={() => setStatus(o._id, "accepted")}
                                    disabled={loading}
                                  >
                                    Accept
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full justify-center px-1.5 py-1 text-[11px] font-extrabold"
                                    onClick={() =>
                                      setStatus(o._id, "preparing")
                                    }
                                    disabled={loading}
                                  >
                                    Prep
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full justify-center px-1.5 py-1 text-[11px] font-extrabold"
                                    onClick={() => setStatus(o._id, "ready")}
                                    disabled={loading}
                                  >
                                    Ready
                                  </Button>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    className="w-full justify-center px-1.5 py-1 text-[11px] font-extrabold"
                                    onClick={() => setStatus(o._id, "rejected")}
                                    disabled={loading}
                                  >
                                    Reject
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}

            {false &&
              filteredOrders.map((o) => {
                const isManual = o.source === "manual";
                const statusPalette = getOrderStatusPalette(o.status);
                const needsAttention = statusPalette.normalized === "pending";
                return (
                  <motion.div
                    key={o._id}
                    initial={motionInitial}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`min-w-0 ${needsAttention ? "kitchen-order-attention" : ""}`}
                  >
                    <Card
                      className={`overflow-hidden shadow-lg transition ${statusPalette.cardClassName || ""}`}
                      style={statusPalette.cardStyle}
                    >
                      <CardContent
                        className="p-0"
                        style={statusPalette.bodyStyle}
                      >
                        <div
                          className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-4 sm:px-5"
                          style={statusPalette.headerStyle}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`font-extrabold ${statusPalette.titleClassName || "text-slate-900"}`}
                              >
                                {formatKitchenTableLabel(o.tableNumber)}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                  isManual
                                    ? "bg-amber-100 text-amber-900"
                                    : "bg-slate-200/80 text-slate-700"
                                }`}
                              >
                                {isManual ? (
                                  <>
                                    <ClipboardList
                                      className="h-3 w-3"
                                      aria-hidden
                                    />
                                    Manual
                                  </>
                                ) : (
                                  <>
                                    <QrCode className="h-3 w-3" aria-hidden />
                                    QR
                                  </>
                                )}
                              </span>
                            </div>
                            <div
                              className={`mt-1.5 space-y-0.5 text-sm ${statusPalette.mutedTextClassName || "text-slate-600"}`}
                            >
                              <div
                                className={`break-words font-medium ${statusPalette.textClassName || "text-slate-800"}`}
                              >
                                {o.customerName || "Guest"}
                              </div>
                              <div
                                className={`text-xs ${statusPalette.mutedTextClassName || "text-slate-500"}`}
                              >
                                {formatKitchenPhone(o.phone)}
                              </div>
                            </div>
                          </div>
                          <div
                            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide shadow-sm ${statusPalette.pillClassName || ""}`}
                            style={statusPalette.pillStyle}
                          >
                            {statusPalette.normalized || o.status}
                          </div>
                        </div>

                        <div className="px-4 pb-3 pt-3 sm:px-5">
                          <div
                            className={`max-h-[min(22rem,50vh)] space-y-2 overflow-y-auto overscroll-contain rounded-xl border p-3 text-sm [scrollbar-gutter:stable] ${statusPalette.panelClassName || "border-slate-100"} ${statusPalette.panelTextClassName || "text-slate-900"}`}
                            style={statusPalette.panelStyle}
                          >
                            {(Array.isArray(o.items) ? o.items : []).map(
                              (it, idx) => (
                                <div
                                  key={idx}
                                  className={`flex items-start justify-between gap-3 border-b border-slate-100/90 pb-2 last:border-0 last:pb-0 ${statusPalette.panelTextClassName || "text-slate-900"}`}
                                >
                                  <span className="min-w-0 flex-1 break-words leading-snug text-slate-800">
                                    <span className="font-semibold">
                                      {lineItemLabel(it)}
                                    </span>
                                    <span className="text-slate-500">
                                      {" "}
                                      × {Number(it?.qty || 0)}
                                    </span>
                                  </span>
                                  <span className="shrink-0 tabular-nums font-medium text-slate-900">
                                    ₹{lineItemTotal(it).toFixed(2)}
                                  </span>
                                </div>
                              ),
                            )}
                          </div>

                          {o.paymentMode && (
                            <div
                              className={`mt-3 text-xs font-semibold ${statusPalette.textClassName || "text-slate-600"}`}
                            >
                              Payment: {String(o.paymentMode).toUpperCase()}
                            </div>
                          )}

                          {o.notes ? (
                            <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-sm text-amber-950">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                                Order note
                              </div>
                              <div className="mt-1 whitespace-pre-wrap break-words">
                                {o.notes}
                              </div>
                            </div>
                          ) : null}

                          {(() => {
                            const lineSum = (
                              Array.isArray(o.items) ? o.items : []
                            ).reduce(
                              (s, it) =>
                                s + Number(it.price || 0) * Number(it.qty || 0),
                              0,
                            );
                            const hasServerPricing =
                              typeof o.subtotalAmount === "number" &&
                              typeof o.taxAmount === "number";
                            const subtotal = hasServerPricing
                              ? Number(o.subtotalAmount)
                              : Number(o.totalAmount || lineSum);
                            const discount =
                              typeof o.discountAmount === "number"
                                ? Number(o.discountAmount)
                                : 0;
                            const taxRate = Number(cafeInfo?.taxPercent || 0);
                            const taxAmount = hasServerPricing
                              ? Number(o.taxAmount)
                              : subtotal * (taxRate / 100);
                            const totalFinal = hasServerPricing
                              ? Number(o.totalAmount || 0)
                              : subtotal + taxAmount;
                            return (
                              <div
                                className={`mt-3 space-y-1 rounded-xl border px-3 py-2 text-sm ${statusPalette.panelClassName || "border-slate-100"} ${statusPalette.panelTextClassName || "text-slate-900"}`}
                                style={statusPalette.panelStyle}
                              >
                                <div
                                  className={`flex justify-between ${statusPalette.panelMutedTextClassName || "text-slate-600"}`}
                                >
                                  <span>Subtotal</span>
                                  <span className="tabular-nums">
                                    ₹{subtotal.toFixed(2)}
                                  </span>
                                </div>
                                {discount > 0 && (
                                  <div
                                    className={`flex justify-between ${statusPalette.panelMutedTextClassName || "text-slate-600"}`}
                                  >
                                    <span>Discount</span>
                                    <span className="tabular-nums">
                                      − ₹{discount.toFixed(2)}
                                    </span>
                                  </div>
                                )}
                                <div
                                  className={`flex justify-between ${statusPalette.panelMutedTextClassName || "text-slate-600"}`}
                                >
                                  <span>
                                    Tax{" "}
                                    {!hasServerPricing && taxRate
                                      ? `(${taxRate}%)`
                                      : ""}
                                  </span>
                                  <span className="tabular-nums">
                                    ₹{taxAmount.toFixed(2)}
                                  </span>
                                </div>
                                <div
                                  className={`flex justify-between border-t border-slate-100 pt-1 font-extrabold ${statusPalette.panelTextClassName || "text-slate-900"}`}
                                >
                                  <span>Total</span>
                                  <span className="tabular-nums">
                                    ₹{totalFinal.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <Button
                              variant="outline"
                              className="w-full justify-center"
                              type="button"
                              onClick={() => openEditOrderEditor(o)}
                              disabled={loading || editorSaving}
                            >
                              Edit order
                            </Button>
                            <Button
                              variant="outline"
                              className="w-full justify-center"
                              onClick={() => setStatus(o._id, "accepted")}
                              disabled={loading}
                            >
                              Accepted
                            </Button>
                            <Button
                              variant="outline"
                              className="w-full justify-center"
                              onClick={() => setStatus(o._id, "preparing")}
                              disabled={loading}
                            >
                              Preparing
                            </Button>
                            <Button
                              variant="outline"
                              className="w-full justify-center"
                              onClick={() => setStatus(o._id, "ready")}
                              disabled={loading}
                            >
                              Ready
                            </Button>
                            <Button
                              variant="danger"
                              className="w-full justify-center"
                              onClick={() => setStatus(o._id, "rejected")}
                              disabled={loading}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
          </div>
        )}

        {!loading && cafeId && groupedFilteredOrders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-slate-700 dark:border-slate-850 dark:bg-slate-900/50 dark:text-slate-400">
            {tableFilter || sourceFilter !== "all"
              ? "No orders match your search or source filter. Try clearing filters or refresh."
              : "No active orders on the board yet."}
          </div>
        )}
        {selectedGroup ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]">
            <button
              type="button"
              aria-label="Close table orders"
              className="absolute inset-0"
              onClick={() => setSelectedTableKey("")}
            />
            <div className="relative z-10 max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200/90 bg-gradient-to-br from-white via-orange-50/30 to-slate-50 shadow-[0_30px_90px_-30px_rgba(15,23,42,0.45)]">
              <div className="border-b border-slate-200/90 bg-white/85 px-5 py-5 backdrop-blur-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-orange-700">
                      Kitchen Order View
                    </div>
                    <div className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                      {formatKitchenTableLabel(selectedGroup.tableNumber)}
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      {selectedGroup.customerNames.length
                        ? selectedGroup.customerNames.join(", ")
                        : "Guest"}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedTableKey("")}
                    iconLeft={<X className="h-4 w-4" />}
                  >
                    Close
                  </Button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-900">
                    {selectedGroup.orders.length} active orders
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                    {selectedGroup.phones.length
                      ? selectedGroup.phones
                          .map((phone) => formatKitchenPhone(phone))
                          .join(" • ")
                      : "No phone"}
                  </div>
                </div>
              </div>
              <div className="max-h-[calc(90vh-124px)] overflow-y-auto p-3 sm:p-4">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {selectedGroup.orders.map((o, index) => {
                    const orderPalette = getOrderStatusPalette(o.status);
                    const itemCount = (
                      Array.isArray(o.items) ? o.items : []
                    ).reduce((sum, item) => sum + Number(item?.qty || 0), 0);
                    return (
                      <div
                        key={o._id}
                        className="overflow-hidden rounded-[1.25rem] border border-slate-200/90 bg-white shadow-[0_18px_45px_-32px_rgba(15,23,42,0.5)]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-orange-900">
                                Customer {index + 1}
                              </div>
                              <div className="text-[15px] font-black leading-tight text-slate-950">
                                Order #{String(o._id).slice(-6)}
                              </div>
                              <div
                                className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${orderPalette.pillClassName || ""}`}
                                style={orderPalette.pillStyle}
                              >
                                {orderPalette.normalized || o.status}
                              </div>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-slate-600">
                              <span className="font-semibold text-slate-900">
                                {o.customerName || "Guest"}
                              </span>
                              <span>{formatKitchenPhone(o.phone)}</span>
                              <span>{itemCount} items</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-3">
                          <div className="overflow-hidden rounded-xl border border-slate-200">
                            <div className="grid grid-cols-[1fr_auto_auto] gap-2 bg-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                              <span>Item</span>
                              <span>Qty</span>
                              <span>Total</span>
                            </div>
                            <div className="divide-y divide-slate-100">
                              {(Array.isArray(o.items) ? o.items : []).map(
                                (it, idx) => (
                                  <div
                                    key={idx}
                                    className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 text-[13px]"
                                  >
                                    <div className="min-w-0">
                                      <div className="break-words font-bold text-slate-900">
                                        {lineItemLabel(it)}
                                      </div>
                                      <div className="mt-0.5 text-[11px] text-slate-500">
                                        Rs {Number(it?.price || 0).toFixed(0)}{" "}
                                        each
                                      </div>
                                    </div>
                                    <div className="text-right font-semibold text-slate-700">
                                      {Number(it?.qty || 0)}
                                    </div>
                                    <div className="text-right font-black tabular-nums text-slate-900">
                                      Rs {lineItemTotal(it).toFixed(0)}
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>
                          </div>

                          <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_13rem]">
                            <div className="space-y-2">
                              {o.paymentMode ? (
                                <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-[13px] text-emerald-950">
                                  <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-emerald-700">
                                    Payment
                                  </div>
                                  <div className="mt-1 font-bold">
                                    {String(o.paymentMode).toUpperCase()}
                                  </div>
                                </div>
                              ) : null}
                              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-[13px] text-slate-800">
                                <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-600">
                                  Accepted to Served
                                </div>
                                <div className="mt-1 font-bold">
                                  {formatOrderAcceptToServe(o)}
                                </div>
                              </div>
                              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-[12px] text-slate-800">
                                <div>
                                  <span className="font-semibold">
                                    Accepted:
                                  </span>{" "}
                                  {formatOrderAcceptedAt(o)}
                                </div>
                                <div>
                                  <span className="font-semibold">Served:</span>{" "}
                                  {formatOrderServedAt(o)}
                                </div>
                              </div>
                              {o.notes ? (
                                <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-[13px] text-amber-950">
                                  <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-amber-800">
                                    Order Note
                                  </div>
                                  <div className="mt-1 whitespace-pre-wrap break-words font-semibold leading-snug">
                                    {o.notes}
                                  </div>
                                </div>
                              ) : null}
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                              {(() => {
                                const lineSum = (
                                  Array.isArray(o.items) ? o.items : []
                                ).reduce(
                                  (s, it) =>
                                    s +
                                    Number(it.price || 0) * Number(it.qty || 0),
                                  0,
                                );
                                const hasServerPricing =
                                  typeof o.subtotalAmount === "number" &&
                                  typeof o.taxAmount === "number";
                                const subtotal = hasServerPricing
                                  ? Number(o.subtotalAmount)
                                  : Number(o.totalAmount || lineSum);
                                const discount =
                                  typeof o.discountAmount === "number"
                                    ? Number(o.discountAmount)
                                    : 0;
                                const taxRate = Number(
                                  cafeInfo?.taxPercent || 0,
                                );
                                const taxAmount = hasServerPricing
                                  ? Number(o.taxAmount)
                                  : subtotal * (taxRate / 100);
                                const totalFinal = hasServerPricing
                                  ? Number(o.totalAmount || 0)
                                  : subtotal + taxAmount;
                                return (
                                  <div className="space-y-1.5 text-[13px]">
                                    <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">
                                      Bill Summary
                                    </div>
                                    <div className="flex items-center justify-between text-slate-600">
                                      <span>Subtotal</span>
                                      <span className="font-bold tabular-nums text-slate-900">
                                        Rs {subtotal.toFixed(0)}
                                      </span>
                                    </div>
                                    {discount > 0 ? (
                                      <div className="flex items-center justify-between text-slate-600">
                                        <span>Discount</span>
                                        <span className="font-bold tabular-nums text-slate-900">
                                          - Rs {discount.toFixed(0)}
                                        </span>
                                      </div>
                                    ) : null}
                                    <div className="flex items-center justify-between text-slate-600">
                                      <span>
                                        Tax{" "}
                                        {!hasServerPricing && taxRate
                                          ? `(${taxRate}%)`
                                          : ""}
                                      </span>
                                      <span className="font-bold tabular-nums text-slate-900">
                                        Rs {taxAmount.toFixed(0)}
                                      </span>
                                    </div>
                                    <div className="border-t border-slate-200 pt-1.5">
                                      <div className="flex items-center justify-between">
                                        <span className="font-extrabold text-slate-950">
                                          Total
                                        </span>
                                        <span className="font-black tabular-nums text-slate-950">
                                          Rs {totalFinal.toFixed(0)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="mt-3 rounded-xl border border-slate-200/90 bg-white p-2">
                            <div className="mb-2 px-1 text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-500">
                              Quick Actions
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
                              <Button
                                variant="outline"
                                size="sm"
                                className={kitchenActionButtonClass("edit")}
                                type="button"
                                onClick={() => openEditOrderEditor(o)}
                                disabled={loading || editorSaving}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className={kitchenActionButtonClass("accepted")}
                                onClick={() => setStatus(o._id, "accepted")}
                                disabled={loading}
                              >
                                Accept
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className={kitchenActionButtonClass(
                                  "preparing",
                                )}
                                onClick={() => setStatus(o._id, "preparing")}
                                disabled={loading}
                              >
                                Preparing
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className={kitchenActionButtonClass("ready")}
                                onClick={() => setStatus(o._id, "ready")}
                                disabled={loading}
                              >
                                Ready
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                className={kitchenActionButtonClass("rejected")}
                                onClick={() => setStatus(o._id, "rejected")}
                                disabled={loading}
                              >
                                Reject
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full justify-center px-1.5 py-1 text-[11px] font-extrabold border-slate-200 text-slate-800 hover:bg-slate-100"
                                onClick={() => printReceipt(o)}
                                disabled={loading}
                              >
                                Print
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[2px]">
          <button
            type="button"
            aria-label="Close order editor"
            className="min-w-0 flex-1 cursor-default"
            onClick={closeOrderEditor}
          />
          <div className="flex h-[100dvh] max-h-[100dvh] w-full min-w-0 max-w-none flex-col border-l border-slate-200/80 bg-white shadow-[-12px_0_40px_-8px_rgba(15,23,42,0.18)] sm:max-w-3xl lg:max-w-5xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="min-w-0 pr-2">
                <div className="font-bold text-slate-900">
                  {editorMode === "edit" ? "Edit order" : "Manual order"}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Add walk-in orders with one-tap item picking, then adjust
                  quantities only where needed.
                </div>
              </div>
              <Button
                variant="outline"
                onClick={closeOrderEditor}
                disabled={editorSaving}
              >
                Close
              </Button>
            </div>

            <form
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
              onSubmit={submitOrderDraft}
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-5 py-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input
                    value={orderDraft.tableNumber}
                    onChange={(e) =>
                      updateDraftField("tableNumber", e.target.value)
                    }
                    placeholder="Table number"
                    type="number"
                    min="1"
                  />
                  <Input
                    value={orderDraft.customerName}
                    onChange={(e) =>
                      updateDraftField("customerName", e.target.value)
                    }
                    placeholder="Customer name"
                  />
                  <Input
                    value={orderDraft.phone}
                    onChange={(e) => updateDraftField("phone", e.target.value)}
                    placeholder="Phone (optional)"
                  />
                  <select
                    value={orderDraft.paymentMode}
                    onChange={(e) =>
                      updateDraftField("paymentMode", e.target.value)
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white/90 p-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300/70"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                  </select>
                  <select
                    value={orderDraft.status}
                    onChange={(e) => updateDraftField("status", e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white/90 p-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300/70"
                  >
                    <option value="pending">Pending</option>
                    <option value="accepted">Accepted</option>
                    <option value="preparing">Preparing</option>
                    <option value="ready">Ready</option>
                    <option value="served">Served</option>
                  </select>
                </div>

                <Textarea
                  value={orderDraft.notes}
                  onChange={(e) => updateDraftField("notes", e.target.value)}
                  placeholder="Order notes"
                  rows={3}
                />

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        Manual order
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Tap dishes to add them instantly. Use the summary to
                        adjust quantities.
                      </div>
                    </div>
                    <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                      {draftItemsDetailed.length} item
                      {draftItemsDetailed.length === 1 ? "" : "s"} selected
                    </div>
                  </div>

                  <div className="mt-3">
                    <Input
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      placeholder="Search menu items by name, category, or description"
                    />
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Menu list is cached briefly (same as admin). Use{" "}
                      <strong>Refresh</strong> above to reload menu and pricing
                      from the server.
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
                    <div className="min-h-[18rem] max-h-[min(52vh,34rem)] overflow-y-auto overscroll-contain rounded-xl border border-slate-200/90 bg-white p-3">
                      {menuLoading ? (
                        <div className="text-sm text-slate-500">
                          Loading menu...
                        </div>
                      ) : null}
                      {!menuLoading && filteredMenuItems.length === 0 ? (
                        <div className="text-sm text-slate-500">
                          No menu items match this search.
                        </div>
                      ) : null}
                      <div className="grid gap-3 md:grid-cols-2">
                        {filteredMenuItems.map((menuItem) => {
                          const existingLine = draftItemsDetailed.find(
                            (entry) =>
                              entry.menuItemId === String(menuItem._id),
                          );
                          return (
                            <button
                              key={menuItem._id}
                              type="button"
                              onClick={() => addDraftItem(menuItem._id)}
                              className={`rounded-2xl border p-3 text-left shadow-sm transition ${
                                existingLine
                                  ? "border-orange-300 bg-orange-50 ring-1 ring-orange-200"
                                  : "border-slate-200 bg-slate-50/40 hover:border-orange-200 hover:bg-orange-50/50"
                              }`}
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="break-words text-sm font-semibold leading-snug text-slate-900">
                                    {menuItem.name}
                                  </div>
                                  <div className="mt-1 break-words text-xs text-slate-500">
                                    {formatMenuItemMeta(menuItem)}
                                  </div>
                                  {menuItem.description ? (
                                    <div className="mt-2 break-words text-xs leading-snug text-slate-500">
                                      {menuItem.description}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex shrink-0 items-center justify-between gap-2 sm:block sm:text-right">
                                  <div className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                                    + Add
                                  </div>
                                  {existingLine ? (
                                    <div className="text-xs font-semibold text-orange-700 sm:mt-2">
                                      Qty {existingLine.qty}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex min-h-[18rem] max-h-[min(52vh,34rem)] flex-col rounded-xl border border-slate-200/90 bg-white p-3">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            Selected items
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Adjust quantities only if needed.
                          </div>
                        </div>
                        {draftItemsDetailed.length ? (
                          <div className="text-xs font-semibold text-slate-500">
                            {draftItemsDetailed.reduce(
                              (sum, item) => sum + item.qty,
                              0,
                            )}{" "}
                            pcs
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-3 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
                        {draftItemsDetailed.map((item) => (
                          <div
                            key={`${item.menuItemId}-${item.index}`}
                            className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="break-words text-sm font-semibold leading-snug text-slate-900">
                                  {item.menuItem.name}
                                </div>
                                <div className="mt-1 break-words text-xs text-slate-500">
                                  {formatMenuItemMeta(item.menuItem)}
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                className="w-full sm:w-auto"
                                onClick={() => removeDraftItem(item.index)}
                              >
                                Remove
                              </Button>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-3">
                              <div className="inline-flex h-11 items-stretch overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                                <button
                                  type="button"
                                  className="flex w-11 items-center justify-center border-r border-slate-200 bg-slate-50 text-lg font-semibold text-slate-700 transition hover:bg-slate-100 active:bg-slate-200"
                                  aria-label="Decrease quantity"
                                  onClick={() =>
                                    updateDraftItem(item.index, {
                                      qty: Math.max(1, item.qty - 1),
                                    })
                                  }
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  inputMode="numeric"
                                  value={item.qty}
                                  onChange={(e) => {
                                    const n = Number(e.target.value);
                                    updateDraftItem(item.index, {
                                      qty:
                                        Number.isFinite(n) && n >= 1
                                          ? Math.floor(n)
                                          : 1,
                                    });
                                  }}
                                  className="w-16 border-0 bg-white px-1 text-center text-base font-semibold tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-200/90"
                                />
                                <button
                                  type="button"
                                  className="flex w-11 items-center justify-center border-l border-slate-200 bg-slate-50 text-lg font-semibold text-slate-700 transition hover:bg-slate-100 active:bg-slate-200"
                                  aria-label="Increase quantity"
                                  onClick={() =>
                                    updateDraftItem(item.index, {
                                      qty: item.qty + 1,
                                    })
                                  }
                                >
                                  +
                                </button>
                              </div>
                              <div className="text-sm font-bold tabular-nums text-slate-900">
                                Rs {item.lineTotal.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        ))}

                        {!draftItemsDetailed.length ? (
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500">
                            Start tapping menu items on the left to build the
                            order.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 rounded-2xl border border-orange-100 bg-orange-50/70 p-4 text-sm text-slate-700 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Subtotal
                    </div>
                    <div className="mt-1 font-bold text-slate-900">
                      ₹{draftEstimate.subtotal.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Discount
                    </div>
                    <div className="mt-1 font-bold text-slate-900">
                      ₹{draftEstimate.discountAmount.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Tax
                    </div>
                    <div className="mt-1 font-bold text-slate-900">
                      ₹{draftEstimate.taxAmount.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Estimated total
                    </div>
                    <div className="mt-1 font-bold text-slate-900">
                      ₹{draftEstimate.total.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.12)]">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    disabled={editorSaving || menuLoading || !menuItems.length}
                  >
                    {editorSaving
                      ? "Saving..."
                      : editorMode === "edit"
                        ? "Save order changes"
                        : "Create manual order"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeOrderEditor}
                    disabled={editorSaving}
                  >
                    Cancel
                  </Button>
                  {editorMode === "edit" ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={openNewOrderEditor}
                      disabled={editorSaving}
                    >
                      New order instead
                    </Button>
                  ) : null}
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </StaffShell>
  );
}
