// tests/vanguard-board-paging.test.ts
//
// THE BOARD'S SECOND PAGE MUST EXTEND THE BOARD, NOT REPLACE IT, AND GETTING
// THAT WRONG IS INVISIBLE TO EVERY OTHER CHECK.
//
// `fetchOnline` overwrote `onlineBoard` on every call for the whole life of the
// feature, which was correct while one page was all there was. Paging makes the
// same line a defect in one direction only: an append that quietly replaces
// answers 250 rows after LOAD MORE instead of 500, throws page one away, and
// looks on screen exactly like a board that simply refused to grow. Nothing
// type-checks it, the game still runs, and the failure is a number nobody counts.
//
// FOUR CALLERS PREDATE PAGING AND ALL FOUR WANT THE REPLACE (the run start,
// `refreshBoard`, the post-submit refetches, the co-op landing). So the same
// function has to do both, and the pair of assertions below - append extends,
// omitting the flag still replaces - is what stops one being fixed at the other's
// expense.
//
// THIS WALKS THE SHIPPED BUILD, never a fixture of it. `src/lib/legacy/vanguard`
// is one 8,600-line HTML file behind an injection boundary with no module
// exports, no dev harness route and no way to import a function out of it, so the
// board's own source is CUT OUT OF THE REAL FILE by its own anchors and evaluated
// against a stubbed jsonp and a stubbed DOM. That is a real limit and it is worth
// naming: an anchor that drifts makes the extraction fail, which is why every
// `cut` below throws rather than returning empty - a slice that silently came
// back blank would evaluate to nothing and pass.

import { describe, expect, it } from 'vitest';
import { vanguardHtml } from '../src/lib/legacy';

/** Backend page shape: the fields the board reads off an `action=top` row. */
interface Row {
	name: string;
	name2?: string;
	score: number;
	t?: number;
}

/**
 * The slice of the shipped build between two anchors, inclusive of both.
 * Throws when either anchor is missing or ambiguous, so a drifted anchor is a
 * red test rather than an empty string that evaluates to nothing.
 */
function cut(html: string, from: string, to: string): string {
	const a = html.indexOf(from);
	if (a === -1) throw new Error(`anchor not found in the shipped build: ${from}`);
	if (html.indexOf(from, a + 1) !== -1) throw new Error(`anchor is ambiguous: ${from}`);
	const b = html.indexOf(to, a);
	if (b === -1) throw new Error(`closing anchor not found after ${from}: ${to}`);
	return html.slice(a, b + to.length);
}

/** A harness holding the real board functions, wired to a scripted backend. */
interface Board {
	fetchOnline(then?: () => void, fail?: () => void, offset?: number, append?: boolean): void;
	loadMoreBoard(target: string, btn: unknown): void;
	renderBoard(target: string, name?: string, score?: number): void;
	boardState(): { rows: Row[] | null; loaded: number; more: boolean; mode: string };
	setMode(m: string): void;
	html(target: string): string;
	requests: string[];
	/** Answer the next pending jsonp request with these rows (or null to fail it). */
	answer(rows: Row[] | null): void;
}

/**
 * Build the harness from the SHIPPED build text. `source` lets a caller mutate
 * the extracted board source before it is evaluated, which is how the positive
 * control below breaks the append without touching the file on disk.
 */
