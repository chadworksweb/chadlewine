"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswordVisible, setShowPasswordVisible] = useState(false);
  const [showConfirmVisible, setShowConfirmVisible] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [tosAccepted, setTosAccepted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  const needsConfirm = mode === "register" || mode === "claim" || mode === "reset";
  const rawMismatch =
    needsConfirm && confirmPassword.length > 0 && password !== confirmPassword;
  // Debounced display of the mismatch error so it doesn't flicker while
  // the user is mid-typing. Submit-time validation uses rawMismatch.
  const [showMismatch, setShowMismatch] = useState(false);
  useEffect(() => {
    if (!rawMismatch) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- debounced display: setTimeout requires effect
      setShowMismatch(false);
      return;
    }
    const t = setTimeout(() => setShowMismatch(true), 600);
    return () => clearTimeout(t);
  }, [rawMismatch, password, confirmPassword]);

  const searchParams = useSearchParams();
  const justConfirmed = mode === "login" && searchParams.get("confirmed") === "1";

  const resetTurnstile = () => {
    setTurnstileToken(null);
    turnstileRef.current?.reset();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (needsConfirm && password !== confirmPassword) {
      setStatus("err");
      setMessage("Passwords don't match.");
      return;
    }
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
        // Honor ?next= so login from cart returns to the cart (and similar
        // deep-links). Same-origin only to avoid open-redirect.
        const next = searchParams.get("next");
        const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
        router.push(safeNext);
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
            tos_accepted: tosAccepted,
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
        if (!res.ok) {
          setStatus("err");
          setMessage(data.error || "Could not send reset link.");
          return;
        }
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
        {status === "ok" && (mode === "register" || mode === "claim") ? (
          <div className="account-auth__confirm">
            <div className="account-auth__confirm-icon" aria-hidden="true">✉</div>
            <h1 className="account-auth__title">Check your email</h1>
            <p className="account-auth__sub">
              I just sent a confirmation link to{" "}
              <strong>{email}</strong>. Click it to activate your account.
            </p>
            <p className="account-auth__hint" style={{ marginTop: "var(--space-md)" }}>
              The email may take a minute. Check your spam folder if you
              don&rsquo;t see it.
            </p>
            <div className="account-auth__footer" style={{ justifyContent: "center" }}>
              <Link href="/account/login">Back to sign in</Link>
            </div>
          </div>
        ) : (
        <>
        <div className="account-auth__left">
          <h1 className="account-auth__title">{HEADINGS[mode].title}</h1>
          <p className="account-auth__sub">{HEADINGS[mode].sub}</p>
        </div>

        <div className="account-auth__right">
        {justConfirmed && (
          <div className="account-auth__banner">
            Thanks for confirming. You&rsquo;re now able to log in.
          </div>
        )}

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
              <div className="account-auth__password-wrap">
                <input
                  type={showPasswordVisible ? "text" : "password"}
                  className="account-auth__input account-auth__input--password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={needsConfirm ? 12 : 8}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                <button
                  type="button"
                  className="account-auth__reveal"
                  onClick={() => setShowPasswordVisible((v) => !v)}
                  aria-label={showPasswordVisible ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPasswordVisible ? <EyeOff /> : <Eye />}
                </button>
              </div>
              {needsConfirm && (
                <p className="account-auth__hint">
                  12 characters minimum. Mix of upper, lower, number, symbol recommended.
                </p>
              )}

              {needsConfirm && (
                <>
                  <label className="account-auth__label">Confirm password</label>
                  <div className="account-auth__password-wrap">
                    <input
                      type={showConfirmVisible ? "text" : "password"}
                      className="account-auth__input account-auth__input--password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={12}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="account-auth__reveal"
                      onClick={() => setShowConfirmVisible((v) => !v)}
                      aria-label={showConfirmVisible ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      {showConfirmVisible ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                  {showMismatch && (
                    <p className="account-auth__hint account-auth__hint--err">
                      Passwords don&rsquo;t match.
                    </p>
                  )}
                </>
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

          {(mode === "register" || mode === "claim") && (
            <>
              <p className="account-auth__disclosure">
                Creating an account subscribes you to occasional updates from
                Chad &mdash; new music, art, pop-ups. Transactional emails
                (receipts, downloads, password resets) are sent regardless.
                <strong> One-click unsubscribe in every email.</strong>
              </p>
              <label className="account-auth__checkbox-row">
                <input
                  type="checkbox"
                  checked={tosAccepted}
                  onChange={(e) => setTosAccepted(e.target.checked)}
                  required
                />
                <span>
                  I agree to the{" "}
                  <Link href="/terms-of-service" target="_blank" rel="noopener">
                    Terms of Service
                  </Link>
                  .
                </span>
              </label>
            </>
          )}

          {useTurnstile && turnstileKey && (
            <div
              style={{
                marginTop: "var(--space-sm)",
                maxWidth: "100%",
                overflow: "hidden",
                borderRadius: 4,
              }}
            >
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
              (useTurnstile && (mode === "register" || mode === "claim") && !turnstileToken) ||
              ((mode === "register" || mode === "claim") && !tosAccepted) ||
              rawMismatch ||
              (needsConfirm && confirmPassword.length === 0)
            }
          >
            {status === "loading" ? (
              <span className="account-auth__loader" aria-hidden="true">
                <span className="account-auth__loader-shape" />
                <span className="account-auth__loader-shape" />
                <span className="account-auth__loader-shape" />
                <span className="account-auth__loader-shape" />
                <span className="account-auth__loader-shape" />
                <span className="account-auth__loader-shape" />
              </span>
            ) : mode === "login"
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
        </>
        )}
      </div>
    </div>
  );
}

/* Tiny inline icons — avoid the icon-lib dependency. */
function Eye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
