/**
 * Shared probes for the class page's toolbar row (ledger 0396, part 7), over
 * `/dev/class-header?view=class&items=class`: the REAL ClassView under the
 * real header, with the whole class Mr. Pina screenshotted on 2026-10-16
 * (three units and the unfiled group, one unit folded, twenty-one items a
 * teacher can select, seven videos). `_`-prefixed, so `routes.mjs` does not
 * load it as a route.
 *
 * WHAT A BROWSER IS FOR HERE. The report was SPACE: "The space between the
 * class banner and the content of the class is too large." So the distance
 * from the banner's bottom edge to the first unit's top edge is printed at
 * every width, and the row is held to the plate's step on both sides of it.
 * Every claim below is width-invariant so one spec reads at 375 and at 1440;
 * a claim that only holds where there is room says so in its own words.
 */

export const TOOLBAR_BASE = '/dev/class-header?view=class&items=class';
/** Mr. Pina's page as a teacher: no notice, no posted teams, so nothing sits between the banner and the row. */
export const TEACHER = `${TOOLBAR_BASE}&role=teacher&posts=0&teams=0`;
export const STUDENT = `${TOOLBAR_BASE}&posts=0&teams=0`;

export const IGNORE = ['Failed to load resource: net::ERR_FAILED'];

/**
 * The real class page has painted its row and its first unit, AND the class
 * theme's key has joined the header's row. That key arrives once its tally
 * has read, and on a phone it adds a tile line to the header: measured, a
 * position recorded before it arrived read 36.5px off a position read after,
 * which is the header settling, not the toolbar moving.
 */
export const READY = {
	waitFor: `() => !!document.querySelector('[data-testid="harness-class"] .class-toolbar') && !!document.querySelector('[data-testid="harness-class"] [data-testid="unit-group"]') && !!document.querySelector('[data-testid="class-header-row"] [data-testid="class-theme-toggle"]')`,
	label: 'the class page has painted its toolbar row, its units and its header row',
	timeoutMs: 30000
};

/**
 * THE MEASUREMENT, printed: the banner's bottom edge to the first unit's top
 * edge (the number the report was about), the row's own height, and what each
 * of its lines holds, so a reviewer reads the wrap at this width in words.
 */
export const MEASURE = {
	evaluate: `() => {
		const root = document.querySelector('[data-testid="harness-class"]');
		const header = root.querySelector('[data-testid="class-header"]');
		const banner = (header.closest('.ct-banner') || header).getBoundingClientRect();
		const unit = root.querySelector('[data-testid="unit-group"]').getBoundingClientRect();
		const row = root.querySelector('.class-toolbar');
		const r = row.getBoundingClientRect();
		const items = [...row.querySelectorAll('.find-field, .find-kind, .find-chip, .find-door, .find-result, .disc-trigger, [data-testid="bulk-bar"], [data-testid="bulk-select-all"]')].filter((e) => e.getBoundingClientRect().height > 0);
		const lines = new Map();
		for (const e of items) {
			const b = e.getBoundingClientRect();
			const key = Math.round((b.top + b.height / 2) / 10);
			const word = e.matches('.find-field') ? 'search' : e.matches('.find-kind') ? 'kinds' : e.matches('.find-chip') ? (e.dataset.status || 'chip') : e.matches('.find-door') ? 'duplicates' : e.matches('.find-result') ? 'count' : e.matches('.disc-trigger') ? 'videos' : e.matches('[data-testid="bulk-bar"]') ? 'tray' : 'select-all';
			lines.set(key, [...(lines.get(key) ?? []), word]);
		}
		// The keys' own extent (the row's box takes half a step outside them).
		// (the kind picker's well stands 1px out either side of its line, so it is left out.)
		const boxes = items.filter((e) => !e.matches('.find-kind')).map((e) => e.getBoundingClientRect());
		const keys = Math.max(...boxes.map((b) => b.bottom)) - Math.min(...boxes.map((b) => b.top));
		return 'banner to first unit ' + (unit.top - banner.bottom).toFixed(1) + 'px; its keys ' + keys.toFixed(1) + 'px tall in ' + lines.size + ' line(s): ' + [...lines.values()].map((l) => '[' + l.join(' ') + ']').join(' ') + (row.hasAttribute('data-planned') ? ' (planned by the script)' : ' (drawn by the stylesheet)');
	}`
};

