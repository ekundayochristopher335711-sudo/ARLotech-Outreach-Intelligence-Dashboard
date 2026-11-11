# Website Analyzer Edge Function Contracts

These contracts match the canonical `website_analyses` schema. All functions are invoked from the authenticated browser through Supabase and must receive the caller's Supabase JWT. Server-side code must never expose `PAGESPEED_API_KEY`.

## 1. `pagespeed-insights`

**Request**
```json
{
  "url": "https://example.com",
  "strategy": "desktop",
  "categories": ["performance", "accessibility", "seo", "best-practices"]
}
```

**Response**
```json
{
  "id": "https://example.com/",
  "title": "Example Domain",
  "strategy": "desktop",
  "lighthouseResult": {
    "categories": {
      "performance": { "id": "performance", "title": "Performance", "score": 0.91, "scoreDisplayMode": "numeric", "description": "...", "auditRefs": [] },
      "accessibility": { "id": "accessibility", "title": "Accessibility", "score": 0.95 },
      "seo": { "id": "seo", "title": "SEO", "score": 0.88 },
      "best-practices": { "id": "best-practices", "title": "Best Practices", "score": 0.92 }
    },
    "audits": {
      "first-contentful-paint": {
        "id": "first-contentful-paint",
        "title": "First Contentful Paint",
        "description": "...",
        "score": 0.98,
        "scoreDisplayMode": "numeric",
        "displayValue": "1.2 s",
        "numericValue": 1200,
        "details": {}
      }
    },
    "fullPageScreenshot": {},
    "timing": {},
    "userAgent": {}
  },
  "loadingExperience": {},
  "originLoadingExperience": {}
}
```

**Errors**
```json
{ "error": "PAGESPEED_API_KEY is not configured" }
```

## 2. `extract-content`

**Request**
```json
{ "url": "https://example.com" }
```

**Response**
```json
{
  "url": "https://example.com",
  "finalUrl": "https://example.com/",
  "status": 200,
  "title": "Example Domain",
  "metaDescription": "...",
  "robots": "index,follow",
  "canonical": "https://example.com/",
  "lang": "en",
  "viewport": "width=device-width, initial-scale=1",
  "favicon": "/favicon.ico",
  "og": { "title": "...", "description": "..." },
  "twitter": {},
  "headings": { "h1": ["..."], "h2": [] },
  "wordCount": 120,
  "textExcerpt": "...",
  "links": { "total": 4, "internal": 2, "external": 2, "externalDomains": ["example.org"] },
  "images": { "total": 3, "missingAlt": 1 },
  "schema": ["{\"@type\":\"Organization\"}"],
  "h1Count": 1,
  "contacts": { "emails": ["hello@example.com"], "phones": ["+1 555 000 0000"] }
}
```

## 3. `analyze-website-visuals`

The function accepts an authenticated user's audit ID, verifies ownership, reads the saved screenshot objects from the private bucket, and submits screenshot image data to the configured OpenAI vision model. The API key remains a Supabase Edge Function secret.

**Request**
```json
{ "audit_id": "uuid" }
```

**Response**
```json
{
  "visual_audit": {
    "status": "completed",
    "visual_score": 86,
    "score_explanation": "A concise explanation based only on visible screenshot evidence.",
    "assessment": { "summary": "A concise visual summary." },
    "findings": [],
    "model": "gpt-4.1-mini",
    "analyzed_at": "2026-11-10T00:00:00.000Z",
    "analysis_version": "1.0",
    "screenshot_coverage": { "available": 2, "inspected": 2, "pages": [] }
  }
}
```

## Canonical `website_analyses` insert performed by `analyzeWebsite`

```json
{
  "user_id": "uuid",
  "prospect_id": "uuid or null",
  "website_url": "https://example.com",
  "overall_score": 89,
  "performance_score": 91,
  "accessibility_score": 95,
  "seo_score": 88,
  "best_practices_score": 92,
  "category_scores": { "performance": 91, "accessibility": 95, "seo": 88, "best-practices": 92 },
  "findings": [
    {
      "id": "ps-0",
      "title": "Lighthouse audit title",
      "evidence": "display value",
      "explanation": "audit description",
      "recommended_fix": "audit description",
      "potential_benefit": "",
      "priority": "high",
      "confidence": "high",
      "status": "open"
    }
  ],
  "positive_observations": [
    { "id": "pos-0", "title": "positive observation", "evidence": "measured or extracted evidence", "potential_benefit": "", "priority": "low" }
  ],
  "analysis_details": {
    "score_explanation": "Unified website score: 89/100 (Excellent).",
    "technical_score": {
      "methodology": "Weighted Lighthouse category score",
      "weights": { "performance": 30, "seo": 25, "accessibility": 25, "best-practices": 20 },
      "value": 91,
      "missing_categories": []
    },
    "unified_score": {
      "version": "unified-v1",
      "score": 89,
      "unrounded_score": 89.27,
      "provisional": false,
      "interpretation": "Very Good",
      "available_categories": ["visual_design", "performance", "seo", "accessibility", "best-practices"],
      "unavailable_categories": [],
      "breakdown": {
        "visual_design": { "score": 86, "configured_weight_percent": 40, "applied_weight_percent": 40, "weighted_contribution": 34.4 },
        "performance": { "score": 91, "configured_weight_percent": 18, "applied_weight_percent": 18, "weighted_contribution": 16.38 },
        "seo": { "score": 88, "configured_weight_percent": 15, "applied_weight_percent": 15, "weighted_contribution": 13.2 },
        "accessibility": { "score": 95, "configured_weight_percent": 15, "applied_weight_percent": 15, "weighted_contribution": 14.25 },
        "best-practices": { "score": 92, "configured_weight_percent": 12, "applied_weight_percent": 12, "weighted_contribution": 11.04 }
      }
    },
    "optimization_opportunities": [],
    "diagnostics": [],
    "screenshot_review": { "status": "completed", "pages": [] },
    "visual_audit": { "status": "completed", "visual_score": 86, "findings": [] }
  },
  "analysis_status": "completed",
  "error_message": null,
  "analysis_provider": "pagespeed",
  "analyzed_at": "2026-01-01T00:00:00.000Z"
}
```

New audits use AI Visual Design 40%, Performance 18%, SEO 15%, Accessibility 15%, and Best Practices 12%. The sum is rounded to a whole-number overall score. If one or more categories are unavailable, the score is provisional and the remaining category weights are normalized; missing values are never treated as zero or perfect. `technical_score` remains a separate Lighthouse-only value. Historical audits retain their stored score methodology.

## Security requirements

- Edge Functions must verify the Supabase JWT before calling external APIs.
- `PAGESPEED_API_KEY` must remain server-side only.
- `OPENAI_API_KEY` and `OPENAI_VISION_MODEL` are Supabase Edge Function secrets, not frontend variables. Stored screenshots are transmitted to the configured vision provider for analysis.
- URLs must be validated server-side, including blocking localhost, private IP ranges, internal hostnames, and cloud metadata addresses.
- Redirects must be revalidated against the same blocklist.
- PageSpeed responses must be validated before persistence.
- Database writes must respect RLS ownership checks.
