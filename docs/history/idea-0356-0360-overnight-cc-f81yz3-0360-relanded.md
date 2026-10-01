---
title: "0360 re-landed: the Bolt badge's charge beat crashed Chrome 154 on every classroom page that showed it"
date: 2026-10-01
branches: ["claude/idea-0356-0360-overnight-cc-f81yz3"]
migrations: []
subsystems: ["IDEA Classroom", "Profile", "Tournaments"]
---

The 2026-10-01 feedback round (`idea-0356-0360-overnight-cc-f81yz3-0360.md`)
was pushed as 900c76f4 and broke the classroom for some people within the
hour. Chrome showed "Can't open this page" with the code STATUS_BREAKPOINT on
`/classroom` and on everything under it, about a second after a page painted.
It hit two students first and then Mr. Pina, in Space White, while other
students in other themes had no trouble. b1f14288 reverted the client code
and kept migration 0230, and the site came back. This entry records the
cause and the re-land.

## The cause, measured

- **One keyframe.** The round redrew the badge emblems (report R16) and gave
  each one a short beat. The Bolt's `charge` beat animated the recessed face's
  `fill` to `color-mix(in srgb, currentColor 72%, transparent)`. **Chrome 154
  crashes the whole renderer when a CSS animation moves an SVG `fill` or
  `stroke` to a `color-mix()` that names `currentColor`.** On Windows a
  renderer CHECK failure is reported as STATUS_BREAKPOINT, which is the code
  on the screenshot.
- **Measured in Chrome 154.0.8037.92** (downloaded to the session scratchpad;
  the harness browser is Chromium 141), on bare pages:

  | Page | Chrome 154 |
  | --- | --- |
  | all eight emblems, the round's stylesheet | crash |
  | each emblem alone | bolt crashes, the other seven live |
  | one `path`, keyframe `fill: color-mix(in srgb, currentColor 72%, transparent)` | crash |
  | the same keyframe on `stroke` | crash |
  | the same keyframe with `#3a6` in place of `currentColor` | lives |
  | keyframe `fill: currentColor` | lives |
  | keyframe `color:` or `border-color:` to the same mix, on a `div` | lives |
  | a `transition` of `fill` between two such mixes | lives |
  | `fill: currentColor; fill-opacity: 0.22`, keyframe `fill-opacity: 0.72` | lives |

  Chromium 141 lives on every row, which is why no browser pass in this
  repository could have caught it.
- **And on the real route.** The round's own build (`vite build` at 900c76f4)
  was served against a mock Supabase in which one of three classes had voted
  the Bolt. Hovering the Bolt in the class strip on `/classroom` crashed
  Chrome 154. The same build with only the repair below, put through the
  same steps, ran the charge beat on both Bolts (`idea-badge-charge` in
  `document.getAnimations()`) and lived.
- **Why some people and not others.** It is data: a badge renders only for a
  class whose theme vote picked one, and only the Bolt's beat names the mix.
  A student in that class met it on every classroom page. On a class page the
  banner plays its beat on arrival, 440ms after paint, which is the "showed
  for a second". In the class strip and My Classes it plays on hover, and a
  pointer is usually resting where the last click was. An admin sees every
  class, so Mr. Pina met it too. The theme has nothing to do with it.
- **One thing the mock surfaced on the way.** The mock profile had no pathway,
  so the round's pathway picker covered the page and the first hover reached
  the picker, not the badge. A real student who has chosen a pathway never
  sees that overlay. The probe set one, which is what reproduced the crash.

## The repair

- `src/lib/tournaments/BadgeIcon.svelte`: the face is `fill: currentColor;
  fill-opacity: 0.22`, where it was `color-mix(in srgb, currentColor 22%,
  transparent)`, and the charge keyframe animates `fill-opacity: 0.72`. A mix
  with `transparent` in sRGB is the colour at that alpha, so the resting pixel
  is unchanged. Nothing else in the round moved: the re-land is 900c76f4's tree
  plus this file, the new test and the documents below.
- `tests/keyframe-paint-currentcolor.test.ts` sweeps every `@keyframes` block
  in `src/` (`.svelte` and `.css`) for a declaration whose value is a
  `color-mix()` naming `currentColor`. It asserts it parsed a real population
  (more than 100 keyframes, and exactly 16 in the badge renderer) and that it
  catches the shipped keyframe verbatim. Mutation: putting the crashing line
  back reddens it, naming the file and the keyframe; the file was restored
  from a copy (md5 `58c566ec`) and the sweep is green again. It does NOT see a
  value that reaches the mix through a custom property, and it does not sweep
  transitions, which were measured not to crash.
- `CLAUDE.md` gains the trap under DOM.

## Not verified

- Windows Chrome itself. The reproduction is Linux Chrome 154 and the
  production report is Windows Chrome. The exit code differs, the crash is
  the same renderer CHECK, and only the bare-page table above was measured.
- Whether other Chrome versions crash. 141 does not; nothing between 141 and
  154 was tried.
- The class page's arrival beat on the real route. The mock does not serve a
  class page (it 404s). The beat is the same keyframe, crashed on the bare
  page as `once`, and lived there after the repair.
