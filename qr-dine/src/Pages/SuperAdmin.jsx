import React, { useEffect, useMemo, useState } from "react";
import Navbar from "../Components/Home/Navbar";

const apiBaseUrl =
  process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_SERVER_URL || "";

export default function SuperAdmin() {
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
    if (!apiBaseUrl) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBaseUrl}/api/cafe`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to fetch cafes");
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
    if (!apiBaseUrl) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBaseUrl}/api/cafe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          address,
          numberOfTables: Number(numberOfTables || 0),
          logoUrl,
          brandImageUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to create cafe");

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
    <>
      <Navbar />
      <main className="pt-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-extrabold text-orange-600 mb-6">
            Super Admin
          </h1>

          {!apiBaseUrl && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6">
              Missing `REACT_APP_API_BASE_URL` in `qr-dine/.env`.
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="bg-white border border-orange-100 rounded-2xl shadow p-5">
              <h2 className="text-xl font-bold text-gray-900 mb-3">Add Cafe</h2>
              <form onSubmit={handleCreate} className="space-y-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Cafe Name"
                  className="w-full p-3 border border-orange-200 rounded-lg"
                  required
                />
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Address"
                  className="w-full p-3 border border-orange-200 rounded-lg"
                />
                <input
                  value={numberOfTables}
                  onChange={(e) => setNumberOfTables(e.target.value)}
                  placeholder="Number of Tables"
                  type="number"
                  min={0}
                  className="w-full p-3 border border-orange-200 rounded-lg"
                />
                <input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="Logo URL (optional)"
                  className="w-full p-3 border border-orange-200 rounded-lg"
                />
                <input
                  value={brandImageUrl}
                  onChange={(e) => setBrandImageUrl(e.target.value)}
                  placeholder="Brand Image URL (optional)"
                  className="w-full p-3 border border-orange-200 rounded-lg"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-300 text-white font-bold rounded-lg shadow disabled:opacity-60"
                >
                  {loading ? "Working..." : "Create Cafe"}
                </button>
              </form>
            </section>

            <section className="bg-white border border-orange-100 rounded-2xl shadow p-5">
              <h2 className="text-xl font-bold text-gray-900 mb-3">
                Cafes ({cafes.length})
              </h2>
              {loading ? (
                <div className="text-gray-600">Loading…</div>
              ) : cafes.length === 0 ? (
                <div className="text-gray-600">No cafes yet.</div>
              ) : (
                <div className="space-y-3">
                  {cafes.map((c) => {
                    const customerUrl = `${baseCustomerUrl}/${c._id}?table=1`;
                    return (
                      <div
                        key={c._id}
                        className="border border-orange-100 rounded-xl p-4"
                      >
                        <div className="font-bold text-gray-900">{c.name}</div>
                        <div className="text-sm text-gray-600">{c.address}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          cafeId: {c._id}
                        </div>
                        <a
                          className="text-sm text-orange-600 font-semibold mt-2 inline-block"
                          href={customerUrl}
                        >
                          Open customer URL
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