function makeBoard(mutate: (src: string) => string = (s) => s): Board {
	const html = vanguardHtml;

	// One slice: the board's module-level state through the end of boardKey.
	const state = cut(html, 'let onlineBoard=null, boardRetries=0;', "].join('|'); }");
	const fetchSrc = cut(html, 'function fetchOnline(then,fail,offset,append){', 'boardLoaded, true); }');
	const rowHtml = cut(html, 'function _boardRowHTML(r,rank,me,idx){', '\n}');
	const detail = cut(html, 'function _boardDetail(r,rank){', "return p.join(''); }");
	const rowsFn = cut(html, 'function boardRows(){', 'localBoard(); }');
	const render = cut(html, 'function renderBoard(target,highlightName,highlightScore){', '\n}');
	const esc = cut(html, 'function escHTML(s){', '}[c];}); }');
	const contB = cut(html, 'function contBadge(r){', ": ''; }");

	const src = mutate(
		[
			state,
			esc,
			contB,
			rowHtml,
			detail,
			rowsFn,
			render,
			fetchSrc,
			'return { fetchOnline, loadMoreBoard, renderBoard, boardKey,',
			'  boardState: () => ({ rows: onlineBoard, loaded: boardLoaded, more: boardMore, mode: boardMode }),',
			'  setMode: (m) => { boardMode = m; onlineBoard = null; boardRetries = 0; } };'
		].join('\n')
	);

	const boxes: Record<string, { innerHTML: string }> = {
		bigBoard: { innerHTML: '' },
		titleBoard: { innerHTML: '' }
	};
	const requests: string[] = [];
	const pending: Array<{ ok: (d: unknown) => void; fail: () => void }> = [];

	// The board reads these five names out of the wider game file. Each stub is
	// the narrowest thing the extracted source actually touches.
	const preamble = [
		"const API_URL='https://example.invalid/exec';",
		// BOARD_N, boardMode and the paging counters are NOT stubbed: they come out
		// of the build with the code under test, so the page size this asserts
		// against is the game's own.
		'let _boardShown={};',
		'const el = (id) => __boxes[id];',
		'const Audio_ = { hit: () => {} };',
		'const localBoard = () => [];',
		'const _achTitleChip = () => "";',
		'const jsonp = (url, cb, fail) => { __requests.push(url); __pending.push({ ok: cb, fail }); };'
	].join('\n');

	const factory = new Function('__boxes', '__requests', '__pending', `${preamble}\n${src}`) as (
		b: unknown,
		r: string[],
		p: unknown[]
	) => Omit<Board, 'html' | 'requests' | 'answer'>;

	const api = factory(boxes, requests, pending);

	return {
		...api,
		requests,
		html: (target) => boxes[target].innerHTML,
		answer(rows) {
			const next = pending.shift();
			if (!next) throw new Error('answer() called with no request in flight');
			if (rows === null) next.fail();
			else next.ok(rows);
		}
	};
}

/** `n` descending rows starting at `startScore`, distinct by name and time. */
function page(n: number, startScore: number, tag: string): Row[] {
	return Array.from({ length: n }, (_, i) => ({
		name: `${tag}${i}`,
		score: startScore - i,
		t: i
	}));
}

const FULL = 250;

describe('the shipped build still contains the board source this test walks', () => {
	it('extracts every anchor it needs', () => {
		expect(() => makeBoard()).not.toThrow();
	});

	it('renders the LOAD MORE control from the build, not from this file', () => {
		// The markup asserted below has to exist in the shipped build; asserting on
		// a string this test also wrote would prove nothing about the game.
		expect(vanguardHtml).toContain('class="bmorebtn"');
		expect(vanguardHtml.match(/class="bmorebtn"/g)).toHaveLength(1);
	});
});

describe('fetchOnline paging', () => {
	it('APPENDS a second page and leaves page one in place', () => {
		const b = makeBoard();
		b.fetchOnline();
		b.answer(page(FULL, 10_000, 'a'));
		expect(b.boardState().rows).toHaveLength(FULL);
		expect(b.boardState().loaded).toBe(FULL);
		expect(b.boardState().more).toBe(true);

		b.fetchOnline(undefined, undefined, FULL, true);
		b.answer(page(FULL, 5_000, 'b'));

		// The whole point: 500, not 250. A replace answers 250 here.
		expect(b.boardState().rows).toHaveLength(FULL * 2);
		expect(b.boardState().loaded).toBe(FULL * 2);
		// Page one's rows survived and still sort above page two's.
		expect(b.boardState().rows?.[0].name).toBe('a0');
		expect(b.boardState().rows?.[FULL].name).toBe('b0');
	});

	it('REPLACES when the append flag is omitted, which is what all four old callers do', () => {
		const b = makeBoard();
		b.fetchOnline();
		b.answer(page(FULL, 10_000, 'a'));
		b.fetchOnline();
		b.answer(page(3, 9_000, 'c'));
		expect(b.boardState().rows).toHaveLength(3);
		expect(b.boardState().rows?.[0].name).toBe('c0');
		expect(b.boardState().loaded).toBe(3);
	});

	it('sends the offset on the wire only when paging', () => {
		const b = makeBoard();
		b.fetchOnline();
		b.answer(page(FULL, 10_000, 'a'));
		b.fetchOnline(undefined, undefined, FULL, true);
		expect(b.requests[0]).not.toContain('offset=');
		expect(b.requests[1]).toContain('&offset=250');
		expect(b.requests[1]).toContain('&n=250');
	});

	it('drops a row that arrives on both pages, so a sheet edit mid-page cannot double it', () => {
		const b = makeBoard();
		b.fetchOnline();
		b.answer(page(FULL, 10_000, 'a'));
		const overlap = [...page(1, 10_000 - (FULL - 1), 'a').map(() => ({ name: 'a249', score: 10_000 - 249, t: 249 })), ...page(4, 5_000, 'b')];
		b.fetchOnline(undefined, undefined, FULL, true);
		b.answer(overlap);
		expect(b.boardState().rows).toHaveLength(FULL + 4);
		expect(b.boardState().rows?.filter((r) => r.name === 'a249')).toHaveLength(1);
	});

	it('refuses a page that lands after the mode tab moved', () => {
		const b = makeBoard();
		b.fetchOnline();
		b.answer(page(FULL, 10_000, 'a'));
		b.fetchOnline(undefined, undefined, FULL, true);
		b.setMode('hardcore'); // tab pressed while the page is in flight
		b.answer(page(FULL, 5_000, 'b'));
		// The hardcore rows did not get stapled onto the (now cleared) normal board.
		expect(b.boardState().rows).toBeNull();
	});
});

