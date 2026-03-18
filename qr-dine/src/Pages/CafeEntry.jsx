import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

const apiBaseUrl =
  process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_SERVER_URL || "";

export default function CafeEntry() {
  const { cafeId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const tableNumber = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get("table");
    return t ? parseInt(t, 10) : null;
  }, [location.search]);

  const [cafe, setCafe] = useState(null);
  const [splash, setSplash] = useState(true);
  const [step, setStep] = useState("landing"); // landing | info
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSplash(false), 2200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${apiBaseUrl}/api/cafe/${cafeId}`);
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.message || "Failed to load cafe");
        if (!cancelled) setCafe(data);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load cafe");
      }
    }
    if (apiBaseUrl && cafeId) load();
    return () => {
      cancelled = true;
    };
  }, [cafeId]);

  const handleGetStarted = () => setStep("info");

  const handleContinue = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!phone.trim()) {
      setError("Please enter your phone number");
      return;
    }
    if (!tableNumber) {
      setError("Missing table number in QR URL (use ?table=1)");
      return;
    }

    setError("");
    const sessionKey = `customer:${cafeId}:table:${tableNumber}`;
    localStorage.setItem(
      sessionKey,
      JSON.stringify({ cafeId, tableNumber, name: name.trim(), phone: phone.trim() })
    );
    navigate(`/${cafeId}/menu?table=${tableNumber}`, { replace: true });
  };

  if (splash) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-100 to-amber-200">
        <div className="text-center">
          <div className="text-5xl font-extrabold text-orange-600 mb-2">
            {cafe?.name || "QRDine"}
          </div>
          <div className="text-gray-600 font-semibold">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-cover bg-center"
      style={{
        backgroundImage: cafe?.brandImageUrl ? `url(${cafe.brandImageUrl})` : "none",
      }}
    >
      <div className="min-h-screen bg-white/70 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-orange-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            {cafe?.logoUrl ? (
              <img
                src={cafe.logoUrl}
                alt={cafe.name}
                className="w-12 h-12 rounded-xl object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 font-extrabold">
                Q
              </div>
            )}
            <div>
              <div className="text-xl font-extrabold text-orange-700">
                {cafe?.name || "Cafe"}
              </div>
              <div className="text-sm text-gray-600">
                Table {tableNumber || "?"}
              </div>
            </div>
          </div>

          {step === "landing" ? (
            <>
              <p className="text-gray-700 mb-6">
                Scan. Order. Pay at counter. Track your order status in real-time.
              </p>
              <button
                type="button"
                onClick={handleGetStarted}
                className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-300 text-white font-bold rounded-lg shadow hover:brightness-110 transition"
              >
                Get Started
              </button>
            </>
          ) : (
            <form onSubmit={handleContinue} className="space-y-4">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full p-3 border border-orange-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                className="w-full p-3 border border-orange-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-green-500 to-lime-400 text-white font-bold rounded-lg shadow hover:brightness-110 transition"
              >
                Continue to Menu
              </button>
            </form>
          )}

          {error && <p className="text-red-600 font-semibold mt-4">{error}</p>}
          {!apiBaseUrl && (
            <p className="text-red-600 font-semibold mt-4">
              Missing API base URL. Set `REACT_APP_API_BASE_URL` in `.env`.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

