/**
 * The shared way into "Import from class roster" on `/dev/coin-desk`
 * (SectionManager, ledger 0298), for the specs that measure it. Not a spec
 * itself: the loader skips a file whose name starts with `_`.
 *
 * THE MANAGE CLICK WAITS ON THE IMPORT BLOCK, NOT ON THE CLASS PICKER, and
 * that is load-bearing: `manage` TOGGLES the panel, and the picker arrives
 * after the class list loads, so a predicate naming the picker would let a
 * retry click CLOSE the panel it had just opened. The picker is then WAITED
 * for, because it is a payload landing rather than something to press.
 */

/** Students area, then `manage` on the first coin section (eng1h-sophomore). */
export const OPEN_MANAGE = (blockSelector = '[data-testid="cd-roster-import"]') => [
	{
		click: '.cd-root .desk-nav li:nth-child(2) button',
		until: '() => !!document.querySelector(".cd-root .section-manager")',
		attempts: 8,
		waitMs: 250
	},
	{
		click: '.cd-root [data-testid="cd-section-manage"]',
		until: `() => !!document.querySelector(${JSON.stringify(`.cd-root ${blockSelector}`)})`,
		attempts: 1,
		waitMs: 250
	}
];

export const WAIT_FOR_CLASSES = {
	waitFor:
		'() => document.querySelectorAll(".cd-root [data-testid=\\"cd-roster-import-class\\"] option").length > 1',
	timeoutMs: 8000
};

/**
 * CHOOSING A CLASS, AS AN `evaluate` STEP. The runner has no `select`, and a
 * real choice in a `<select>` is a `change` event, which is what this
 * dispatches. It returns what it chose, so the report prints it.
 */
export const CHOOSE_CLASS = (classId, until) => ({
	evaluate: `() => { const el = document.querySelector('.cd-root [data-testid="cd-roster-import-class"]'); if (!el) return 'NO CLASS PICKER'; el.value = ${JSON.stringify(classId)}; el.dispatchEvent(new Event('change', { bubbles: true })); return 'chose: ' + el.options[el.selectedIndex].textContent.trim(); }`,
	until,
	attempts: 4,
	gapMs: 300
});

/** The raw numbers, printed rather than gated. */
export const REPORT_GEOMETRY = {
	evaluate:
		'() => { const s = document.querySelector(".cd-root [data-testid=\\"cd-roster-import-class\\"]"); const b = document.querySelector(".cd-root [data-testid=\\"cd-roster-import-go\\"]"); const box = (el) => el ? Math.round(el.getBoundingClientRect().width) + "x" + Math.round(el.getBoundingClientRect().height) : "none"; return "import at " + window.innerWidth + "px: class picker " + box(s) + ", add button " + box(b) + (b ? " reading \\"" + b.textContent.trim() + "\\"" : ""); }'
};