/**
 * THE ROW ITSELF, as claims that hold at every width: one row, its members in
 * order, Select all at the right edge and the row's last key (a teacher), the
 * plate's 12px step from the banner and to the first unit, a whole word in
 * the search field, and one line at 1440. At rest there is no tray and
 * nothing held in reserve (review round 2): a teacher's row is one line
 * wherever its visible controls fit, Mr. Pina's own 1223 included. And no
 * small key alone on a line (review round 3, `toolbarFit`): on this class
 * that holds at every width from 344px up for a teacher and from 360 up for
 * a student and a teacher with no draft (swept every 4px), so it holds at
 * whatever width a run asks for; below that two of the keys no longer fit
 * side by side at all. And DRAWN BY THE STYLESHEET (review round 4): the
 * planner wrote nothing (no `data-planned`, no inline margin or basis), so
 * what is on screen is what the server render draws before any script runs,
 * and hydration moved nothing. The student's status chips are one line
 * wherever that costs nothing.
 */
/** A row's last control, links and fields included. */
const LAST_KEY = `const lastKey = (el) => { const keys = el ? [...el.querySelectorAll('button, select, input, a')] : []; return keys[keys.length - 1] ?? null; };`;

export const ROW = (teacher) => `() => {
	${LAST_KEY}
	const root = document.querySelector('[data-testid="harness-class"]');
	const rows = root.querySelectorAll('.class-toolbar');
	const row = rows[0];
	const r = row.getBoundingClientRect();
	const header = root.querySelector('[data-testid="class-header"]');
	const banner = (header.closest('.ct-banner') || header).getBoundingClientRect();
	const unit = root.querySelector('[data-testid="unit-group"]').getBoundingClientRect();
	// The keys' own extent: the row's box takes half a step outside them
	// (review round 4, \`--tb-line-gap\`), so the step is measured on the keys.
	const keyBoxes = [...row.querySelectorAll('.find-field, .find-chip, .disc-trigger, [data-testid="bulk-select-all"]')].map((e) => e.getBoundingClientRect()).filter((b) => b.height > 0);
	const keysTop = Math.min(...keyBoxes.map((b) => b.top)), keysBottom = Math.max(...keyBoxes.map((b) => b.bottom));
	const at = (sel) => row.querySelector(sel);
	const search = at('[data-testid="stream-search"]'), kind = at('[data-testid="stream-kind"]'), videos = at('[data-testid="class-videos-toggle"]'), all = at('[data-testid="bulk-select-all"]');
	const after = (a, b) => !!(a && b && (a.compareDocumentPosition(b) & 4));
	const keys = [...row.querySelectorAll('.find-field, .find-kind, .find-chip, .disc-trigger, [data-testid="bulk-select-all"]')].map((e) => e.getBoundingClientRect()).filter((b) => b.height > 0);
	const lines = new Set(keys.map((b) => Math.round((b.top + b.height / 2) / 10))).size;
	const ph = row.querySelector('.find-ph');
	const word = ph && [...ph.children].find((e) => e.getBoundingClientRect().width > 0);
	const byLine = new Map();
	for (const e of row.querySelectorAll('.find-field, .find-kind, .find-chip, .find-door, .find-result, .disc-trigger, [data-testid="bulk-select-all"]')) {
		const b = e.getBoundingClientRect();
		if (b.height <= 0) continue;
		const key = Math.round((b.top + b.height / 2) / 10);
		byLine.set(key, [...(byLine.get(key) ?? []), e]);
	}
	const stranded = [...byLine.values()].filter((l) => l.length === 1 && !l[0].matches('.find-field')).length;
	const out = [
		'toolbar rows=' + rows.length,
		'members=' + row.dataset.toolbar,
		'search, kinds, videos in order=' + (after(search, kind) && after(kind, videos)),
		'plate step above the row=' + (Math.abs(keysTop - banner.bottom - 12) <= 1.5),
		'plate step below the row=' + (Math.abs(unit.top - keysBottom - 12) <= 1.5),
		'drawn by the stylesheet, as the server render draws it=' + (!row.hasAttribute('data-planned') && ![...row.querySelectorAll('*')].some((e) => e.style.marginInlineEnd || e.style.flexBasis)),
		'one line at 1440=' + (innerWidth < 1400 || lines === 1),
		'the search shows a word=' + !!word,
		'the word is whole, never cut=' + (!!word && ph.scrollWidth <= ph.clientWidth + 0.5),
		'no small key alone on a line=' + (stranded === 0)
	];
	if (${teacher}) {
		const a = all.getBoundingClientRect();
		out.push('select all after the videos key=' + after(videos, all));
		out.push('select all at the right edge=' + (Math.abs(r.right - a.right) <= 4));
		out.push('select all is the row\\'s last key=' + (lastKey(row) === all));
		out.push('no tray and nothing in reserve at rest=' + (!row.querySelector('[data-testid="bulk-bar"]') && row.querySelectorAll('[inert]').length === 0 && !row.classList.contains('selecting')));
	} else {
		out.push('no select all=' + (root.querySelectorAll('[data-testid="bulk-select-all"]').length === 0));
		// THE STATUS CHIPS ARE ONE GROUP (review round 4): on one line wherever
		// keeping them together costs no line and strands no key, which on this
		// class is every width from 532px up; on a phone Done goes with Videos.
		const chips = [...row.querySelectorAll('.find-chip')].map((e) => Math.round(e.getBoundingClientRect().top));
		out.push('the status chips on one line where they fit together=' + (innerWidth < 532 || new Set(chips).size === 1));
	}
	return out;
}`;

