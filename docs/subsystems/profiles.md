# Profiles and identity customization

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). Profile columns, identity style, avatars, badges, preferences blobs. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

### Profiles

`profiles` carries `display_name`, `avatar` (`preset:<id>` | `upload:<path>` |
null -> Google `avatar_url` -> initials), and `preferences` (free-form JSONB).
The root `+layout.server.ts` loads it once as `userProfile` -- **a key no page
load shadows** -- so it is in `page.data` everywhere.
`src/lib/ProfileMenu.svelte` is mounted in every page header and reads it from
`$app/state`. Shared sign-out is `signOutEverywhere()` in `src/lib/profile.ts`.

**Storage uploads write only into the user's own `<uid>/` folder**, enforced by
Storage RLS, in every bucket that accepts a user upload.

#### IDENTITY CUSTOMIZATION -- one pure layer, two render sites, and a restraint

**A PERSON'S IDENTITY STYLE IS SIX FIELDS AND `$lib/identity-style.ts` IS THE
ONE IMPLEMENTATION OF WHAT THEY MEAN** (0220): a background, an accent, a badge,
a flourish and a tagline. It is the tournament layer's own registries and render
helpers with the type widened off `EntryStyle`, and
`$lib/tournaments/entry-styles.ts` RE-EXPORTS all of it -- so `accentOf`,
`backgroundCss`, `bannerInk`, `hasStyle`, `BADGES` and `ACCENT_PRESETS` are one
function object each, asserted by identity rather than by equality in
`tests/identity-style-shared.test.ts`. **Do not write a second copy under a
profile name.** Adding a badge or a flourish means editing that module AND
`0064` AND `0220`, in the same change.

- **THE COLUMNS ARE ON `profiles`, AND 0220 ADDS NO POLICY, NO GRANT AND NO
  FUNCTION.** `0001`'s "update own profile" / "teachers update any profile" pair
  is the whole write gate and "select own profile" / "teachers select all
  profiles" the whole read gate, exactly as `0038` (pathway) and `0045`
  (tour) rely on them. A `profile_styles` table would restate all four, which
  is a second authorization model for one person's identity. **If a change here
  ever needs a policy of its own, the shape was wrong** --
  `tests/db/profile-identity-style.test.ts` asserts the policy list is still
  the four.
- **WHICH MEANS VALIDATION IS THE DATABASE'S, AS CHECK CONSTRAINTS, NOT AN
  RPC'S.** A tournament style has one writer that validates before it inserts;
  a profile style is written by the student's own browser under RLS, so the
  constraints have to be complete rather than advisory. `backgroundCss`
  re-validates a third time where the value meets a style attribute.
- **AN IMAGE BACKGROUND IS REFUSED ON A PROFILE, AND THAT IS A DISCLOSURE
  DECISION RATHER THAN A CAP.** A tournament banner may carry one because its
  URL arrives through the RPC and names a bucket the student owns a folder in.
  A profile is written directly, so an image background is an ARBITRARY https
  URL every viewer's browser fetches automatically, on every surface that
  person appears on -- their IP and Referer handed to whatever host a classmate
  named. That is `resolveFigureSrc`'s same-origin rule in its second costume.
  Solid and gradient are colours and carry no request.
- **ONLY THE AMBIENT FLOURISHES ARE STORABLE.** An event flourish names a moment
  a tournament has and a profile does not. `PROFILE_FLOURISHES` is DERIVED by
  filtering on `kind`, never typed out, and the test reconciles it against
  0220's own constraint in both directions.
- **THE AVATAR TAKES THE ACCENT AND NOTHING ELSE; THE BANNER TAKES THE REST.**
  `Avatar.svelte` reads one field, as the ring it already draws -- one
  `border-color`, no extra node, no layer, no animation -- because a roster
  draws thirty of them and the stated performance budget is a six-to-eight-year
  -old school desktop. `IdentityBanner.svelte` carries the background, the
  badge, the tagline and the ambient flourish and is mounted where ONE person
  is shown. **Do not add a background wash, a badge pip or a flourish to the
  avatar**, and do not gate the banner on a `size` threshold: whether a surface
  wants a banner is the surface's call, not arithmetic's.
