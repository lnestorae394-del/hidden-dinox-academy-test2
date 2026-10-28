"use strict";

/** Render the existing academy login page at / without redirecting to index.html. */
function renderRootLoginHtml(html) {
  if (typeof html !== "string") throw new TypeError("html must be a string");
  // Resolve the login page's relative assets from /academy/ while keeping the
  // visible document URL at /. Client-side stage transitions use absolute URLs.
  let output = html.replace(/<head\b([^>]*)>/i, '<head$1>\n  <base href="/academy/">');
  // The logo should return to the clean root route, not expose index.html.
  output = output.replace(/(<a\b[^>]*class="brand"[^>]*href=")index\.html("[^>]*>)/i, "$1/$2");
  return output;
}

module.exports = { renderRootLoginHtml };
