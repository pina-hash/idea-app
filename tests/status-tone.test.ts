import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATUS_GLYPHS, STATUS_TONES, STATUS_TONE_NAMES, toneFrom, toneStyle } from '../src/lib/ui/status-tone';
import { GRADE_BANDS } from '../src/lib/classroom/student-overview';
import { workStateTone } from '../src/lib/classroom/classroom';
import { checkInTone } from '../src/lib/classroom/class-check-ins';
import { PRESENCE_DISPLAY } from '../src/lib/classroom/presence/state';
import { COIN_TYPE_TONES } from '../src/lib/coin-desk/transaction-types';

/**
 * THE ONE TONE MAP AND THE ONE STATUS CHIP (ledger 0466).
 *
 * What is held here is what regresses SILENTLY: a grade quietly wearing the
 * live and error red, in progress drifting back onto the warning hue, a
 * draft taking the warning sign, and a second `.tone-*` vocabulary or a
 * hand-rolled status chip class growing back somewhere in `src/`. Each of
 * those renders a perfectly working page that nobody compares with the map.
 * How the chip LOOKS is the browser pass's, never this file's.
 */

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(svelte|css|ts)$/.test(name)) out.push(p);
	}
	return out;
}

/*
 * The status chip classes this lane retired, by name. Rooms that keep their
 * own documented vocabulary are NOT in it: the Foundry's ForgeStatus heat
 * language (`.fg-chip`), GAUNTLET, GREENLINE, IdeaCAD, FRC and FSP, Armory,
 * and the frozen legacy pages. The /dev/themes-shape design board is the
 * archived record of a decision and keeps its own copies.
 */
const RETIRED = [
	'work-chip', 'todo-chip', 'draft-chip', 'sched-chip', 'pin-chip', 'updated-chip', 'export-chip',
	'state-chip', 'roster-chip', 'mark-chip', 'override-chip', 'lg-chip', 'lg-missing-chip', 'lg-signal-chip',
	'lc-wall-chip', 'lc-chip-quiet', 'hp-chip', 'ctool-chip', 'sq-chip', 'tp-chip', 'tsp-chip', 'pq-chip',
	'done-chip', 'pl-chip', 'ib-chip', 'fb-horizon-chip', 'cdx-chip', 'cp-chip', 'cp-debt-chip', 'cpx-chip',
	'type-chip', 'medium-chip', 'mk-chip', 'fs-chip', 'mp-chip', 'live-chip', 'bye-chip', 'ff-chip',
	'err-chip', 'hh-chip', 'strike-chip'
];
const EXEMPT = (rel: string) => rel.startsWith('routes/dev/themes-shape/') || rel.startsWith('lib/legacy/');
const RETIRED_RE = new RegExp(`(?:\\.|class="[^"]*\\b|class=\\{[^}]*\\b)(?:${RETIRED.join('|')})\\b`);
// A bare `.tone-*` class; a room's own prefixed vocabulary (`cert-tone-*`,
// `ar-tone-*`) is that room's and is not this sweep's.
const TONE_CLASS_RE = /\.tone-[a-z]+\b|class="[^"]*(?<![\w-])tone-[{a-z]/;

describe('the one tone map', () => {
	it('has seven tones, each with a glyph the glyph set draws', () => {
		expect([...STATUS_TONE_NAMES].sort()).toEqual(['danger', 'draft', 'info', 'neutral', 'ok', 'special', 'warn']);
		expect(Object.keys(STATUS_TONES).sort()).toEqual([...STATUS_TONE_NAMES].sort());
		for (const t of STATUS_TONE_NAMES) expect(STATUS_GLYPHS[STATUS_TONES[t].glyph], t).toBeDefined();
	});

	it('paints the five coloured tones from the status tokens and nothing else', () => {
		for (const t of ['ok', 'warn', 'danger', 'info', 'special'] as const) {
			const s = STATUS_TONES[t];
			expect(s.solid).toBe(`var(--status-${t}-solid)`);
			expect(s.on).toBe(`var(--status-${t}-on)`);
			expect(s.ink).toBe(`var(--status-${t})`);
			expect(toneStyle(t)).toContain(`--st-solid: var(--status-${t}-solid)`);
		}
	});

	it('gives a draft its own tone and its own mark, never the warning sign', () => {
		expect(STATUS_TONES.draft.glyph).toBe('draft');
		expect(STATUS_TONES.draft.glyph).not.toBe(STATUS_TONES.warn.glyph);
		expect(STATUS_TONES.draft.ink).not.toContain('--status-warn');
		expect(STATUS_TONES.draft.dashed).toBe(true);
		expect(checkInTone('draft')).toBe('draft');
	});

	it('keeps in progress off the warning hue', () => {
		expect(workStateTone('in-progress')).toBe('info');
		expect(PRESENCE_DISPLAY.viewing.tone).toBe('info');
	});

	it('never paints a grade, a fine or a presence state in the danger tone', () => {
		// The danger tone is live, recording and error, and nothing else.
		for (const b of GRADE_BANDS) expect(b.tone, b.band).not.toBe('danger');
		expect(GRADE_BANDS.find((b) => b.band === 'low')!.tone).toBe('warn');
		expect(COIN_TYPE_TONES.fine).not.toBe('danger');
		for (const [k, v] of Object.entries(PRESENCE_DISPLAY)) expect(v.tone, k).not.toBe('danger');
		// The old vocabulary maps onto it in one place, and a refusal is never danger.
		expect(toneFrom('attention')).toBe('warn');
		expect(toneFrom('bad')).toBe('warn');
		expect(toneFrom('muted')).toBe('neutral');
	});
});

describe('one status chip across src', () => {
	const files = walk(SRC).map((p) => ({ rel: relative(SRC, p).split('\\').join('/'), text: readFileSync(p, 'utf8') }));

	it('finds no retired status chip class and no .tone-* copy, and many StatusChip uses', () => {
		const retired = files.filter((f) => !EXEMPT(f.rel) && RETIRED_RE.test(f.text)).map((f) => f.rel);
		const tones = files.filter((f) => !EXEMPT(f.rel) && TONE_CLASS_RE.test(f.text)).map((f) => f.rel);
		const uses = files.reduce((n, f) => n + (f.text.match(/<StatusChip\b/g) ?? []).length, 0);
		expect(retired).toEqual([]);
		expect(tones).toEqual([]);
		// BOTH DIRECTIONS: the sweep above passes vacuously over a tree that
		// draws no status at all, so the chip has to be there in number.
		expect(uses).toBeGreaterThanOrEqual(150);
	});

	it('POSITIVE CONTROL: both patterns catch a planted class and a planted tone copy', () => {
		expect(RETIRED_RE.test('<span class="chip work-chip">x</span>')).toBe(true);
		expect(RETIRED_RE.test('\t.cdx-chip.warn {')).toBe(true);
		expect(TONE_CLASS_RE.test('\t.tone-attention {')).toBe(true);
		expect(TONE_CLASS_RE.test('<span class="chip tone-{chip.tone}">')).toBe(true);
		// And they do not fire on what replaced them.
		expect(RETIRED_RE.test('<StatusChip tone="warn" label="Missing" />')).toBe(false);
		expect(TONE_CLASS_RE.test('style={toneStyle(c.tone)}')).toBe(false);
	});
});