export const ROW_EXPECTED_TEACHER = [
	'toolbar rows=1',
	'members=find videos',
	'search, kinds, videos in order=true',
	'plate step above the row=true',
	'plate step below the row=true',
	'drawn by the stylesheet, as the server render draws it=true',
	'one line at 1440=true',
	'the search shows a word=true',
	'the word is whole, never cut=true',
	'no small key alone on a line=true',
	'select all after the videos key=true',
	'select all at the right edge=true',
	"select all is the row's last key=true",
	'no tray and nothing in reserve at rest=true'
];
export const ROW_EXPECTED_STUDENT = [
	'toolbar rows=1',
	'members=find videos',
	'search, kinds, videos in order=true',
	'plate step above the row=true',
	'plate step below the row=true',
	'drawn by the stylesheet, as the server render draws it=true',
	'one line at 1440=true',
	'the search shows a word=true',
	'the word is whole, never cut=true',
	'no small key alone on a line=true',
	'no select all=true',
	'the status chips on one line where they fit together=true'
];

/**
 * Where things were before a press, for the claims after it. Two frames:
 * IN THE CLASS PAGE'S OWN COORDINATES (offset from its top-left), so a scroll
 * the checks between a press and a claim make (a presence or tap-target read
 * brings its element into view) cannot read as the class moving; and IN THE
 * WINDOW'S, read only inside `prepare`, right before and right after the
 * press, which is what "under the pointer" means. RECORD first brings the
 * first row's checkbox to the middle of the window itself, so the tick's own
 * click needs no scroll and every window-frame change is the page's doing.
 * The class page's own origin is read afresh for every box, because a
 * probe that presses something (the Videos band closing) can move the page's
 * scroll between two reads.
 */
const REL = `const root = document.querySelector('[data-testid="harness-class"]');
	const box = (sel) => { const e = root.querySelector(sel); if (!e) return null; const origin = root.getBoundingClientRect(); const b = e.getBoundingClientRect(); return { x: b.left - origin.left, y: b.top - origin.top, w: b.width, h: b.height, r: b.right - origin.left, b: b.bottom - origin.top }; };
	const view = (sel) => { const e = root.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, r: b.right }; };
	const snap = () => ({ unit: box('[data-testid="unit-group"]'), all: box('[data-testid="bulk-select-all"]'), del: box('[data-testid="bulk-delete"]'), tray: box('[data-testid="bulk-bar"]'), row: box('.class-toolbar'), field: box('.find-field'), vUnit: view('[data-testid="unit-group"]'), vAll: view('[data-testid="bulk-select-all"]'), vBox: view('[data-testid^="row-select-"]') });`;
export const RECORD = {
	evaluate: `() => {
		${REL}
		root.querySelector('[data-testid^="row-select-"]').scrollIntoView({ block: 'center', behavior: 'instant' });
		window.__tb = snap();
		return 'recorded: first unit ' + window.__tb.unit.y.toFixed(1) + 'px below the top of the class page, the first checkbox ' + window.__tb.vBox.y.toFixed(1) + 'px down the window';
	}`
};