describe('the LOAD MORE control is only there when it does something', () => {
	it('is absent on a board smaller than a page', () => {
		const b = makeBoard();
		b.fetchOnline();
		b.answer(page(40, 5_000, 'a'));
		b.renderBoard('bigBoard');
		expect(b.boardState().more).toBe(false);
		expect(b.html('bigBoard')).not.toContain('bmorebtn');
		// positive control: the 40 rows really did render
		expect(b.html('bigBoard').match(/class="rk"/g)).toHaveLength(40);
	});

	it('is present after a full page, and gone again once a short page comes back', () => {
		const b = makeBoard();
		b.fetchOnline();
		b.answer(page(FULL, 10_000, 'a'));
		b.renderBoard('bigBoard');
		expect(b.html('bigBoard')).toContain('bmorebtn');
		expect(b.html('bigBoard')).toContain('LOAD MORE');

		b.loadMoreBoard('bigBoard', null);
		b.answer(page(7, 5_000, 'b')); // short page = end of the board
		expect(b.boardState().more).toBe(false);
		expect(b.html('bigBoard')).not.toContain('bmorebtn');
		expect(b.html('bigBoard').match(/class="rk"/g)).toHaveLength(FULL + 7);
	});

	it('draws every loaded row, not the first BOARD_N of them', () => {
		const b = makeBoard();
		b.fetchOnline();
		b.answer(page(FULL, 10_000, 'a'));
		b.fetchOnline(undefined, undefined, FULL, true);
		b.answer(page(FULL, 5_000, 'b'));
		b.renderBoard('bigBoard');
		expect(b.html('bigBoard').match(/class="rk"/g)).toHaveLength(FULL * 2);
	});
});

describe('the rank below the cut is claimed only when it is known', () => {
	it('says BELOW TOP n and never a number while pages remain', () => {
		const b = makeBoard();
		b.fetchOnline();
		b.answer(page(FULL, 10_000, 'a'));
		b.renderBoard('bigBoard', 'ME', 1);
		const out = b.html('bigBoard');
		expect(out).toContain('BELOW TOP 250');
		expect(out).toContain('<span class="rk">&gt;250</span>');
		// The old confidently-wrong answer was exactly this, and must not be back.
		expect(out).not.toContain('<span class="rk">251</span>');
	});

	it('prints the real rank once the last page has come back short', () => {
		const b = makeBoard();
		b.fetchOnline();
		b.answer(page(FULL, 10_000, 'a'));
		b.loadMoreBoard('bigBoard', null);
		b.answer(page(10, 5_000, 'b')); // 260 rows total, board complete
		b.renderBoard('bigBoard', 'ME', 1);
		const out = b.html('bigBoard');
		expect(out).toContain('<span class="rk">261</span>'); // all 260 outrank a score of 1
		expect(out).not.toContain('BELOW TOP');
		expect(out).not.toContain('&gt;');
	});

	it('keeps the player marked across a LOAD MORE re-render', () => {
		const b = makeBoard();
		b.fetchOnline();
		b.answer(page(FULL, 10_000, 'a'));
		b.renderBoard('bigBoard', 'ME', 1);
		b.loadMoreBoard('bigBoard', null);
		b.answer(page(2, 5_000, 'b'));
		// renderBoard was re-run by loadMoreBoard with the remembered highlight
		expect(b.html('bigBoard')).toContain('class="row me"');
	});
});

describe('a failed page leaves the board alone', () => {
	it('keeps the loaded rows and does not advance the offset', () => {
		const b = makeBoard();
		b.fetchOnline();
		b.answer(page(FULL, 10_000, 'a'));
		b.loadMoreBoard('bigBoard', null);
		b.answer(null);
		expect(b.boardState().rows).toHaveLength(FULL);
		expect(b.boardState().loaded).toBe(FULL);
		expect(b.boardState().more).toBe(true);
	});
});
