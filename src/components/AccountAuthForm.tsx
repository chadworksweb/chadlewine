"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";

type Mode = "login" | "register" | "forgot" | "reset" | "claim";

interface Props {
  mode: Mode;
  /** Used for claim/reset flows — token from URL. */
  initialEmail?: string;
}

const HEADINGS: Record<Mode, { title: string; sub: string }> = {
  login: { title: "Sign in", sub: "Welcome back." },
  register: { title: "Create an account", sub: "Your orders, downloads, and preferences in one place." },
  forgot: { title: "Forgot password", sub: "Enter your email — I'll send a reset link." },
  reset: { title: "Set a new password", sub: "Pick something you'll remember." },
  claim: { title: "Claim your account", sub: "You've been here before. Set a password to access your dashboard." },
};

export function AccountAuthForm({ mode, initialEmail }: Props) {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [email, setEmail] = useState(initialEmail || "");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.session) {
          setStatus("err");
          setMessage(error?.message || "Login failed");
          return;
        }
        await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          }),
        });
        router.push("/account");
        return;
      }

      if (mode === "register" || mode === "claim") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/account`,
          },
        });
        if (error) {
          setStatus("err");
          setMessage(error.message);
          return;
        }
        if (data.session) {
          // Auto-confirm path: set cookies and redirect immediately.
          await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            }),
          });
          router.push("/account");
          return;
        }
        setStatus("ok");
        setMessage("Check your email to confirm — then come back and sign in.");
        return;
      }

      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/account/reset-password`,
        });
        if (error) {
          setStatus("err");
          setMessage(error.message);
          return;
        }
        setStatus("ok");
        setMessage("Check your email for a reset link.");
        return;
      }

      if (mode === "reset") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          setStatus("err");
          setMessage(error.message);
          return;
        }
        setStatus("ok");
        setMessage("Password updated. Redirecting...");
        setTimeout(() => router.push("/account"), 800);
        return;
      }
    } catch (e) {
      setStatus("err");
      setMessage(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  const showPassword = mode !== "forgot";
  const showEmail = mode !== "reset";

  return (
    <div className="account-auth">
      <div className="account-auth__card">
        <h1 className="account-auth__title">{HEADINGS[mode].title}</h1>
        <p className="account-auth__sub">{HEADINGS[mode].sub}</p>

        <form onSubmit={onSubmit} className="account-auth__form">
          {showEmail && (
            <>
              <label className="account-auth__label">Email</label>
              <input
                type="email"
                className="account-auth__input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </>
          )}

          {showPassword && (
            <>
              <label className="account-auth__label">
                {mode === "reset" ? "New password" : "Password"}
              </label>
              <input
                type="password"
                className="account-auth__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              {(mode === "register" || mode === "claim" || mode === "reset") && (
                <p className="account-auth__hint">8 characters minimum.</p>
              )}
            </>
          )}

          {status === "err" && message && (
            <p className="account-auth__err">{message}</p>
          )}
          {status === "ok" && message && (
            <p className="account-auth__ok">{message}</p>
          )}

          <button
            type="submit"
            className="account-auth__submit"
            disabled={status === "loading"}
          >
            {status === "loading"
              ? "..."
              : mode === "login"
                ? "Sign in"
                : mode === "register"
                  ? "Create account"
                  : mode === "claim"
                    ? "Claim account"
                    : mode === "forgot"
                      ? "Send reset link"
                      : "Save password"}
          </button>
        </form>

        <div className="account-auth__footer">
          {mode === "login" && (
            <>
              <Link href="/account/register">Create an account</Link>
              <Link href="/account/forgot-password">Forgot password?</Link>
            </>
          )}
          {mode === "register" && <Link href="/account/login">Already have an account? Sign in</Link>}
          {mode === "claim" && <Link href="/account/login">Already have an account? Sign in</Link>}
          {(mode === "forgot" || mode === "reset") && (
            <Link href="/account/login">Back to sign in</Link>
          )}
        </div>
      </div>
    </div>
  );
}
