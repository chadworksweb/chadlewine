import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";
import {
  getFrontRelease,
  getFrontVideo,
  getFrontPost,
  getFrontDiscography,
} from "@/lib/front-data";
import { FrontPanelCell, FrontLinkCell } from "@/components/front/FrontCell";
import { FrontSubscribe } from "@/components/front/FrontSubscribe";
import { FrontVideoPlayer } from "@/components/front/FrontVideoPlayer";
import { FrontJsonLd } from "@/components/front/FrontJsonLd";
import { FrontFoldSizer } from "@/components/front/FrontFoldSizer";
import { FrontExit } from "@/components/front/FrontExit";
import { frontDate, frontDuration } from "@/components/front/format";

export const revalidate = 60;

// Where VIEW FULL SITE goes.
//
// The animatic homepage, moved to /home at cutover so the front page could take
// the root. FrontExit hard-navigates to it: the hero's boot script stamps
// ha-anim on <html> before first paint and a client-side navigation never runs
// it.
const FULL_SITE_HREF = "/home";

// The canonical self-description, reused rather than rewritten.
//
// The same sentence is already the root layout's meta description, the summary
// in llms.txt and the WebSite node's description in SiteJsonLd. A door that
// introduced a fourth wording would give an answer engine four slightly
// different answers to "what is this site" and no way to pick.
const STANDFIRST =
  "Chad Lewine is a metaphysical artist creating and distributing original music, art and thoughts to empower the individual and the collective.";

const DEFAULT_METADATA: Metadata = {
  title: { absolute: "Chad Lewine" },
  description: STANDFIRST,
  alternates: { canonical: "https://chadlewine.com/" },
};

export async function generateMetadata(): Promise<Metadata> {
  // Reads the "/" row. This IS the homepage; the full site reads "/home".
  return mergeMetadata("/", DEFAULT_METADATA);
}

// The post artwork is handed to CSS as a custom property, which means it is
// interpolated into a url() token rather than into an attribute. A value
// carrying a quote, a paren or a semicolon could close that token early and
// inject declarations, so only a plain absolute URL is accepted and anything
// else drops the background rather than being escaped into something almost
// safe. The paths in this column are CDN URLs, so the guard costs nothing real.
function cssUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!/^(https:\/\/|\/)[^"'()\s;]+$/.test(path)) return null;
  return `url("${path}")`;
}

