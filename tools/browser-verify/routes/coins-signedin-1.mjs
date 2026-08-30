/**
 * The IDEA Coin Ledger's report control, SIGNED IN -- the other direction of
 * the claim `/dev/coins` makes signed out.
 *
 * WHY IT IS A SECOND ROUTE RATHER THAN A SECOND ROW. The signed-in and
 * signed-out panels differ in three ways at once -- which endpoint the report
 * posts to, whether the optional contact field exists, and what the panel tells
 * a person their report carries -- and every one of those is a claim about a
 * BRANCH. A spec that only ever measured one state proves the branch renders,
 * never that it is a branch: an implementation that ignored the session
 * entirely would pass the signed-out spec completely.
 *
 * So each of the three claims is asserted in BOTH states, with the phrases and
 * the counts swapped: what `/dev/coins` requires, this forbids, and the other
 * way round.
 *
 * THE 51px OVERFLOW AT 375 IS THE LEDGER'S OWN OFF-CANVAS DRAWER and is not
 * this bundle's; `coins.mjs` carries the measurement, the reasoning and a probe
 * that names the element. It reports here too because this spec is an alias of
 * the same page.
 *
 * `?signedIn=1` is the harness's own switch (a cookie `/dev/coins` sets from
 * the query), which is what a real session is here -- there is no Google OAuth
 * against a local fixture.
 */
export default {
	path: '/dev/coins-signedin-1',
	aliasOf: '/dev/coins?signedIn=1',
	label: 'IDEA Coin Ledger report control, signed in',
	settleMs: 1200,
	prepare: [
		{
			click: '#idea-ledger-report-btn',
			until: '() => { const p = document.getElementById("idea-ledger-report"); return !!p && getComputedStyle(p).display !== "none"; }',
			attempts: 8,
			waitMs: 250
		}
	],
	presence: [
		{ selector: '.tab-bar .tab-btn', label: 'the Ledger rendered (its own tabs)', expectPresent: 4 },
		{ selector: '#idea-ledger-report', label: 'the report panel, once opened', expectPresent: 1, maxPresent: 1 },
		/* THE POSITIVE CONTROL FOR THE ABSENCE BELOW. The message field is what
		   says the panel built its fields at all, so "no contact field" cannot
		   pass by the panel being empty. */
		{ selector: '#idea-ledger-report textarea', label: 'the message field (positive control)', expectPresent: 1, maxPresent: 1 },
		{ selector: '#idea-ledger-report button[data-kind]', label: 'one chip per feedback kind', expectPresent: 4, maxPresent: 4 },
		/* NO CONTACT FIELD WHERE THERE IS AN ACCOUNT. It is offered only where
		   there is none, and it is NEVER an identity -- nothing verifies it --
		   so a signed-in report carrying one would be a second, unverified name
		   beside a real account. */
		{ selector: '#idea-ledger-report input[type="text"]', label: 'no contact field when signed in', expectPresent: 0, expectVisible: 0, maxVisible: 0 }
	],
	contrast: [
		{ selector: '#idea-ledger-report-btn', label: 'the trigger on the Ledger header', min: 4.5 },
		{ selector: '#idea-ledger-report > div > div:nth-child(2)', label: 'the panel note copy', min: 4.5 }
	],
	tapTargets: [
		{ selector: '#idea-ledger-report-btn', label: 'the report trigger', min: 44 },
		{ selector: '#idea-ledger-report button', label: 'every control inside the panel', min: 44 }
	],
	textContains: [
		{
			selector: '#idea-ledger-report',
			label: 'the panel says the report carries an account, and never that it does not',
			must: ['REPORT A PROBLEM', 'carries your account'],
			mustNot: ['not signed in', 'this report carries no name', 'A way to reach you']
		}
	],
	orderResult: [
		{
			label: 'a signed-in report posts to the authenticated route, never the anonymous one',
			/* THE TWO PATHS MUST NEVER SWAP. A signed-in student travelling the
			   anonymous route files a row with no account, attributable to an
			   address hash instead -- which is the one outcome the split of
			   these two endpoints exists to prevent. In the harness the
			   authenticated endpoint is the in-memory fixture sink; on the real
			   route it is `/api/coin-feedback`. What is asserted is that it is
			   NOT `/api/feedback`. */
			evaluate:
				'() => { const src = [...document.scripts].map((s) => s.textContent || "").find((t) => t.indexOf("idea-ledger-report-btn") !== -1); if (!src) return ["NO INJECTED SCRIPT"]; const m = /"endpoint":"([^"]+)"/.exec(src); if (!m) return ["NO ENDPOINT IN CONFIG"]; return [m[1] === "/api/feedback" ? "ANONYMOUS ROUTE: " + m[1] : "authenticated: " + m[1]]; }',
			expected: ['authenticated: /dev/coins/api/feedback']
		}
	]
};
