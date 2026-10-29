/**
 * THE ONE TONE MAP (ledger 0466, feedback de294f40 and 2c3cacb2).
 *
 * Every status the site draws, a chip, a callout, a coloured word in a list,
 * takes its colours and its glyph from this table and from nowhere else. The
 * chip is `StatusChip.svelte`; anything that is not a chip but still says a
 * status reads the same four colours through `toneStyle()`, which sets
 * `--st-ink`, `--st-fill`, `--st-solid`, `--st-on` and `--st-edge` on the
 * element, so a stylesheet writes `color: var(--st-ink)` and never names a
 * hue.
 *
 * THE FIVE COLOURED TONES ARE THE STATUS TOKENS, AND THEY ARE THE ONLY ONES.
 * Lane 0465 solved `--status-<tone>`, `-fill`, `-solid` and `-on` per theme
 * (src/lib/design-system/colors.css and its themes) and held the five solids
 * 12 CIEDE2000 apart, 8 under simulated deuteranopia and protanopia. A sixth
 * hue would break that floor for every reader who needs it, so the two tones
 * that are not status hues, `draft` and `neutral`, carry no hue at all: they
 * are the surface's own recessed tag with a word in the body ink, and the
 * glyph and the edge tell them apart.
 *
 *   ok       done, returned, approved, on the roster                 check
 *   warn     late, missing, needs a look, to mark                    triangle
 *   danger   LIVE, recording and error, and NOTHING ELSE. A grade is
 *            never danger, however low (the tokens' own reservation).  cross
 *   info     information, waiting, IN PROGRESS. In progress is never
 *            the warning hue: the student is doing what was asked.     ring
 *   special  brass: pinned, instructor only, featured                 star
 *   draft    not published yet. Its own tone and its own pencil,
 *            never a warning sign: a draft is not a problem.          pencil
 *   neutral  closed, hidden, excused, not started, archived           dash
 *
 * THE WORD IS ALWAYS SHOWN. Colour is never the only signal, and neither is
 * a glyph; `StatusChip` has no glyph-only form.
 */

export type StatusTone = 'ok' | 'warn' | 'danger' | 'info' | 'special' | 'draft' | 'neutral';

export const STATUS_TONE_NAMES: readonly StatusTone[] = ['ok', 'warn', 'danger', 'info', 'special', 'draft', 'neutral'];

/**
 * 24x24 stroke paths in currentColor, the repo's mark convention (the
 * classroom's `ICONS` reads its done, missing and draft marks from here).
 * `fill` is an optional second path painted solid, for the two glyphs whose
 * meaning is a filled shape (the live dot, the half-full progress ring).
 */