/** Tick the first row's checkbox. The predicate is something only the tick produces. */
export const TICK = {
	click: '[data-testid="harness-class"] [data-testid^="row-select-"]',
	until: `() => document.querySelector('[data-testid="bulk-count"]')?.textContent.trim() === '1 selected'`,
	attempts: 40,
	waitMs: 300
};
/** Where things are once ticked, for the claims after the tick, after Select all and after arming Delete. */
export const RECORD_TICKED = {
	evaluate: `() => {
		${REL}
		window.__tk = snap();
		return 'recorded once ticked: the first checkbox ' + window.__tk.vBox.y.toFixed(1) + 'px down the window (' + window.__tb.vBox.y.toFixed(1) + ' before); Delete from ' + window.__tk.del.x.toFixed(1) + ' to ' + window.__tk.del.r.toFixed(1);
	}`
};

/**
 * THE FIRST TICK (review round 2): the filters make way and the selection's
 * tray LEADS the row in their places, Select all still the row's last key.
 * Nothing under the pointer moves, at either width: at 1440 the tray, the
 * Videos key and Select all are one line as the filters were, and at 375,
 * where the row needs more lines, the page scrolls by what it grew so the list
 * and Select all on the row's last line stay where they were in the window.
 */
export const TICKED = `() => {
	${REL}
	${LAST_KEY}
	const row = root.querySelector('.class-toolbar');
	const tray = row.querySelector('[data-testid="bulk-bar"]');
	const was = window.__tb, now = window.__tk;
	const painted = (sel) => [...row.querySelectorAll(sel)].some((e) => e.getBoundingClientRect().width > 0);
	return [
		'one tray, leading the row=' + (root.querySelectorAll('[data-testid="bulk-bar"]').length === 1 && row.firstElementChild === tray),
		'the actions are in it=' + ['bulk-count', 'bulk-publish', 'bulk-unit-select', 'bulk-delete', 'bulk-clear'].every((id) => !!tray?.querySelector('[data-testid="' + id + '"]')),
		'the filters made way=' + (row.classList.contains('selecting') && !painted('.find-field, .find-kind, .find-chip, .find-door')),
		'select all is still the row\\'s last key, outside the tray=' + (lastKey(row)?.getAttribute('data-testid') === 'bulk-select-all' && !tray.contains(lastKey(row))),
		'the class did not move under the pointer=' + (Math.abs(now.vUnit.y - was.vUnit.y) < 0.5 && Math.abs(now.vBox.y - was.vBox.y) < 0.5),
		'select all did not move under the pointer=' + (Math.abs(now.vAll.x - was.vAll.x) < 0.5 && Math.abs(now.vAll.y - was.vAll.y) < 0.5),
		'one line in a 1440 window, as at rest=' + (innerWidth < 1400 || Math.abs(now.row.h - was.row.h) < 0.5)
	];
}`;
export const TICKED_EXPECTED = [
	'one tray, leading the row=true',
	'the actions are in it=true',
	'the filters made way=true',
	"select all is still the row's last key, outside the tray=true",
	'the class did not move under the pointer=true',
	'select all did not move under the pointer=true',
	'one line in a 1440 window, as at rest=true'
];

/** Select all, then arm Delete: each predicate is something only that press produces. */
export const SELECT_ALL = {
	click: '[data-testid="harness-class"] [data-testid="bulk-select-all"]',
	until: `() => /^Deselect all/.test(document.querySelector('[data-testid="bulk-select-all"]')?.textContent.trim() ?? '')`,
	attempts: 20,
	waitMs: 300
};
export const ARM = {
	click: '[data-testid="harness-class"] [data-testid="bulk-delete"]',
	until: `() => /^Really delete/.test(document.querySelector('[data-testid="bulk-delete"]')?.textContent.trim() ?? '')`,
	attempts: 20,
	waitMs: 300
};
/** Where things are once Select all has been pressed and Delete armed. */
export const RECORD_ARMED = {
	evaluate: `() => {
		${REL}
		window.__ta = snap();
		return 'recorded once armed: Delete from ' + window.__ta.del.x.toFixed(1) + ' to ' + window.__ta.del.r.toFixed(1) + ', ' + window.__ta.del.y.toFixed(1) + 'px down';
	}`
};

