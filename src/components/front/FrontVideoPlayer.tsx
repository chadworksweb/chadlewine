"use client";

import { useState } from "react";

// A facade, not a player.
//
// The poster and the title are server HTML; the provider's iframe is only
// created once someone asks for it. Three reasons, in order of weight:
//
//   1. This cell sits on the site's front door, which is now the page every
//      visitor loads first. Mounting a video iframe there would put a
//      third-party connection, its player bundle and its cookies in front of
//      every single arrival, including the ones who came to read one post.
//   2. Consent. An iframe that loads before anyone has touched anything is a
//      third party set loose ahead of the banner, which is the exact problem
//      the fonts were pulled in-house to fix in July.
//   3. The panel is at most a few hundred pixels tall. An iframe that boots
//      inside a collapsed <details> measures itself against a zero-height box
//      and comes back wrong.
//
// Opening the <details> is NOT the trigger. A reader expanding the cell to read
// the description has not asked to stream anything.

export function FrontVideoPlayer({
  src,
  poster,
  title,
}: {
  src: string | null;
  poster: string | null;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (!src) {
    return poster ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="front__video-poster" src={poster} alt="" loading="lazy" />
    ) : null;
  }

  if (playing) {
    return (
      <iframe
        className="front__video-frame"
        src={src}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  return (
    <button
      type="button"
      className="front__video-facade"
      onClick={() => setPlaying(true)}
      aria-label={`Play ${title}`}
    >
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="front__video-poster" src={poster} alt="" loading="lazy" />
      ) : null}
      <span className="front__video-play" aria-hidden="true">
        &#9658;
      </span>
    </button>
  );
}
