"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";

export default function SuperAdminPage() {
  const [cafes, setCafes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [numberOfTables, setNumberOfTables] = useState(10);
  const [logoUrl, setLogoUrl] = useState("");
  const [brandImageUrl, setBrandImageUrl] = useState("");

  const baseCustomerUrl = useMemo(() => window.location.origin, []);

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

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiFetch("/api/cafe", {
        method: "POST",
        body: JSON.stringify({
          name,
          address,
          numberOfTables: Number(numberOfTables || 0),
          logoUrl,
          brandImageUrl,
        }),
      });
      setName("");
      setAddress("");
      setNumberOfTables(10);
      setLogoUrl("");
      setBrandImageUrl("");
      await load();
    } catch (e2) {
      setError(e2.message || "Failed to create cafe");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <h1 className="text-3xl font-extrabold text-brand mb-6">Super Admin</h1>

      {error && <div className="mb-4 text-red-700 font-semibold">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent>
            <h2 className="text-xl font-bold mb-3">Add Cafe</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cafe name" required />
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" />
              <Input value={numberOfTables} onChange={(e) => setNumberOfTables(e.target.value)} type="number" min={0} placeholder="Number of tables" />
              <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="Logo URL" />
              <Input value={brandImageUrl} onChange={(e) => setBrandImageUrl(e.target.value)} placeholder="Brand image URL" />
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Working…" : "Create"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h2 className="text-xl font-bold mb-3">Cafes ({cafes.length})</h2>
            {loading ? (
              <div className="text-gray-700">Loading…</div>
            ) : cafes.length === 0 ? (
              <div className="text-gray-700">No cafes yet.</div>
            ) : (
              <div className="space-y-3">
                {cafes.map((c) => (
                  <div key={c._id} className="border border-orange-100 rounded-xl p-4">
                    <div className="font-bold">{c.name}</div>
                    <div className="text-sm text-gray-600">{c.address}</div>
                    <a className="text-sm text-orange-600 font-semibold mt-2 inline-block" href={`${baseCustomerUrl}/${c._id}?table=1`}>
                      Open customer URL
                    </a>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
