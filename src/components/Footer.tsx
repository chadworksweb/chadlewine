import Link from "next/link";
import { ManageCookiesButton } from "@/components/ManageCookiesButton";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer id="site-footer" className="site-footer">
      <div className="site-footer__inner">
        <span className="site-footer__tagline">Chad Lewine</span>
        <div className="site-footer__copyright-group">
          <Link href="/contact" className="site-footer__link">Contact</Link>
          <Link href="/terms-of-service" className="site-footer__link">Terms of Service</Link>
          <Link href="/privacy-policy" className="site-footer__link">Privacy Policy</Link>
          <Link href="/data-request" className="site-footer__link">DSAR</Link>
          <ManageCookiesButton className="site-footer__link">Cookies Settings</ManageCookiesButton>
          <span className="site-footer__copyright">© {year}</span>
        </div>
      </div>
    </footer>
  );
}
