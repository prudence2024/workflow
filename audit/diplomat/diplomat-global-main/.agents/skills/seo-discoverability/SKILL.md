---
name: seo-discoverability
description: SEO audit covering sitemap, robots.txt, llms.txt, metadata, structured data, OpenGraph, Twitter cards, canonical URLs, and AI discoverability. Use when auditing website visibility and search engine readiness.
version: 1.0.0
source: Adapted from Prudence Codex visibility skill
---

# SEO & Discoverability

Audit and verify website visibility for search engines and AI crawlers.

## Sitemap Audit
- HTTP status and content type
- URL count vs actual content
- Static public pages included
- Product URLs included
- Blog post URLs included
- CMS page URLs included
- Category URLs included
- Draft/private content excluded
- lastmod timestamps
- Production domain correct

## Robots.txt
- User-agent rules
- Allow/Disallow paths
- Sitemap declaration
- Crawl-delay (if needed)

## LLMS.txt
- HTTP status
- Content accuracy
- Production URLs correct
- No private data exposed
- No stale content

## Metadata
- Title tags (unique, descriptive)
- Meta descriptions (unique, compelling)
- OpenGraph (title, description, image, url, type)
- Twitter cards (card, title, description, image)
- Canonical URLs
- Favicon
- Schema.org structured data

## Content Quality
- No duplicate titles
- No duplicate descriptions
- No empty meta tags
- No placeholder content
- No broken links (sampled)

## AI Discoverability
- llms.txt present and accurate
- Structured data helps AI understanding
- No AI-blocking robots rules

## Workflow
1. Runtime-test all endpoints
2. Compare sitemap URLs against DB content
3. Verify metadata on key pages
4. Check for common SEO issues
5. Generate findings report
6. Fix critical gaps
