/**
 * THE CLASS PAGE'S TOOLBAR: ONE ROW UNDER THE BANNER (ledger 0396, part 7).
 *
 * Mr. Pina, 2026-10-16: "The space between the class banner and the content
 * of the class is too large." Under the banner the page stacked the search
 * and kind filter on one row, the collapsed Videos section on a full-width
 * row of its own, and a teacher's Select all on a third, each spending a whole
 * line of a projector on one small control. They are one wrapping row now:
 * the search, the kind filter (and the status chips, the duplicates door and
 * the filter's count that belong to it), the Videos key, and Select all at the
 * right edge.
 *
 * BUT THEY ARE STILL TWO PANELS A PERSON ARRANGES. `find` and `videos` move
 * and hide independently in each person's page layout (`panel-layout.ts`,
 * report R23), so the toolbar is not a panel of its own and joins nothing a
 * person separated:
 *   - two toolbar panels JOIN when they are next to each other on the same
 *     side of the posts and both shown, in the person's own order;
 *   - a toolbar panel with no neighbour is a toolbar of one (the Videos key
 *     alone, or the search alone), still one row;
 *   - a teacher's bulk controls join the toolbar ONLY when it sits directly
 *     above the posts, because they act on the list under them: Select all
 *     at the row's right edge, and once anything is ticked the selection's
 *     tray LEADING the row while the filters make way for it (ClassView's
 *     `toolbarPanel`). Anywhere else -- the toolbar moved below the posts, or
 *     both panels hidden -- they stay where they always were, a row at the top
 *     of the posts.
 *
 * THE SEARCH FIELD NEVER CHANGES SLOT, AND THAT IS WHY `host` EXISTS. A panel
 * is rendered in its own keyed slot (`PanelStack`), and a slot that started
 * rendering the search field it did not render before would build a new
 * `<input>`: the caret and the half-typed word go with the old one. Whether
 * the Videos key exists depends on the search itself (the videos are the ones
 * in what the search leaves showing), so a toolbar keyed on its first member
 * would hop slots mid-word whenever a person had put Videos first. So a
 * toolbar holding `find` always renders in `find`'s slot, and only the Videos
 * key ever mounts or unmounts.
 *
 * Pure: no Svelte, no DOM. `tests/classroom-class-toolbar.test.ts` holds every
 * arrangement.
 */
import type { ResolvedPanels } from './panel-layout';

/** The class page panels that join the toolbar row, in the page's own default order. */
export const TOOLBAR_PANELS = ['find', 'videos'] as const;
export type ToolbarPanel = (typeof TOOLBAR_PANELS)[number];

export function isToolbarPanel(id: string): id is ToolbarPanel {
	return (TOOLBAR_PANELS as readonly string[]).includes(id);
}

export interface ClassToolbar {
	/**
	 * The panel slot the row renders in: `find` whenever the search is in it
	 * (see the header), otherwise its one member. Every other member renders
	 * nothing in its own slot.
	 */
	host: ToolbarPanel;
	/** What the row holds, in the person's order. Never empty. */
	members: ToolbarPanel[];
	/** It sits directly above the posts, so it carries a teacher's Select all and the selection's tray. */
	bulk: boolean;
}

/**
 * THE TOOLBARS ONE ARRANGEMENT RENDERS: one per run of toolbar panels that
 * sit next to each other in `above` or in `below` (the posts between the two
 * lists always split a run). With nothing stored that is exactly one toolbar,
 * `find` then `videos`, directly above the posts, with the bulk controls.
 */
export function classToolbars(resolved: Pick<ResolvedPanels, 'above' | 'below'>): ClassToolbar[] {
	const out: ClassToolbar[] = [];
	const scan = (list: readonly string[], abovePosts: boolean) => {
		let run: ToolbarPanel[] = [];
		const close = (atEnd: boolean) => {
			if (!run.length) return;
			out.push({ host: run.includes('find') ? 'find' : run[0], members: run, bulk: abovePosts && atEnd });
			run = [];
		};
		for (const id of list) {
			if (isToolbarPanel(id)) run.push(id);
			else close(false);
		}
		close(true);
	};
	scan(resolved.above, true);
	scan(resolved.below, false);
	return out;
}

/** The toolbar a panel's slot renders, or null: the panel is drawn inside another member's row. */
export function toolbarAt(toolbars: readonly ClassToolbar[], id: string): ClassToolbar | null {
	return toolbars.find((t) => t.host === id) ?? null;
}

