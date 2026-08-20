import Link from "next/link";

// The two shapes a front cell comes in.
//
// BOTH ARE ONE ROW OF THE SAME TABLE. The difference is only what happens when
// you press one: a panel cell expands in place, a link cell leaves. They share a
// summary bar so the table reads as one object rather than as two lists that
// happen to be stacked.
//
// The panel is a native <details>, and that choice is doing real work. A
// JS-driven accordion would keep its contents out of the server HTML, or in it
// but hidden behind a state flag, and the whole point of putting release, video
// and post metadata on this page is that a crawler reads it off / without
// running anything. <details> ships its contents in the markup, open or shut,
// and browsers expose them to find-in-page and to assistive tech.
//
// The `name` attribute makes the set an EXCLUSIVE accordion natively: opening
// one closes the rest, with no state and no effect. That is not a nicety here,
// it is what keeps the promise that the page never scrolls -- two open panels
// would not fit, and front.css sizes the table on the assumption that at most one
// is open at a time.

const ACCORDION = "front-cell";

export function FrontPanelCell({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | null;
  children: React.ReactNode;
}) {
  return (
    <details className="front__cell front__cell--panel" name={ACCORDION}>
      <summary className="front__summary">
        <span className="front__label">{label}</span>
        {hint ? <span className="front__hint">{hint}</span> : null}
        <span className="front__chev" aria-hidden="true">
          +
        </span>
      </summary>
      <div className="front__panel">
        <div className="front__panel-inner">{children}</div>
      </div>
    </details>
  );
}

export function FrontLinkCell({
  label,
  hint,
  href,
}: {
  label: string;
  hint?: string | null;
  href: string;
}) {
  return (
    <Link className="front__cell front__cell--link" href={href}>
      <span className="front__summary">
        <span className="front__label">{label}</span>
        {hint ? <span className="front__hint">{hint}</span> : null}
        <span className="front__chev" aria-hidden="true">
          &#8594;
        </span>
      </span>
    </Link>
  );
}