export const STATUS_GLYPHS = {
	check: { d: 'M5 12.5l4.5 4.5L19 7.5' },
	alert: { d: 'M12 8.5v4.5M12 16.5h.01M10.3 4.2L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z' },
	error: { d: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17zM9 9l6 6M15 9l-6 6' },
	live: { d: 'M12 4.5a7.5 7.5 0 1 0 0 15a7.5 7.5 0 0 0 0-15z', fill: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z' },
	info: { d: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17zM12 11v5.5M12 7.8h.01' },
	progress: { d: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17z', fill: 'M12 7a5 5 0 0 1 0 10z' },
	clock: { d: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17zM12 8v4l2.5 2.5' },
	star: { d: 'M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z' },
	pin: { d: 'M9 3.5h6l-1 6.5 3.5 3.5h-11L10 10zM12 13.5v7' },
	draft: { d: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4' },
	dash: { d: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17zM8 12h8' },
	undo: { d: 'M9 6.5L4.5 11 9 15.5M4.5 11H15a4.5 4.5 0 0 1 0 9h-2.5' },
	hidden: { d: 'M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5zM4 4l16 16' },
	lock: { d: 'M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3' },
	ring: { d: 'M12 6a6 6 0 1 0 0 12a6 6 0 0 0 0-12z' },
	elsewhere: { d: 'M5.5 7l5 5-5 5M12.5 7l5 5-5 5' },
	link: { d: 'M10 13.5a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 4.8l-1.7 1.7M14 10.5a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 19.2l1.7-1.7' }
} as const satisfies Record<string, { d: string; fill?: string }>;

export type StatusGlyph = keyof typeof STATUS_GLYPHS;

export interface ToneSpec {
	/** A word or a glyph drawn straight on a ground: 4.5:1 on every ground. */
	ink: string;
	/** The band behind a row or a banner; it carries --text-1. */
	fill: string;
	/** The chip's own face. */
	solid: string;
	/** The word and glyph ON the solid. */
	on: string;
	/** The chip's edge. In the ink, which is solve()'s `line` rule for a solid under 3:1 on its ground. */
	edge: string;
	/** A dashed edge: the draft tone's second signal beside its pencil. */
	dashed: boolean;
	glyph: StatusGlyph;
	/** What the tone means, in words, for the dev harness and the docs. */
	meaning: string;
}

const coloured = (t: 'ok' | 'warn' | 'danger' | 'info' | 'special', glyph: StatusGlyph, meaning: string): ToneSpec => ({
	ink: `var(--status-${t})`,
	fill: `var(--status-${t}-fill)`,
	solid: `var(--status-${t}-solid)`,
	on: `var(--status-${t}-on)`,
	edge: `var(--status-${t})`,
	dashed: false,
	glyph,
	meaning
});

/*
 * The two hueless tones sit on the surface's own recessed tag face where the
 * plate draws one (--plate-chip-ground), and on --surface-2 where it does not.
 */
const TAG_FACE = 'var(--plate-chip-ground, var(--surface-2))';

export const STATUS_TONES: Record<StatusTone, ToneSpec> = {
	ok: coloured('ok', 'check', 'Done, returned, approved'),
	warn: coloured('warn', 'alert', 'Late, missing, needs a look'),
	danger: coloured('danger', 'error', 'Live, recording or an error, never a grade'),
	info: coloured('info', 'info', 'Information, waiting, in progress'),
	special: coloured('special', 'star', 'Pinned, instructor only, featured'),
	draft: {
		ink: 'var(--text-1)',
		fill: TAG_FACE,
		solid: TAG_FACE,
		on: 'var(--text-1)',
		edge: 'var(--boundary)',
		dashed: true,
		glyph: 'draft',
		meaning: 'Not published yet'
	},
	neutral: {
		ink: 'var(--text-2)',
		fill: TAG_FACE,
		solid: TAG_FACE,
		on: 'var(--text-2)',
		edge: 'var(--hairline)',
		dashed: false,
		glyph: 'dash',
		meaning: 'Closed, hidden, excused, not started'
	}
};

/**
 * The tone's colours as custom properties, for an element that says a status
 * without being a chip. Its stylesheet reads `var(--st-ink)` and the rest.
 */
export function toneStyle(tone: StatusTone): string {
	const t = STATUS_TONES[tone];
	return `--st-ink: ${t.ink}; --st-fill: ${t.fill}; --st-solid: ${t.solid}; --st-on: ${t.on}; --st-edge: ${t.edge}`;
}

/**
 * THE OLD VOCABULARY, READ ONCE. Several modules still name a state's tone in
 * the words they always used ('good', 'attention', 'muted', 'missing', ...).
 * They are mapped here, in one place, so no surface keeps a second table.
 * 'missing' is warn (the alert glyph and the word set it apart from
 * "Complete, late", which is warn with a check); 'note' and 'changed' were
 * brass words and are special.
 */
export type LegacyTone =
	| 'good'
	| 'attention'
	| 'info'
	| 'muted'
	| 'missing'
	| 'note'
	| 'changed'
	| 'bad'
	| 'wait'
	| 'gold'
	| 'plain'
	| '';

const LEGACY: Record<LegacyTone, StatusTone> = {
	good: 'ok',
	attention: 'warn',
	info: 'info',
	muted: 'neutral',
	missing: 'warn',
	note: 'special',
	changed: 'special',
	// The coin pages' request and role-day words: a refusal is warn, never
	// danger, and a request still waiting is info.
	bad: 'warn',
	wait: 'info',
	// The market's brass Featured and its plain words.
	gold: 'special',
	plain: 'neutral',
	'': 'neutral'
};

export function toneFrom(tone: LegacyTone | StatusTone): StatusTone {
	return (LEGACY as Record<string, StatusTone>)[tone] ?? (tone as StatusTone);
}

/** The mark for the coin pages' good / bad / wait words. */
export function verdictGlyph(tone: LegacyTone | StatusTone): StatusGlyph {
	const t = toneFrom(tone);
	return t === 'ok' ? 'check' : t === 'warn' ? 'error' : t === 'info' ? 'clock' : 'dash';
}
