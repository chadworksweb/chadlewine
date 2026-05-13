"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { createBrowserClient } from "@/lib/supabase-browser";

type Mode = "login" | "register" | "forgot" | "reset" | "claim";

interface Props {
  mode: Mode;
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
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const turnstileKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const useTurnstile = !!turnstileKey && (mode === "login" || mode === "register" || mode === "claim");

  const [email, setEmail] = useState(initialEmail || "");
  const [password, setPassword] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  const resetTurnstile = () => {
    setTurnstileToken(null);
    turnstileRef.current?.reset();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      if (mode === "login") {
        const res = await fetch("/api/account/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, turnstile_token: turnstileToken }),
        });
        const data = await res.json();
        if (!res.ok) {
          setStatus("err");
          setMessage(data.error || "Login failed");
          resetTurnstile();
          return;
        }
        router.push("/account");
        return;
      }

      if (mode === "register" || mode === "claim") {
        const res = await fetch("/api/account/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            honeypot,
            turnstile_token: turnstileToken,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setStatus("err");
          setMessage(data.error || "Sign up failed");
          resetTurnstile();
          return;
        }
        setStatus("ok");
        setMessage(data.message || "Check your email to confirm.");
        return;
      }

      if (mode === "forgot") {
        const res = await fetch("/api/account/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        setStatus("ok");
        setMessage(data.message || "Check your email.");
        return;
      }

      if (mode === "reset") {
        // Reset still uses Supabase browser SDK — the magic link sets a
        // session in the URL hash which only the SDK can finalize. Once
        // we have a session we update the password.
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
      resetTurnstile();
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
                minLength={mode === "register" || mode === "claim" || mode === "reset" ? 12 : 8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              {(mode === "register" || mode === "claim" || mode === "reset") && (
                <p className="account-auth__hint">
                  12 characters minimum. Mix of upper, lower, number, symbol recommended.
                </p>
              )}
            </>
          )}

          {/* Honeypot — invisible field that real users won't fill but bots will. */}
          {(mode === "register" || mode === "claim") && (
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              style={{
                position: "absolute",
                left: "-9999px",
                width: 1,
                height: 1,
                opacity: 0,
              }}
              aria-hidden="true"
            />
          )}

          {useTurnstile && turnstileKey && (
            <div style={{ marginTop: "var(--space-sm)" }}>
              <Turnstile
                ref={turnstileRef}
                siteKey={turnstileKey}
                onSuccess={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken(null)}
                onError={() => setTurnstileToken(null)}
                options={{ theme: "dark", size: "flexible" }}
              />
            </div>
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
            disabled={
              status === "loading" ||
              (useTurnstile && (mode === "register" || mode === "claim") && !turnstileToken)
            }
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
