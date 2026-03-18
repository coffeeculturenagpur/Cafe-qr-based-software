"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { setToken, setUser } from "../../../lib/auth";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";

export default function AdminLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
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
      setToken(data.token);
      if (data.user) setUser(data.user);
      router.replace("/admin/menu");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-6 max-w-md mx-auto">
      <h1 className="text-3xl font-extrabold text-brand">Admin Login</h1>
      <Card className="mt-6">
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Email or Username" required />
            <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" required />
            {error && <div className="text-red-700 font-semibold">{error}</div>}
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-sm text-gray-600 mt-4">
        This logs in via <code className="font-mono">/api/auth/login</code> and stores a JWT in localStorage.
      </p>
    </main>
  );
}