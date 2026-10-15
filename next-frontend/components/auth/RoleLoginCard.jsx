"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { setToken, setUser } from "../../lib/auth";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { Input } from "../ui/Input";

const highlights = [
  "Real-time order flow",
  "Role-based access control",
  "Secure JWT sessions",
  "Fast table service",
];

export default function RoleLoginCard({
  roleKey,
  title,
  subtitle,
  redirectTo,
  helpText,
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const isEmail = identifier.includes("@");
      const payload = {
        email: isEmail ? identifier : undefined,
        username: !isEmail ? identifier : undefined,
        password,
      };
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (roleKey && data?.user?.role !== roleKey) {
        setError("This account does not have access to this portal.");
        return;
      }

      setToken(data.token);
      if (data.user) setUser(data.user);
      router.replace(redirectTo || "/");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6">
        <div className="rounded-3xl bg-slate-900 text-white p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-20 -right-16 h-56 w-56 rounded-full bg-amber-400/40 blur-3xl" />
          <div className="absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-orange-500/40 blur-3xl" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide">
              QRDine Universal
            </div>
            <h1 className="mt-6 text-3xl sm:text-4xl font-extrabold tracking-tight">
              {title}
            </h1>
            {subtitle && <p className="mt-3 text-sm text-white/80 max-w-sm">{subtitle}</p>}

            <div className="mt-8 space-y-3">
              {highlights.map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm">
                  <span className="h-2 w-2 rounded-full bg-amber-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
              "Service is smoother when every role gets the right tools."
            </div>
          </div>
        </div>

        <Card className="border border-orange-100 shadow-xl">
          <CardContent>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 text-white text-xl font-bold">
                Q
              </div>
              <h2 className="mt-4 text-2xl font-extrabold text-orange-700">Sign in</h2>
              <p className="mt-2 text-sm text-gray-600">Use your portal credentials to continue.</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <Input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Email or username"
                autoComplete="username"
                required
              />
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                type="password"
                autoComplete="current-password"
                required
              />
              {error && <div className="text-red-600 text-sm font-semibold">{error}</div>}
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            {helpText && (
              <p className="mt-4 text-xs text-gray-600 text-center">{helpText}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
