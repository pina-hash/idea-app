# 63 The Foundry's featured row fills itself when nobody has picked

- Raised: 2026-10-14  By: validation of report 415af89e (ledger 0381): the featured row decision 59 shipped drew nothing until an admin picked something, so the gallery still opened on no highlights.
- Status: DECIDED 2026-10-14 in the building session (ledger 0381). AMENDS decision 59 (foundry-schedule-collections-votes-featured), whose default was "with no picks there is no row".
- Decision: With no picks, the row still fills (up to six) from the top of Most played and Trending, skipping any app nobody has played or voted on. A gallery with no plays and no votes has no row, because a tied list has no top. Hand-picked apps still come first when there are any.
- Context: CLAUDE.md "THE GALLERY HAS TWO MORE CURATED SECTIONS"; `foundryFeaturedRow`.