/**
 * SELECT ALL AND ARMING DELETE MOVE NOTHING (review rounds 1 and 2). Every
 * label in the tray that changes holds the room of its longest form from the
 * first tick (the count, "Deselect all (00)", and "Really delete", the armed
 * words wrapping to a second line inside Delete's 44px key), so neither press
 * changes a width or a height: Select all keeps its box as it turns into
 * Deselect all, Delete keeps its box as it arms, the tray keeps its box, and
 * the class does not move, at every width. Round 2's reviewer found the armed
 * Delete moving the bar up a line in a 16px band of widths, where the count
 * used to step aside for it; nothing steps aside now.
 */
export const ARMED = `() => {
	${REL}
	const was = window.__tk, now = window.__ta;
	const label = root.querySelector('[data-testid="bulk-delete"]').textContent.trim();
	const count = root.querySelector('[data-testid="bulk-count"]');
	const n = root.querySelectorAll('[data-testid^="row-select-"]:checked').length;
	const same = (a, b) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5;
	return [
		'armed, Delete names the count=' + (n > 1 && label === 'Really delete ' + n + ' items?'),
		'select all kept its box=' + same(now.all, was.all),
		'delete kept its box=' + same(now.del, was.del),
		'the tray kept its box=' + (same(now.tray, was.tray) && Math.abs(now.tray.h - was.tray.h) < 0.5),
		'the count stayed=' + (!!count && count.getBoundingClientRect().width > 0),
		'the class did not move=' + (Math.abs(now.unit.y - was.unit.y) < 0.5)
	];
}`;
export const ARMED_EXPECTED = [
	'armed, Delete names the count=true',
	'select all kept its box=true',
	'delete kept its box=true',
	'the tray kept its box=true',
	'the count stayed=true',
	'the class did not move=true'
];

/** Open the Videos key. */
export const OPEN_VIDEOS = {
	click: '[data-testid="harness-class"] [data-testid="class-videos-toggle"]',
	until: `() => document.querySelector('[data-testid="class-videos-toggle"]')?.getAttribute('aria-expanded') === 'true'`,
	attempts: 40,
	waitMs: 300
};

/**
 * OPEN, the list is a band under the whole row, as wide as the row, with the
 * class a plate step under it; CLOSED again, the class is back where it was.
 */
export const VIDEOS_BAND = `async () => {
	${REL}
	const row = box('.class-toolbar');
	const key = root.querySelector('[data-testid="class-videos-toggle"]');
	const k = box('[data-testid="class-videos-toggle"]');
	const band = box('.cvid-body[data-open="true"]');
	const unitOpen = box('[data-testid="unit-group"]');
	const out = [
		'band under the key=' + (!!band && band.y >= k.b - 0.5),
		'band as wide as the row=' + (!!band && Math.abs(band.w - row.w) < 1),
		'the class a plate step under the band=' + (!!band && Math.abs(unitOpen.y - band.b - 12) <= 1.5),
		'the class pushed down, not covered=' + (unitOpen.y > window.__tb.unit.y + 100)
	];
	for (let i = 0; i < 20 && key.getAttribute('aria-expanded') === 'true'; i++) {
		key.click();
		await new Promise((r) => setTimeout(r, 300));
	}
	const unitClosed = box('[data-testid="unit-group"]');
	out.push('closing gives the space back=' + (key.getAttribute('aria-expanded') === 'false' && Math.abs(unitClosed.y - window.__tb.unit.y) < 0.5));
	return out;
}`;
export const VIDEOS_BAND_EXPECTED = [
	'band under the key=true',
	'band as wide as the row=true',
	'the class a plate step under the band=true',
	'the class pushed down, not covered=true',
	'closing gives the space back=true'
];

/**
 * CLEAR SELECTION PUTS THE FOCUS ON SELECT ALL (review round 3). The key goes
 * away with the tray it sits in, which dropped a keyboard user's focus to the
 * page; it lands on Select all, which stays where it was. Pressed from the
 * keyboard's position (focused, then activated), after the ticked claims.
 */