- **THE BANNER'S BACKGROUND IS A WASH OVER THE ROOM'S PLATE, NEVER A FILL UNDER
  THE TEXT, AND THAT IS MEASURED.** With the colour chosen freely,
  `bannerInk`'s two-value rule bottoms out at **1.90:1** for the name at full
  strength; max-contrast ink reaches only 3.98 and flips 35.7% of the colour
  space; a black scrim needs 0.60 alpha and still leaves the tagline at 3.90.
  At a 0.22 wash the ink is the room's own `--text-1` and the worst case is
  **5.73:1**, so legibility is a property of the construction. **`bannerInk` is
  therefore not called by `IdentityBanner`** -- it is still right for a surface
  that paints at full strength, which the tournament banner does. **THE 1.90:1
  FINDING IS THE TOURNAMENT BANNER'S TOO AND IS STILL OPEN**; fixing it changes
  what a projector renders mid-tournament and needs its own visual pass.
- **THE BADGE TAKES THE INK, NEVER THE ACCENT, because the accent and the
  background are TWO FREE COLOURS** and no pairing of two free colours can be
  guaranteed to contrast (measured: 2.11:1 for a red crown on amber). A badge is
  a glyph somebody chose to display, so it is READ and takes the text tier. The
  accent keeps the ring and the rule, which are decoration and which do clear
  where the shipping arrangement puts them -- 3.31:1 worst of the nine on a bare
  plate.
- **A CONTRAST CHECK CANNOT SEE A `::before` WASH.** `checks-visual.mjs` walks
  ANCESTORS for a background-color, so on a washed banner it reports the PAGE
  plate (measured 14.66:1 where the real ground governs) and passes for a reason
  nobody checked. The washed cases go through the `identity ink clears its own
  washed ground` probe in `tools/browser-verify/routes/avatars.mjs`, which
  composites the real computed values, scores EVERY gradient stop rather than a
  mean, and reports the count it examined.
- **SOMEBODY ELSE'S STYLE TRAVELS THROUGH THEIR SURFACE'S OWN RPC, and the
  client half is already built.** `AvatarSubject` carries the six columns
  structurally and `rosterSubject` / `gridStudentSubject` copy them across
  PRESERVING `undefined`, which is the pre-0220 payload and is not the same as
  a null somebody chose. No RPC projects them yet; each is a `select` widening
  in that subsystem's own lane, and the day one lands every consumer of
  `Avatar.svelte` renders it with no edit -- which is what 0179/0180 did for the
  avatar columns. `tests/identity-consumer-inheritance.test.ts` proves both
  directions on the real consumers. It used to also assert, from `git diff`,
  that 0289 had not edited them; that could only pass on 0289's own branch and
  was removed (ledger 0295).

**A SITE ADMIN CAN TURN A PROFILE PICTURE OFF, AND THE LOCK IS THE DATABASE'S
(0267, ledger 0392).** `profile_avatar_hide` snapshots `avatar` and
`avatar_url` into `profile_avatar_holds` and clears both, so every surface that
shows a picture (each reads the two columns live and copies them nowhere)
draws initials with no other function changed; `profile_avatar_restore` puts
the snapshot back exactly and releases the hold, which is kept, never deleted.
The `enforce_avatar_hold` trigger (the `enforce_role_change` pattern) refuses
the owner a change to either column while held, because the owner holds
table-level UPDATE. Every admin function asks `is_admin()` and answers a
non-admin like an address with no account. `$lib/avatar-moderation.ts` is the
one client vocabulary; `AvatarHoldControl` is the student page's control
(handed in only for an admin, absence is the mechanism) and
`AvatarHoldsConsole` is `/admin/avatars`; the profile menu replaces its picker
with `AVATAR_HELD_NOTE` while held. An uploaded file stays in the bucket.

**AND THE AVATAR PRESET SET IS APPEND-ONLY, FOR THE REASON `curriculum.ts`'s
`SECTIONS` IS.** `profiles.avatar` is free text holding `preset:<id>`, so every
id may sit in a real row and dropping or renaming one turns somebody's chosen
picture into an initials tile with nothing saying why.

