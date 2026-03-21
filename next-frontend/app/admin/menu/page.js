"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, getApiBaseUrl } from "../../../lib/api";
import { authHeaders, clearToken, getToken, getUser } from "../../../lib/auth";
import { connectCafeSocket } from "../../../lib/socket";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Input, Textarea } from "../../../components/ui/Input";

function upsertById(list, item) {
  const idx = list.findIndex((x) => x._id === item._id);
  if (idx === -1) return [item, ...list];
  const copy = list.slice();
  copy[idx] = item;
  return copy;
}

export default function AdminMenuPage() {
  const user = getUser();
  const role = user?.role;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [adminCafeId, setAdminCafeId] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("Drinks");
  const [type, setType] = useState("veg");
  const [isSpecial, setIsSpecial] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", price: "", category: "", type: "veg", image: "", isSpecial: false });

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

  const baseCustomerUrl = useMemo(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
    []
  );

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
    taxPercent: "",
    discountType: "percent",
    discountValue: "",
  });
  const [cafeLoading, setCafeLoading] = useState(false);
  const [cafeError, setCafeError] = useState("");
  const [cafeSuccess, setCafeSuccess] = useState("");
  const [cafeLogoUploading, setCafeLogoUploading] = useState(false);
  const [cafeBrandUploading, setCafeBrandUploading] = useState(false);

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
        taxPercent: typeof data?.taxPercent === "number" ? String(data.taxPercent) : "",
        discountType: data?.discountType || "percent",
        discountValue:
          typeof data?.discountValue === "number"
            ? String(data.discountValue)
            : typeof data?.discountPercent === "number"
              ? String(data.discountPercent)
              : "",
      });
    } catch (e) {
      setCafeError(e.message || "Failed to load cafe");
    } finally {
      setCafeLoading(false);
    }
  };

  const loadOrders = async () => {
    if (!tablesCafeId) return;
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const data = await apiFetch(`/api/orders/${tablesCafeId}`);
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
        taxPercent: cafeForm.taxPercent === "" ? 0 : Number(cafeForm.taxPercent),
        discountType: cafeForm.discountType || "percent",
        discountValue: cafeForm.discountValue === "" ? 0 : Number(cafeForm.discountValue),
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
    load();
  }, []);

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
    if (!tablesCafeId) return;
    const socket = connectCafeSocket(tablesCafeId);
    setOrdersSocket("connecting");

    socket.on("connect", () => setOrdersSocket("connected"));
    socket.on("disconnect", () => setOrdersSocket("disconnected"));

    const onOrder = (payload) => {
      if (!payload?._id) return;
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
  }, [tablesCafeId]);

  const createItem = async (e) => {
    e.preventDefault();
    if (!requireLogin(false)) return;
    setLoading(true);
    setError("");
    try {
      const body = {
        name,
        description,
        price: Number(price),
        category,
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
      setCategory("Drinks");
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
      const body = {
        name: editForm.name,
        description: editForm.description,
        price: Number(editForm.price),
        category: editForm.category,
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

  return (
    <main className="min-h-screen page-shell relative overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
      <div className="pointer-events-none absolute -top-24 -right-20 h-64 w-64 rounded-full bg-orange-300/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 -left-24 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="relative mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-orange-700 shadow">
              Admin Menu Console
            </div>
            <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-slate-900">Menu management</h1>
            <p className="mt-2 text-sm text-slate-600">Create, update, and publish dishes across your cafe.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-center">
              <div className="text-xl font-bold text-slate-900">{stats.total}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Items</div>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-center">
              <div className="text-xl font-bold text-slate-900">{stats.available}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Available</div>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3 text-center">
              <div className="text-xl font-bold text-slate-900">{stats.categories}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Categories</div>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => load(false)} disabled={loading}>Refresh</Button>
          <Button
            variant="outline"
            onClick={() => {
              clearToken();
              window.location.href = "/admin/login";
            }}
          >
            Logout
          </Button>
        </div>

        {role === "super_admin" && (
          <Card className="border border-orange-100 shadow-xl">
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

        <Card className="border border-orange-100 shadow-xl">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold">Cafe branding</div>
                <div className="text-sm text-gray-600 mt-1">Update cafe name, logo, and brand image.</div>
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

        <Card className="border border-orange-100 shadow-xl">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold">Live orders</div>
                <div className="text-sm text-gray-600 mt-1">
                  Track customer orders in real time. Socket: <span className="font-semibold">{ordersSocket}</span>
                </div>
              </div>
              <Button variant="outline" onClick={loadOrders} disabled={ordersLoading || !tablesCafeId}>
                Refresh orders
              </Button>
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

        <Card className="border border-orange-100 shadow-xl">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold">Table QR codes</div>
                <div className="text-sm text-gray-600 mt-1">
                  Generate one QR per table. Each QR links to the cafe with its table number.
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
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
                  const tableUrl = `${baseCustomerUrl}/${tablesCafeId}?table=${table.tableNumber}`;
                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(tableUrl)}`;
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

        <Card className="border border-orange-100 shadow-xl">
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

        <Card className="border border-orange-100 shadow-xl">
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

        <div className="grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-6">
          <Card className="border border-orange-100 shadow-xl">
            <CardContent>
              <h2 className="text-xl font-bold mb-4">Add new item</h2>
              <form onSubmit={createItem} className="grid grid-cols-1 gap-3">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
                <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" type="number" required />
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" required />
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
                        <Input value={editForm.category} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))} placeholder="Category" />
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
      </div>
    </main>
  );
}
