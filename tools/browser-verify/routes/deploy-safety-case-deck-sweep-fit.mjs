import { fitSweep } from './_fit-sweep.mjs';

/* SCOPED TO THE DECK PAGE, because the harness's own counters bar (Reset
   counters and its chips, src/routes/dev/deploy-safety/+layout.svelte) is still
   laid out UNDER the deck, which is `position: fixed; inset: 0` over the whole
   window. Swept from `body`, a deck-bar control that happened to land over a
   harness control the reader cannot even see read as an overlap: the longer
   "Feedback" word (2026-10-07) put the deck's report control over "Reset
   counters" at 375, 847px2 of a covered harness button. The deck viewer and its
   bar are what this sweep is about, and the page carries no harness bar. */
export default fitSweep('/dev/deploy-safety?case=deck', 'the deck viewer and its bar', { root: '.deck-page' });
