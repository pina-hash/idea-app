---
title: "What this is"
date: 2026-06-20
branches: []
migrations: ["0038"]
subsystems: ["Platform & access"]
record_order: 1
---

## What this is

`idea-app` is the authenticated foundation for the unified **IDEA portal** at
Bosco Tech, and beyond that the foundation of the **Bosco Tech student
platform**: any Bosco Tech student can sign in, and every student is identified
by their pathway (see "Pathways (0038)" below). It will replace the existing
static IDEA site (GitHub Pages) over the coming phases. This repo is the new
home; the old static repo is separate.

- **Stack:** SvelteKit + Supabase + Vercel
- **Repo:** https://github.com/pina-hash/idea-app
  (intended home is the `mrpina-dev` account; transfer or move the remote there
  when that account is available)
- **Local path:** `C:\idea-app`
- **Production domain:** `ideabosco.com` is the **canonical** production domain.
  The Vercel default `idea-app-sage.vercel.app` is not canonical: `vercel.json`
  adds a platform-level 308 redirect from that host to the same path on
  `ideabosco.com` (host-matched, so it only fires for the vercel.app hostname).
  Any hardcoded absolute URL (OG tags, sitemap, robots) must use
  `https://ideabosco.com`, never the vercel.app host.

