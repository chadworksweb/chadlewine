"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export function SubscribeSection() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const sectionRef = useRef<HTMLElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  // Mouse-following glow effect — exact AES CTAGlow implementation
  useEffect(() => {
    const section = sectionRef.current;
    const glow = glowRef.current;
    if (!section || !glow) return;

    // Respect reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const mouse = { x: 0, y: 0 };
    const glowPos = { x: 0, y: 0 };
    let isHovering = false;
    let animationId: number | null = null;

    // Lerp factor — lower = more lag
    const ease = 0.04;

    function animate() {
      if (!isHovering) return;

      glowPos.x += (mouse.x - glowPos.x) * ease;
      glowPos.y += (mouse.y - glowPos.y) * ease;

      glow!.style.left = glowPos.x + "px";
      glow!.style.top = glowPos.y + "px";

      animationId = requestAnimationFrame(animate);
    }

    function onMouseMove(e: MouseEvent) {
      const rect = section!.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    }

    function onMouseEnter(e: MouseEvent) {
      const rect = section!.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      glowPos.x = mouse.x;
      glowPos.y = mouse.y;
      isHovering = true;
      glow!.style.opacity = "1";
      animate();
    }

    function onMouseLeave() {
      isHovering = false;
      glow!.style.opacity = "0";
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    }

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      const rect = section!.getBoundingClientRect();
      mouse.x = t.clientX - rect.left;
      mouse.y = t.clientY - rect.top;
      glowPos.x = mouse.x;
      glowPos.y = mouse.y;
      isHovering = true;
      glow!.style.opacity = "1";
      animate();
    }

    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      if (!t) return;
      const rect = section!.getBoundingClientRect();
      mouse.x = t.clientX - rect.left;
      mouse.y = t.clientY - rect.top;
    }

    function onTouchEnd() {
      isHovering = false;
      glow!.style.opacity = "0";
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    }

    section.addEventListener("mousemove", onMouseMove);
    section.addEventListener("mouseenter", onMouseEnter);
    section.addEventListener("mouseleave", onMouseLeave);
    section.addEventListener("touchstart", onTouchStart, { passive: true });
    section.addEventListener("touchmove", onTouchMove, { passive: true });
    section.addEventListener("touchend", onTouchEnd);
    section.addEventListener("touchcancel", onTouchEnd);

    return () => {
      section.removeEventListener("mousemove", onMouseMove);
      section.removeEventListener("mouseenter", onMouseEnter);
      section.removeEventListener("mouseleave", onMouseLeave);
      section.removeEventListener("touchstart", onTouchStart);
      section.removeEventListener("touchmove", onTouchMove);
      section.removeEventListener("touchend", onTouchEnd);
      section.removeEventListener("touchcancel", onTouchEnd);
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;

    setStatus("loading");
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source_page: window.location.pathname }),
    });

    if (res.ok) {
      setStatus("success");
      setMessage("You're in.");
      setEmail("");
      // Footer subscribers should never get the engagement popup.
      try {
        const prev = JSON.parse(localStorage.getItem("cl_submodal") || "{}");
        localStorage.setItem(
          "cl_submodal",
          JSON.stringify({ ...prev, subscribed: true })
        );
      } catch {
        /* storage unavailable; ignore */
      }
    } else {
      const data = await res.json();
      setStatus("error");
      setMessage(data.error || "Something went wrong.");
    }
  }, [email]);

  return (
    <section ref={sectionRef} className="subscribe-section">
      <div ref={glowRef} className="subscribe-section__glow" aria-hidden="true" />

      <div className="subscribe-section__inner">
        <h2 className="subscribe-section__headline">
          Subscribe
        </h2>
        <p className="subscribe-section__text">
          Find out where I&rsquo;m headed.
        </p>

        {status === "success" ? (
          <p className="subscribe-section__success">{message}</p>
        ) : (
          <form className="subscribe-section__form" onSubmit={handleSubmit}>
            <div className="subscribe-section__fields">
              <input
                type="email"
                className="subscribe-section__input"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button
                type="submit"
                className="subscribe-section__button"
                disabled={status === "loading"}
              >
                {status === "loading" ? "..." : "Subscribe"}
              </button>
            </div>
            {status === "error" && (
              <p className="subscribe-section__error">{message}</p>
            )}
          </form>
        )}

      </div>
    </section>
  );
}
