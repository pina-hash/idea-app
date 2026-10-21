/**
 * THE STOCKS THE `/dev/coin-stocks` HARNESS DRAWS, AND THE ONE PLACE THEIR
 * COUNT COMES FROM (ledger 0425).
 *
 * WHY THIS FILE EXISTS. The harness used to list its stocks inline and
 * `tools/browser-verify/routes/coin-stocks.mjs` pinned "four stocks" and "a
 * chart each, the index too" as the literals 4 and 5. Ledger 0421 added three
 * area stocks to the harness and touched neither number, so from then on the
 * spec failed on every tree (7 cards against 4, 8 charts against 5) and read
 * as a regression nobody had made. The page and the spec now read this list,
 * so a stock added tomorrow moves both, the way `src/routes/dev/marks/mark-roster.js`
 * does for the marks. Plain `.js` with JSDoc for the same reason as that
 * file: the spec loads it through Node's own ESM loader.
 */

/**
 * @typedef {object} RosterStock
 * @property {string} id
 * @property {'index' | 'class' | 'foundry' | 'gauntlet' | 'area'} kind
 * @property {string} ticker
 * @property {string} name
 * @property {[number, number] | [number, number, number] | null} walk The seeded price walk (seed, start, hold every n), or null for the index, which is made from the others.
 * @property {boolean} inIndex Whether the index is the mean of this stock's moves.
 */

/** @type {readonly RosterStock[]} */
export const STOCK_ROSTER = [
	{ id: 'idea', kind: 'index', ticker: 'IDEA', name: 'IDEA index', walk: null, inIndex: false },
	{ id: 'class:s-a', kind: 'class', ticker: 'IDEA100B1', name: 'IDEA100 Block 1', walk: [7, 10.4], inIndex: true },
	{ id: 'class:s-b', kind: 'class', ticker: 'IDEA209HB4', name: 'IDEA209H Block 4', walk: [19, 9.4, 9], inIndex: true },
	{ id: 'foundry', kind: 'foundry', ticker: 'FNDRY', name: 'IDEA Foundry', walk: [31, 10.6], inIndex: true },
	{ id: 'gauntlet', kind: 'gauntlet', ticker: 'GNTLT', name: 'GAUNTLET', walk: [43, 11, 6], inIndex: true },
	{ id: 'area:classroom', kind: 'area', ticker: 'CLASS', name: 'IDEA Classroom', walk: [55, 10.2], inIndex: false },
	{ id: 'area:market', kind: 'area', ticker: 'MARKT', name: 'IDEA Market', walk: [67, 9.8, 7], inIndex: false },
	{ id: 'area:feedback', kind: 'area', ticker: 'FEED', name: 'Feedback', walk: [79, 10], inIndex: false }
];

/**
 * What the board draws from the roster: one card per stock that is not the
 * index (the index has its own panel), and one chart per stock, the index's
 * included.
 */
export const ROSTER_COUNTS = {
	cards: STOCK_ROSTER.filter((s) => s.kind !== 'index').length,
	charts: STOCK_ROSTER.length
};
