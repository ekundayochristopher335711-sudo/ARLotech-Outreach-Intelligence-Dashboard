# Website Analyzer Edge Function Contracts

These contracts match the canonical `website_analyses` schema. All functions are invoked from the authenticated browser through Supabase and must receive the caller's Supabase JWT. Server-side code must never expose `PAGESPEED_API_KEY` or `GEMINI_API_KEY`.

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

## 3. `gemini-analysis`

**Request**
```json
{
  "url": "https://example.com",
  "content": { "...": "ExtractedContent from extract-content" },
  "pagespeed": { "...": "PageSpeedResult from pagespeed-insights" },
  "model": "gemini-2.0-flash"
}
```

**Response**
```json
{
  "text": "raw model output",
  "parsed": {
    "summary": "short overall summary",
    "score_explanation": "why the score is what it is",
    "recommendations": ["actionable recommendation 1"],
    "seo_notes": ["seo-specific note 1"],
    "content_notes": ["content-specific note 1"],
    "positive_observations": ["positive 1"]
  },
  "model": "gemini-2.0-flash"
}
```

## Canonical `website_analyses` insert performed by `analyzeWebsite`

```json
{
  "user_id": "uuid",
  "prospect_id": "uuid or null",
  "website_url": "https://example.com",
  "overall_score": 87,
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
    { "id": "pos-0", "title": "positive observation", "evidence": "AI-generated", "potential_benefit": "", "priority": "low" }
  ],
  "ai_analysis": { "summary": "...", "recommendations": ["..."] },
  "analysis_status": "completed",
  "error_message": null,
  "analysis_provider": "pagespeed+gemini",
  "analyzed_at": "2026-01-01T00:00:00.000Z"
}
```

## Security requirements

- Edge Functions must verify the Supabase JWT before calling external APIs.
- `PAGESPEED_API_KEY` and `GEMINI_API_KEY` must remain server-side only.
- URLs must be validated server-side, including blocking localhost, private IP ranges, internal hostnames, and cloud metadata addresses.
- Redirects must be revalidated against the same blocklist.
- PageSpeed and Gemini responses must be validated before persistence.
- Database writes must respect RLS ownership checks.
