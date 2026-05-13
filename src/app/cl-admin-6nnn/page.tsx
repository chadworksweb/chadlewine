"use client";

import { useState, useEffect } from "react";
export default function LoginPage() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Route admin login through the hardened server endpoint — rate limit,
    // lockout, audit log all enforced before Supabase Auth is hit.
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Login failed");
      setLoading(false);
      return;
    }

    // Cookies are set server-side by /api/admin/login — just redirect.
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect") || "/admin";
    window.location.href = redirect;
  }

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={handleLogin}>
        <h1 className="login-form__title">Admin</h1>

        {error && <p className="login-form__error">{error}</p>}

        <label className="login-form__label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="login-form__input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />

        <label className="login-form__label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="login-form__input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button className="login-form__button" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
