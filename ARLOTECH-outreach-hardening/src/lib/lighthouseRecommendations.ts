const recommendations: Array<[RegExp, string]> = [
  [
    /redirect|multiple-page-redirects/i,
    'Choose one canonical HTTPS hostname and point HTTP, alternate-hostname, and trailing-slash variants directly to it. Update internal links to use the final URL and avoid redirect chains.',
  ],
  [
    /document-request-latency|server-response-time|time-to-first-byte/i,
    'Reduce origin response time by checking server-side work, database calls, and cache status for the affected page. Compare the document response time before and after the change.',
  ],
  [
    /network-dependency-tree|critical-request-chains/i,
    'Shorten the critical request chain: remove unnecessary dependencies, defer non-critical scripts, and preload only assets required for the initial render.',
  ],
  [
    /render-blocking/i,
    'For the listed CSS and script URLs, inline only above-the-fold critical CSS, defer non-critical JavaScript, and load remaining styles without blocking the first render.',
  ],
  [
    /image-delivery|uses-optimized-images|modern-image-formats/i,
    'Convert the listed images to appropriately sized WebP or AVIF variants, serve responsive dimensions, and preserve visual quality. Recheck the transferred bytes after deployment.',
  ],
  [
    /unused-javascript/i,
    'Use the listed script URLs to identify unused modules; remove them where possible and split or defer code that is not needed for the initial page view.',
  ],
  [
    /legacy-javascript/i,
    'Review the listed scripts and build targets; remove unnecessary legacy transforms or polyfills while preserving support for the browsers your visitors use.',
  ],
  [
    /forced-reflow/i,
    'Profile the listed script and DOM activity; batch layout reads before writes and avoid repeated geometry reads after DOM or style changes.',
  ],
  [
    /robots-txt|robots\.txt/i,
    'Serve a valid plain-text robots.txt at the site root. Remove malformed directives, keep each rule on its own line, and verify the resulting file with Google Search Console.',
  ],
  [
    /font-display/i,
    'Set an appropriate font-display value (usually swap or optional) for the listed fonts so text remains visible while font files load.',
  ],
  [
    /efficiently.*cache|uses-long-cache-ttl|cache-policy/i,
    'Set long-lived cache headers for versioned static assets and use content-hashed filenames so updated files can be cached safely.',
  ],
  [
    /minify-css/i,
    'Minify the listed CSS files in the production build and remove unused styles where practical; confirm the built assets, not only the source files, are optimized.',
  ],
  [
    /minify-javascript/i,
    'Enable production JavaScript minification and remove development-only code from the listed bundles; verify the deployed bundle size after rebuilding.',
  ],
]

export function lighthouseRecommendation(auditId: string, title: string) {
  const recommendation = recommendations.find(([pattern]) => pattern.test(auditId) || pattern.test(title))?.[1]
  if (recommendation) return recommendation

  return `Inspect the affected resources for “${title}” and correct the specific configuration or asset causing the measured Lighthouse result. Re-run the same test to verify the change.`
}
