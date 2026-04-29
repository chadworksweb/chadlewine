"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";

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

    const supabase = createBrowserClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !data.session) {
      setError(authError?.message || "Login failed");
      setLoading(false);
      return;
    }

    // Set cookies via API route so they're httpOnly
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      }),
    });

    if (!res.ok) {
      setError("Failed to establish session");
      setLoading(false);
      return;
    }

    // Redirect to admin or the requested page
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
