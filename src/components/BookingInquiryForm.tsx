"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { ROOM_TYPES, EXCHANGES, PA_PLANS, PA_RESTRICTED_EXCHANGES } from "@/lib/booking-options";

// The whole inquiry view is one Typeform-style form: one prompt per screen,
// the host advances with the on-screen button or Enter, and can step back at
// any point. Steps slide horizontally (direction follows forward/back). The
// final screen posts to /api/book (Supabase + email + coupon). Replaces the old
// mailto-based InquiryView body; the page wrapper still carries
// page-booking--inquiry so the pillar wipe keeps working.
//
// Framing rule: the host provides the room and SUGGESTS songs -- that is their
// only creative input. Chad shapes the night. No band comparisons (these rooms
// never host bands).

export interface BookingSong {
  id: string;
  title: string;
}

const CATALOG_URL = "/music/songs";
const OVERVIEW_HREF = "/super-individual-night";

// Step keys in order. "welcome" and "done" are bookends that do not count
// toward the progress bar.
const STEPS = [
  "welcome",
  "rider",
  "space",
  "room",
  "pa",
  "projector",
  "capacity",
  "dates",
  "exchange",
  "setlist",
  "covers",
  "message",
  "name",
  "email",
  "phone",
  "review",
  "done",
] as const;
type StepKey = (typeof STEPS)[number];

// Preset cover songs offered on the covers step. "For now" -- hosts can also
// type a couple of their own.
const COVER_PRESETS = ["Man in the Mirror", "MMMBop"];

// Hosts suggest up to this many originals; Chad has final say and adds his own.
const MAX_SET = 8;

const REVIEW_INDEX = STEPS.indexOf("review");

type Status = "idle" | "loading" | "err";
type Dir = "fwd" | "back";

