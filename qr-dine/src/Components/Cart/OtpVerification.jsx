import React, { useMemo, useState } from "react";

const defaultServerUrl = "http://localhost:5000";

const isLikelyE164Phone = (phone) => /^\+\d{10,15}$/.test(phone);

export default function OtpVerification({ onVerified, onCancel }) {
  const serverUrl = useMemo(
    () => process.env.REACT_APP_SERVER_URL || defaultServerUrl,
    []
  );

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devOtpHint, setDevOtpHint] = useState("");

  const handleSendOtp = async () => {
    setError("");
    setDevOtpHint("");

    if (!isLikelyE164Phone(phone)) {
      setError("Enter phone in E.164 format, e.g. +919876543210");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${serverUrl}/api/auth/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to send OTP");

      if (data.otp) {
        setDevOtpHint(`Dev OTP: ${data.otp}`);
      }
      setStep(2);
    } catch (err) {
      setError(err.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError("");

    if (!otp.trim()) {
      setError("Enter the OTP");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${serverUrl}/api/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp: otp.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "OTP verification failed");

      onVerified?.({ phone });
    } catch (err) {
      setError(err.message || "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-orange-100 to-amber-200 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm border border-orange-200">
        <h2 className="text-2xl font-bold text-center text-orange-600 mb-4">
          {step === 1 ? "Enter Mobile Number" : "Enter OTP"}
        </h2>

        {step === 1 ? (
          <>
            <input
              type="tel"
              placeholder="+91XXXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full mb-4 p-3 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-300 text-white font-bold rounded-lg shadow hover:brightness-110 transition-all duration-200 disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send OTP"}
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full mb-4 p-3 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <button
              type="button"
              onClick={handleVerifyOtp}
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-green-500 to-lime-400 text-white font-bold rounded-lg shadow hover:brightness-110 transition-all duration-200 disabled:opacity-60"
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>

            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={loading}
              className="w-full mt-3 py-2 border border-orange-300 text-orange-700 rounded-lg font-semibold hover:bg-orange-50 transition disabled:opacity-60"
            >
              Change Number
            </button>
          </>
        )}

        {devOtpHint && (
          <p className="text-xs mt-3 text-center text-gray-600">{devOtpHint}</p>
        )}
        {error && (
          <p className="text-red-500 mt-3 text-center font-semibold">{error}</p>
        )}

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="w-full mt-4 py-2 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition disabled:opacity-60"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

