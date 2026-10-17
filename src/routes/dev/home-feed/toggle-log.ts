/**
 * THE HARNESS'S RECORD OF EVERY FOLD, KEPT OUTSIDE ANY COMPONENT (ledger 0396,
 * part 3). A module's state survives a client-side navigation, so the landing
 * page under ./class/ can read what the feed harness did before the link was
 * followed: one entry per `onToggle` call, in order. That is the instrument for
 * "a click on the class link never fires the fold": a link click that also
 * folded the card would leave one more entry here than the folds the spec made
 * on purpose, and the navigation that followed would hide it from every other
 * read. Dev harness only; nothing outside src/routes/dev/home-feed imports it.
 */
export const toggleLog: string[] = [];
