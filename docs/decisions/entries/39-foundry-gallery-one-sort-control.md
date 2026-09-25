# 39 The Foundry gallery is one list with one sort control, and the ranked board sections go

- Raised: 2026-09-25  By: feedback report R11 of the 2026-09-25 archive, filed by Mr. Pina.
- Status: DECIDED 2026-09-25 by Mr. Pina, by filing it: "there's a bunch of dead space on
  the page there's all these scroll bars it's kind of messy ... it should just be a
  drop-down that sorts every game on the website instead of all these different sections".
  **This reverses the shipped board design** (reports 30 and 32b, 0221, and CLAUDE.md's
  "THE GALLERY'S RANKED SECTIONS ARE THE LEADERBOARDS, AND THERE IS NO BOARD PAGE").
  Decision 35 is NOT reversed: every order still ranks apps, never students, and no new
  cross-app `players` column is added.
- Build: OPEN, in round 1 (ledger 0298).

## Default taken

One labelled native `<select>`: Most played (the default, per decision 04), Trending,
Played this week, Most hours, Most updated, Newest, Recently updated. `sortGallery` stays
the ONE comparator; `trending` and `new` join `FOUNDRY_GALLERY_SORTS` and `isGallerySort`
admits them, because the 375px-button-group reason for refusing them is gone with the
buttons. The play-coverage note (`FOUNDRY_PLAY_COVERAGE_NOTE`) still renders beside any
figure. The CLAUDE.md rule block is edited in place.