export const CLEARED = `async () => {
	const root = document.querySelector('[data-testid="harness-class"]');
	const clear = root.querySelector('[data-testid="bulk-clear"]');
	if (!clear) return ['clear selection was there to press=false'];
	clear.focus();
	clear.click();
	for (let i = 0; i < 20 && root.querySelector('[data-testid="bulk-bar"]'); i++) await new Promise((r) => setTimeout(r, 100));
	await new Promise((r) => setTimeout(r, 150));
	const row = root.querySelector('.class-toolbar');
	const field = row.querySelector('.find-field');
	return [
		'clear selection was there to press=true',
		'the tray is gone=' + !root.querySelector('[data-testid="bulk-bar"]'),
		'the filters are back=' + (!row.classList.contains('selecting') && !!field && field.getBoundingClientRect().width > 0),
		'the focus is on select all=' + (document.activeElement?.getAttribute('data-testid') === 'bulk-select-all')
	];
}`;
export const CLEARED_EXPECTED = [
	'clear selection was there to press=true',
	'the tray is gone=true',
	'the filters are back=true',
	'the focus is on select all=true'
];

/** The words on the toolbar's keys are the key's ink, on the key's face. */
export const KEY_CONTRAST = [
	{ selector: '[data-testid="class-videos-toggle"] .disc-label', label: 'the Videos key: its word', min: 4.5 },
	{ selector: '[data-testid="class-videos-count"]', label: 'the Videos key: its count', min: 4.5 },
	{ selector: '[data-testid="class-videos-toggle"] .disc-action', label: 'the Videos key: Show', min: 4.5 },
	{ selector: '.class-toolbar .find-ph-long', label: 'the search field: its words', min: 4.5 }
];

export const TAPS = (teacher) => [
	{ selector: '[data-testid="stream-search"]', label: 'the search field', min: 44 },
	{ selector: '[data-testid="stream-kind"]', label: 'the kinds filter', min: 44 },
	{ selector: '[data-testid="class-videos-toggle"]', label: 'the Videos key', min: 44 },
	...(teacher ? [{ selector: '[data-testid="bulk-select-all"]', label: 'Select all', min: 44 }] : [])
];

/**
 * TYPING IN THE SEARCH NEVER MOVES OR RESIZES THE FIELD (review round 4, and
 * polish round 1). Measured in round 4 on a 390 phone: the first keystroke
 * halved the field (277 to 133px) and pulled the kind filter up beside the
 * caret. Polish round 1 measured two more: a Videos key that came back while
 * the field had the focus landed on a line of its own under a student's
 * one-line row and stayed there after Escape, and in a videos-first layout the
 * field slid 146px left on the keystroke that took the key away. So the probe
 * types "glossary", which leaves no video showing (the Videos key leaves the
 * row mid-word), then deletes it again letter by letter (the key comes back):
 * the field's box must not move by a pixel at any of those sixteen keystrokes,
 * the count must sit on its own line under every key, and the row with the
 * word deleted, still focused, must be the row at rest, line for line. Then
 * "gl" and Escape (which empties the field and keeps the focus) gives the row
 * back as it was, and Clear hands the focus to the search field rather than
 * dropping it on the page, pressed from the keyboard or with a pointer. Polish
 * round 2 added the rest of the row to the claim: no key that is on screen may
 * leave the place it had at rest at any of the sixteen keystrokes (the kind
 * filter was taken off the field's line and back at a phone's 375 and 390,
 * Done climbed a line at 390 and Drafts dropped one), so a key the word takes
 * away leaves a gap and nothing closes it. Each keystroke is the field's own
 * input event (this harness has no keyboard step), after a retry that waits
 * for the page to answer one, which is how a hydrated page is told from a
 * painted one.
 */
