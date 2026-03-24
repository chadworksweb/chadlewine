"use client";

import { useState, useEffect } from "react";

interface Revision {
  id: string;
  revision_number: number;
  title: string;
  body: string;
  change_summary: string | null;
  created_at: string;
}

interface RevisionData {
  date_captured: string;
  published_at: string | null;
  created_at: string;
  revisions: Revision[];
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function RevisionTimeline({ slug }: { slug: string }) {
  const [data, setData] = useState<RevisionData | null>(null);
  const [open, setOpen] = useState(false);
  const [viewingRevision, setViewingRevision] = useState<Revision | null>(null);
  const [sliderValue, setSliderValue] = useState(0);

  useEffect(() => {
    if (!open || data) return;
    fetch(`/api/observations/${slug}/revisions`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (d.revisions.length > 0) {
          setSliderValue(d.revisions.length - 1);
        }
      });
  }, [open, slug, data]);

  function close() {
    setOpen(false);
    setViewingRevision(null);
  }

  const { revisions, date_captured, published_at } = data || { revisions: [], date_captured: "", published_at: null };
  const hasRevisions = revisions.length > 0;

  function handleSlider(e: React.ChangeEvent<HTMLInputElement>) {
    const idx = parseInt(e.target.value, 10);
    setSliderValue(idx);
    setViewingRevision(revisions[idx] || null);
  }

  return (
    <div className="rev-tip-wrap">
      <button
        className="rev-tip__trigger"
        onClick={() => setOpen(!open)}
        type="button"
      >
        Revision History <span className={`rev-tip__chevron${open ? " rev-tip__chevron--open" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="rev-tip">
          <div className="rev-tip__arrow" />
          {!data ? (
            <span className="rev-tip__row">Loading...</span>
          ) : (
            <>
              <div className="rev-tip__row">
                <span className="rev-tip__label">Captured</span>
                <span className="rev-tip__value">{formatDate(date_captured)}</span>
              </div>
              {published_at && (
                <div className="rev-tip__row">
                  <span className="rev-tip__label">Published</span>
                  <span className="rev-tip__value">{formatTimestamp(published_at)}</span>
                </div>
              )}
              {hasRevisions && (
                <div className="rev-tip__row">
                  <span className="rev-tip__label">Last edited</span>
                  <span className="rev-tip__value">{formatTimestamp(revisions[revisions.length - 1].created_at)}</span>
                </div>
              )}
              <div className="rev-tip__row">
                <span className="rev-tip__label">Revisions</span>
                <span className="rev-tip__value">{revisions.length}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