/** Does a toolbar carry the bulk controls, so the posts do not draw them a row of their own. */
export function bulkInToolbar(toolbars: readonly ClassToolbar[]): boolean {
	return toolbars.some((t) => t.bulk);
}

/**
 * WHAT A TOOLBAR ROW HOLDS, KEY BY KEY, IN ITS ORDER (review round 4): the
 * row's `data-shape`, which the class page's container queries key on to draw
 * the planned lines from the server render on, before any script runs
 * (ClassView's `.tb-br` rules; `greedyToolbarLines` is their model). One word
 * a key: `search`, `kinds`, each status chip by its status (`drafts`, or
 * `todo missing done`), `duplicates`, `videos`, `all` (Select all), and `tray`
 * once anything is ticked, when the filters make way for it. The count of a
 * narrowed list is not a word: it is a line of its own under the keys, so it
 * never changes where they break. A shape no rule names is simply drawn as
 * the plain wrap and planned by the script.
 */
export function toolbarShape(row: {
	members: readonly ToolbarPanel[];
	selecting: boolean;
	carries: boolean;
	kinds: boolean;
	statuses: readonly string[];
	duplicates: boolean;
}): string {
	const words: string[] = row.selecting ? ['tray'] : [];
	for (const member of row.members) {
		if (member === 'videos') {
			words.push('videos');
			continue;
		}
		if (row.selecting) continue;
		words.push('search');
		if (row.kinds) words.push('kinds');
		words.push(...row.statuses);
		if (row.duplicates) words.push('duplicates');
	}
	if (row.carries) words.push('all');
	return words.join(' ');
}

/**
 * NO KEY ALONE ON A LINE OF ITS OWN WHERE ANOTHER ARRANGEMENT FITS (ledger
 * 0396, part 7, review rounds 3 and 4).
 *
 * The row wraps like any flex row, greedily: each key goes on the line it is
 * reached on if it fits. Greedy filling is what left Select all alone on the
 * row's last line at a phone's 390px and a tablet's 744 ("a row holding only
 * SELECT ALL" is the very shape Mr. Pina reported), and a student's Videos key
 * alone at 393 and 780, at widths where the same keys, in the same order, fit
 * in the same number of lines with nobody stranded. An arrangement is judged,
 * in this order, by:
 *
 *   1. the FEWEST LINES (exactly the lines the greedy wrap takes, so a plan
 *      never makes the row taller and never moves the class under it);
 *   2. then the fewest LONE KEYS: a line holding one small key. The search
 *      field may sit alone, because it fills its line, and so may the
 *      selection's tray, which is a group of keys;
 *   3. then the fewest SPLIT GROUPS (review round 4): a student's three status
 *      chips are one `role="group"`, "Show by status", and stay on one line
 *      whenever an arrangement with as few lines and as few lone keys keeps
 *      them together (at an iPad's 768 to 820, `[search kinds] [To do Missing
 *      Done Videos]`, where the greedy wrap cut Done off with Videos). Below
 *      that, on a phone, keeping them whole would leave the Videos key alone
 *      on the last line, the reported row, so step 2 decides first;
 *   4. then no lone key on the LAST line, which is where the report's Select
 *      all sat (where a lone key cannot be avoided at all, as at 360px with no
 *      draft, it is the kind filter under the search rather than Select all
 *      under everything);
 *   5. then as close to the greedy wrap as that allows: each line holds as
 *      many keys as it can, top first.
 *
 * `toolbarLines` finds the best arrangement exactly, by a dynamic programme
 * over the suffixes (a row has a dozen keys at most); `toolbarCost` scores
 * any arrangement on the same terms, which is how the measuring half
 * (`toolbar-lines.ts`) asks whether the arrangement the stylesheet already
 * drew is as good as the best one and leaves it alone if it is (see
 * `greedyToolbarLines`' forced breaks, the stylesheet's model).
 */
export interface ToolbarItem {
	/** The width the row breaks lines on: the item's own width, or a growing field's flex basis. */
	width: number;
	/** May sit alone on a line without reading as a stray key (the search field, the selection's tray). */
	aloneOk: boolean;
	/** A field that grows to fill its line (the search), up to this width. */
	growsTo?: number;
	/** Items sharing a key are one set of controls (`role="group"`), kept on one line where it fits. */
	group?: string;
}

/** How good an arrangement is, every term smaller-is-better, compared in this order. */
export interface ToolbarCost {
	lines: number;
	lone: number;
	splits: number;
	lastLone: number;
}

