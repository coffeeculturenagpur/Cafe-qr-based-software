"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, getApiBaseUrl } from "../../../lib/api";
import { isOrderInLocalToday, ordersTodayQueryString } from "../../../lib/staffOrderRange";
import Link from "next/link";
import { authHeaders, getToken } from "../../../lib/auth";
import { useClientAuth } from "../../../lib/useClientAuth";
import { connectCafeSocket } from "../../../lib/socket";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Input, Textarea } from "../../../components/ui/Input";
import { StaffShell } from "../../../components/StaffShell";
import SoundControl from "../../../components/SoundControl";
import { AppLoading } from "../../../components/AppLoading";

function upsertById(list, item) {
  const idx = list.findIndex((x) => x._id === item._id);
  if (idx === -1) return [item, ...list];
  const copy = list.slice();
  copy[idx] = item;
  return copy;
}

export default function AdminMenuPage() {
  const { user, ready: authReady } = useClientAuth();
  const role = user?.role;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [adminCafeId, setAdminCafeId] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("Beverages");
  const [customCategory, setCustomCategory] = useState("");
  const [type, setType] = useState("veg");
  const [isSpecial, setIsSpecial] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError, setCsvError] = useState("");
  const [csvSuccess, setCsvSuccess] = useState("");
  const [csvErrors, setCsvErrors] = useState([]);
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvPreviewErrors, setCsvPreviewErrors] = useState([]);
  const [csvPreviewLoading, setCsvPreviewLoading] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", price: "", category: "", type: "veg", image: "", isSpecial: false });

  const defaultCategories = [
    "Beverages",
    "Water",
    "Soft Drinks",
    "Juices",
    "Milkshakes",
    "Smoothies",
    "Mocktails",
    "Coffee",
    "Tea",
    "Hot Chocolate",
    "Breakfast",
    "Bakery",
    "Breads",
    "Snacks",
    "Starters",
    "Soups",
    "Salads",
    "Sandwiches",
    "Burgers",
    "Wraps",
    "Pasta",
    "Pizza",
    "Noodles",
    "Rice Bowls",
    "Main Course",
    "Grill",
    "BBQ",
    "Seafood",
    "Veg Specials",
    "Non-Veg Specials",
    "Thali",
    "Combos",
    "Kids Menu",
    "Desserts",
    "Ice Cream",
    "Cakes",
    "Pastries",
    "Sides",
    "Dips",
  ];
  const [menuCategories, setMenuCategories] = useState(defaultCategories);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("qrdine:menuCategories");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setMenuCategories(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("qrdine:menuCategories", JSON.stringify(menuCategories));
    } catch {
      // ignore
    }
  }, [menuCategories]);

  const addCategoryIfNew = (value) => {
    const next = String(value || "").trim();
    if (!next) return;
    setMenuCategories((prev) => (prev.includes(next) ? prev : [...prev, next]));
  };

  const listUrl = useMemo(() => {
    const qs = adminCafeId ? `?cafeId=${encodeURIComponent(adminCafeId)}` : "";
    return `/api/admin/menu${qs}`;
  }, [adminCafeId]);

  const stats = useMemo(() => {
    const total = items.length;
    const available = items.filter((i) => i.isAvailable).length;
    const categories = new Set(items.map((i) => i.category)).size;
    return { total, available, categories };
  }, [items]);

  const [baseCustomerUrl, setBaseCustomerUrl] = useState("");
  const [qrApiBaseUrl, setQrApiBaseUrl] = useState("");

  const [tables, setTables] = useState([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [tableError, setTableError] = useState("");
  const [tableCount, setTableCount] = useState("");
  const [manualTableNumber, setManualTableNumber] = useState("");
  const [manualTableLoading, setManualTableLoading] = useState(false);
  const [manualTableError, setManualTableError] = useState("");
  const [manualTableSuccess, setManualTableSuccess] = useState("");

  const [staffUsername, setStaffUsername] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffRole, setStaffRole] = useState("kitchen");
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [staffSuccess, setStaffSuccess] = useState("");

  const [staffList, setStaffList] = useState([]);
  const [staffListLoading, setStaffListLoading] = useState(false);
  const [staffListError, setStaffListError] = useState("");

  const [cafeInfo, setCafeInfo] = useState(null);
  const [cafeForm, setCafeForm] = useState({
    name: "",
    address: "",
    logoUrl: "",
    brandImageUrl: "",
    upiQrUrl: "",
    taxPercent: "",
    discountType: "percent",
    discountValue: "",
    primaryColor: "",
    accentColor: "",
    latitude: "",
    longitude: "",
    serviceRadiusMeters: "",
    showcaseHighlights: [],
    showcaseCommunityNotes: [],
    showcaseCommunityShots: [],
  });
  const [showcaseUploading, setShowcaseUploading] = useState(false);
  const [cafeLoading, setCafeLoading] = useState(false);
  const [cafeError, setCafeError] = useState("");
  const [cafeSuccess, setCafeSuccess] = useState("");
  const [cafeLogoUploading, setCafeLogoUploading] = useState(false);
  const [cafeBrandUploading, setCafeBrandUploading] = useState(false);
  const [cafeUpiUploading, setCafeUpiUploading] = useState(false);
  const [cafeUpiUploaded, setCafeUpiUploaded] = useState(false);

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [ordersSocket, setOrdersSocket] = useState("disconnected");

  const tablesCafeId = useMemo(
    () => (role === "super_admin" ? adminCafeId : user?.cafeId || ""),
    [role, adminCafeId, user?.cafeId]
  );

  const staffCafeId = tablesCafeId;

  const cafeIdForAdmin = tablesCafeId;

  const requireLogin = (redirectOnFail = true) => {
    const token = getToken();
    if (!token) {
      if (redirectOnFail) window.location.href = "/admin/login";
      return false;
    }
    if (role && role !== "cafe_admin" && role !== "super_admin") {
      if (redirectOnFail) window.location.href = "/admin/login";
      return false;
    }
    return true;
  };

  const load = async (redirectOnFail = true) => {
    if (!requireLogin(redirectOnFail)) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(listUrl, { headers: { ...authHeaders() } });
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to load menu");
    } finally {
      setLoading(false);
    }
  };

  const loadTables = async () => {
    if (!requireLogin(false)) return;
    if (!tablesCafeId) {
      setTables([]);
      return;
    }
    setTablesLoading(true);
    setTableError("");
    try {
      const qs = role === "super_admin" ? `?cafeId=${encodeURIComponent(tablesCafeId)}` : "";
      const data = await apiFetch(`/api/admin/tables${qs}`, { headers: { ...authHeaders() } });
      setTables(Array.isArray(data) ? data : []);
    } catch (e) {
      setTableError(e.message || "Failed to load tables");
    } finally {
      setTablesLoading(false);
    }
  };

  const generateTables = async () => {
    if (!requireLogin(false)) return;
    if (!tablesCafeId && role === "super_admin") {
      setTableError("cafeId is required");
      return;
    }
    setTablesLoading(true);
    setTableError("");
    try {
      const body = {};
      if (role === "super_admin") body.cafeId = tablesCafeId;
      if (tableCount) body.numberOfTables = Number(tableCount);
      const data = await apiFetch("/api/admin/tables/generate", {
        method: "POST",
        headers: { ...authHeaders() },
        body: JSON.stringify(body),
      });
      setTables(Array.isArray(data.tables) ? data.tables : []);
    } catch (e) {
      setTableError(e.message || "Failed to generate tables");
    } finally {
      setTablesLoading(false);
    }
  };

  const addTableManual = async (event) => {
    event.preventDefault();
    if (!requireLogin(false)) return;
    if (!tablesCafeId && role === "super_admin") {
      setManualTableError("cafeId is required");
      return;
    }
    const number = Number(manualTableNumber);
    if (!number || number < 1) {
      setManualTableError("Table number must be >= 1");
      return;
    }
    setManualTableLoading(true);
    setManualTableError("");
    setManualTableSuccess("");
    try {
      const body = { tableNumber: number };
      if (role === "super_admin") body.cafeId = tablesCafeId;
      await apiFetch("/api/admin/tables", {
        method: "POST",
        headers: { ...authHeaders() },
        body: JSON.stringify(body),
      });
      setManualTableNumber("");
      setManualTableSuccess(`Added table ${number}`);
      loadTables();
    } catch (e) {
      setManualTableError(e.message || "Failed to add table");
    } finally {
      setManualTableLoading(false);
    }
  };

  const deleteTable = async (tableId, tableNumber) => {
    if (!requireLogin(false)) return;
    const ok = window.confirm(`Delete table ${tableNumber}? This removes its QR.`);
    if (!ok) return;
    setTablesLoading(true);
    setTableError("");
    try {
      const qs = role === "super_admin" ? `?cafeId=${encodeURIComponent(tablesCafeId)}` : "";
      await apiFetch(`/api/admin/tables/${tableId}${qs}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      setTables((prev) => prev.filter((t) => t._id !== tableId));
    } catch (e) {
      setTableError(e.message || "Failed to delete table");
    } finally {
      setTablesLoading(false);
    }
  };

  const deleteAllTables = async () => {
    if (!requireLogin(false)) return;
    if (!tablesCafeId && role === "super_admin") {
      setTableError("cafeId is required");
      return;
    }
    const ok = window.confirm("Delete ALL table QRs? This removes every table seat.");
    if (!ok) return;
    setTablesLoading(true);
    setTableError("");
    try {
      const qs = role === "super_admin" ? `?cafeId=${encodeURIComponent(tablesCafeId)}` : "";
      await apiFetch(`/api/admin/tables${qs}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      setTables([]);
    } catch (e) {
      setTableError(e.message || "Failed to delete tables");
    } finally {
      setTablesLoading(false);
    }
  };

  const uploadCafeImage = async (file, setter, setUploading) => {
    if (!file) return;
    if (!requireLogin(false)) return;
    setUploading(true);
    setCafeError("");
    try {
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) throw new Error("Missing NEXT_PUBLIC_API_BASE_URL");
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${baseUrl}/api/admin/media/image`, {
        method: "POST",
        headers: {
          ...(authHeaders() || {}),
        },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Upload failed");
      setter(data.url || "");
    } catch (e) {
      setCafeError(e.message || "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const loadCafe = async () => {
    if (!requireLogin(false)) return;
    if (!cafeIdForAdmin) {
      setCafeInfo(null);
      return;
    }
    setCafeLoading(true);
    setCafeError("");
    try {
      const qs = role === "super_admin" ? `?cafeId=${encodeURIComponent(cafeIdForAdmin)}` : "";
      const data = await apiFetch(`/api/admin/cafe${qs}`, { headers: { ...authHeaders() } });
      setCafeInfo(data || null);
      setCafeForm({
        name: data?.name || "",
        address: data?.address || "",
        logoUrl: data?.logoUrl || "",
        brandImageUrl: data?.brandImageUrl || "",
        upiQrUrl: data?.upiQrUrl || "",
        taxPercent: typeof data?.taxPercent === "number" ? String(data.taxPercent) : "",
        discountType: data?.discountType || "percent",
        discountValue:
          typeof data?.discountValue === "number"
            ? String(data.discountValue)
            : typeof data?.discountPercent === "number"
              ? String(data.discountPercent)
              : "",
        primaryColor: data?.primaryColor || "",
        accentColor: data?.accentColor || "",
        latitude: typeof data?.latitude === "number" ? String(data.latitude) : "",
        longitude: typeof data?.longitude === "number" ? String(data.longitude) : "",
        serviceRadiusMeters:
          typeof data?.serviceRadiusMeters === "number" ? String(data.serviceRadiusMeters) : "",
        showcaseHighlights: Array.isArray(data?.showcaseHighlights)
          ? data.showcaseHighlights.map((it) => ({
              name: it?.name || "",
              note: it?.note || "",
              tag: it?.tag || "",
              price: typeof it?.price === "number" ? String(it.price) : "",
              image: it?.image || "",
            }))
          : [],
        showcaseCommunityNotes: Array.isArray(data?.showcaseCommunityNotes)
          ? data.showcaseCommunityNotes.map((it) => ({
              quote: it?.quote || "",
              name: it?.name || "",
              tag: it?.tag || "",
            }))
          : [],
        showcaseCommunityShots: Array.isArray(data?.showcaseCommunityShots)
          ? data.showcaseCommunityShots.map((s) => s || "")
          : [],
      });
    } catch (e) {
      setCafeError(e.message || "Failed to load cafe");
    } finally {
      setCafeLoading(false);
    }
  };

  const loadOrders = async () => {
    if (!tablesCafeId) return;
    if (!requireLogin(false)) return;
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const qs = ordersTodayQueryString();
      const data = await apiFetch(`/api/orders/${tablesCafeId}?${qs}`, {
        headers: { ...authHeaders() },
      });
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      setOrdersError(e.message || "Failed to load orders");
    } finally {
      setOrdersLoading(false);
    }
  };

  const saveCafe = async (event) => {
    event.preventDefault();
    if (!requireLogin(false)) return;
    if (!cafeIdForAdmin) {
      setCafeError("cafeId is required");
      return;
    }
    setCafeLoading(true);
    setCafeError("");
    setCafeSuccess("");
    try {
      const body = {
        name: cafeForm.name,
        address: cafeForm.address,
        logoUrl: cafeForm.logoUrl,
        brandImageUrl: cafeForm.brandImageUrl,
        upiQrUrl: cafeForm.upiQrUrl,
        taxPercent: cafeForm.taxPercent === "" ? 0 : Number(cafeForm.taxPercent),
        discountType: cafeForm.discountType || "percent",
        discountValue: cafeForm.discountValue === "" ? 0 : Number(cafeForm.discountValue),
        primaryColor: cafeForm.primaryColor,
        accentColor: cafeForm.accentColor,
        latitude: cafeForm.latitude === "" ? null : Number(cafeForm.latitude),
        longitude: cafeForm.longitude === "" ? null : Number(cafeForm.longitude),
        serviceRadiusMeters: cafeForm.serviceRadiusMeters === "" ? 0 : Number(cafeForm.serviceRadiusMeters),
        showcaseHighlights: (cafeForm.showcaseHighlights || []).map((it) => ({
          name: it?.name || "",
          note: it?.note || "",
          tag: it?.tag || "",
          price: it?.price === "" || typeof it?.price === "undefined" ? 0 : Number(it.price || 0),
          image: it?.image || "",
        })),
        showcaseCommunityNotes: (cafeForm.showcaseCommunityNotes || []).map((it) => ({
          quote: it?.quote || "",
          name: it?.name || "",
          tag: it?.tag || "",
        })),
        showcaseCommunityShots: (cafeForm.showcaseCommunityShots || [])
          .filter((s) => typeof s === "string")
          .map((s) => s),
      };
      if (role === "super_admin") body.cafeId = cafeIdForAdmin;
      const updated = await apiFetch("/api/admin/cafe", {
        method: "PATCH",
        headers: { ...authHeaders() },
        body: JSON.stringify(body),
      });
      setCafeInfo(updated);
      setCafeSuccess("Cafe updated");
    } catch (e) {
      setCafeError(e.message || "Failed to update cafe");
    } finally {
      setCafeLoading(false);
    }
  };

  const uploadImage = async (file) => {
    if (!file) return;
    if (!requireLogin(false)) return;
    setImageUploading(true);
    setError("");
    try {
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) throw new Error("Missing NEXT_PUBLIC_API_BASE_URL");
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${baseUrl}/api/admin/media/image`, {
        method: "POST",
        headers: {
          ...(authHeaders() || {}),
        },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Upload failed");
      setImageUrl(data.url || "");
    } catch (e) {
      setError(e.message || "Image upload failed");
    } finally {
      setImageUploading(false);
    }
  };

  const updateHighlight = (idx, patch) => {
    setCafeForm((prev) => {
      const next = [...(prev.showcaseHighlights || [])];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, showcaseHighlights: next };
    });
  };

  const addHighlight = () => {
    setCafeForm((prev) => ({
      ...prev,
      showcaseHighlights: [
        ...(prev.showcaseHighlights || []),
        { name: "", note: "", tag: "", price: "", image: "" },
      ],
    }));
  };

  const removeHighlight = (idx) => {
    setCafeForm((prev) => ({
      ...prev,
      showcaseHighlights: (prev.showcaseHighlights || []).filter((_, i) => i !== idx),
    }));
  };

  const updateCommunityNote = (idx, patch) => {
    setCafeForm((prev) => {
      const next = [...(prev.showcaseCommunityNotes || [])];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, showcaseCommunityNotes: next };
    });
  };

  const addCommunityNote = () => {
    setCafeForm((prev) => ({
      ...prev,
      showcaseCommunityNotes: [
        ...(prev.showcaseCommunityNotes || []),
        { quote: "", name: "", tag: "" },
      ],
    }));
  };

  const removeCommunityNote = (idx) => {
    setCafeForm((prev) => ({
      ...prev,
      showcaseCommunityNotes: (prev.showcaseCommunityNotes || []).filter((_, i) => i !== idx),
    }));
  };

  const updateCommunityShot = (idx, value) => {
    setCafeForm((prev) => {
      const next = [...(prev.showcaseCommunityShots || [])];
      next[idx] = value;
      return { ...prev, showcaseCommunityShots: next };
    });
  };

  const addCommunityShot = () => {
    setCafeForm((prev) => ({
      ...prev,
      showcaseCommunityShots: [...(prev.showcaseCommunityShots || []), ""],
    }));
  };

  const removeCommunityShot = (idx) => {
    setCafeForm((prev) => ({
      ...prev,
      showcaseCommunityShots: (prev.showcaseCommunityShots || []).filter((_, i) => i !== idx),
    }));
  };

  const uploadMenuCsv = async (event) => {
    event.preventDefault();
    if (!requireLogin(false)) return;
    if (!csvFile) {
      setCsvError("Please choose a CSV file");
      return;
    }
    if (role === "super_admin" && !adminCafeId) {
      setCsvError("cafeId is required for super admin");
      return;
    }
    setCsvUploading(true);
    setCsvError("");
    setCsvSuccess("");
    setCsvErrors([]);
    try {
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) throw new Error("Missing NEXT_PUBLIC_API_BASE_URL");
      const formData = new FormData();
      formData.append("file", csvFile);
      if (role === "super_admin") formData.append("cafeId", adminCafeId);
      const res = await fetch(`${baseUrl}/api/admin/menu/bulk-upload`, {
        method: "POST",
        headers: {
          ...(authHeaders() || {}),
        },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "CSV upload failed");
      setCsvSuccess(`Uploaded ${data.created} created, ${data.updated} updated (of ${data.total})`);
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        setCsvErrors(data.errors);
      }
      setCsvFile(null);
      load();
    } catch (e) {
      setCsvError(e.message || "CSV upload failed");
    } finally {
      setCsvUploading(false);
    }
  };

  const splitCsvLine = (line) => {
    const out = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === "\"") {
        if (inQuotes && line[i + 1] === "\"") {
          current += "\"";
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        out.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    out.push(current);
    return out.map((v) => v.trim());
  };

  const handleCsvFileChange = async (file) => {
    setCsvFile(file);
    setCsvPreview([]);
    setCsvPreviewErrors([]);
    if (!file) return;
    if (role === "super_admin" && !adminCafeId) {
      setCsvPreviewErrors([{ row: 0, message: "cafeId is required for super admin" }]);
      return;
    }
    setCsvPreviewLoading(true);
    try {
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) throw new Error("Missing NEXT_PUBLIC_API_BASE_URL");
      const formData = new FormData();
      formData.append("file", file);
      if (role === "super_admin") formData.append("cafeId", adminCafeId);
      const res = await fetch(`${baseUrl}/api/admin/menu/bulk-preview`, {
        method: "POST",
        headers: {
          ...(authHeaders() || {}),
        },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Preview failed");
      setCsvPreview(Array.isArray(data.preview) ? data.preview : []);
      setCsvPreviewErrors(Array.isArray(data.errors) ? data.errors : []);
    } catch (e) {
      setCsvPreviewErrors([{ row: 0, message: e.message || "Preview failed" }]);
    } finally {
      setCsvPreviewLoading(false);
    }
  };

  const deleteAllMenuItems = async () => {
    if (!requireLogin(false)) return;
    if (role === "super_admin" && !adminCafeId) {
      setError("cafeId is required for super admin");
      return;
    }
    const ok = window.confirm("Delete ALL menu items? This cannot be undone.");
    if (!ok) return;
    setLoading(true);
    setError("");
    try {
      const qs = role === "super_admin" ? `?cafeId=${encodeURIComponent(adminCafeId)}` : "";
      await apiFetch(`/api/admin/menu/all${qs}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      setItems([]);
    } catch (e) {
      setError(e.message || "Failed to delete all menu items");
    } finally {
      setLoading(false);
    }
  };

  const downloadCsvTemplate = () => {
    const header = "name,price,category,description,type,image,isSpecial,isAvailable";
    const sample = "House Espresso,180,Coffee,Short espresso shot,veg,https://example.com/espresso.jpg,false,true";
    const blob = new Blob([`${header}\n${sample}\n`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "menu-template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const loadStaff = async () => {
    if (!requireLogin(false)) return;
    if (!staffCafeId) {
      setStaffList([]);
      return;
    }
    setStaffListLoading(true);
    setStaffListError("");
    try {
      const qs = role === "super_admin" ? `?cafeId=${encodeURIComponent(staffCafeId)}` : "";
      const data = await apiFetch(`/api/admin/users${qs}`, { headers: { ...authHeaders() } });
      setStaffList(Array.isArray(data) ? data : []);
    } catch (e) {
      setStaffListError(e.message || "Failed to load staff");
    } finally {
      setStaffListLoading(false);
    }
  };

  const resetStaffPassword = async (id) => {
    const newPassword = window.prompt("Enter a new password for this account:");
    if (!newPassword) return;
    setStaffListLoading(true);
    setStaffListError("");
    try {
      await apiFetch(`/api/admin/users/${id}/password`, {
        method: "PATCH",
        headers: { ...authHeaders() },
        body: JSON.stringify({ password: newPassword }),
      });
      setStaffListLoading(false);
      loadStaff();
    } catch (e) {
      setStaffListError(e.message || "Failed to reset password");
      setStaffListLoading(false);
    }
  };

  const deleteStaff = async (id) => {
    const ok = window.confirm("Delete this staff account?");
    if (!ok) return;
    setStaffListLoading(true);
    setStaffListError("");
    try {
      await apiFetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      setStaffList((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      setStaffListError(e.message || "Failed to delete staff");
    } finally {
      setStaffListLoading(false);
    }
  };

  const createStaff = async (event) => {
    event.preventDefault();
    if (!requireLogin(false)) return;
    setStaffLoading(true);
    setStaffError("");
    setStaffSuccess("");
    try {
      const body = {
        username: staffUsername || undefined,
        email: staffEmail || undefined,
        password: staffPassword,
        role: staffRole,
      };
      if (role === "super_admin") {
        if (!adminCafeId) {
          setStaffError("cafeId is required for super admin");
          setStaffLoading(false);
          return;
        }
        body.cafeId = adminCafeId;
      }

      const created = await apiFetch("/api/admin/users", {
        method: "POST",
        headers: { ...authHeaders() },
        body: JSON.stringify(body),
      });
      setStaffUsername("");
      setStaffEmail("");
      setStaffPassword("");
      setStaffRole("kitchen");
      setStaffSuccess(`Created ${created.role} account for ${created.username || created.email}`);
    } catch (e) {
      setStaffError(e.message || "Failed to create staff");
    } finally {
      setStaffLoading(false);
    }
  };

  useEffect(() => {
    setBaseCustomerUrl(typeof window !== "undefined" ? window.location.origin : "");
    setQrApiBaseUrl(getApiBaseUrl() || "");
  }, []);

  useEffect(() => {
    if (!authReady) return;
    load();
  }, [authReady]);

  useEffect(() => {
    if (!authReady) return;
    if (!getToken()) {
      window.location.href = "/admin/login";
      return;
    }
    if (role && role !== "cafe_admin" && role !== "super_admin") {
      window.location.href = "/admin/login";
    }
  }, [authReady, role]);

  useEffect(() => {
    if (tablesCafeId) loadTables();
  }, [tablesCafeId]);

  useEffect(() => {
    if (cafeIdForAdmin) loadCafe();
  }, [cafeIdForAdmin]);

  useEffect(() => {
    if (staffCafeId) loadStaff();
  }, [staffCafeId]);

  useEffect(() => {
    if (tablesCafeId) loadOrders();
  }, [tablesCafeId]);

  useEffect(() => {
    if (!authReady || !tablesCafeId) return;
    const socket = connectCafeSocket(tablesCafeId);
    setOrdersSocket("connecting");

    socket.on("connect", () => setOrdersSocket("connected"));
    socket.on("disconnect", () => setOrdersSocket("disconnected"));

    const onOrder = (payload) => {
      if (!payload?._id) return;
      if (!isOrderInLocalToday(payload)) return;
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o._id === payload._id);
        if (idx === -1) return [payload, ...prev];
        const copy = prev.slice();
        copy[idx] = payload;
        return copy;
      });
    };

    socket.on("NEW_ORDER", onOrder);
    socket.on("ORDER_UPDATED", onOrder);
    socket.on("ORDER_READY", onOrder);
    socket.on("ORDER_PAID", onOrder);

    return () => {
      socket.off("NEW_ORDER", onOrder);
      socket.off("ORDER_UPDATED", onOrder);
      socket.off("ORDER_READY", onOrder);
      socket.off("ORDER_PAID", onOrder);
      socket.disconnect();
    };
  }, [authReady, tablesCafeId]);

  const createItem = async (e) => {
    e.preventDefault();
    if (!requireLogin(false)) return;
    setLoading(true);
    setError("");
    try {
      const resolvedCategory = category === "__custom__" ? customCategory.trim() : category;
      if (!resolvedCategory) {
        setError("Please choose or enter a category.");
        setLoading(false);
        return;
      }
      addCategoryIfNew(resolvedCategory);
      const body = {
        name,
        description,
        price: Number(price),
        category: resolvedCategory,
        type,
        image: imageUrl || "",
        isAvailable: true,
        isSpecial,
      };
      if (role === "super_admin" && adminCafeId) body.cafeId = adminCafeId;

      const data = await apiFetch("/api/admin/menu", {
        method: "POST",
        headers: { ...authHeaders() },
        body: JSON.stringify(body),
      });
      setName("");
      setDescription("");
      setPrice("");
      setCategory("Beverages");
      setCustomCategory("");
      setType("veg");
      setImageUrl("");
      setIsSpecial(false);
      setItems((prev) => upsertById(prev, data));
    } catch (e2) {
      setError(e2.message || "Failed to create item");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item._id);
    setEditForm({
      name: item.name || "",
      description: item.description || "",
      price: String(item.price ?? ""),
      category: item.category || "",
      type: item.type || "veg",
      image: item.image || "",
      isSpecial: Boolean(item.isSpecial),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: "", description: "", price: "", category: "", type: "veg", image: "" });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!requireLogin(false)) return;
    setLoading(true);
    setError("");
    try {
      const resolvedCategory = String(editForm.category || "").trim();
      if (!resolvedCategory) {
        setError("Please choose or enter a category.");
        setLoading(false);
        return;
      }
      addCategoryIfNew(resolvedCategory);
      const body = {
        name: editForm.name,
        description: editForm.description,
        price: Number(editForm.price),
        category: resolvedCategory,
        type: editForm.type,
        image: editForm.image || "",
        isSpecial: editForm.isSpecial,
      };
      if (role === "super_admin" && adminCafeId) body.cafeId = adminCafeId;

      const data = await apiFetch(`/api/admin/menu/${editingId}`, {
        method: "PUT",
        headers: { ...authHeaders() },
        body: JSON.stringify(body),
      });
      setItems((prev) => prev.map((x) => (x._id === data._id ? data : x)));
      cancelEdit();
    } catch (e) {
      setError(e.message || "Failed to update item");
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (id) => {
    if (!requireLogin(false)) return;
    const ok = window.confirm("Delete this menu item?");
    if (!ok) return;
    setLoading(true);
    setError("");
    try {
      await apiFetch(`/api/admin/menu/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      setItems((prev) => prev.filter((x) => x._id !== id));
    } catch (e) {
      setError(e.message || "Failed to delete item");
    } finally {
      setLoading(false);
    }
  };

  const toggleAvailability = async (id) => {
    if (!requireLogin()) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(`/api/admin/menu/${id}/toggle`, {
        method: "PATCH",
        headers: { ...authHeaders() },
      });
      setItems((prev) => prev.map((x) => (x._id === data._id ? data : x)));
    } catch (e) {
      setError(e.message || "Failed to toggle availability");
    } finally {
      setLoading(false);
    }
  };

  if (!authReady) {
    return (
      <StaffShell title="Menu management" subtitle="Loading session…" contentClassName="mx-auto max-w-6xl">
        <AppLoading label="Loading" />
      </StaffShell>
    );
  }

  return (
    <StaffShell
      staffNav={{
        variant: role === "super_admin" ? "super_admin" : "admin",
        onRefresh: () => load(false),
      }}
      badge={
        <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-orange-700 shadow">
          Admin Menu Console
        </span>
      }
      title="Menu management"
      subtitle="Create, update, and publish dishes across your cafe."
      actions={
        <>
          <SoundControl />
          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold text-slate-900">{stats.total}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Items</div>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold text-slate-900">{stats.available}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Available</div>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-center shadow-sm">
              <div className="text-xl font-bold text-slate-900">{stats.categories}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Categories</div>
            </div>
          </div>
        </>
      }
      contentClassName="mx-auto max-w-6xl space-y-8"
    >
        {role === "super_admin" && (
          <Card id="admin-pick-cafe" className="border border-orange-100 shadow-xl">
            <CardContent>
              <div className="font-bold">Super Admin: choose a cafeId</div>
              <div className="text-sm text-gray-600 mt-1">Provide a cafeId to scope listing and writes.</div>
              <div className="mt-3 flex gap-2">
                <Input value={adminCafeId} onChange={(e) => setAdminCafeId(e.target.value)} placeholder="cafeId (ObjectId)" />
                <Button variant="outline" onClick={load} disabled={loading}>Load</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card id="admin-branding" className="border border-orange-100 shadow-xl">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold">Cafe branding</div>
                <div className="text-sm text-gray-600 mt-1">Update cafe name, branding, and UPI QR.</div>
              </div>
              <Button variant="outline" onClick={loadCafe} disabled={cafeLoading || !cafeIdForAdmin}>
                Refresh branding
              </Button>
            </div>

            {!cafeIdForAdmin ? (
              <div className="mt-4 text-sm text-gray-600">Provide a cafeId to edit branding.</div>
            ) : (
              <form className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={saveCafe}>
                <Input
                  value={cafeForm.name}
                  onChange={(e) => setCafeForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Cafe name"
                  required
                />
                <Input
                  value={cafeForm.address}
                  onChange={(e) => setCafeForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Address"
                />
                <div className="space-y-2">
                  <Input
                    value={cafeForm.logoUrl}
                    onChange={(e) => setCafeForm((p) => ({ ...p, logoUrl: e.target.value }))}
                    placeholder="Logo URL"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => uploadCafeImage(e.target.files?.[0], (url) => setCafeForm((p) => ({ ...p, logoUrl: url })), setCafeLogoUploading)}
                    className="text-sm text-slate-600"
                  />
                  {cafeLogoUploading && <div className="text-xs text-slate-500">Uploading logo...</div>}
                </div>
                <div className="space-y-2">
                  <Input
                    value={cafeForm.brandImageUrl}
                    onChange={(e) => setCafeForm((p) => ({ ...p, brandImageUrl: e.target.value }))}
                    placeholder="Brand image URL"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => uploadCafeImage(e.target.files?.[0], (url) => setCafeForm((p) => ({ ...p, brandImageUrl: url })), setCafeBrandUploading)}
                    className="text-sm text-slate-600"
                  />
                  {cafeBrandUploading && <div className="text-xs text-slate-500">Uploading brand image...</div>}
                </div>
                <div className="space-y-2">
                  <Input
                    value={cafeForm.upiQrUrl}
                    onChange={(e) => setCafeForm((p) => ({ ...p, upiQrUrl: e.target.value }))}
                    placeholder="UPI payment QR URL"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      setCafeUpiUploaded(false);
                      uploadCafeImage(
                        e.target.files?.[0],
                        (url) => {
                          setCafeForm((p) => ({ ...p, upiQrUrl: url }));
                          setCafeUpiUploaded(Boolean(url));
                        },
                        setCafeUpiUploading
                      );
                    }}
                    className="text-sm text-slate-600"
                  />
                  {cafeUpiUploading && <div className="text-xs text-slate-500">Uploading UPI QR...</div>}
                  {cafeUpiUploaded && !cafeUpiUploading && (
                    <div className="text-xs font-semibold text-emerald-600">UPI QR uploaded.</div>
                  )}
                  {cafeForm.upiQrUrl ? (
                    <div className="mt-2 rounded-2xl border border-orange-100 bg-white p-3">
                      <div className="text-xs font-semibold text-slate-500">Preview</div>
                      <img src={cafeForm.upiQrUrl} alt="UPI QR" className="mt-2 h-40 w-40 rounded-xl object-cover" />
                    </div>
                  ) : null}
                </div>
                <Input
                  value={cafeForm.taxPercent}
                  onChange={(e) => setCafeForm((p) => ({ ...p, taxPercent: e.target.value }))}
                  placeholder="Tax % (e.g. 5)"
                  type="number"
                  min={0}
                  step="0.01"
                />
                <select
                  value={cafeForm.discountType}
                  onChange={(e) => setCafeForm((p) => ({ ...p, discountType: e.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300/60"
                >
                  <option value="percent">Discount in %</option>
                  <option value="fixed">Discount in INR</option>
                </select>
                <Input
                  value={cafeForm.discountValue}
                  onChange={(e) => setCafeForm((p) => ({ ...p, discountValue: e.target.value }))}
                  placeholder={cafeForm.discountType === "fixed" ? "Discount amount (e.g. 50)" : "Discount % (e.g. 10)"}
                  type="number"
                  min={0}
                  step="0.01"
                />
                <Input
                  value={cafeForm.primaryColor}
                  onChange={(e) => setCafeForm((p) => ({ ...p, primaryColor: e.target.value }))}
                  placeholder="Primary color (hex e.g. #ea580c)"
                />
                <Input
                  value={cafeForm.accentColor}
                  onChange={(e) => setCafeForm((p) => ({ ...p, accentColor: e.target.value }))}
                  placeholder="Accent color (hex e.g. #fbbf24)"
                />
                <Input
                  value={cafeForm.latitude}
                  onChange={(e) => setCafeForm((p) => ({ ...p, latitude: e.target.value }))}
                  placeholder="Venue latitude (geofence)"
                  type="number"
                  step="any"
                />
                <Input
                  value={cafeForm.longitude}
                  onChange={(e) => setCafeForm((p) => ({ ...p, longitude: e.target.value }))}
                  placeholder="Venue longitude (geofence)"
                  type="number"
                  step="any"
                />
                <Input
                  value={cafeForm.serviceRadiusMeters}
                  onChange={(e) => setCafeForm((p) => ({ ...p, serviceRadiusMeters: e.target.value }))}
                  placeholder="Service radius (meters, 0 = off)"
                  type="number"
                  min={0}
                  step="1"
                />
                <div className="md:col-span-2 text-xs text-slate-500">
                  Set latitude, longitude, and a radius &gt; 0 to restrict orders to guests within that distance.
                </div>
                <div className="md:col-span-2 mt-4 rounded-2xl border border-orange-100 bg-white/70 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-slate-900">Homepage highlights</div>
                    <Button variant="outline" type="button" onClick={addHighlight}>
                      Add highlight
                    </Button>
                  </div>
                  <div className="mt-3 space-y-3">
                    {(cafeForm.showcaseHighlights || []).length === 0 && (
                      <div className="text-xs text-slate-500">Add items for “Highlights worth the detour”.</div>
                    )}
                    {(cafeForm.showcaseHighlights || []).map((item, idx) => (
                      <div key={`highlight-${idx}`} className="rounded-2xl border border-slate-200 bg-white/90 p-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            value={item.name}
                            onChange={(e) => updateHighlight(idx, { name: e.target.value })}
                            placeholder="Item name"
                          />
                          <Input
                            value={item.tag}
                            onChange={(e) => updateHighlight(idx, { tag: e.target.value })}
                            placeholder="Tag (e.g. Bestseller)"
                          />
                          <Input
                            value={item.note}
                            onChange={(e) => updateHighlight(idx, { note: e.target.value })}
                            placeholder="Short note"
                          />
                          <Input
                            value={item.price}
                            onChange={(e) => updateHighlight(idx, { price: e.target.value })}
                            placeholder="Price (INR)"
                            type="number"
                            min={0}
                          />
                          <Input
                            value={item.image}
                            onChange={(e) => updateHighlight(idx, { image: e.target.value })}
                            placeholder="Image URL"
                          />
                          <div className="space-y-2">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) =>
                                uploadCafeImage(
                                  e.target.files?.[0],
                                  (url) => updateHighlight(idx, { image: url }),
                                  setShowcaseUploading
                                )
                              }
                              className="text-sm text-slate-600"
                            />
                            {showcaseUploading && (
                              <div className="text-xs text-slate-500">Uploading image...</div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <Button variant="outline" type="button" onClick={() => removeHighlight(idx)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2 mt-4 rounded-2xl border border-orange-100 bg-white/70 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-slate-900">Regulars, rituals, reviews</div>
                    <Button variant="outline" type="button" onClick={addCommunityNote}>
                      Add review
                    </Button>
                  </div>
                  <div className="mt-3 space-y-3">
                    {(cafeForm.showcaseCommunityNotes || []).length === 0 && (
                      <div className="text-xs text-slate-500">Add quotes for the reviews section.</div>
                    )}
                    {(cafeForm.showcaseCommunityNotes || []).map((note, idx) => (
                      <div key={`review-${idx}`} className="rounded-2xl border border-slate-200 bg-white/90 p-3">
                        <Textarea
                          value={note.quote}
                          onChange={(e) => updateCommunityNote(idx, { quote: e.target.value })}
                          placeholder="Quote"
                          rows={2}
                        />
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            value={note.name}
                            onChange={(e) => updateCommunityNote(idx, { name: e.target.value })}
                            placeholder="Name"
                          />
                          <Input
                            value={note.tag}
                            onChange={(e) => updateCommunityNote(idx, { tag: e.target.value })}
                            placeholder="Tag (e.g. Regular since 2021)"
                          />
                        </div>
                        <div className="mt-3 flex justify-end">
                          <Button variant="outline" type="button" onClick={() => removeCommunityNote(idx)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2 mt-4 rounded-2xl border border-orange-100 bg-white/70 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-slate-900">Community photos</div>
                    <Button variant="outline" type="button" onClick={addCommunityShot}>
                      Add photo
                    </Button>
                  </div>
                  <div className="mt-3 space-y-3">
                    {(cafeForm.showcaseCommunityShots || []).length === 0 && (
                      <div className="text-xs text-slate-500">Upload or paste image URLs for the gallery.</div>
                    )}
                    {(cafeForm.showcaseCommunityShots || []).map((shot, idx) => (
                      <div key={`shot-${idx}`} className="rounded-2xl border border-slate-200 bg-white/90 p-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            value={shot}
                            onChange={(e) => updateCommunityShot(idx, e.target.value)}
                            placeholder="Image URL"
                          />
                          <div className="space-y-2">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) =>
                                uploadCafeImage(
                                  e.target.files?.[0],
                                  (url) => updateCommunityShot(idx, url),
                                  setShowcaseUploading
                                )
                              }
                              className="text-sm text-slate-600"
                            />
                            {showcaseUploading && (
                              <div className="text-xs text-slate-500">Uploading image...</div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <Button variant="outline" type="button" onClick={() => removeCommunityShot(idx)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Button className="w-full" type="submit" disabled={cafeLoading}>
                    {cafeLoading ? "Saving..." : "Save branding"}
                  </Button>
                </div>
              </form>
            )}

            {cafeError && <div className="mt-3 text-red-700 font-semibold">{cafeError}</div>}
            {cafeSuccess && <div className="mt-3 text-emerald-700 font-semibold">{cafeSuccess}</div>}
          </CardContent>
        </Card>

        <Card id="admin-live-orders" className="border border-orange-100 shadow-xl">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold">Live orders</div>
                <div className="text-sm text-gray-600 mt-1">
                  Track customer orders in real time. Socket: <span className="font-semibold">{ordersSocket}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={loadOrders} disabled={ordersLoading || !tablesCafeId}>
                  Refresh orders
                </Button>
                <Link
                  href="/admin/history"
                  className="inline-flex items-center justify-center rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-semibold text-orange-800 shadow-sm hover:bg-orange-50"
                >
                  History
                </Link>
              </div>
            </div>

            {ordersError && <div className="mt-3 text-red-700 font-semibold">{ordersError}</div>}

            {tablesCafeId ? (
              orders.length === 0 && !ordersLoading ? (
                <div className="mt-4 text-sm text-gray-600">No orders yet.</div>
              ) : (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {orders.map((order) => (
                    <div key={order._id} className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-slate-900">Table {order.tableNumber}</div>
                        <div className="px-2 py-1 rounded-full text-[11px] font-semibold border bg-orange-50 text-orange-700 border-orange-200">
                          {order.status}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-gray-500">Order #{order._id.slice(-6)}</div>
                      <div className="mt-3 text-sm text-slate-700">
                        {order.items?.slice(0, 2).map((it, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span>{it.name} x {it.qty}</span>
                            <span>₹{(it.price * it.qty).toFixed(2)}</span>
                          </div>
                        ))}
                        {order.items?.length > 2 && (
                          <div className="text-xs text-gray-500 mt-1">+{order.items.length - 2} more items</div>
                        )}
                      </div>
                      <div className="mt-3 font-semibold text-slate-900">Total ₹{Number(order.totalAmount || 0).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="mt-4 text-sm text-gray-600">Provide a cafeId to view orders.</div>
            )}
          </CardContent>
        </Card>

        <Card id="admin-tables" className="border border-orange-100 shadow-xl">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold">Table QR codes</div>
                <div className="text-sm text-gray-600 mt-1">
                  Generate one QR per table. Each QR links to the cafe with its table number.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={deleteAllTables} disabled={tablesLoading || !tablesCafeId}>
                  Delete all QRs
                </Button>
                <Button variant="outline" onClick={loadTables} disabled={tablesLoading || !tablesCafeId}>
                  Refresh tables
                </Button>
              </div>
            </div>

            <form
              className="mt-4 flex flex-wrap items-center gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                generateTables();
              }}
            >
              <Input
                value={tableCount}
                onChange={(e) => setTableCount(e.target.value)}
                placeholder="Number of tables (optional)"
                type="number"
                min={1}
              />
              <div className="text-xs text-gray-500">
                Leave empty to use the cafe's saved number of tables.
              </div>
              <Button variant="outline" type="submit" disabled={tablesLoading}>
                Save seats & generate
              </Button>
            </form>

            {tableError && <div className="mt-3 text-red-700 font-semibold">{tableError}</div>}

            <form className="mt-4 flex flex-wrap items-center gap-3" onSubmit={addTableManual}>
              <Input
                value={manualTableNumber}
                onChange={(e) => setManualTableNumber(e.target.value)}
                placeholder="Add single table number"
                type="number"
                min={1}
              />
              <Button variant="outline" type="submit" disabled={manualTableLoading}>
                {manualTableLoading ? "Adding..." : "Add table"}
              </Button>
              {manualTableError && <div className="text-red-700 font-semibold">{manualTableError}</div>}
              {manualTableSuccess && <div className="text-emerald-700 font-semibold">{manualTableSuccess}</div>}
            </form>

            {tablesCafeId ? (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tables.map((table) => {
                  const tokenParam = table.tableToken ? `&t=${table.tableToken}` : "";
                  const tableUrl = `${baseCustomerUrl}/${tablesCafeId}?table=${table.tableNumber}${tokenParam}`;
                  const qrUrl = qrApiBaseUrl
                    ? `${qrApiBaseUrl}/api/qr/table?cafeId=${encodeURIComponent(
                        tablesCafeId
                      )}&tableNumber=${encodeURIComponent(
                        table.tableNumber
                      )}&baseUrl=${encodeURIComponent(baseCustomerUrl)}&size=260`
                    : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(tableUrl)}`;
                  const statusLabel = table.status === "reserved" ? "Reserved" : "Free";
                  const statusClass =
                    table.status === "reserved"
                      ? "bg-orange-50 text-orange-700 border-orange-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200";
                  return (
                    <div key={table._id} className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-slate-900">Table {table.tableNumber}</div>
                        <div className={`px-2 py-1 rounded-full text-[11px] font-semibold border ${statusClass}`}>{statusLabel}</div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                        <a className="font-semibold text-orange-600" href={tableUrl} target="_blank" rel="noreferrer">
                          Open
                        </a>
                        <span>{table.status || "free"}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-center">
                        <img src={qrUrl} alt={`QR for table ${table.tableNumber}`} className="h-40 w-40 rounded-xl border border-orange-100" />
                      </div>
                      <div className="mt-3 text-xs text-gray-500 break-all">{tableUrl}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <a
                          className="inline-flex items-center justify-center rounded-full border-2 border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-100"
                          href={qrUrl}
                          download={`table-${table.tableNumber}-qr.png`}
                        >
                          Download QR
                        </a>
                        <Button
                          variant="outline"
                          onClick={() => deleteTable(table._id, table.tableNumber)}
                          disabled={tablesLoading}
                        >
                          Delete seat
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 text-sm text-gray-600">
                Provide a cafeId to load table QR codes.
              </div>
            )}
          </CardContent>
        </Card>

        <Card id="admin-staff-create" className="border border-orange-100 shadow-xl">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold">Create staff account</div>
                <div className="text-sm text-gray-600 mt-1">
                  Add chef or waiter accounts for your cafe. Super admins must provide a cafeId.
                </div>
              </div>
            </div>

            <form className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={createStaff}>
              <Input
                value={staffUsername}
                onChange={(e) => setStaffUsername(e.target.value)}
                placeholder="Username"
              />
              <Input
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder="Email (optional)"
                type="email"
              />
              <Input
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder="Password"
                type="password"
                required
              />
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value)}
                className="w-full rounded-lg border border-orange-200 px-3 py-2 text-sm text-slate-900"
              >
                <option value="kitchen">Chef (Kitchen)</option>
                <option value="staff">Waiter/Staff</option>
              </select>
              <div className="md:col-span-2">
                <Button className="w-full" type="submit" disabled={staffLoading}>
                  {staffLoading ? "Creating..." : "Create staff account"}
                </Button>
              </div>
            </form>

            {staffError && <div className="mt-3 text-red-700 font-semibold">{staffError}</div>}
            {staffSuccess && <div className="mt-3 text-emerald-700 font-semibold">{staffSuccess}</div>}
          </CardContent>
        </Card>

        <Card id="admin-staff-list" className="border border-orange-100 shadow-xl">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold">Staff accounts</div>
                <div className="text-sm text-gray-600 mt-1">Manage chef and waiter accounts.</div>
              </div>
              <Button variant="outline" onClick={loadStaff} disabled={staffListLoading || !staffCafeId}>
                Refresh staff
              </Button>
            </div>

            {staffListError && <div className="mt-3 text-red-700 font-semibold">{staffListError}</div>}

            {staffCafeId ? (
              staffList.length === 0 && !staffListLoading ? (
                <div className="mt-4 text-sm text-gray-600">No staff accounts yet.</div>
              ) : (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {staffList.map((staff) => (
                    <div key={staff.id} className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-900">{staff.username || staff.email}</div>
                          <div className="text-xs text-slate-500">{staff.email || "No email"}</div>
                        </div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                          {staff.role === "kitchen" ? "Chef" : staff.role === "staff" ? "Waiter" : "Admin"}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => resetStaffPassword(staff.id)} disabled={staffListLoading}>
                          Reset password
                        </Button>
                        <Button variant="outline" onClick={() => deleteStaff(staff.id)} disabled={staffListLoading}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="mt-4 text-sm text-gray-600">Provide a cafeId to manage staff.</div>
            )}
          </CardContent>
        </Card>

        {error && <div className="text-red-700 font-semibold">{error}</div>}

        <div id="admin-menu-editor" className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-6">
          <Card className="border border-orange-100 shadow-xl">
            <CardContent>
              <div className="mb-6 rounded-2xl border border-orange-100 bg-white/80 p-4">
                <div className="text-sm font-bold text-slate-900">Bulk upload menu (CSV)</div>
                <div className="mt-1 text-xs text-slate-500">
                  Columns: name, price, category, description, type, image, isSpecial, isAvailable
                </div>
                <form className="mt-3 flex flex-wrap items-center gap-3" onSubmit={uploadMenuCsv}>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => handleCsvFileChange(e.target.files?.[0] || null)}
                    className="text-sm text-slate-600"
                  />
                  <Button variant="outline" type="submit" disabled={csvUploading}>
                    {csvUploading ? "Uploading..." : "Upload CSV"}
                  </Button>
                  <Button variant="outline" type="button" onClick={downloadCsvTemplate}>
                    Download template
                  </Button>
                  {csvError && <div className="text-sm font-semibold text-red-700">{csvError}</div>}
                  {csvSuccess && <div className="text-sm font-semibold text-emerald-700">{csvSuccess}</div>}
                </form>
                {csvErrors.length > 0 && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    <div className="font-semibold">Rows skipped:</div>
                    <ul className="mt-2 space-y-1">
                      {csvErrors.map((e, idx) => (
                        <li key={`${e.row}-${idx}`}>Line {e.row}: {e.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {csvPreviewErrors.length > 0 && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <div className="font-semibold">Preview warnings:</div>
                    <ul className="mt-2 space-y-1">
                      {csvPreviewErrors.slice(0, 10).map((e, idx) => (
                        <li key={`${e.row}-${idx}`}>Line {e.row}: {e.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {csvPreviewLoading && (
                  <div className="mt-4 text-xs text-slate-500">Generating preview...</div>
                )}
                {csvPreview.length > 0 && !csvPreviewLoading && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      Preview ({csvPreview.length} rows)
                    </div>
                    <div className="mt-3 overflow-auto">
                      <table className="w-full text-xs text-slate-700">
                        <thead>
                          <tr className="text-left text-[11px] uppercase tracking-widest text-slate-400">
                            <th className="py-2 pr-3">Name</th>
                            <th className="py-2 pr-3">Price</th>
                            <th className="py-2 pr-3">Category</th>
                            <th className="py-2 pr-3">Type</th>
                            <th className="py-2 pr-3">Image</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreview.map((row, idx) => (
                            <tr key={`${row.name}-${idx}`} className="border-t border-slate-100">
                              <td className="py-2 pr-3 font-semibold">{row.name || "-"}</td>
                              <td className="py-2 pr-3">{row.price || "-"}</td>
                              <td className="py-2 pr-3">{row.category || "-"}</td>
                              <td className="py-2 pr-3">{row.type || "-"}</td>
                              <td className="py-2 pr-3">
                                {row.image ? (
                                  <img src={row.image} alt={row.name || "Preview"} className="h-10 w-10 rounded-lg object-cover" />
                                ) : (
                                  "-"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button variant="outline" type="button" onClick={deleteAllMenuItems} disabled={loading}>
                    Delete all menu items
                  </Button>
                  <span className="text-xs text-slate-500">This removes every item for this cafe.</span>
                </div>
              </div>
              <h2 className="text-xl font-bold mb-4">Add new item</h2>
              <form onSubmit={createItem} className="grid grid-cols-1 gap-3">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
                <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" type="number" required />
                <div className="space-y-2">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300/60"
                  >
                    {menuCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__custom__">Custom category</option>
                  </select>
                  <Input
                    value={customCategory}
                    onChange={(e) => {
                      setCustomCategory(e.target.value);
                      setCategory("__custom__");
                    }}
                    placeholder="Add a new category (e.g., Healthy Bowls)"
                  />
                  <div className="text-xs text-slate-500">Pick from the list or type a new category.</div>
                </div>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full rounded-lg border border-orange-200 px-3 py-2 text-sm text-slate-900"
                >
                  <option value="veg">Veg</option>
                  <option value="non-veg">Non-veg</option>
                  <option value="customer-insights">Customer Insights</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={isSpecial} onChange={(e) => setIsSpecial(e.target.checked)} />
                  Mark as Today&apos;s Special
                </label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} />
                <div className="space-y-2">
                  <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Image URL (optional)" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => uploadImage(e.target.files?.[0])}
                    className="text-sm text-slate-600"
                  />
                  {imageUploading && <div className="text-xs text-slate-500">Uploading...</div>}
                </div>
                <Button className="w-full" type="submit" disabled={loading}>
                  {loading ? "Saving..." : "Create item"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h2 className="text-xl font-extrabold">Items</h2>
            {items.map((it) => {
              const editing = editingId === it._id;
              return (
                <Card key={it._id} className="border border-orange-100 shadow-lg">
                  <CardContent>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-extrabold text-lg text-slate-900">{it.name}</div>
                        <div className="text-sm text-slate-600">{it.category} - {it.type}</div>
                        {it.isSpecial && (
                          <div className="mt-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                            Today&apos;s Special
                          </div>
                        )}
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${it.isAvailable ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-700 border-gray-200"}`}>
                        {it.isAvailable ? "Available" : "Unavailable"}
                      </div>
                    </div>

                    {editing ? (
                      <div className="mt-4 space-y-2">
                        <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} placeholder="Name" />
                        <Input value={editForm.price} onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))} placeholder="Price" type="number" />
                        <div className="space-y-2">
                          <select
                            value={menuCategories.includes(editForm.category) ? editForm.category : "__custom__"}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditForm((p) => ({ ...p, category: val === "__custom__" ? p.category : val }));
                            }}
                            className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-300/60"
                          >
                            {menuCategories.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                            <option value="__custom__">Custom category</option>
                          </select>
                          <Input
                            value={editForm.category}
                            onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))}
                            placeholder="Custom category"
                          />
                          <div className="text-xs text-slate-500">Pick from the list or type a new category.</div>
                        </div>
                        <select
                          value={editForm.type}
                          onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value }))}
                          className="w-full rounded-lg border border-orange-200 px-3 py-2 text-sm text-slate-900"
                        >
                          <option value="veg">Veg</option>
                          <option value="non-veg">Non-veg</option>
                          <option value="customer-insights">Customer Insights</option>
                        </select>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={editForm.isSpecial}
                            onChange={(e) => setEditForm((p) => ({ ...p, isSpecial: e.target.checked }))}
                          />
                          Today&apos;s Special
                        </label>
                        <Input value={editForm.image} onChange={(e) => setEditForm((p) => ({ ...p, image: e.target.value }))} placeholder="Image URL" />
                        <Textarea value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description" rows={3} />
                        <div className="flex gap-2">
                          <Button onClick={saveEdit} disabled={loading}>Save</Button>
                          <Button variant="outline" onClick={cancelEdit} disabled={loading}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="mt-3 text-sm text-slate-700">{it.description || <span className="text-slate-500">No description</span>}</div>
                        <div className="mt-3 font-extrabold text-slate-900">INR {Number(it.price || 0).toFixed(2)}</div>
                        {it.image && (
                          <div className="mt-3">
                            <img src={it.image} alt={it.name} className="h-28 w-full rounded-xl object-cover border border-orange-100" />
                          </div>
                        )}
                      </>
                    )}

                    {!editing && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => toggleAvailability(it._id)} disabled={loading}>
                          {it.isAvailable ? "Mark unavailable" : "Mark available"}
                        </Button>
                        <Button variant="outline" onClick={() => startEdit(it)} disabled={loading}>Edit</Button>
                        <Button variant="outline" onClick={() => deleteItem(it._id)} disabled={loading}>Delete</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {!loading && items.length === 0 && (
              <div className="text-gray-700">No menu items yet.</div>
            )}
          </div>
        </div>
    </StaffShell>
  );
}
