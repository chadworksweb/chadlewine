<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet
  version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
  xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"
  exclude-result-prefixes="s image video">

  <xsl:output method="html" encoding="UTF-8" indent="yes" doctype-system="about:legacy-compat"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="robots" content="noindex,follow"/>
        <title>
          <xsl:choose>
            <xsl:when test="s:sitemapindex">Sitemap Index - chadlewine.com</xsl:when>
            <xsl:otherwise>Sitemap - chadlewine.com</xsl:otherwise>
          </xsl:choose>
        </title>
        <style>
          :root {
            --bg: #0a0a0b;
            --bg-elev: rgba(255,255,255,0.04);
            --bg-elev-2: rgba(255,255,255,0.06);
            --border: rgba(255,255,255,0.10);
            --text: #f5f5f5;
            --text-2: rgba(245,245,245,0.72);
            --text-3: rgba(245,245,245,0.50);
            --accent: #a78bfa;
            --green: #22c55e;
          }
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background: var(--bg);
            color: var(--text);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 14px;
            line-height: 1.5;
          }
          .wrap {
            max-width: 1100px;
            margin: 0 auto;
            padding: 32px 24px 64px;
          }
          .hd {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 12px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border);
            margin-bottom: 20px;
          }
          h1 {
            font-size: 22px;
            font-weight: 600;
            margin: 0 0 4px;
            letter-spacing: -0.01em;
          }
          .kicker {
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--accent);
            margin: 0 0 6px;
          }
          .sub {
            font-size: 13px;
            color: var(--text-2);
            margin: 0;
          }
          .count {
            font-size: 13px;
            color: var(--text-2);
            font-variant-numeric: tabular-nums;
          }
          .count strong {
            color: var(--text);
            font-weight: 600;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
          }
          th {
            text-align: left;
            font-weight: 500;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--text-3);
            padding: 10px 12px;
            border-bottom: 1px solid var(--border);
            background: var(--bg-elev);
          }
          td {
            padding: 10px 12px;
            border-bottom: 1px solid var(--border);
            vertical-align: top;
          }
          tr:hover td {
            background: var(--bg-elev);
          }
          .num {
            color: var(--text-3);
            font-variant-numeric: tabular-nums;
            width: 48px;
          }
          .lastmod, .freq, .pri {
            color: var(--text-2);
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
          }
          .pri {
            text-align: right;
            width: 70px;
          }
          .freq {
            width: 100px;
            text-transform: capitalize;
          }
          a {
            color: var(--text);
            text-decoration: none;
            border-bottom: 1px dashed var(--border);
          }
          a:hover {
            color: var(--accent);
            border-bottom-color: var(--accent);
          }
          .url-cell {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
          }
          .badge {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            padding: 1px 7px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            font-variant-numeric: tabular-nums;
          }
          .badge--img {
            background: rgba(167, 139, 250, 0.14);
            color: #c4b5fd;
          }
          .badge--vid {
            background: rgba(34, 197, 94, 0.14);
            color: #86efac;
          }
          .footer {
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid var(--border);
            font-size: 11px;
            color: var(--text-3);
            display: flex;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
          }
          .footer a { font-size: 11px; }
          @media (max-width: 640px) {
            .wrap { padding: 20px 14px 48px; }
            .lastmod, .freq, .pri { display: none; }
            th.lastmod-h, th.freq-h, th.pri-h { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="wrap">
          <xsl:choose>
            <xsl:when test="s:sitemapindex">
              <xsl:call-template name="sitemap-index"/>
            </xsl:when>
            <xsl:otherwise>
              <xsl:call-template name="urlset"/>
            </xsl:otherwise>
          </xsl:choose>
          <div class="footer">
            <xsl:if test="s:urlset">
              <a href="/sitemap.xml">&#8592; Back to sitemap index</a>
            </xsl:if>
            <a href="/admin/settings/sitemaps">Admin view</a>
          </div>
        </div>
      </body>
    </html>
  </xsl:template>

  <xsl:template name="sitemap-index">
    <div class="hd">
      <div>
        <p class="kicker">chadlewine.com</p>
        <h1>Sitemap Index</h1>
      </div>
      <div class="count">
        <strong><xsl:value-of select="count(s:sitemapindex/s:sitemap)"/></strong> sub-sitemaps
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Sitemap</th>
          <th class="lastmod-h">Last modified</th>
        </tr>
      </thead>
      <tbody>
        <xsl:for-each select="s:sitemapindex/s:sitemap">
          <tr>
            <td class="num"><xsl:value-of select="position()"/></td>
            <td>
              <a href="{s:loc}">
                <xsl:value-of select="s:loc"/>
              </a>
            </td>
            <td class="lastmod">
              <xsl:value-of select="substring(s:lastmod, 1, 10)"/>
            </td>
          </tr>
        </xsl:for-each>
      </tbody>
    </table>
  </xsl:template>

  <xsl:template name="urlset">
    <div class="hd">
      <div>
        <p class="kicker">chadlewine.com</p>
        <h1>Sitemap</h1>
      </div>
      <div class="count">
        <strong><xsl:value-of select="count(s:urlset/s:url)"/></strong> URLs
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>URL</th>
          <th class="lastmod-h">Last modified</th>
          <th class="freq-h">Frequency</th>
          <th class="pri-h">Priority</th>
        </tr>
      </thead>
      <tbody>
        <xsl:for-each select="s:urlset/s:url">
          <tr>
            <td class="num"><xsl:value-of select="position()"/></td>
            <td>
              <div class="url-cell">
                <a href="{s:loc}">
                  <xsl:value-of select="s:loc"/>
                </a>
                <xsl:if test="count(image:image) &gt; 0">
                  <span class="badge badge--img">img <xsl:value-of select="count(image:image)"/></span>
                </xsl:if>
                <xsl:if test="count(video:video) &gt; 0">
                  <span class="badge badge--vid">vid <xsl:value-of select="count(video:video)"/></span>
                </xsl:if>
              </div>
            </td>
            <td class="lastmod">
              <xsl:value-of select="substring(s:lastmod, 1, 10)"/>
            </td>
            <td class="freq">
              <xsl:value-of select="s:changefreq"/>
            </td>
            <td class="pri">
              <xsl:value-of select="s:priority"/>
            </td>
          </tr>
        </xsl:for-each>
      </tbody>
    </table>
  </xsl:template>

</xsl:stylesheet>