/** Negative when `a` is the better arrangement, zero when they are as good as each other. */
export function compareToolbarCost(a: ToolbarCost, b: ToolbarCost): number {
	return a.lines - b.lines || a.lone - b.lone || a.splits - b.splits || a.lastLone - b.lastLone;
}

/** Room a line has to spare beyond which a key is taken to fit, so a half-pixel rounding never decides a break. */
const FIT_SLACK = 0.01;

function lineWidth(items: readonly ToolbarItem[], from: number, to: number, gap: number): number {
	let sum = 0;
	for (let i = from; i < to; i++) sum += items[i].width;
	return sum + gap * (to - from - 1);
}

const loneOn = (items: readonly ToolbarItem[], from: number, to: number) =>
	to - from === 1 && !items[from].aloneOk ? 1 : 0;
/** A line ending at `to` cuts a group in two when the items either side of the cut share one. */
const splitAt = (items: readonly ToolbarItem[], to: number) =>
	to > 0 && to < items.length && items[to - 1].group !== undefined && items[to - 1].group === items[to].group ? 1 : 0;

/** The cost of the arrangement whose lines start at `starts` (the first entry 0). */
export function toolbarCost(items: readonly ToolbarItem[], starts: readonly number[]): ToolbarCost {
	const cost: ToolbarCost = { lines: starts.length, lone: 0, splits: 0, lastLone: 0 };
	starts.forEach((from, l) => {
		const to = starts[l + 1] ?? items.length;
		const lone = loneOn(items, from, to);
		cost.lone += lone;
		cost.splits += splitAt(items, to);
		if (l === starts.length - 1) cost.lastLone = lone;
	});
	return cost;
}

/**
 * The lines of the best arrangement: each line is the index of its first
 * item, so the first entry is always 0. An item wider than the row is a line
 * of its own (the row shrinks it to fit, as it does now).
 */
export function toolbarLines(items: readonly ToolbarItem[], width: number, gap: number): number[] {
	const n = items.length;
	if (n === 0) return [];
	const fits = (from: number, to: number) => to - from === 1 || lineWidth(items, from, to, gap) <= width + FIT_SLACK;
	type Best = ToolbarCost & { next: number };
	const best: (Best | null)[] = new Array(n + 1).fill(null);
	best[n] = { lines: 0, lone: 0, splits: 0, lastLone: 0, next: n };
	for (let i = n - 1; i >= 0; i--) {
		let pick: Best | null = null;
		// Longest line first, so a tie keeps the line that holds more.
		for (let j = n; j > i; j--) {
			if (!fits(i, j)) continue;
			const rest = best[j]!;
			const lone = loneOn(items, i, j);
			const cost: Best = {
				lines: rest.lines + 1,
				lone: rest.lone + lone,
				splits: rest.splits + splitAt(items, j),
				lastLone: j === n ? lone : rest.lastLone,
				next: j
			};
			if (!pick || compareToolbarCost(cost, pick) < 0) pick = cost;
		}
		best[i] = pick;
	}
	const starts: number[] = [];
	for (let i = 0; i < n; i = best[i]!.next) starts.push(i);
	return starts;
}

/**
 * What a flex row draws on its own: the greedy wrap, with a line also starting
 * at every index in `breaks`. That second argument is the STYLESHEET'S model:
 * the class page's container queries show a zero-height, full-width break
 * before a key at the widths where the greedy wrap would strand one
 * (ClassView's `.tb-br` rules), so the server render, before any script runs,
 * already draws the best arrangement for the toolbars a class page usually
 * has. `tests/classroom-class-toolbar.test.ts` puts those rules through this
 * model at every width.
 */
export function greedyToolbarLines(
	items: readonly ToolbarItem[],
	width: number,
	gap: number,
	breaks: Iterable<number> = []
): number[] {
	const forced = new Set(breaks);
	const starts: number[] = [];
	let from = 0;
	for (let i = 0; i < items.length; i++) {
		if (i === from) {
			starts.push(i);
			continue;
		}
		if (forced.has(i) || lineWidth(items, from, i + 1, gap) > width + FIT_SLACK) {
			from = i;
			starts.push(i);
		}
	}
	return starts;
}

export interface ToolbarFit {
	/** The planned lines, as `toolbarLines` returns them. */
	lines: number[];
	/** Per item, an end margin in px that stops the next key fitting beside it (0 for none). */
	endMargin: number[];
	/** Per item, a flex basis in px for the growing field (null leaves it alone). */
	basis: (number | null)[];
}

