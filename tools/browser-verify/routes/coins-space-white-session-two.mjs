/**
 * The IDEA Coin Ledger after IDEA Coin V2 session two (ledger 0385), on Space
 * White: the champion card's rim, the Print key at desktop width, the role
 * badges and the reported coins on hand.
 *
 * THE RIM. The dark themes draw the champion's rim as an animated glow over a
 * 2px transparent border; Space White turns glows off, so the border showed
 * the card's own face and the champion looked like every other card. The rim
 * is a real gold border there now, and what is measured is the border's own
 * computed colour and width, not the pseudo-element (which is not drawn).
 *
 * THE PRINT KEY. It wrapped onto two lines at 1440 because it could shrink in
 * the filter row. The label's line boxes are counted through a Range (the key's
 * own height is its 44px floor and says nothing about wrapping).
 *
 * Both fixture rows that carry the new columns are named in
 * src/routes/dev/coins/fixture.ts: ID_ADA holds a role, ID_WALKUP reported
 * coins on hand.
 */
export default {
	path: '/dev/coins-space-white-session-two',
	aliasOf: '/dev/coins?theme=space-white',
	label: 'IDEA Coin Ledger on Space White: champion rim, Print key, role badges, coins on hand',
	settleMs: 1500,
	presence: [
		{ selector: '.coin-card.rank-1', label: 'one champion card', expectPresent: 1, maxPresent: 1 },
		{ selector: '.coin-card .role-badge', label: 'a role badge on a card', expectPresent: 1 },
		{ selector: '.coin-card .coin-onhand', label: 'a coins-on-hand line on a card', expectPresent: 1 }
	],
	contrast: [
		{ selector: '.coin-card .coin-onhand', label: 'the coins-on-hand line', min: 4.5 },
		{ selector: '.coin-card .role-badge', label: 'the role badge', min: 4.5 }
	],
	textContains: [
		{
			selector: '.coin-card .coin-onhand',
			label: 'the reported count names its date',
			must: ['coins on hand', 'reported']
		}
	],
	orderResult: [
		{
			label: 'the champion card has a visible gold rim on Space White',
			evaluate:
				'() => { const c = document.querySelector(".coin-card.rank-1"); if (!c) return ["NO CHAMPION"]; const s = getComputedStyle(c); const gold = getComputedStyle(document.documentElement).getPropertyValue("--gold").trim(); const probe = document.createElement("i"); probe.style.color = gold; document.body.appendChild(probe); const want = getComputedStyle(probe).color; probe.remove(); return [s.borderTopStyle === "solid" && parseFloat(s.borderTopWidth) >= 2 && s.borderTopColor === want ? "gold rim" : "rim is " + s.borderTopWidth + " " + s.borderTopStyle + " " + s.borderTopColor + " want " + want]; }',
			expected: ['gold rim']
		},
		{
			label: 'the Print key holds its label on one line',
			evaluate:
				'() => { const b = document.querySelector(".print-lb-btn"); if (!b) return ["NO PRINT KEY"]; const r = document.createRange(); r.selectNodeContents(b); const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))); return [tops.size === 1 ? "one line" : "wraps onto " + tops.size + " lines"]; }',
			expected: ['one line']
		}
	]
};
