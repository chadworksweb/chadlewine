import Link from "next/link";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer id="site-footer" className="site-footer">
      <div className="site-footer__inner">
        <span className="site-footer__tagline">Chad Lewine</span>
        <div className="site-footer__links">
          <Link href="/archive/xanga" className="site-footer__link">
            Xanga Archive
          </Link>
          <span className="site-footer__copyright">© {year}</span>
        </div>
      </div>
    </footer>
  );
}