- **`presetMarks` IS THE ONE IMPLEMENTATION OF "how a preset draws".**
  `Avatar.svelte` and `ProfileMenu.svelte`'s picker each carried their own
  `<path d={preset.d} />`, which was survivable while a preset was one path; a
  figurative mark makes two copies a cat with eyes beside a cat without them.
  `AvatarMark` carries an optional `fill`, `stroke`, `width` and `rotate`, and a
  filled mark says `currentColor` rather than a hex so a preset's colour is
  never written down twice.
- **A PRESET'S `fg` IS A GLYPH STROKE AND CARRIES THE 3:1 GRAPHICAL FLOOR, and
  two of the original eight did not clear it.** `gear` measured 2.57:1 and
  `wave` **1.33:1** on the portal grounds -- a picture that was very nearly not
  there. Repaired by `--acc-ink`'s rule, LIGHTNESS ONLY with the hue and
  saturation held. Anything added joins the pinned 62%/65% set, which is what
  lets the whole set clear together rather than one entry at a time.
- **THE TIERS ARE `geometric` / `creature` / `instrument`, and `undefined` means
  geometric** so the original eight needed no edit to gain one. The creature
  tier is the MASCOT PACK a student asked to add to, and its marks are ORIGINAL
  line drawings in the house format -- a photograph or a meme image is neither
  renderable as a 24x24 mark nor ours to ship.

**THE BADGE SET IS REDRAWN IN PLACE, NEVER RE-IDED (ledger 0360, report R16).**
`BADGES` ids are stored (0064, 0220, class votes), so the list is append-only;
the art (`faces`, `paths`, `details` and `solids`, in one `currentColor` ink) is
code and may change with no migration, and `paths` stays the non-empty OUTLINE.
`BadgeIcon`'s `motion` is `hover` (one beat when the nearest a, button, label or
`[role=button]` is hovered, keyboard-focused or pressed), `once` (draw then beat,
for a one-identity banner) or `none`; every beat runs one iteration, ends on no
transform and lives only inside `prefers-reduced-motion: no-preference`.
`tests/badge-art.test.ts` counts the gear's teeth and sweeps the stylesheet.

**"NO PATHWAY YET" IS AN ANSWER, NOT A VALUE (ledger 0360, report R18).**
`profiles.pathway` stays NULL; the answer is stored in `preferences.pathway`
through profile-io and holds until the next 1 August in Los Angeles.
`pathwayPromptWanted` in `$lib/pathway-choice` is the one rule of who is asked,
called by `PathwayPicker`, `HomeTour` and `HomeTourOffer`. A freshman is never
inferred from an email.

**`preferences` is a shared JSONB blob with several independent namespaces**
(`homepage`, `classroomFeed`, `classroomUnits`, `coinDesk`, `ideacad`, `classroom`,
`quickNote`, `pathway`, and `calendar`: the layers and classes a viewer switched off,
read by `readCalendarPrefs` and, for the phone link, by 0308's `_calendar_prefs`). Every
write goes through **`$lib/preferences/profile-io`**, which READS THE ROW FIRST and
merges one namespace, in one queue per tab (ledger 0297): a writer spreading the
page-load snapshot was measured erasing a sibling's write one click later (a folded
class card lost to a pinned app), so a direct `.update({ preferences` outside that
module and IdeaCAD's own read-first store is the defect, and
`tests/preferences-store.test.ts` sweeps for it. Each `classroom` group records
whether it follows the device or the account (`$lib/preferences/classroom.ts`). Every
write is a whole-blob **spread-merge**, so a sibling namespace can never be clobbered; every
read **validates values against their union** and DROPS an unrecognised one, so a
stored value can never put the UI in a state no branch renders. **A NESTED
NAMESPACE NEEDS THE MERGE AT EVERY LEVEL IT SHARES**: `ideacad` holds `panes`
(the chooser's layout) and `solid` (the direct modeler's store), and the
chooser's writer replaced the whole `ideacad` object until ledger 0296 made it
merge, which is the sibling clobbering this rule exists to prevent, one level
down.

**A preference stores a DEFAULT, never the entry itself.** Remembering the last
student, category or amount across sessions is how the wrong one gets charged.
**A preference shape migrates on READ**, in code, detected from the stored shape --
it needs no database migration.

---