export default async function FrontPage() {
  const [release, video, post, discography] = await Promise.all([
    getFrontRelease(),
    getFrontVideo(),
    getFrontPost(),
    getFrontDiscography(),
  ]);

  const releaseDate = frontDate(release?.releaseDate);
  const videoDate = frontDate(video?.publishedAt);
  const postDate = frontDate(post?.dateCaptured);
  const videoLength = frontDuration(video?.durationSeconds);

  // Only set when there is artwork; the CSS drops the whole layer when the
  // property is absent, rather than veiling a page that has no image under it.
  const postBg = cssUrl(post?.artPath);

  return (
    <div
      className="front"
      style={postBg ? ({ "--f-post-bg": postBg } as React.CSSProperties) : undefined}
    >
      <FrontJsonLd release={release} video={video} post={post} />
      <FrontFoldSizer />

      <header className="front__head">
        {/* The wordmark carries the h1. On a brand front door that is the
            correct heading: / ranks for the name, and inventing a keyword
            headline to sit above it would be writing for a crawler rather than
            for the person who typed the name in.

            THE LOGO IS Nav.tsx's, LIFTED WHOLE. Same element order, same class
            names, so it picks up .site-nav__logo, .site-nav__logo-frame,
            .logo-shape and .site-nav__logo-text out of global.css untouched,
            including the hover shimmer that migrates the blocks outward. An
            earlier pass here rebuilt it at 0.85em and dropped the frames; at
            that size the shaded blocks stop reading as a gradient and land as
            little staples, which was a sizing mistake, not a reason to lose
            them.

            The block characters are written as entities because this repo is
            ASCII-only in code. They parse to the identical four glyphs the nav
            renders; nothing about the output differs.

            A span, not a Link. In the nav the logo is the way home; on the
            front page you are already home, and a self-link is a dead control
            for anyone tabbing through. */}
        <h1 className="front__wordmark">
          <span className="site-nav__logo">
            <span className="site-nav__logo-frame site-nav__logo-frame--left" aria-hidden="true">
              <span className="logo-shape">&#9617;</span><span className="logo-shape">&#9618;</span><span className="logo-shape">&#9619;</span><span className="logo-shape">&#9608;</span>
            </span>
            <span className="site-nav__logo-text">Chad Lewine</span>
            <span className="site-nav__logo-frame site-nav__logo-frame--right" aria-hidden="true">
              <span className="logo-shape">&#9608;</span><span className="logo-shape">&#9619;</span><span className="logo-shape">&#9618;</span><span className="logo-shape">&#9617;</span>
            </span>
          </span>
        </h1>
      </header>

      <div className="front__table">
        <FrontPanelCell label="Latest Release" hint={release?.title ?? null}>
          {release ? (
            <div className="front__media front__media--stacks">
              {release.coverPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="front__art"
                  src={release.coverPath}
                  alt={release.coverAlt || `${release.title} cover art`}
                />
              ) : null}
              <div className="front__body">
                <p className="front__title">{release.title}</p>
                <p className="front__meta">
                  {[
                    release.releaseType,
                    releaseDate,
                    release.trackCount ? `${release.trackCount} tracks` : null,
                  ]
                    .filter(Boolean)
                    .join("  /  ")}
                </p>
                {release.summary ? <p className="front__text">{release.summary}</p> : null}
                <Link className="front__go" href={release.href}>
                  Listen to {release.title}
                </Link>
              </div>
            </div>
          ) : (
            <p className="front__text">Nothing released yet.</p>
          )}
        </FrontPanelCell>

        <FrontPanelCell label="Latest Video" hint={video?.title ?? null}>
          {video ? (
            <div className="front__media front__media--stacks">
              <div className="front__stage">
                <FrontVideoPlayer
                  src={video.embedSrc}
                  poster={video.thumbnail}
                  title={video.title}
                />
              </div>
              <div className="front__body">
                <p className="front__title">{video.title}</p>
                <p className="front__meta">
                  {[videoDate, videoLength].filter(Boolean).join("  /  ")}
                </p>
                {video.description ? (
                  <p className="front__text">{video.description}</p>
                ) : null}
                <Link className="front__go" href={video.href}>
                  Open the video page
                </Link>
              </div>
            </div>
          ) : (
            <p className="front__text">No video published yet.</p>
          )}
        </FrontPanelCell>

        <FrontPanelCell label="Latest Post" hint={post?.title ?? null}>
          {post ? (
            /* No featured image in here. It is the page's background (see
               --f-post-bg on .front), and printing it again inside the panel
               put the picture on top of a full-bleed copy of itself. */
            <div className="front__body">
              <p className="front__kind">
                {post.kind === "journal" ? "Journal" : "Observation"}
              </p>
              <p className="front__title">{post.title}</p>
              {postDate ? <p className="front__meta">{postDate}</p> : null}
              {post.lede ? <p className="front__text">{post.lede}</p> : null}
              <Link className="front__go" href={post.href}>
                Read the whole thing
              </Link>
            </div>
          ) : (
            <p className="front__text">Nothing posted yet.</p>
          )}
        </FrontPanelCell>

        {/* A panel now rather than a link, because it has something to show.
            The covers are PICTURES ONLY, with no link of their own: three
            competing routes into three records is not what this cell is for,
            and the one link it does carry says how many records are not on
            screen, which is the reason to press it. */}
        <FrontPanelCell label="Discography" hint="Every release">
          {discography.covers.length > 0 ? (
            <>
              <div className="front__covers">
                {discography.covers.map((cover) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={cover.slug}
                    className="front__cover"
                    src={cover.coverPath}
                    alt={cover.coverAlt || `${cover.title} cover art`}
                  />
                ))}
              </div>
              <div className="front__more">
                {discography.more > 0 ? (
                  <p className="front__more-count">+ {discography.more} more</p>
                ) : null}
                <Link className="front__go" href="/discography">
                  View all
                </Link>
              </div>
            </>
          ) : (
            <Link className="front__go" href="/discography">
              See the discography
            </Link>
          )}
        </FrontPanelCell>
        {/* The sentence used to sit under the masthead as a standfirst. It is
            the site's canonical self-description -- the same wording as the
            root meta description, llms.txt and the WebSite node -- and it
            answers "who is doing this", so it belongs behind the cell that
            asks. A crawler still reads it either way: the panel's contents
            ship in the server HTML whether or not it is opened. */}
        <FrontPanelCell label="About" hint="Who is doing this">
          <div className="front__media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="front__portrait"
              src="/images/super-individual/chad-lewine_the-deprogrammer_blue-glow.webp"
              alt="Chad Lewine, the Deprogrammer"
            />
            <div className="front__body">
              <p className="front__text">{STANDFIRST}</p>
              <Link className="front__go" href="/chad-lewine">
                More about Chad Lewine
              </Link>
            </div>
          </div>
        </FrontPanelCell>

        <FrontPanelCell label="Subscribe" hint="Where I am headed">
          <FrontSubscribe />
        </FrontPanelCell>
      </div>

      {/* Not next/link, and not a bare <a> either. FrontExit keeps the hard
          navigation the hero's pre-paint boot script requires, and plays the
          wipe before it. See that component for both halves of the why. */}
      <FrontExit href={FULL_SITE_HREF}>
        <span className="front__cta-text">View Full Site</span>
        <span className="front__cta-chev" aria-hidden="true">
          &#8594;
        </span>
      </FrontExit>
    </div>
  );
}