/**
 * HOW A FLEX ROW IS MADE TO BREAK WHERE THE PLAN SAYS. A flex row breaks a
 * line when the next key does not fit, so where the plan ends a line early,
 * the line is filled: the growing search field, if the line has it, is given
 * the width it would have grown to anyway (as its basis, so it still fills
 * its line, nothing blank beside it), and anything that still leaves room for
 * the next key becomes an end margin on the line's last key, just wide enough
 * that the next key does not fit. The margin is blank space at the end of a
 * line, where a wrapped line is blank anyway. A line the plan ends where the
 * greedy wrap would end it needs nothing. `lines` is the plan to draw, the
 * best one unless the caller holds some lines where they were (a search being
 * typed into, `toolbarPinnedLines`).
 */
export function toolbarFit(
	items: readonly ToolbarItem[],
	width: number,
	gap: number,
	lines: number[] = toolbarLines(items, width, gap)
): ToolbarFit {
	const n = items.length;
	const endMargin = new Array<number>(n).fill(0);
	const basis = new Array<number | null>(n).fill(null);
	for (let l = 0; l < lines.length - 1; l++) {
		const from = lines[l];
		const to = lines[l + 1];
		const next = items[to];
		const used = lineWidth(items, from, to, gap);
		const free = width - used;
		// The next key fits beside this line on its own: the plan breaks early here.
		if (free < gap + next.width - FIT_SLACK) continue;
		let rest = free;
		for (let i = from; i < to; i++) {
			const growsTo = items[i].growsTo;
			if (growsTo === undefined) continue;
			// Half a pixel short of the line, so a rounding never pushes the
			// field itself off it; the field's own grow takes the half back.
			const grow = Math.max(0, Math.min(rest - 0.5, growsTo - items[i].width));
			if (grow > 0) {
				basis[i] = items[i].width + grow;
				rest -= grow;
			}
			break;
		}
		// One pixel past what the next key needs, so it can never fit.
		const margin = rest - (gap + next.width) + 1;
		if (margin > 0) endMargin[to - 1] = margin;
	}
	return { lines, endMargin, basis };
}

/**
 * WHILE THE SEARCH IS BEING TYPED INTO, NOTHING ON THE ROW MOVES BUT THE KEYS
 * THE SEARCH TAKES AWAY AND GIVES BACK (review round 4, polish rounds 1 and
 * 2). Typing can take the Videos key away (the videos are the ones the search
 * leaves showing) or bring it back, and a word that matches nothing takes
 * Select all with it; a re-plan of the whole row then moved the field under
 * the caret (measured on a 390 phone in round 4: the field halved from 277px
 * to 133 on the first keystroke). So from the moment the field takes the
 * focus until it is left empty, the row is drawn on the lines it had when the
 * hold began (`hold.lineOf`, each key by its own identity, so a Videos key
 * that leaves and comes back is the same key), and the field keeps its width
 * (the caller freezes it):
 *
 *   - THE FIELD NEVER MOVES. Where a key that sat before the field on its
 *     line has gone (the Videos key, in a person's videos-first layout) its
 *     room is kept open before the field (`reserve`), so the field does not
 *     slide left under the caret, and the key comes back into exactly that
 *     room. (A line before the field's that loses every key is the caller's
 *     to keep: it measures the field's top.)
 *   - EVERY OTHER KEY STAYS ON ITS LINE TOO (polish round 2). Polish round 1
 *     held the field and let the keys after it be planned again whenever that
 *     left fewer lone keys, and a Videos key leaving and coming back then
 *     dragged its neighbours with it, keystroke by keystroke: the kind filter
 *     off the search's line and back (a student at 375, a teacher with no
 *     draft at 375 and 390), Done up a line and back (a student at 390),
 *     Drafts down a line and back (a teacher at 390). Now a key that goes
 *     leaves a gap where it stood and nothing closes it, so a line may be left
 *     holding one key while a word is in the box (Select all, or Done). That
 *     is the accepted cost: it lasts only while the field holds a word, and
 *     emptying the field plans the row afresh, as at rest.
 *   - A KEY THAT COMES BACK TAKES ITS OWN LINE BACK. Polish round 1 found a
 *     returning Videos key put on a line of its own under the row and left
 *     there after Escape, because a remounted key was a stranger to the hold;
 *     it is known by its identity now, so the row it returns to is the row it
 *     left. A key the hold never saw takes the line of the key before it, or
 *     joins the first held line when it comes before all of them, never a
 *     line of its own above the field.
 *
 * ONLY A LINE THAT NO LONGER FITS IS DRAWN AGAIN (a key the hold never saw
 * arriving where there is no room for it, or a key that grew). A held line
 * before the field that no longer fits gives the row up to the wrap from that
 * line on, which may move the field, the one case this cannot help besides a
 * key the hold never saw arriving before the field (`heldStarts`). The
 * field's own line keeps as many of its keys as still fit beside it, in their
 * order; every later held line that fits is kept, and from the first that
 * does not, the rest is planned afresh.
 */