export function BookingInquiryForm({ songs }: { songs: BookingSong[] }) {
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const turnstileKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const mountedAt = useRef(Date.now());

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<Dir>("fwd");

  // Fields
  const [spaceName, setSpaceName] = useState("");
  const [location, setLocation] = useState("");
  const [roomType, setRoomType] = useState("");
  const [paPlan, setPaPlan] = useState(""); // onsite | rent | split
  const [paNo, setPaNo] = useState(false); // "No PA" picked -> reveal solutions
  const [hasProjector, setHasProjector] = useState(""); // yes | no
  const [hasScreen, setHasScreen] = useState(""); // yes | no
  const [capacity, setCapacity] = useState("");
  const [dates, setDates] = useState("");
  const [exchange, setExchange] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Setlist
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [letChad, setLetChad] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Covers: preset picks + up to two of the host's own.
  const [coverPicks, setCoverPicks] = useState<string[]>([]);
  const [customCovers, setCustomCovers] = useState<[string, string]>(["", ""]);

  // Anti-spam + verification
  const [honeypot, setHoneypot] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const key: StepKey = STEPS[step];

  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of songs) m.set(s.id, s.title);
    return m;
  }, [songs]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Debounce the search so filtering doesn't run on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Each step starts at the top of the page (cards can be tall).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const rightList = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return songs.filter(
      (s) => !selectedSet.has(s.id) && (!q || s.title.toLowerCase().includes(q)),
    );
  }, [songs, selectedSet, debouncedQuery]);

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  // When Chad splits the PA rental he carries cost, so the no-guarantee
  // exchange models are removed (gating only; break-even math comes later).
  const chadCarriesPa = paPlan === "split";
  const exchangeOptions = useMemo(
    () => (chadCarriesPa ? EXCHANGES.filter((x) => !PA_RESTRICTED_EXCHANGES.has(x.value)) : EXCHANGES),
    [chadCarriesPa],
  );

  // Final cover list: selected presets + the host's own non-empty entries.
  const coversList = useMemo(
    () => [...coverPicks, ...customCovers.map((c) => c.trim()).filter(Boolean)],
    [coverPicks, customCovers],
  );

  function canAdvance(k: StepKey): boolean {
    switch (k) {
      case "space":
        return location.trim().length > 0;
      case "room":
        return roomType.length > 0;
      case "pa":
        return paPlan.length > 0;
      case "projector":
        return hasProjector.length > 0 && hasScreen.length > 0;
      case "dates":
        return dates.trim().length > 0;
      case "exchange":
        return exchange.length > 0;
      case "name":
        return name.trim().length > 0;
      case "email":
        return emailValid;
      default:
        return true;
    }
  }

  const goNext = () => {
    if (!canAdvance(key)) return;
    setError("");
    setDir("fwd");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => {
    setError("");
    setDir("back");
    setStep((s) => Math.max(s - 1, 0));
  };

  // Selecting a single-choice value advances on its own (Typeform feel).
  const chooseRoom = (v: string) => {
    setRoomType(v);
    setError("");
    setDir("fwd");
    setStep((s) => s + 1);
  };
  const chooseExchange = (v: string) => {
    setExchange(v);
    setError("");
    setDir("fwd");
    setStep((s) => s + 1);
  };
  // PA: "Yes" sets onsite and advances; "No" reveals the rent/split options.
  const choosePaOnsite = () => {
    setPaPlan("onsite");
    setPaNo(false);
    setError("");
    setDir("fwd");
    setStep((s) => s + 1);
  };
  const choosePaSolution = (v: string) => {
    setPaPlan(v);
    // If Chad now carries PA cost, drop any exchange that's no longer offered.
    if (v === "split" && PA_RESTRICTED_EXCHANGES.has(exchange)) setExchange("");
    setError("");
    setDir("fwd");
    setStep((s) => s + 1);
  };

  function toggleCover(title: string) {
    setCoverPicks((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    );
  }
  function setCustomCover(i: 0 | 1, v: string) {
    setCustomCovers((prev) => (i === 0 ? [v, prev[1]] : [prev[0], v]));
  }

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goNext();
    }
  };

  function addSong(id: string) {
    if (letChad || selectedIds.length >= MAX_SET) return;
    setSelectedIds((prev) => (prev.includes(id) || prev.length >= MAX_SET ? prev : [...prev, id]));
  }
  function removeSong(id: string) {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }

  async function submit() {
    if (honeypot) {
      setDir("fwd");
      setStep(STEPS.indexOf("done"));
      return;
    }
    if (turnstileKey && !token) {
      setError("Please complete the verification check.");
      return;
    }
    const fd = new FormData();
    fd.append("company", honeypot);
    fd.append("elapsedMs", String(Date.now() - mountedAt.current));
    if (token) fd.append("turnstileToken", token);
    fd.append("name", name.trim());
    fd.append("email", email.trim());
    fd.append("phone", phone.trim());
    fd.append("spaceName", spaceName.trim());
    fd.append("location", location.trim());
    fd.append("roomType", roomType);
    fd.append("paPlan", paPlan);
    fd.append("hasProjector", hasProjector);
    fd.append("hasScreen", hasScreen);
    fd.append("capacity", capacity.trim());
    fd.append("dates", dates.trim());
    fd.append("exchange", exchange);
    fd.append("message", message.trim());
    fd.append("letChad", String(letChad));
    fd.append("covers", JSON.stringify(coversList));
    fd.append(
      "setlist",
      JSON.stringify(
        letChad
          ? []
          : selectedIds.map((id) => ({ id, title: titleById.get(id) || "" })),
      ),
    );

    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/book", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setStatus("idle");
        setDir("fwd");
        setStep(STEPS.indexOf("done"));
      } else {
        setStatus("err");
        setError(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("err");
      setError("Network error. Please try again.");
    } finally {
      setToken(null);
      turnstileRef.current?.reset();
    }
  }

  const showChrome = key !== "welcome" && key !== "done";

  return (
    <section className="bkf" aria-label="Booking inquiry">
      {/* Honeypot - off-screen; bots fill it, humans never see it. */}
      <div className="sw-hp" aria-hidden="true">
        <label>
          Company
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      <div className="bkf__panel">
        {/* Bordered, contained stage. Content slides horizontally within it.
            The welcome card's border slowly pulses grey -> blue. */}
        <div className={`bkf__stage${key === "welcome" ? " bkf__stage--pulse" : ""}`}>
        {/* Keyed so each step remounts and replays the slide-in animation. */}
        <div key={step} className={`bkf__anim${dir === "back" ? " bkf__anim--back" : ""}`}>
          {/* WELCOME */}
          {key === "welcome" && (
            <div className="bkf__hero">
              <p className="bkf__eyebrow">Booking inquiry</p>
              <h2 className="bkf__headline">Host a Super Individual Night</h2>
              <p className="bkf__lede">
                Tell me about your space and suggest any songs you&rsquo;d like to hear, I&rsquo;ll
                shape the rest.
              </p>
              <div className="bkf__welcome-actions">
                <button type="button" className="bkf__cta" onClick={goNext}>
                  Start &rarr;
                </button>
                <span className="bkf__hint">takes about a minute</span>
              </div>
              <p className="bkf__backlink">
                <Link href={OVERVIEW_HREF}>&larr; Back to the overview</Link>
              </p>
            </div>
          )}

          {/* RIDER (share-only) */}
          {key === "rider" && (
            <div className="bkf__wide">
              <h2 className="bkf__q">First, what hosting takes</h2>
              <div className="bkf__rider">
                <div className="bkf__rider-col">
                  <h3>All I need from the space</h3>
                  <ul>
                    <li>A PA / house sound system (or a quiet, intimate room for an acoustic-leaning set)</li>
                    <li>One vocal mic</li>
                    <li>A line / aux input for my playback (1/8&quot; or DI)</li>
                    <li>Dimmable or low lighting, and floor space &mdash; cushions, mats, or chairs</li>
                  </ul>
                </div>
                <div className="bkf__rider-col">
                  <h3>What I bring</h3>
                  <ul>
                    <li>My own backing tracks and playback rig</li>
                    <li>A full-sounding, finished set built as a transmission</li>
                    <li>Fast, calm load-in and tear-down &mdash; I run the whole night solo</li>
                    <li>A set shaped around the songs you suggest, or one I shape for your room</li>
                  </ul>
                </div>
              </div>
              <div className="bkf__nav">
                <button type="button" className="bkf__back" onClick={goBack}>
                  &larr; Back
                </button>
                <button type="button" className="bkf__cta" onClick={goNext}>
                  Got it &rarr;
                </button>
              </div>
            </div>
          )}

          {/* SPACE */}
          {key === "space" && (
            <SplitStep eyebrow="Your space" question="Where would the night happen?">
              <label className="bkf__label" htmlFor="bkf-space">
                Space or venue name <span className="bkf__opt">(optional)</span>
              </label>
              <input
                id="bkf-space"
                className="bkf__input"
                type="text"
                value={spaceName}
                maxLength={200}
                placeholder="Room, studio, or gathering"
                onChange={(e) => setSpaceName(e.target.value)}
                onKeyDown={onInputKey}
              />
              <label className="bkf__label" htmlFor="bkf-loc">
                City / location
              </label>
              <input
                id="bkf-loc"
                className="bkf__input"
                type="text"
                value={location}
                maxLength={200}
                autoFocus
                placeholder="City, state, or region"
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={onInputKey}
              />
              <StepNav onBack={goBack} onNext={goNext} disabled={!canAdvance("space")} />
            </SplitStep>
          )}

          {/* ROOM TYPE */}
          {key === "room" && (
            <SplitStep eyebrow="Your space" question="What kind of room is it?">
              <div className="bkf__choices">
                {ROOM_TYPES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className={`bkf__choice${roomType === r.value ? " bkf__choice--active" : ""}`}
                    onClick={() => chooseRoom(r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <StepNav onBack={goBack} onNext={goNext} disabled={!canAdvance("room")} />
            </SplitStep>
          )}

          {/* PA SYSTEM */}
          {key === "pa" && (
            <SplitStep
              eyebrow="Your space"
              question="Is a proper PA available?"
              sub="A house sound system or PA the room can use for the night."
            >
              <div className="bkf__choices">
                <button
                  type="button"
                  className={`bkf__choice${paPlan === "onsite" ? " bkf__choice--active" : ""}`}
                  onClick={choosePaOnsite}
                >
                  Yes &mdash; we have a PA
                </button>
                <button
                  type="button"
                  className={`bkf__choice${paNo ? " bkf__choice--active" : ""}`}
                  onClick={() => {
                    setPaNo(true);
                    setPaPlan("");
                  }}
                >
                  No PA on site
                </button>
              </div>

              {paNo && (
                <div className="bkf__pa-solutions">
                  <p className="bkf__sub">No problem &mdash; how should we cover sound?</p>
                  <div className="bkf__choices">
                    <button
                      type="button"
                      className={`bkf__choice${paPlan === "rent" ? " bkf__choice--active" : ""}`}
                      onClick={() => choosePaSolution("rent")}
                    >
                      We&rsquo;ll rent a PA <span className="bkf__opt">(preferred)</span>
                    </button>
                    <button
                      type="button"
                      className={`bkf__choice${paPlan === "split" ? " bkf__choice--active" : ""}`}
                      onClick={() => choosePaSolution("split")}
                    >
                      Split the PA rental with Chad
                    </button>
                  </div>
                </div>
              )}
              <StepNav onBack={goBack} onNext={goNext} disabled={!canAdvance("pa")} />
            </SplitStep>
          )}

          {/* PROJECTOR */}
          {key === "projector" && (
            <SplitStep
              eyebrow="Your space"
              question="Any projection in the room?"
              sub="The night uses visuals — a music video and a live Rising Compass reading. No projector is fine; it just shapes how I run those."
            >
              <p className="bkf__label">A projector?</p>
              <div className="bkf__yesno">
                <button
                  type="button"
                  className={`bkf__choice${hasProjector === "yes" ? " bkf__choice--active" : ""}`}
                  onClick={() => setHasProjector("yes")}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={`bkf__choice${hasProjector === "no" ? " bkf__choice--active" : ""}`}
                  onClick={() => setHasProjector("no")}
                >
                  No
                </button>
              </div>

              <p className="bkf__label">And a screen or projection wall?</p>
              <div className="bkf__yesno">
                <button
                  type="button"
                  className={`bkf__choice${hasScreen === "yes" ? " bkf__choice--active" : ""}`}
                  onClick={() => setHasScreen("yes")}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={`bkf__choice${hasScreen === "no" ? " bkf__choice--active" : ""}`}
                  onClick={() => setHasScreen("no")}
                >
                  No
                </button>
              </div>

              <StepNav onBack={goBack} onNext={goNext} disabled={!canAdvance("projector")} />
            </SplitStep>
          )}

          {/* CAPACITY */}
          {key === "capacity" && (
            <SplitStep
              eyebrow="Your space"
              question="Roughly how many people?"
              sub="A range is fine — this just helps me picture the room."
            >
              <input
                className="bkf__input"
                type="text"
                inputMode="numeric"
                value={capacity}
                maxLength={60}
                autoFocus
                placeholder="e.g. 30, or 40-60"
                onChange={(e) => setCapacity(e.target.value)}
                onKeyDown={onInputKey}
              />
              <StepNav onBack={goBack} onNext={goNext} nextLabel={capacity ? "Next" : "Skip"} />
            </SplitStep>
          )}

          {/* DATES */}
          {key === "dates" && (
            <SplitStep
              eyebrow="The night"
              question="When are you thinking?"
              sub="A date, a couple of options, or just a season — whatever you have."
            >
              <input
                className="bkf__input"
                type="text"
                value={dates}
                maxLength={300}
                autoFocus
                placeholder="e.g. a Friday in October, or Oct 18 / Nov 1"
                onChange={(e) => setDates(e.target.value)}
                onKeyDown={onInputKey}
              />
              <StepNav onBack={goBack} onNext={goNext} disabled={!canAdvance("dates")} />
            </SplitStep>
          )}

          {/* EXCHANGE */}
          {key === "exchange" && (
            <SplitStep
              eyebrow="The night"
              question="How would the exchange work?"
              sub={
                chadCarriesPa ? (
                  <>
                    Since we&rsquo;re splitting the PA rental, the no-guarantee options are paused so
                    the night at least breaks even.
                  </>
                ) : (
                  <>
                    I&rsquo;m flexible and realistic &mdash; pick whatever fits your space and we&rsquo;ll
                    make it easy.
                  </>
                )
              }
            >
              <div className="bkf__choices">
                {exchangeOptions.map((x) => (
                  <button
                    key={x.value}
                    type="button"
                    className={`bkf__choice${exchange === x.value ? " bkf__choice--active" : ""}`}
                    onClick={() => chooseExchange(x.value)}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
              <StepNav onBack={goBack} onNext={goNext} disabled={!canAdvance("exchange")} />
            </SplitStep>
          )}

          {/* SETLIST */}
          {key === "setlist" && (
            <SplitStep
              eyebrow="Suggest the set"
              question="Which songs do you want to hear?"
              sub={
                <>
                  Search and add up to {MAX_SET} titles. You suggest; I have final say on the set
                  and add a few of my own. New to the music?{" "}
                  <Link href={CATALOG_URL} target="_blank" rel="noopener noreferrer">
                    Spend time with the songs first
                  </Link>
                  , or let me pick.
                </>
              }
            >
              <div className="bkf__set">
                <div className="bkf__pane-head">
                  {letChad
                    ? "Chad picks the setlist"
                    : `Your set${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
                </div>

                <input
                  type="search"
                  className="bkf__search"
                  placeholder="Search songs to add..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={letChad || selectedIds.length >= MAX_SET}
                  aria-label="Search songs by title"
                />

                {/* Search results to add (only while typing). */}
                {!letChad && debouncedQuery.trim() && selectedIds.length < MAX_SET && (
                  <ul className="bkf__results">
                    {rightList.slice(0, 8).map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="bkf__catalog-row"
                          onClick={() => addSong(s.id)}
                        >
                          {s.title}
                        </button>
                      </li>
                    ))}
                    {rightList.length === 0 && (
                      <li className="bkf__catalog-empty">No titles match that search.</li>
                    )}
                  </ul>
                )}

                {selectedIds.length >= MAX_SET && !letChad && (
                  <p className="bkf__set-note">
                    That&rsquo;s the max of {MAX_SET} &mdash; remove one to swap.
                  </p>
                )}

                <ul className="bkf__chosen-list">
                  {letChad ? (
                    <li className="bkf__chosen-empty">
                      You&rsquo;ve handed the set to Chad &mdash; he&rsquo;ll read your room and pick
                      the setlist.
                      <button
                        type="button"
                        className="bkf__handoff-undo"
                        onClick={() => setLetChad(false)}
                      >
                        Actually, I&rsquo;ll pick
                      </button>
                    </li>
                  ) : (
                    <>
                      {selectedIds.length === 0 ? (
                        <li className="bkf__chosen-empty">
                          No songs yet &mdash; search above to build your set.
                        </li>
                      ) : (
                        selectedIds.map((id) => (
                          <li key={id} className="bkf__chosen-row">
                            <span>{titleById.get(id)}</span>
                            <button
                              type="button"
                              className="bkf__remove"
                              aria-label={`Remove ${titleById.get(id)}`}
                              onClick={() => removeSong(id)}
                            >
                              &times;
                            </button>
                          </li>
                        ))
                      )}
                      {selectedIds.length < 3 && (
                        <li className="bkf__handoff-cta-row">
                          <button
                            type="button"
                            className="bkf__handoff-cta"
                            onClick={() => setLetChad(true)}
                          >
                            Don&rsquo;t know the songs? Let Chad pick the setlist &rarr;
                          </button>
                        </li>
                      )}
                    </>
                  )}
                </ul>
              </div>
              <StepNav onBack={goBack} onNext={goNext} />
            </SplitStep>
          )}

          {/* COVERS */}
          {key === "covers" && (
            <SplitStep
              eyebrow="Suggest the set"
              question="Any covers you'd love to hear?"
              sub="Tap one of these, or name a couple of your own. Totally optional."
            >
              <div className="bkf__choices">
                {COVER_PRESETS.map((title) => (
                  <button
                    key={title}
                    type="button"
                    className={`bkf__choice${coverPicks.includes(title) ? " bkf__choice--active" : ""}`}
                    onClick={() => toggleCover(title)}
                    aria-pressed={coverPicks.includes(title)}
                  >
                    {title}
                  </button>
                ))}
              </div>
              <label className="bkf__label" htmlFor="bkf-cover1">
                Your own covers <span className="bkf__opt">(optional)</span>
              </label>
              <input
                id="bkf-cover1"
                className="bkf__input"
                type="text"
                value={customCovers[0]}
                maxLength={120}
                placeholder="A cover you'd love"
                onChange={(e) => setCustomCover(0, e.target.value)}
              />
              <input
                className="bkf__input"
                type="text"
                value={customCovers[1]}
                maxLength={120}
                placeholder="And one more"
                onChange={(e) => setCustomCover(1, e.target.value)}
                style={{ marginTop: "var(--space-sm)" }}
              />
              <StepNav
                onBack={goBack}
                onNext={goNext}
                nextLabel={coversList.length ? "Next" : "Skip"}
              />
            </SplitStep>
          )}

          {/* MESSAGE */}
          {key === "message" && (
            <SplitStep
              eyebrow="Almost there"
              question="Anything else I should know?"
              sub="Your community, the mood you want to hold, questions — optional."
            >
              <textarea
                className="bkf__textarea"
                value={message}
                maxLength={4000}
                rows={5}
                placeholder="Tell me anything that helps me picture the night."
                onChange={(e) => setMessage(e.target.value)}
              />
              <StepNav onBack={goBack} onNext={goNext} nextLabel={message ? "Next" : "Skip"} />
            </SplitStep>
          )}

          {/* NAME */}
          {key === "name" && (
            <SplitStep eyebrow="So I can reach you" question="What's your name?">
              <input
                className="bkf__input"
                type="text"
                value={name}
                maxLength={200}
                autoFocus
                autoComplete="name"
                placeholder="Your name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={onInputKey}
              />
              <StepNav onBack={goBack} onNext={goNext} disabled={!canAdvance("name")} />
            </SplitStep>
          )}

          {/* EMAIL */}
          {key === "email" && (
            <SplitStep eyebrow="So I can reach you" question="What's your email?">
              <input
                className="bkf__input"
                type="email"
                value={email}
                maxLength={200}
                autoFocus
                autoComplete="email"
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={onInputKey}
              />
              <StepNav onBack={goBack} onNext={goNext} disabled={!canAdvance("email")} />
            </SplitStep>
          )}

          {/* PHONE */}
          {key === "phone" && (
            <SplitStep
              eyebrow="So I can reach you"
              question="A phone number?"
              sub={<>Optional &mdash; only if you&rsquo;d rather I call or text.</>}
            >
              <input
                className="bkf__input"
                type="tel"
                value={phone}
                maxLength={60}
                autoFocus
                autoComplete="tel"
                placeholder="(optional)"
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={onInputKey}
              />
              <StepNav onBack={goBack} onNext={goNext} nextLabel={phone ? "Review" : "Skip"} />
            </SplitStep>
          )}

          {/* REVIEW + SEND */}
          {key === "review" && (
            <SplitStep eyebrow="One last look" question="Send your inquiry">
              <dl className="bkf__review">
                <ReviewRow label="Name" value={name} />
                <ReviewRow label="Email" value={email} />
                {phone && <ReviewRow label="Phone" value={phone} />}
                <ReviewRow label="Space" value={[spaceName, location].filter(Boolean).join(" — ")} />
                <ReviewRow label="Room" value={ROOM_TYPES.find((r) => r.value === roomType)?.label} />
                <ReviewRow label="PA" value={PA_PLANS.find((p) => p.value === paPlan)?.label} />
                <ReviewRow
                  label="Projection"
                  value={
                    hasProjector
                      ? hasProjector === "yes"
                        ? hasScreen === "yes"
                          ? "Projector + screen"
                          : "Projector, no screen"
                        : hasScreen === "yes"
                          ? "Screen, no projector"
                          : "No projection"
                      : null
                  }
                />
                {capacity && <ReviewRow label="Capacity" value={capacity} />}
                <ReviewRow label="Dates" value={dates} />
                <ReviewRow label="Exchange" value={EXCHANGES.find((x) => x.value === exchange)?.label} />
                <ReviewRow
                  label="Set"
                  value={
                    letChad
                      ? "Chad picks the setlist"
                      : selectedIds.length
                        ? `${selectedIds.length} song${selectedIds.length === 1 ? "" : "s"} suggested`
                        : "None selected"
                  }
                />
                {coversList.length > 0 && <ReviewRow label="Covers" value={coversList.join(", ")} />}
                {message && <ReviewRow label="Notes" value={message} />}
              </dl>

              {turnstileKey && (
                <div className="bkf__turnstile">
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={turnstileKey}
                    onSuccess={setToken}
                    onError={() => setToken(null)}
                    onExpire={() => setToken(null)}
                    options={{ theme: "dark" }}
                  />
                </div>
              )}

              {error && (
                <p className="bkf__error" role="status" aria-live="polite">
                  {error}
                </p>
              )}

              <div className="bkf__nav">
                <button type="button" className="bkf__back" onClick={goBack} disabled={status === "loading"}>
                  &larr; Back
                </button>
                <button
                  type="button"
                  className="bkf__cta"
                  onClick={submit}
                  disabled={status === "loading"}
                >
                  {status === "loading" ? "Sending..." : "Send inquiry →"}
                </button>
              </div>
            </SplitStep>
          )}

          {/* DONE */}
          {key === "done" && (
            <div className="bkf__hero">
              <p className="bkf__eyebrow">Got it</p>
              <h2 className="bkf__headline">Your night is on its way.</h2>
              <p className="bkf__lede">
                Thanks, {name.trim().split(" ")[0] || "friend"}. I&rsquo;ll look at your space and dates
                and get back to you with a straight answer. Keep an eye on your inbox &mdash; there&rsquo;s
                a little thank-you waiting there too.
              </p>
              <div className="bkf__welcome-actions">
                <Link href="/music" className="bkf__cta">
                  Explore the music &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Chaptered progress, sticky to the bottom of the viewport (YouTube-style). */}
      {showChrome && (
        <div className="bkf__progress" aria-hidden="true">
          {Array.from({ length: REVIEW_INDEX }, (_, i) => (
            <span
              key={i}
              className={`bkf__chapter${step >= i + 1 ? " bkf__chapter--done" : ""}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// Full-width single-prompt layout: question pinned left, answer on the right.
function SplitStep({
  eyebrow,
  question,
  sub,
  children,
}: {
  eyebrow: string;
  question: string;
  sub?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bkf__split">
      <div className="bkf__split-prompt">
        <p className="bkf__step-eyebrow">{eyebrow}</p>
        <h2 className="bkf__q">{question}</h2>
        {sub && <p className="bkf__sub">{sub}</p>}
      </div>
      <div className="bkf__split-answer">{children}</div>
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  disabled,
  nextLabel = "Next",
}: {
  onBack: () => void;
  onNext: () => void;
  disabled?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="bkf__nav">
      <button type="button" className="bkf__back" onClick={onBack}>
        &larr; Back
      </button>
      <button type="button" className="bkf__cta" onClick={onNext} disabled={disabled}>
        {nextLabel} &rarr;
      </button>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="bkf__review-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
