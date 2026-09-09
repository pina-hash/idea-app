# 0104 The legacy portal's rulebook becomes a redirect, applied by hand

- Issued: 2026-09-09
- By: Mr. Pina. Written into the ledger retrospectively by prompt 0109, which is
  why the number sat as a gap between 0103 and 0105 for a day.
- Owns: nothing in `pina-hash/idea-app`. The whole of the work is one file in
  `mrpina-dev/IDEA`, a repository no session in this ledger can write to. This
  entry exists because the ledger is the list of what was DONE, not the list of
  what a session did, and an action nobody recorded is an action the next
  bundle re-plans.
- Migration permitted: no. Claims: none.
- Lands on: not this repository. `mrpina-dev/IDEA`, by hand, in the GitHub UI.
- Status: deployed
- Branch: none.
- Notes: `deployed` here is confirmed by reading the SERVED artifact, which is the
  only reading available: the redirect answers at
  `https://mrpina-dev.github.io/IDEA/IDEA-Blade_Rulebook_v2_2.html`, and prompt 0105
  independently fetched that portal's bytes the same day. The ledger's rule is
  never to advance a status on the strength of a REPORT, and that rule is kept:
  what is reported is why the work happened, not that it landed. This entry uses
  `##` prose sections, which one other entry in a hundred does, because the thing
  being recorded is an action in another repository and the interesting half is
  what it did NOT touch.

## What was done

The `mrpina-dev/IDEA` GitHub Pages portal carried its own copy of the IDEA-Blade
rulebook at `https://mrpina-dev.github.io/IDEA/IDEA-Blade_Rulebook_v2_2.html`. On
2026-09-09 Mr. Pina replaced that copy with a redirect to
`https://ideabosco.com/assignments/IDEA-Blade_Rulebook_v2_2`, which is the canonical
one, so an old bookmark, a printed QR code or a Classroom link minted last year now
lands on the current rulebook instead of a stale one.

**He did it by hand because two cloud sessions were refused write access to that
repository on the same day.** One was refused by the permission classifier at
`add_repo`; the other took a 403 on both `git push` and the GitHub MCP write. **The
first of those two is the only one this tree records** -- prompt 0105's history entry
says "`add_repo` for `mrpina-dev/IDEA` was denied in this session", which is a READ
refusal; the 403 on the write paths is Mr. Pina's report and nothing here can confirm
it. Both are generalised in `IDEA_instructions.md` 4.25 under "GitHub write access is
per repository": access to `pina-hash/idea-app` implies nothing whatever about
`mrpina-dev/IDEA`, and a prompt that plans around a session reaching the second one is
planning around a precondition that is simply false.

## Why it mattered

Prompt 0103 named this as the most damaging of its three staleness items and could
not fix it: the portal copy has no team entry, no Blade Handler, still says 2 lbs
where the current rulebook says 1.5 lbs, and still carries the 3+ processes and
3+ fasteners minimums that 0103 withdrew. A student following an old link read a
rulebook that contradicted the one their blade is actually inspected against, on
the weight limit. `docs/history/assignment-bundle-2026-09-10-p2jptc.md` states it;
`docs/history/idea113-export-doubling-fct5fc.md` measured the portal's served bytes
and confirmed it.

## What the redirect did NOT touch, and this is the half worth recording

**The portal's six `idea113-blade-*.html` files still answer at their FLAT URLs,
md5-identical to their pre-fix versions.** Prompt 0105 fetched all six over HTTPS
and md5'd them against this repository's pre-fix files on 2026-09-09:

```
-01     559b0cd5662072f8ec415b9bcf58c67b
-02     bb72e553efe757ee808201528f5ba792
-03     e2e39966e0d082f7020ce065bcd924fe
-04     7dc8f0e29e2eb74468497cd9fa40d6bf
-05     93a4b19d91dd7e662dcb100e21cb0cf1
-05-qr  31ebe06857defb8475d32ef4c7c4de9b
```

That table is the "pre-fix" baseline this entry means. After 0105 the two trees
disagree on `-01` only, because 0105 fixed the export-doubling defect in this
repository's `-01` and left the portal's alone; the other five agree because
neither tree changed them.

The portal's INDEX already stopped linking them before any of this: the root
`https://mrpina-dev.github.io/IDEA/` is a redirect notice whose only link points at
the Vercel host, and `/IDEA/assignments/idea113-blade-01.html` is a 404. But the
flat `/IDEA/idea113-blade-<nn>.html` paths are all still 200, so **a bookmark or a
QR code minted last year still reaches an unfixed copy of `-01`.** Redirecting the
rulebook closed one door and did not close those six. Deleting or redirecting them
is the same by-hand job in the same repository, and it is still owed.

## Not verified from this container, and it cannot be

Everything above about `mrpina-dev/IDEA` is Mr. Pina's report plus prompt 0105's
measurement of that portal's SERVED BYTES over HTTPS. The repository itself was
never read: `add_repo` was denied, and this session did not retry it. Whether the
redirect is an HTML meta refresh, a Pages configuration, or a rewritten file is not
recorded here because nothing here can see it. If that detail ever matters, it is a
question for the repository, not for this ledger.
