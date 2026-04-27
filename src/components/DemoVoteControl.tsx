"use client";

import { useState } from "react";
import "./DemoVoteControl.css";

type Phase = "idle" | "voting" | "needs_activation" | "done" | "error";

export function DemoVoteControl({
  songId,
  songTitle,
  songSlug,
  initialVoteCount,
  surfaced,
}: {
  songId: string;
  songTitle: string;
  songSlug: string;
  initialVoteCount: number;
  surfaced: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [voteCount, setVoteCount] = useState(initialVoteCount);
  const [voteIndex, setVoteIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitVote(
    activation_type: "free" | "share" | "payment",
    activation_payload?: Record<string, unknown>,
  ) {
    setPhase("voting");
    setError(null);
    try {
      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ song_id: songId, activation_type, activation_payload }),
      });
      const data = await res.json();
      if (res.status === 402) {
        setPhase("needs_activation");
        setVoteIndex(data.vote_index ?? null);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Vote failed");
        setPhase("error");
        return;
      }
      if (typeof data.demo_vote_count === "number") setVoteCount(data.demo_vote_count);
      setVoteIndex(data.vote_index ?? null);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vote failed");
      setPhase("error");
    }
  }

  async function handleShare() {
    const url = `${window.location.origin}/music/songs/${songSlug}`;
    const shareData = {
      title: `${songTitle} — Chad Lewine`,
      text: `Vote to push this demo: ${songTitle}`,
      url,
    };
    let shared = false;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        shared = true;
      } catch {
        // user cancelled — don't record
        return;
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        shared = true;
      } catch {
        return;
      }
    }
    if (shared) {
      await submitVote("share", { url });
    }
  }

  return (
    <div className="demo-vote">
      <div className="demo-vote__state">
        <span className="demo-vote__badge">
          {surfaced ? "Demo" : "Vaulted Demo"}
        </span>
        <span className="demo-vote__count">
          <strong>{voteCount}</strong> {voteCount === 1 ? "vote" : "votes"}
        </span>
      </div>

      {phase === "done" && (
        <div className="demo-vote__msg demo-vote__msg--ok">
          Vote recorded{voteIndex ? ` (#${voteIndex} from you)` : ""}. Vote again to keep pushing.
        </div>
      )}

      {phase === "error" && error && (
        <div className="demo-vote__msg demo-vote__msg--err">{error}</div>
      )}

      {phase !== "needs_activation" ? (
        <button
          type="button"
          className="demo-vote__btn"
          disabled={phase === "voting"}
          onClick={() => submitVote("free")}
        >
          {phase === "voting" ? "Voting…" : surfaced ? "Vote to push" : "Vote to surface"}
        </button>
      ) : (
        <div className="demo-vote__activations">
          <p className="demo-vote__prompt">
            You&rsquo;ve already voted. Push it further with an activation:
          </p>
          <div className="demo-vote__activation-row">
            <button
              type="button"
              className="demo-vote__btn demo-vote__btn--share"
              onClick={handleShare}
              disabled={phase === "voting" as Phase}
            >
              Share
            </button>
            <button
              type="button"
              className="demo-vote__btn demo-vote__btn--pay"
              disabled
              title="Payment activation coming soon"
            >
              Pay (soon)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