export const typingProbe = (kindsBeside = false) => `async () => {
	const root = document.querySelector('[data-testid="harness-class"]');
	const row = root.querySelector('.class-toolbar[data-testid="stream-find"]');
	const input = row.querySelector('[data-testid="stream-search"]');
	const field = row.querySelector('.find-field');
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const box = () => { const b = field.getBoundingClientRect(); return [b.left, b.top, b.width].map((n) => n.toFixed(1)).join(','); };
	const word = (e) => e.matches('.find-field') ? 'search' : e.matches('.find-kind') ? 'kinds' : e.matches('.find-chip') ? e.dataset.status : e.matches('.disc-trigger') ? 'videos' : 'all';
	const lines = () => {
		const keys = [...row.querySelectorAll('.find-field, .find-kind, .find-chip, .disc-trigger, [data-testid="bulk-select-all"]')].filter((e) => e.getBoundingClientRect().height > 0);
		const out = []; let bottom = -1e9;
		for (const e of keys) { const b = e.getBoundingClientRect(); if (b.top >= bottom - 1) out.push([]); out[out.length - 1].push(word(e)); bottom = b.bottom; }
		return out.map((l) => l.join(' ')).join(' / ');
	};
	// Every key's place by its word, for the keys on screen now.
	const places = () => {
		const out = new Map();
		for (const e of row.querySelectorAll('.find-kind, .find-chip, .disc-trigger, [data-testid="bulk-select-all"]')) {
			const b = e.getBoundingClientRect();
			if (b.height > 0) out.set(word(e), b.left.toFixed(1) + ',' + b.top.toFixed(1));
		}
		return out;
	};
	const type = (value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
	input.focus();
	await sleep(150);
	const rest = box(), restLines = lines(), restPlaces = places();
	let keysMoved = 0;
	const keysStill = () => { for (const [k, at] of places()) if (restPlaces.get(k) !== at) return false; return true; };
	// Hydrated: the page answers an input with the count line.
	for (let i = 0; i < 40 && !row.querySelector('[data-testid="stream-find-result"]'); i++) { type('g'); await sleep(250); }
	type('');
	await sleep(300);
	let moved = 0, typed = '', gone = false;
	for (const ch of 'glossary') {
		typed += ch;
		type(typed);
		await sleep(150);
		if (box() !== rest) moved++;
		if (!keysStill()) keysMoved++;
	}
	gone = !row.querySelector('[data-testid="class-videos-toggle"]');
	const count = row.querySelector('[data-testid="stream-find-result"]');
	const keyBottom = Math.max(...[...row.querySelectorAll('.find-field, .find-kind, .find-chip, [data-testid="bulk-select-all"]')].map((e) => e.getBoundingClientRect().bottom));
	const cb = count?.getBoundingClientRect();
	const countBelow = !!cb && cb.top >= keyBottom - 0.5 && Math.abs(cb.left - row.getBoundingClientRect().left) < 1;
	const typedLines = lines();
	const beside = typedLines.split(' / ').some((l) => l.startsWith('search kinds'));
	while (typed) {
		typed = typed.slice(0, -1);
		type(typed);
		await sleep(150);
		if (box() !== rest) moved++;
		if (!keysStill()) keysMoved++;
	}
	await sleep(250);
	const deleted = lines();
	const out = [
		'the page answered the typing=' + !!count,
		'the Videos key left the row with the last video=' + gone,
		'the field never moved or changed width (16 keystrokes)=' + (moved === 0),
		'no other key on screen left its place (16 keystrokes)=' + (keysMoved === 0),
		'the count is a line of its own under the keys=' + countBelow,
		'the word deleted, every key back on its own line, as at rest=' + (deleted === restLines),
		'the field kept the focus=' + (document.activeElement === input)
	];
	if (${kindsBeside}) out.push('with the word in the box, the kind filter is still beside the field=' + beside);
	type('gl');
	await sleep(300);
	input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
	await sleep(400);
	out.push('Escape: the row is back as it was, the field where it was=' + (input.value === '' && box() === rest && lines() === restLines && !row.querySelector('[data-testid="stream-find-result"]')));
	out.push('Escape: the field still has the focus=' + (document.activeElement === input));
	type('glossary');
	await sleep(300);
	row.querySelector('[data-testid="stream-clear"]')?.click();
	await sleep(400);
	out.push('Clear: the row is back as it was and the focus is on the search field=' + (input.value === '' && box() === rest && lines() === restLines && document.activeElement === input));
	// Clear pressed with a pointer (a click with a count of one) lands in the same place.
	type('glossary');
	await sleep(300);
	row.querySelector('[data-testid="stream-clear"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
	await sleep(400);
	out.push('Clear with a pointer: the focus is on the search field=' + (input.value === '' && document.activeElement === input));
	input.blur();
	return out;
}`;
export const TYPING = typingProbe();
export const TYPING_EXPECTED = [
	'the page answered the typing=true',
	'the Videos key left the row with the last video=true',
	'the field never moved or changed width (16 keystrokes)=true',
	'no other key on screen left its place (16 keystrokes)=true',
	'the count is a line of its own under the keys=true',
	'the word deleted, every key back on its own line, as at rest=true',
	'the field kept the focus=true',
	'Escape: the row is back as it was, the field where it was=true',
	'Escape: the field still has the focus=true',
	'Clear: the row is back as it was and the focus is on the search field=true',
	'Clear with a pointer: the focus is on the search field=true'
];