export interface ToolbarHold {
	/** Per item now, the line it sat on when the hold began, or null for a key the row did not have then. */
	lineOf: readonly (number | null)[];
	/** The search field's index among the items. */
	field: number;
	/** How far along its line the field's left edge sat when the hold began, in px. */
	fieldLeft: number;
}

export interface ToolbarPinned {
	/** The lines to draw, as `toolbarLines` returns them. */
	lines: number[];
	/** Room kept open before the field, where keys that sat before it on its line have gone (px, 0 for none). */
	reserve: number;
	/** The items the lines were planned on: the field's width includes the reserve, so `toolbarFit` takes these. */
	items: ToolbarItem[];
}

/**
 * The held lines over the keys there are now, as line starts. A key the hold
 * never saw takes the line of the key before it, or the first held key's line
 * when it comes before every held key; the lines never run backwards, so the
 * keys keep their order.
 */
export function heldStarts(lineOf: readonly (number | null)[]): number[] {
	const first = lineOf.find((l) => l !== null) ?? 0;
	const starts: number[] = [];
	let prev = -Infinity;
	lineOf.forEach((held, i) => {
		const line = Math.max(held ?? (prev === -Infinity ? first : prev), prev);
		if (line > prev) starts.push(i);
		prev = line;
	});
	return starts;
}

export function toolbarPinnedLines(
	items: readonly ToolbarItem[],
	width: number,
	gap: number,
	hold: ToolbarHold
): ToolbarPinned {
	const n = items.length;
	const f = hold.field;
	if (n === 0 || f < 0 || f >= n || hold.lineOf.length !== n) {
		return { lines: toolbarLines(items, width, gap), reserve: 0, items: [...items] };
	}
	const held = heldStarts(hold.lineOf);
	const fieldStart = held.filter((s) => s <= f).at(-1) ?? 0;
	let before = 0;
	for (let i = fieldStart; i < f; i++) before += items[i].width + gap;
	const open = hold.fieldLeft - before;
	const reserve = open > 0.5 ? open : 0;
	const plan = items.map((item, i) => (i === f ? { ...item, width: item.width + reserve } : { ...item }));
	const fits = (list: readonly ToolbarItem[], from: number, to: number) =>
		to - from === 1 || lineWidth(list, from, to, gap) <= width + FIT_SLACK;

	// The lines before the field's, and its own up to the field, are held.
	const pre = held.filter((s) => s < fieldStart);
	const bounds = [...pre, fieldStart];
	for (let l = 0; l < bounds.length; l++) {
		const from = bounds[l];
		const to = l < pre.length ? bounds[l + 1] : f + 1;
		if (!fits(l < pre.length ? items : plan, from, to)) {
			// This line no longer fits: the wrap takes the row from here.
			const wrap = greedyToolbarLines(items.slice(from), width, gap).map((s) => s + from);
			return { lines: [...bounds.slice(0, l), ...wrap], reserve: 0, items: [...items] };
		}
	}

	// Every held line still fits: nothing moves.
	if (held.every((from, l) => fits(plan, from, held[l + 1] ?? n))) {
		return { lines: held, reserve, items: plan };
	}

	// The field's line keeps as many of its own keys as fit beside it.
	const after = held.filter((s) => s > fieldStart);
	const fieldEnd = after[0] ?? n;
	let end = fieldEnd;
	while (end > f + 1 && !fits(plan, fieldStart, end)) end--;
	const lines = [...bounds];
	if (end < fieldEnd) {
		// What did not fit on the field's line, and everything after it, is planned afresh.
		lines.push(...toolbarLines(plan.slice(end), width, gap).map((s) => s + end));
		return { lines, reserve, items: plan };
	}
	// Each later held line that fits is kept; from the first that does not, the rest is planned afresh.
	for (let l = 0; l < after.length; l++) {
		const from = after[l];
		const to = after[l + 1] ?? n;
		if (!fits(plan, from, to)) {
			lines.push(...toolbarLines(plan.slice(from), width, gap).map((s) => s + from));
			return { lines, reserve, items: plan };
		}
		lines.push(from);
	}
	return { lines, reserve, items: plan };
}
