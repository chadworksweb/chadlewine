export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer id="site-footer" className="site-footer">
      <div className="site-footer__inner">
        <span className="site-footer__tagline">Chad Lewine</span>
        <span className="site-footer__copyright">© {year}</span>
      </div>
    </footer>
  );
}
