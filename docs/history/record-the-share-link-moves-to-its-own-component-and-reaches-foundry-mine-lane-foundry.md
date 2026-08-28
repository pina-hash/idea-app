---
title: "The share link moves to its own component and reaches /foundry/mine (`lane/foundry-mine-share`, code only, no migration)"
date: 2026-08-26
branches: [lane/foundry-mine-share]
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 147
---

## The share link moves to its own component and reaches /foundry/mine (`lane/foundry-mine-share`, code only, no migration)

**Branch:** `lane/foundry-mine-share`. **Migration:** none.

### What changed

`/foundry/mine` now carries the same share control the gallery does: the
`/a/<app id>` URL as selectable text, a copy control beside it, and the sentence
saying that anyone with the link opens the app without signing in and that the
page carries no name, class or build notes. A student wants their own link more
than a visitor does, and it was only on the surface visitors read.

### It is an extraction, not a second copy

The control was written inline in `FoundryDetail`. What a second copy would have
duplicated is not markup: it is the PUBLICATION RULE that decides whether a link
exists, the SENTENCE about what the page carries, and a copy handler with a
timer and two effects behind it. `FoundryShare.svelte` holds all three and both
surfaces mount it.

**The sentence is the half that matters.** A surface that quietly lost it is one
where a student shares something without knowing what is on it, and nothing on
screen would report that.

`sectionClass` is the one prop that differs by host: the gallery's
`.fdy-detail-section` and `/foundry/mine`'s `.fdy-block` are shaped differently
and neither is the control's business.

### No link, three ways, all mirroring `/a/`'s own refusals

Nothing published (`publishedVersionOf` reads one column and finds nothing), the
app is hidden (`serveBundleFile` refuses outright), or no
`PUBLIC_FOUNDRY_APPS_ORIGIN`. In each case the section is absent rather than
disabled -- a control whose only outcome is a refusal must not be offered.

It sits ABOVE the editing surfaces on `/foundry/mine`, because once an app is
published this is what its owner comes back for; it renders nothing at all while
they are still building, so it pushes nothing down.

### Both harnesses now pass an apps origin

Neither could drive the control before, and the reason is the correct behaviour:
the local `.env` has no `PUBLIC_FOUNDRY_APPS_ORIGIN`, and unset removes the
frame AND the link. A literal in each harness is what makes both real.
`FoundryGallery` gained an `appsOrigin` pass-through, spread rather than always
bound, so undefined still means "use your own default" and the real route is
unchanged.

### Verified

Driven in a real Chromium at **1440 and 375**, on `/dev/foundry-forge`, whose
three fixtures are exactly the three link states:

| fixture | state | share sections |
| --- | --- | --- |
| Ember Clock | published, not hidden | **1** |
| Cold Start | nothing published | **0** |
| Shelved | hidden | **0** |

On the published one, at both widths: heading "Share this app"; URL
`https://apps.ideabosco.com/a/app-ember/`; the sentence verbatim; the URL
genuinely selectable (a `Range` over it returns the same string, so the copy
control is not the only way to get it); copy button 44px, passing its own
`elementFromPoint` hit test; pressing it put the URL on the real clipboard and
the live region read "Copied." Section order: **Share this app → Details →
Versions → Delete this app.** No horizontal overflow at either width
(1440/1440, 375/375). Zero page errors.

**The gallery was re-checked because the extraction touched it**, and this is
the check that would have caught a broken refactor: with an origin threaded in,
`/dev/foundry-gallery` renders **Share this app → About → How this was built**,
with the identical sentence and the same URL shape. Before the harness had an
origin the section was absent, which is correct but proves nothing -- an absence
explained by configuration is not a verification.

Suite **2540 passed, 113 files, 0 failures**; `svelte-check` 0 errors / 37
warnings (31 `state_referenced_locally`, 5 `css_unused_selector`, 1
`perf_avoid_nested_class`).

### NOT verified

- The real `/foundry/mine` and `/foundry` routes were not driven, because both
  need a session against a real project. What was driven is the two dev
  harnesses, which mount the identical components.
- No link was opened. That `/a/<app id>` actually serves without a session is
  the serving lane's property and was not re-tested here.

---

