"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, getApiBaseUrl } from "../../lib/api";
import { authHeaders, getToken, getUser } from "../../lib/auth";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";

export default function SuperAdminPage() {
  const token = getToken();
  const user = getUser();
  const role = user?.role || "";

  const [cafes, setCafes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [overview, setOverview] = useState([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [numberOfTables, setNumberOfTables] = useState(10);
  const [logoUrl, setLogoUrl] = useState("");
  const [brandImageUrl, setBrandImageUrl] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [brandUploading, setBrandUploading] = useState(false);
  const [createAdminOnCafe, setCreateAdminOnCafe] = useState(false);
  const [newCafeAdmin, setNewCafeAdmin] = useState({ username: "", email: "", password: "" });
  const [createAdminError, setCreateAdminError] = useState("");
  const [createAdminSuccess, setCreateAdminSuccess] = useState("");

  const [editingCafeId, setEditingCafeId] = useState(null);
  const [editCafe, setEditCafe] = useState({
    name: "",
    address: "",
    numberOfTables: 0,
    logoUrl: "",
    brandImageUrl: "",
  });
  const [editLogoUploading, setEditLogoUploading] = useState(false);
  const [editBrandUploading, setEditBrandUploading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const [adminUser, setAdminUser] = useState({ cafeId: "", username: "", email: "", password: "" });
  const [adminUserLoading, setAdminUserLoading] = useState(false);
  const [adminUserError, setAdminUserError] = useState("");
  const [adminUserSuccess, setAdminUserSuccess] = useState("");

  const [baseCustomerUrl, setBaseCustomerUrl] = useState("");

  const totals = useMemo(() => {
    const totalCafes = cafes.length;
    const totalTables = cafes.reduce((sum, cafe) => sum + Number(cafe.numberOfTables || 0), 0);
    return { totalCafes, totalTables };
  }, [cafes]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/cafe");
      setCafes(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to fetch cafes");
    } finally {
      setLoading(false);
    }
  };

  const loadOverview = async () => {
    setOverviewLoading(true);
    setOverviewError("");
    try {
      const data = await apiFetch("/api/superadmin/overview", { headers: { ...authHeaders() } });
      setOverview(Array.isArray(data?.cafes) ? data.cafes : []);
    } catch (e) {
      setOverviewError(e.message || "Failed to load overview");
    } finally {
      setOverviewLoading(false);
    }
  };

  const uploadImage = async (file, setter, setUploading) => {
    if (!file) return;
    setUploading(true);
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
      setter(data.url || "");
    } catch (e) {
      setError(e.message || "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const uploadEditImage = async (file, key, setUploading) => {
    if (!file) return;
    setUploading(true);
    setEditError("");
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
      setEditCafe((prev) => ({ ...prev, [key]: data.url || "" }));
    } catch (e) {
      setEditError(e.message || "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!token || (role && role !== "super_admin")) {
      window.location.href = "/super-admin/login";
      return;
    }
    if (typeof window !== "undefined") {
      setBaseCustomerUrl(window.location.origin);
    }
    load();
    loadOverview();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setCreateAdminError("");
    setCreateAdminSuccess("");
    if (createAdminOnCafe) {
      if (!newCafeAdmin.password) {
        setCreateAdminError("Admin password is required");
        setLoading(false);
        return;
      }
      if (!newCafeAdmin.username && !newCafeAdmin.email) {
        setCreateAdminError("Admin username or email is required");
        setLoading(false);
        return;
      }
    }
    try {
      const createdCafe = await apiFetch("/api/cafe", {
        method: "POST",
        body: JSON.stringify({
          name,
          address,
          numberOfTables: Number(numberOfTables || 0),
          logoUrl,
          brandImageUrl,
        }),
      });
      if (createAdminOnCafe) {
        const adminPayload = {
          cafeId: createdCafe?._id,
          role: "cafe_admin",
          username: newCafeAdmin.username || undefined,
          email: newCafeAdmin.email || undefined,
          password: newCafeAdmin.password,
        };
        try {
          const createdAdmin = await apiFetch("/api/admin/users", {
            method: "POST",
            headers: { ...authHeaders() },
            body: JSON.stringify(adminPayload),
          });
          setCreateAdminSuccess(`Cafe created with admin: ${createdAdmin.username || createdAdmin.email}`);
        } catch (adminErr) {
          setCreateAdminError(`Cafe created, but admin creation failed: ${adminErr.message || "Unknown error"}`);
        }
      }
      setName("");
      setAddress("");
      setNumberOfTables(10);
      setLogoUrl("");
      setBrandImageUrl("");
      setCreateAdminOnCafe(false);
      setNewCafeAdmin({ username: "", email: "", password: "" });
      await load();
      await loadOverview();
    } catch (e2) {
      setError(e2.message || "Failed to create cafe");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (cafe) => {
    setEditingCafeId(cafe._id);
    setEditCafe({
      name: cafe.name || "",
      address: cafe.address || "",
      numberOfTables: cafe.numberOfTables || 0,
      logoUrl: cafe.logoUrl || "",
      brandImageUrl: cafe.brandImageUrl || "",
    });
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingCafeId(null);
    setEditError("");
  };

  const saveEdit = async (cafeId) => {
    setEditLoading(true);
    setEditError("");
    try {
      await apiFetch(`/api/cafe/${cafeId}`, {
        method: "PATCH",
        headers: { ...authHeaders() },
        body: JSON.stringify({
          name: editCafe.name,
          address: editCafe.address,
          numberOfTables: Number(editCafe.numberOfTables || 0),
          logoUrl: editCafe.logoUrl,
          brandImageUrl: editCafe.brandImageUrl,
        }),
      });
      await load();
      await loadOverview();
      setEditingCafeId(null);
    } catch (e) {
      setEditError(e.message || "Failed to update cafe");
    } finally {
      setEditLoading(false);
    }
  };

  const deleteCafe = async (cafeId) => {
    const ok = window.confirm("Delete this cafe and all related data?");
    if (!ok) return;
    setEditLoading(true);
    setEditError("");
    try {
      await apiFetch(`/api/cafe/${cafeId}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      await load();
      await loadOverview();
    } catch (e) {
      setEditError(e.message || "Failed to delete cafe");
    } finally {
      setEditLoading(false);
    }
  };

  const createCafeAdmin = async (event) => {
    event.preventDefault();
    setAdminUserLoading(true);
    setAdminUserError("");
    setAdminUserSuccess("");
    try {
      if (!adminUser.cafeId) {
        setAdminUserError("cafeId is required");
        setAdminUserLoading(false);
        return;
      }
      const payload = {
        cafeId: adminUser.cafeId,
        role: "cafe_admin",
        username: adminUser.username || undefined,
        email: adminUser.email || undefined,
        password: adminUser.password,
      };
      const created = await apiFetch("/api/admin/users", {
        method: "POST",
        headers: { ...authHeaders() },
        body: JSON.stringify(payload),
      });
      setAdminUser({ cafeId: "", username: "", email: "", password: "" });
      setAdminUserSuccess(`Created cafe admin: ${created.username || created.email}`);
    } catch (e) {
      setAdminUserError(e.message || "Failed to create cafe admin");
    } finally {
      setAdminUserLoading(false);
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
              Super Admin Console
            </div>
            <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold text-slate-900">Cafe fleet overview</h1>
            <p className="mt-2 text-sm text-slate-600">Create cafes and monitor key performance metrics.</p>
          </div>
          <div className="flex gap-4">
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-5 py-3 text-center">
              <div className="text-xl font-bold text-slate-900">{totals.totalCafes}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Cafes</div>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-white/80 px-5 py-3 text-center">
              <div className="text-xl font-bold text-slate-900">{totals.totalTables}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Tables</div>
            </div>
          </div>
        </header>

        {error && <div className="text-red-700 font-semibold">{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-6">
          <Card className="border border-orange-100 shadow-xl">
            <CardContent>
              <h2 className="text-xl font-bold mb-4">Add new cafe</h2>
              <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cafe name" required />
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" />
                <Input value={numberOfTables} onChange={(e) => setNumberOfTables(e.target.value)} type="number" min={0} placeholder="Number of tables" />
                <div className="space-y-2">
                  <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="Logo URL" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => uploadImage(e.target.files?.[0], setLogoUrl, setLogoUploading)}
                    className="text-sm text-slate-600"
                  />
                  {logoUploading && <div className="text-xs text-slate-500">Uploading logo...</div>}
                </div>
                <div className="space-y-2">
                  <Input value={brandImageUrl} onChange={(e) => setBrandImageUrl(e.target.value)} placeholder="Brand image URL" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => uploadImage(e.target.files?.[0], setBrandImageUrl, setBrandUploading)}
                    className="text-sm text-slate-600"
                  />
                  {brandUploading && <div className="text-xs text-slate-500">Uploading brand image...</div>}
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={createAdminOnCafe}
                    onChange={(e) => setCreateAdminOnCafe(e.target.checked)}
                  />
                  Create cafe admin now
                </label>
                {createAdminOnCafe && (
                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-orange-100 bg-white/80 p-3">
                    <Input
                      value={newCafeAdmin.username}
                      onChange={(e) => setNewCafeAdmin((p) => ({ ...p, username: e.target.value }))}
                      placeholder="Admin username"
                    />
                    <Input
                      value={newCafeAdmin.email}
                      onChange={(e) => setNewCafeAdmin((p) => ({ ...p, email: e.target.value }))}
                      placeholder="Admin email (optional)"
                      type="email"
                    />
                    <Input
                      value={newCafeAdmin.password}
                      onChange={(e) => setNewCafeAdmin((p) => ({ ...p, password: e.target.value }))}
                      placeholder="Admin password"
                      type="password"
                    />
                  </div>
                )}
                <Button className="w-full" type="submit" disabled={loading}>
                  {loading ? "Working..." : "Create cafe"}
                </Button>
                {createAdminError && <div className="text-red-700 font-semibold">{createAdminError}</div>}
                {createAdminSuccess && <div className="text-emerald-700 font-semibold">{createAdminSuccess}</div>}
              </form>
            </CardContent>
          </Card>

          <Card className="border border-orange-100 shadow-xl">
            <CardContent>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Cafes ({cafes.length})</h2>
                <Button variant="outline" onClick={load} disabled={loading}>Refresh</Button>
              </div>
              {loading ? (
                <div className="text-gray-700 mt-4">Loading...</div>
              ) : cafes.length === 0 ? (
                <div className="text-gray-700 mt-4">No cafes yet.</div>
              ) : (
                <div className="mt-4 grid gap-4">
                  {cafes.map((cafe) => {
                    const isEditing = editingCafeId === cafe._id;
                    return (
                      <div key={cafe._id} className="rounded-2xl border border-orange-100 bg-white/80 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-900">{cafe.name}</div>
                            <div className="text-sm text-slate-600">{cafe.address || "No address"}</div>
                          </div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-orange-600">Active</div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                          <span>Tables: {cafe.numberOfTables || 0}</span>
                          <a className="text-orange-600 font-semibold" href={`${baseCustomerUrl}/${cafe._id}?table=1`}>
                            Open customer URL
                          </a>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button variant="outline" onClick={() => startEdit(cafe)} disabled={editLoading}>
                            Edit
                          </Button>
                          <Button variant="outline" onClick={() => deleteCafe(cafe._id)} disabled={editLoading}>
                            Delete
                          </Button>
                        </div>

                        {isEditing && (
                          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Input
                              value={editCafe.name}
                              onChange={(e) => setEditCafe((p) => ({ ...p, name: e.target.value }))}
                              placeholder="Cafe name"
                            />
                            <Input
                              value={editCafe.address}
                              onChange={(e) => setEditCafe((p) => ({ ...p, address: e.target.value }))}
                              placeholder="Address"
                            />
                            <Input
                              value={editCafe.numberOfTables}
                              onChange={(e) => setEditCafe((p) => ({ ...p, numberOfTables: e.target.value }))}
                              type="number"
                              min={0}
                              placeholder="Number of tables"
                            />
                            <Input
                              value={editCafe.logoUrl}
                              onChange={(e) => setEditCafe((p) => ({ ...p, logoUrl: e.target.value }))}
                              placeholder="Logo URL"
                            />
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => uploadEditImage(e.target.files?.[0], "logoUrl", setEditLogoUploading)}
                              className="text-sm text-slate-600"
                            />
                            {editLogoUploading && <div className="text-xs text-slate-500">Uploading logo...</div>}
                            <Input
                              value={editCafe.brandImageUrl}
                              onChange={(e) => setEditCafe((p) => ({ ...p, brandImageUrl: e.target.value }))}
                              placeholder="Brand image URL"
                            />
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => uploadEditImage(e.target.files?.[0], "brandImageUrl", setEditBrandUploading)}
                              className="text-sm text-slate-600"
                            />
                            {editBrandUploading && <div className="text-xs text-slate-500">Uploading brand image...</div>}
                            <div className="md:col-span-2 flex flex-wrap gap-2">
                              <Button onClick={() => saveEdit(cafe._id)} disabled={editLoading}>
                                {editLoading ? "Saving..." : "Save"}
                              </Button>
                              <Button variant="outline" onClick={cancelEdit} disabled={editLoading}>
                                Cancel
                              </Button>
                            </div>
                            {editError && <div className="md:col-span-2 text-red-700 font-semibold">{editError}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border border-orange-100 shadow-xl">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-bold">Create cafe admin</div>
                <div className="text-sm text-gray-600 mt-1">Super admins can create admin accounts per cafe.</div>
              </div>
            </div>

            <form className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={createCafeAdmin}>
              <Input
                value={adminUser.cafeId}
                onChange={(e) => setAdminUser((p) => ({ ...p, cafeId: e.target.value }))}
                placeholder="cafeId (ObjectId)"
                required
              />
              <Input
                value={adminUser.username}
                onChange={(e) => setAdminUser((p) => ({ ...p, username: e.target.value }))}
                placeholder="Username"
              />
              <Input
                value={adminUser.email}
                onChange={(e) => setAdminUser((p) => ({ ...p, email: e.target.value }))}
                placeholder="Email (optional)"
                type="email"
              />
              <Input
                value={adminUser.password}
                onChange={(e) => setAdminUser((p) => ({ ...p, password: e.target.value }))}
                placeholder="Password"
                type="password"
                required
              />
              <div className="md:col-span-2">
                <Button className="w-full" type="submit" disabled={adminUserLoading}>
                  {adminUserLoading ? "Creating..." : "Create admin user"}
                </Button>
              </div>
            </form>

            {adminUserError && <div className="mt-3 text-red-700 font-semibold">{adminUserError}</div>}
            {adminUserSuccess && <div className="mt-3 text-emerald-700 font-semibold">{adminUserSuccess}</div>}
          </CardContent>
        </Card>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-orange-700 shadow">
                Cafe Insights
              </div>
              <h2 className="mt-3 text-2xl font-extrabold text-slate-900">Orders, revenue, and staff</h2>
              <p className="mt-1 text-sm text-slate-600">Metrics are based on recorded orders and registered staff accounts.</p>
            </div>
            <Button variant="outline" onClick={loadOverview} disabled={overviewLoading}>Refresh insights</Button>
          </div>

          {overviewError && <div className="text-red-700 font-semibold">{overviewError}</div>}

          {overviewLoading ? (
            <div className="text-gray-700">Loading insights...</div>
          ) : overview.length === 0 ? (
            <div className="text-gray-700">No insights yet.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {overview.map((cafe) => (
                <Card key={cafe.cafeId} className="border border-orange-100 shadow-lg">
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900">{cafe.name}</div>
                        <div className="text-sm text-slate-600">{cafe.address || "No address"}</div>
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-orange-600">Cafe ID</div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3">
                        <div className="text-lg font-bold text-slate-900">INR {Number(cafe.revenue || 0).toFixed(2)}</div>
                        <div className="text-xs uppercase tracking-wide text-slate-500">Revenue</div>
                      </div>
                      <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3">
                        <div className="text-lg font-bold text-slate-900">{cafe.totalOrders}</div>
                        <div className="text-xs uppercase tracking-wide text-slate-500">Total orders</div>
                      </div>
                      <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3">
                        <div className="text-lg font-bold text-slate-900">{cafe.paidOrders}</div>
                        <div className="text-xs uppercase tracking-wide text-slate-500">Paid orders</div>
                      </div>
                      <div className="rounded-2xl border border-orange-100 bg-white/80 px-4 py-3">
                        <div className="text-lg font-bold text-slate-900">{cafe.staffTotal}</div>
                        <div className="text-xs uppercase tracking-wide text-slate-500">Registered staff</div>
                      </div>
                    </div>

                    <div className="mt-4 text-sm text-slate-600">
                      Staff by role: {Object.keys(cafe.staffCounts || {}).length === 0
                        ? "No staff"
                        : Object.entries(cafe.staffCounts)
                            .map(([roleKey, count]) => `${roleKey} (${count})`)
                            .join(", ")}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
