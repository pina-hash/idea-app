/**
 * ============================================================================
 * CLASS THEMES: THE CATALOGUE A CLASS VOTES FROM, AND THE ONE WAY IT PAINTS
 * (decision 45, report R07).
 * ============================================================================
 *
 * A course has a theme that tells it apart from every other class: a banner
 * wash and edge, a banner pattern and a badge. The students vote on each of
 * those FEATURES, the most-voted option of each one wins (the database keeps
 * the tally and breaks a tie toward the option that reached it first), and the
 * sections of one course share the result. What tells Block 2 from Block 4 is
 * the one colour a teacher sets per section, `SECTION_ACCENTS`, because a
 * student in one block cannot usefully vote on another block's colour.
 *
 * THIS MODULE IS THE CATALOGUE AND THE DATABASE IS NOT. `0225` stores an
 * option id as bounded free text (1 to 40 of `[a-z0-9-]`) and keeps no preset
 * list, for the reason `0223` gives about team badges: a CHECK constraint
 * would be a second copy of a list that has to change without a migration. So
 * everything that decides what an id MEANS is here, and every read VALIDATES
 * against it: an id this build does not know is DROPPED, never rendered, so a
 * stored value can never put a surface into a state no branch draws.
 *
 * OPTION IDS ARE APPEND-ONLY, the way avatar presets and `curriculum.ts`'s
 * `SECTIONS` are. A shipped id may sit in a vote row or a section's accent,
 * and dropping or renaming one silently turns that class's choice back into
 * the default with nothing saying why. `tests/classroom-class-theme.test.ts`
 * pins every list as a PREFIX, so a removal, a rename or a reorder reddens
 * and an addition at the end does not. Retire an option by leaving it out of
 * what a panel OFFERS, never by deleting it here.
 *
 * NOTHING HERE READS A CLOCK, TOUCHES THE DOM OR IMPORTS SVELTE. The ballot,
 * the words and the paint are pure functions of a payload, which is what lets
 * the contrast sweep measure the exact strings a page receives.
 *
 * ----------------------------------------------------------------------------
 * HOW A COLOUR IS WRITTEN, AND WHY EVERY ONE IS A PAIR
 * ----------------------------------------------------------------------------
 * All three site themes occur on a class page (Space White is route-scoped TO
 * the classroom; IDEA and Matrix are dark), so every colour a palette or an
 * accent contributes is a `ThemeColour`: ONE entry of the kit's colour library
 * (`tools/hx-kit/kit/colors.json`, the `lib` field) and the two values
 * `solve()` gives it, `dark` for IDEA and Matrix and `light` for Space White
 * (ledger 0467). They are read out of the generated `$lib/design-system/identity`
 * and never typed here: a wash takes the entry's `fill`, and an edge and an
 * accent take its `ink`, the strongest value solve() gives an entry (6:1 on
 * every dark ground, 4.8:1 on every Space White one), because both sit on a
 * palette's wash under a pattern stroke, where the `line` of FIRST red read
 * 2.91 and of magenta 2.49. solve() keeps the entry's hue and moves lightness, which is
 * CLAUDE.md's ink rule (`--acc-ink`, `Pathway.inkOnLight`) made by the solver
 * rather than by review. Until ledger 0467 these were hand-picked HSL pairs.
 *
 * WHAT PAINTS WHAT (the same construction `IdentityBanner` measured):
 *
 *   the banner ground  a WASH of the palette's `wash` colour at
 *                      `CLASS_THEME_WASH_ALPHA` (0.22) over the room's own
 *                      card or plate face -- never a fill under the text
 *   the class name     the room's own `--text-1`, never a colour from here
 *   a badge glyph      the room's own `--text-1` too: a badge is READ, so it
 *                      takes the text tier (IdentityBanner's 2.11:1 red crown
 *                      on amber is why)
 *   the edge and rule  the palette's `edge` colour, a graphical object (3:1)
 *   the pattern        the palette's `edge` colour at
 *                      `CLASS_THEME_PATTERN_ALPHA`, as one repeating gradient
 *   the accent stripe  the section's accent, a graphical object (3:1)
 *
 * MEASURED (tests/classroom-class-theme.test.ts, every palette x every accent
 * x every ground below, with and without a pattern stroke under the point;
 * grounds read out of the theme CSS, never typed): the banner grounds are
 * `--surface-0/1/2` and the classroom plate's page and card faces
 * (`--plate-plate-top/bot`, `--plate-panel-top/bot`); an edge and an accent
 * are also measured on the plate's key faces (`--plate-face-top/bot`,
 * `--plate-lit-top`) so a header strip key may carry either.
 *
 *                     text-1 on the wash      edge          accent
 *                     WCAG   projector       WCAG  proj    WCAG  proj
 *     IDEA            6.65   5.00            3.83  3.00    3.84  3.01
 *     Matrix          6.41   4.83            3.85  3.02    3.86  3.03
 *     Space White     8.06   4.60            3.91  2.99    3.93  2.99
 *
 * (ledger 0467, the library's solved values) against floors of 4.5 (text),
 * 3.0 (graphical) and, under `PROJECTOR_MODEL`, 4.5 (body text) and 2.0 (a
 * boundary). `--text-2` does NOT clear on the washed ground of the dark
 * themes (3.13 IDEA, 3.34 Matrix; 4.41 on Space White), which is the `IdentityBanner`
 * tagline finding again: nothing on the banner is painted in `--text-2`; a
 * second line on it takes `--text-1` and differs by size or face.
 *
 * ----------------------------------------------------------------------------
 * HOW A SURFACE PAINTS ONE
 * ----------------------------------------------------------------------------
 * `classThemeVars(theme)` is an inline-style string of custom properties for
 * the component's root, carrying BOTH twins of every colour:
 *
 *   --ct-wash / --ct-wash-light         a colour WITH its alpha, to lay over
 *                                       the ground: `background-color` on an
 *                                       element that sits on the card, or
 *                                       `linear-gradient(var(--ct-wash),
 *                                       var(--ct-wash))` as a layer over the
 *                                       card's own background
 *   --ct-edge / --ct-edge-light         opaque
 *   --ct-pattern / --ct-pattern-light   a `background-image` value (`none`
 *                                       for the plain pattern)
 *   --ct-accent / --ct-accent-light     opaque, and ABSENT when the section
 *                                       has no accent, so a stripe reads
 *                                       `var(--ct-accent, var(--ct-edge))`
 *
 * The component's own stylesheet picks the twin under
 * `:root[data-theme='space-white']`, into a USED property of its own
 * (`--ct-w: var(--ct-wash)` by default and `--ct-w: var(--ct-wash-light)`
 * under the theme). Never redeclare `--ct-wash` itself from its twin: the
 * inline declaration outranks any stylesheet rule on that element, so the
 * override would silently lose.
 *
 * `classThemeWords(theme)` says the same theme in words ("Ocean palette,
 * rings pattern, gear badge, gold section color"), so no surface carries a
 * theme as colour alone. A null theme renders NOTHING: `resolveClassTheme`
 * answers null for a course with no votes and no accent, which is the state
 * every class is in today and has to look exactly as it does now.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { BADGE_BY_ID } from '$lib/identity-style';
import { IDENTITY, type IdentityName } from '$lib/design-system/identity';
import { isSignedOutFailure } from './poll';

/* ========================================================================== */
/* The catalogue                                                              */
/* ========================================================================== */

/** The three things a class votes on, in the order a ballot lists them. */
export type ClassThemeFeature = 'palette' | 'pattern' | 'badge';
export const CLASS_THEME_FEATURES: readonly ClassThemeFeature[] = ['palette', 'pattern', 'badge'];

/**
 * A feature's name as a person reads it. The same word `classThemeWords` uses
 * ("Ocean palette"), so the ballot and the description of the result agree.
 */
export const CLASS_THEME_FEATURE_LABELS: Record<ClassThemeFeature, string> = {
	palette: 'Palette',
	pattern: 'Pattern',
	badge: 'Badge'
};

/** One line saying what a feature changes, for the voting panel. */
export const CLASS_THEME_FEATURE_HINTS: Record<ClassThemeFeature, string> = {
	palette: 'The colors of the class banner and its edge.',
	pattern: 'A pattern drawn across the class banner.',
	badge: 'A symbol beside the class name.'
};

/**
 * The shape the database accepts for a feature or option id (0225), so a
 * value this module would never send is refused here before a round trip.
 */
export const CLASS_THEME_ID = /^[a-z0-9-]{1,40}$/;

/** One colour as a pair of solved values: see the header. */
export interface ThemeColour {
	/** The kit library entry it is solved from. */
	lib: IdentityName;
	/** On the dark themes (IDEA, Matrix): `#rrggbb`. */
	dark: string;
	/** On Space White: `#rrggbb`. */
	light: string;
}

export type ThemeSide = 'dark' | 'light';

/** One role of one library entry, as both twins. */
function solved(lib: IdentityName, role: 'fill' | 'ink'): ThemeColour {
	return { lib, dark: IDENTITY[lib].dark[role], light: IDENTITY[lib].light[role] };
}

/** The CSS for one side of a pair, with an alpha when one is given. */
export function themeColourCss(colour: ThemeColour, side: ThemeSide, alpha?: number): string {
	const hex = side === 'dark' ? colour.dark : colour.light;
	if (alpha === undefined) return hex;
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
	return `rgb(${r} ${g} ${b} / ${alpha})`;
}

/**
 * THE WASH IS 0.22, IdentityBanner's own figure, measured again here over this
 * catalogue: high enough that six palettes read as six colours on a dark card,
 * low enough that the room's `--text-1` keeps at least 4.70:1 under the
 * projector on every ground. The pattern stroke is laid over the wash at 0.16:
 * visible as texture, and the text still clears where a stroke runs under it
 * (the sweep measures that point, not only the bare wash).
 */
export const CLASS_THEME_WASH_ALPHA = 0.22;
export const CLASS_THEME_PATTERN_ALPHA = 0.16;

export interface PaletteOption {
	id: string;
	label: string;
	/** Laid over the room's own card at CLASS_THEME_WASH_ALPHA. Never a fill under text. */
	wash: ThemeColour;
	/** The banner's edge and rule, and the pattern's stroke. A graphical object: 3:1. */
	edge: ThemeColour;
}

/**
 * THE PALETTES (ledger 0467: each wash and edge an entry of the kit's colour
 * library, solved per theme). Two quote brands the site already carries; the
 * rest are the library's linking set and its neutral steel, chosen so no two
 * palettes read alike and none reads as `--crimson`'s live/error red on its
 * own (the test holds every WASH at least 20 degrees of hue off crimson's;
 * FIRST red is an edge, beside a blue wash).
 *
 * - `idea`: the brand green, the one palette that is green, because it is
 *   named for the brand (`idea-green`, read off `--green` by the generator).
 * - `frc`: FIRST's blue wash and red edge (`first-blue`, `first-red`).
 */
export const CLASS_THEME_PALETTES: readonly PaletteOption[] = [
	{ id: 'idea', label: 'IDEA', wash: solved('idea-green', 'fill'), edge: solved('idea-green', 'ink') },
	{ id: 'frc', label: 'FRC', wash: solved('first-blue', 'fill'), edge: solved('first-red', 'ink') },
	{ id: 'ocean', label: 'Ocean', wash: solved('sky', 'fill'), edge: solved('sky', 'ink') },
	{ id: 'ember', label: 'Ember', wash: solved('marigold', 'fill'), edge: solved('coral', 'ink') },
	{ id: 'violet', label: 'Violet', wash: solved('violet', 'fill'), edge: solved('magenta', 'ink') },
	{ id: 'steel', label: 'Steel', wash: solved('steel', 'fill'), edge: solved('steel', 'ink') }
];

export interface PatternOption {
	id: string;
	label: string;
	/**
	 * ONE repeating gradient with `{c}` where the stroke colour goes, or null
	 * for the plain banner. Data rather than a function so a resolved theme can
	 * travel through a load. ONE gradient is also the no-grid rule made
	 * structural: a single family of lines cannot cross itself, so no pattern
	 * here can be a grid, and the test holds every template to exactly one.
	 */
	template: string | null;
}

/** Decoration on the banner only, never behind content anywhere else. */
export const CLASS_THEME_PATTERNS: readonly PatternOption[] = [
	{ id: 'plain', label: 'Plain', template: null },
	{
		id: 'stripes',
		label: 'Stripes',
		template: 'repeating-linear-gradient(135deg, {c} 0 2px, transparent 2px 12px)'
	},
	{
		id: 'rings',
		label: 'Rings',
		template: 'repeating-radial-gradient(circle at 100% 50%, {c} 0 2px, transparent 2px 14px)'
	},
	{
		id: 'rays',
		label: 'Rays',
		template: 'repeating-conic-gradient(at 100% 100%, {c} 0deg 2deg, transparent 2deg 9deg)'
	},
	{
		id: 'ripples',
		label: 'Ripples',
		template:
			'repeating-radial-gradient(ellipse 160% 120% at 0% 100%, ' +
			'{c} 0 2px, transparent 2px 16px)'
	}
];

export interface BadgeOption {
	id: string;
	label: string;
	/** The identity layer's own path array (never a copy); empty for none. */
	paths: readonly string[];
}

/**
 * THE BADGES ARE THE IDENTITY LAYER'S, BY REFERENCE. The ids, labels and paths
 * come from `BADGES` in `$lib/identity-style`, so `BadgeIcon` draws a class
 * badge with no second artwork, and a path fixed there is fixed here. The
 * subset leaves out `crown` and `skull`: a class symbol is shown to everybody
 * in it, and a rank mark or a skull is a choice a person makes for themselves,
 * not one a vote makes for thirty.
 */
const BADGE_SUBSET = ['bolt', 'star', 'shield', 'gear', 'rocket', 'flame'] as const;

export const CLASS_THEME_BADGES: readonly BadgeOption[] = [
	{ id: 'none', label: 'None', paths: [] },
	...BADGE_SUBSET.map((id) => {
		const def = BADGE_BY_ID[id];
		return { id: def.id, label: def.label, paths: def.paths };
	})
];

export interface AccentOption {
	id: string;
	label: string;
	colour: ThemeColour;
}

/**
 * THE ONE COLOUR A TEACHER SETS PER SECTION. Six entries of the kit's colour
 * library, each read as its `ink` (see the header), so two blocks of one course never share a near
 * colour. None is a red: the nearest is the orange of `filament-orange`, 28
 * degrees off crimson's hue, because a stripe that reads as the error red says
 * something the class did not do. None is green either (green means act and done): the
 * `mint` id, which a section may have stored, is the library's indigo since
 * ledger 0467 and says so in its label, so its words match its colour.
 */
export const SECTION_ACCENTS: readonly AccentOption[] = [
	{ id: 'gold', label: 'Gold', colour: solved('marigold', 'ink') },
	{ id: 'tangerine', label: 'Tangerine', colour: solved('filament-orange', 'ink') },
	{ id: 'rose', label: 'Rose', colour: solved('magenta', 'ink') },
	{ id: 'violet', label: 'Violet', colour: solved('violet', 'ink') },
	{ id: 'sky', label: 'Sky', colour: solved('sky', 'ink') },
	{ id: 'mint', label: 'Indigo', colour: solved('indigo', 'ink') }
];

/** What a feature takes when the class has voted on other features but not this one. */
export const CLASS_THEME_DEFAULTS: Record<ClassThemeFeature, string> = {
	palette: 'idea',
	pattern: 'plain',
	badge: 'none'
};

/** Every feature's options as the ballot lists them. */
export const CLASS_THEME_OPTIONS: Record<
	ClassThemeFeature,
	readonly { id: string; label: string }[]
> = {
	palette: CLASS_THEME_PALETTES,
	pattern: CLASS_THEME_PATTERNS,
	badge: CLASS_THEME_BADGES
};

const byId = <T extends { id: string }>(list: readonly T[]): ReadonlyMap<string, T> =>
	new Map(list.map((o) => [o.id, o]));
const PALETTE_BY_ID = byId(CLASS_THEME_PALETTES);
const PATTERN_BY_ID = byId(CLASS_THEME_PATTERNS);
const BADGE_OPTION_BY_ID = byId(CLASS_THEME_BADGES);
const ACCENT_BY_ID = byId(SECTION_ACCENTS);
const OPTION_IDS: Record<ClassThemeFeature, ReadonlyMap<string, { id: string; label: string }>> = {
	palette: PALETTE_BY_ID,
	pattern: PATTERN_BY_ID,
	badge: BADGE_OPTION_BY_ID
};

export function isClassThemeFeature(value: unknown): value is ClassThemeFeature {
	return typeof value === 'string' && (CLASS_THEME_FEATURES as readonly string[]).includes(value);
}

/** Is this an option this build can draw for that feature? */
export function isClassThemeOption(feature: ClassThemeFeature, value: unknown): value is string {
	return typeof value === 'string' && OPTION_IDS[feature].has(value);
}

export function isSectionAccent(value: unknown): value is string {
	return typeof value === 'string' && ACCENT_BY_ID.has(value);
}

/** An option's label, or null for an id this build does not know. */
export function classThemeOptionLabel(feature: ClassThemeFeature, id: string): string | null {
	return OPTION_IDS[feature].get(id)?.label ?? null;
}

export function sectionAccentLabel(id: string): string | null {
	return ACCENT_BY_ID.get(id)?.label ?? null;
}

/* ========================================================================== */
/* Resolution                                                                 */
/* ========================================================================== */

/** Feature to winning option id. A feature nobody voted on is absent. */
export type ClassThemeWinners = Partial<Record<ClassThemeFeature, string>>;

/** What `classroom_class_themes` answers for one section, validated. */
export interface ClassThemeChoice {
	section_id: string;
	course_id: string;
	accent: string | null;
	winners: ClassThemeWinners;
}

/**
 * A winners map with everything this build cannot draw removed: an unknown
 * feature, an unknown option, a value that is not a string. Anything that is
 * not an object reads as no winners at all.
 */
export function parseClassThemeWinners(raw: unknown): ClassThemeWinners {
	const out: ClassThemeWinners = {};
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
	for (const feature of CLASS_THEME_FEATURES) {
		const value = (raw as Record<string, unknown>)[feature];
		if (isClassThemeOption(feature, value)) out[feature] = value;
	}
	return out;
}

export interface ClassTheme {
	palette: PaletteOption;
	pattern: PatternOption;
	badge: BadgeOption;
	/** The section's own accent, or null when the teacher has set none. */
	accent: AccentOption | null;
	/** Which features the class actually chose; the rest are defaults. */
	chosen: Record<ClassThemeFeature, boolean>;
}

/**
 * THE THEME A CLASS HAS, OR NULL FOR "RENDER EXACTLY AS TODAY". Null when
 * nothing survives validation: no winner this build knows and no accent it
 * knows. Once anything is chosen, every feature resolves -- to its winner, or
 * to its default -- so a surface never has to ask whether a palette exists.
 * Takes a raw payload as well as a validated choice, and re-validates either.
 */
export function resolveClassTheme(
	choice: { winners?: unknown; accent?: unknown } | null | undefined
): ClassTheme | null {
	if (!choice || typeof choice !== 'object') return null;
	const winners = parseClassThemeWinners(choice.winners);
	const accent = isSectionAccent(choice.accent) ? ACCENT_BY_ID.get(choice.accent)! : null;
	if (!accent && CLASS_THEME_FEATURES.every((f) => winners[f] === undefined)) return null;
	const pick = (feature: ClassThemeFeature) => winners[feature] ?? CLASS_THEME_DEFAULTS[feature];
	return {
		palette: PALETTE_BY_ID.get(pick('palette'))!,
		pattern: PATTERN_BY_ID.get(pick('pattern'))!,
		badge: BADGE_OPTION_BY_ID.get(pick('badge'))!,
		accent,
		chosen: {
			palette: winners.palette !== undefined,
			pattern: winners.pattern !== undefined,
			badge: winners.badge !== undefined
		}
	};
}

/** Every section that has a theme, keyed by section id; a section with none is absent. */
export function classThemesBySection(
	choices: readonly ClassThemeChoice[]
): Record<string, ClassTheme> {
	const out: Record<string, ClassTheme> = {};
	for (const c of choices) {
		const theme = resolveClassTheme(c);
		if (theme) out[c.section_id] = theme;
	}
	return out;
}

/* ========================================================================== */
/* Paint and words                                                            */
/* ========================================================================== */

/** A pattern's `background-image` value in a given stroke colour (`none` when plain). */
export function patternCss(pattern: PatternOption, stroke: string): string {
	return pattern.template ? pattern.template.replace('{c}', stroke) : 'none';
}

/**
 * THE SAME PATTERN, ABLE TO FLOW (Mr. Pina, 2026-10-14: "the class banner
 * animations are still glitching and pausing. they should be smoothly
 * continuous looping animations").
 *
 * DERIVED FROM THE ONE TEMPLATE, NEVER A SECOND COPY OF IT. A repeating
 * gradient moved by exactly one period is the same picture, so the loop is
 * seamless by construction and never has to stop, turn round or ease: every
 * stop of a linear or radial template is shifted by `var(--ct-phase)` (stripes
 * slide along their own direction, rings and ripples grow outward), and a
 * conic template turns from `var(--ct-turn)`. The banner animates that one
 * registered property from zero to `period`, linearly, forever. At phase zero
 * the picture is the still template's, so the frame the contrast sweep
 * measures is every frame's.
 *
 * WHY NOT A TRANSFORM, WHICH IS WHAT THE MOTION USED TO BE. Rings cannot loop
 * by scaling (scaling changes their spacing, so the last frame never matches
 * the first), and rays turned about a corner uncover the banner unless the
 * layer is thousands of pixels square. Both were therefore oscillations that
 * slowed to a stop at each end, which is the "pausing" in the report.
 */
export interface PatternFlow {
	/** The `background-image` value with the phase variable in it. */
	css: string;
	/** One period, in the unit below: the loop's whole travel. */
	period: number;
	unit: 'px' | 'deg';
	/** The registered property the banner animates. */
	property: '--ct-phase' | '--ct-turn';
}

/** A pattern's flowing form in a given stroke colour, or null for the plain banner. */
export function patternFlow(pattern: PatternOption, stroke: string): PatternFlow | null {
	if (!pattern.template) return null;
	const still = pattern.template.replace('{c}', stroke);
	const open = still.indexOf('(');
	const fn = still.slice(0, open);
	if (fn === 'repeating-conic-gradient') {
		const stops = [...still.matchAll(/(\d+(?:\.\d+)?)deg/g)].map((m) => Number(m[1]));
		return {
			css: `${fn}(from var(--ct-turn) ${still.slice(open + 1)}`,
			period: Math.max(...stops),
			unit: 'deg',
			property: '--ct-turn'
		};
	}
	// The arguments after the first are the colour stops: a colour, then one
	// or two positions. Only those positions move; the first argument (the
	// angle, or the shape and centre) is the gradient's geometry and stays.
	const args = splitTopLevel(still.slice(open + 1, still.lastIndexOf(')')));
	let period = 0;
	const moved = args.map((arg, i) => {
		if (i === 0) return arg;
		const [colour, ...positions] = splitSpaces(arg);
		return [
			colour,
			...positions.map((pos) => {
				const px = pos === '0' ? 0 : Number(pos.replace(/px$/, ''));
				period = Math.max(period, px);
				return `calc(${px}px + var(--ct-phase))`;
			})
		].join(' ');
	});
	return { css: `${fn}(${moved.join(', ')})`, period, unit: 'px', property: '--ct-phase' };
}

/** Split on commas that are not inside parentheses (a colour can be `hsl(... / a)`). */
function splitTopLevel(s: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < s.length; i++) {
		if (s[i] === '(') depth++;
		else if (s[i] === ')') depth--;
		else if (s[i] === ',' && depth === 0) {
			out.push(s.slice(start, i).trim());
			start = i + 1;
		}
	}
	out.push(s.slice(start).trim());
	return out;
}

/** Split on spaces that are not inside parentheses. */
function splitSpaces(s: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = '';
	for (const ch of s) {
		if (ch === '(') depth++;
		else if (ch === ')') depth--;
		if (ch === ' ' && depth === 0) {
			if (cur) out.push(cur);
			cur = '';
		} else cur += ch;
	}
	if (cur) out.push(cur);
	return out;
}

/**
 * HOW FAST EACH PATTERN FLOWS: one period's travel, in milliseconds. Slow on
 * purpose (about four pixels a second, a degree and a half a second for rays):
 * a banner is beside the work all period, and motion that can be noticed
 * from across the room is motion that pulls the eye off the page.
 */
export const PATTERN_FLOW_MS: Readonly<Record<string, number>> = {
	stripes: 3000,
	rings: 3500,
	ripples: 4000,
	rays: 6000
};

/** Frames a second the flow is stepped at: enough to read as smooth at this speed, half the paints of 60. */
export const PATTERN_FLOW_FPS = 30;

/**
 * WHERE IN ITS LOOP A FLOW IS AT A WALL-CLOCK INSTANT. Every banner, on every
 * page, is at the same phase at the same moment, so leaving the class page and
 * coming back (which remounts the banner) lands where the pattern already was
 * rather than restarting it: a restart is a jump, and a jump is a glitch.
 */
export function patternFlowOffset(nowMs: number, durationMs: number): number {
	if (!(durationMs > 0)) return 0;
	const at = nowMs % durationMs;
	return at < 0 ? at + durationMs : at;
}

/** The values one side of a theme paints, as CSS. */
export interface ClassThemeSideCss {
	wash: string;
	edge: string;
	pattern: string;
	accent: string | null;
}

/** One side of a theme, resolved to the exact strings `classThemeVars` emits. */
export function classThemeCss(theme: ClassTheme, side: ThemeSide): ClassThemeSideCss {
	return {
		wash: themeColourCss(theme.palette.wash, side, CLASS_THEME_WASH_ALPHA),
		edge: themeColourCss(theme.palette.edge, side),
		pattern: patternCss(
			theme.pattern,
			themeColourCss(theme.palette.edge, side, CLASS_THEME_PATTERN_ALPHA)
		),
		accent: theme.accent ? themeColourCss(theme.accent.colour, side) : null
	};
}

/**
 * THE INLINE STYLE A THEMED SURFACE PUTS ON ITS ROOT: both twins of every
 * colour, the accent pair only when the section has one, and the empty string
 * for no theme (so `style={classThemeVars(t) || undefined}` writes nothing).
 * Every value comes from the catalogue, never from a payload, so nothing a
 * row carries can reach a style attribute.
 */
export function classThemeVars(theme: ClassTheme | null | undefined): string {
	if (!theme) return '';
	const dark = classThemeCss(theme, 'dark');
	const light = classThemeCss(theme, 'light');
	const vars: [string, string][] = [
		['--ct-wash', dark.wash],
		['--ct-wash-light', light.wash],
		['--ct-edge', dark.edge],
		['--ct-edge-light', light.edge],
		['--ct-pattern', dark.pattern],
		['--ct-pattern-light', light.pattern]
	];
	if (dark.accent && light.accent) {
		vars.push(['--ct-accent', dark.accent], ['--ct-accent-light', light.accent]);
	}
	return vars.map(([k, v]) => `${k}:${v}`).join(';');
}

/**
 * THE FLOWING PATTERN'S TWO TWINS, for the pattern layer's own style
 * attribute, and how long one period takes. The variables sit ON THE LAYER
 * rather than on the banner because a `var()` inside a custom property is
 * resolved where that property is declared: declared on the banner, the phase
 * would be read from the banner, and animating it there would restyle the
 * whole class header every frame instead of one span.
 */
export function classThemeFlow(
	theme: ClassTheme | null | undefined
): { style: string; property: PatternFlow['property']; period: number; unit: PatternFlow['unit']; durationMs: number } | null {
	if (!theme) return null;
	const dark = patternFlow(theme.pattern, themeColourCss(theme.palette.edge, 'dark', CLASS_THEME_PATTERN_ALPHA));
	const light = patternFlow(theme.pattern, themeColourCss(theme.palette.edge, 'light', CLASS_THEME_PATTERN_ALPHA));
	if (!dark || !light) return null;
	return {
		style: `--ct-pf:${dark.css};--ct-pf-light:${light.css}`,
		property: dark.property,
		period: dark.period,
		unit: dark.unit,
		durationMs: PATTERN_FLOW_MS[theme.pattern.id] ?? 4000
	};
}

/**
 * THE THEME IN WORDS, so a surface is never colour alone: "Ocean palette,
 * rings pattern, gear badge, gold section color". The palette is always
 * named because it is always painted; a plain pattern and no badge are left
 * out because there is nothing on screen for them to describe. Empty for no
 * theme.
 */
export function classThemeWords(theme: ClassTheme | null | undefined): string {
	if (!theme) return '';
	const parts = [`${theme.palette.label} palette`];
	if (theme.pattern.template) parts.push(`${theme.pattern.label.toLowerCase()} pattern`);
	if (theme.badge.paths.length > 0) parts.push(`${theme.badge.label.toLowerCase()} badge`);
	if (theme.accent) parts.push(`${theme.accent.label.toLowerCase()} section color`);
	return parts.join(', ');
}

/* ========================================================================== */
/* The live tally                                                             */
/* ========================================================================== */

/**
 * HOW OFTEN AN OPEN THEME PANEL RE-READS THE TALLY, and on a return to the tab
 * besides (the shared poller, `$lib/classroom/poll`). A vote is something a
 * class does together in a few minutes; a student's OWN vote moves the banner
 * at once from the vote's answer, so the poll is only how a classmate's vote
 * arrives. 30 SECONDS, RAISED FROM 15 IN LEDGER 0357: at 15, thirty students
 * with the panel open were two reads a second for the class, on the database
 * that stalled at 8:00 on 2026-09-29 and 2026-09-30. The fast rate is used only
 * while `voting_open` is true; while voting is CLOSED the tally only moves when
 * a teacher opens or resets it, so it is re-read every two minutes, and only
 * while the panel is open at all. `classThemePollMs` answers which.
 */
export const CLASS_THEME_POLL_MS = 30_000;
export const CLASS_THEME_IDLE_POLL_MS = 120_000;

export function classThemePollMs(votingOpen: boolean): number {
	return votingOpen ? CLASS_THEME_POLL_MS : CLASS_THEME_IDLE_POLL_MS;
}

export interface ClassThemeCount {
	feature: ClassThemeFeature;
	option: string;
	votes: number;
}

/** What `classroom_theme_tally` answers, validated. Counts only: never who voted. */
export interface ClassThemeTally {
	course_id: string;
	voting_open: boolean;
	reset_at: string | null;
	/** The caller manages a section of the course (opens, closes and resets). */
	manages: boolean;
	/** The caller may vote (enrolled in a live section, not a manager). */
	can_vote: boolean;
	voters: number;
	counts: ClassThemeCount[];
	winners: ClassThemeWinners;
	/** The caller's own votes. */
	mine: ClassThemeWinners;
}

const nonNegativeInt = (v: unknown): number =>
	typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
const stringOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** A tally payload validated; null when it is not one. */
export function parseClassThemeTally(raw: unknown): ClassThemeTally | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.course_id !== 'string' || !r.course_id) return null;
	const counts: ClassThemeCount[] = [];
	if (Array.isArray(r.counts)) {
		for (const c of r.counts) {
			if (!c || typeof c !== 'object') continue;
			const { feature, option, votes } = c as Record<string, unknown>;
			if (!isClassThemeFeature(feature) || !isClassThemeOption(feature, option)) continue;
			counts.push({ feature, option, votes: nonNegativeInt(votes) });
		}
	}
	return {
		course_id: r.course_id,
		voting_open: r.voting_open === true,
		reset_at: stringOrNull(r.reset_at),
		manages: r.manages === true,
		can_vote: r.can_vote === true,
		voters: nonNegativeInt(r.voters),
		counts,
		winners: parseClassThemeWinners(r.winners),
		mine: parseClassThemeWinners(r.mine)
	};
}

export interface BallotOption {
	id: string;
	label: string;
	votes: number;
	/** The database's winner. Never re-derived here: the tie rule is the database's. */
	winning: boolean;
	mine: boolean;
}

export interface BallotFeature {
	feature: ClassThemeFeature;
	label: string;
	hint: string;
	options: BallotOption[];
	/** Votes cast on this feature. */
	total: number;
}

/**
 * EVERY FEATURE WITH EVERY OPTION, in catalogue order, with its count (zero
 * where nobody chose it), whether it is winning and whether it is the
 * caller's. A null tally is the ballot before the first read: all zeros,
 * nothing winning.
 */
export function classThemeBallot(tally: ClassThemeTally | null | undefined): BallotFeature[] {
	return CLASS_THEME_FEATURES.map((feature) => {
		const votes = new Map<string, number>();
		for (const c of tally?.counts ?? []) {
			if (c.feature === feature) votes.set(c.option, (votes.get(c.option) ?? 0) + c.votes);
		}
		const options = CLASS_THEME_OPTIONS[feature].map((o) => ({
			id: o.id,
			label: o.label,
			votes: votes.get(o.id) ?? 0,
			winning: tally?.winners[feature] === o.id,
			mine: tally?.mine[feature] === o.id
		}));
		return {
			feature,
			label: CLASS_THEME_FEATURE_LABELS[feature],
			hint: CLASS_THEME_FEATURE_HINTS[feature],
			options,
			total: options.reduce((n, o) => n + o.votes, 0)
		};
	});
}

/* ========================================================================== */
/* Transports                                                                 */
/* ========================================================================== */

/**
 * `unavailable` is PGRST202 ALONE: the deployment has no 0225 yet, and a
 * surface removes its theme controls rather than showing a failure. Every
 * other error is `error` with the database's own sentence, verbatim -- these
 * functions raise sentences a student and a teacher are meant to read.
 */
export type ClassThemeFailure =
	| { ok: false; reason: 'unavailable' }
	| {
			ok: false;
			reason: 'error';
			message: string;
			/** The caller has no valid session (ledger 0357): a poll stops on this. */
			signedOut?: true;
	  };

export type ClassThemesResult = { ok: true; themes: ClassThemeChoice[] } | ClassThemeFailure;
export type ClassThemeTallyResult = { ok: true; tally: ClassThemeTally } | ClassThemeFailure;
export type ClassThemeVoteResult =
	| { ok: true; withdrawn: false; option: string; winners: ClassThemeWinners }
	| { ok: true; withdrawn: true; winners: ClassThemeWinners | null }
	| { ok: false; reason: 'closed' }
	| ClassThemeFailure;
export type ClassThemeVotingResult =
	| { ok: true; voting_open: boolean; reset_at: string | null }
	| ClassThemeFailure;
export type ClassThemeAccentResult = { ok: true; accent: string | null } | ClassThemeFailure;

export interface ClassThemeTransports {
	themes(sectionIds: readonly string[]): Promise<ClassThemesResult>;
	tally(courseId: string): Promise<ClassThemeTallyResult>;
	/** `option` null withdraws the caller's vote on that feature. */
	vote(
		courseId: string,
		feature: ClassThemeFeature,
		option: string | null
	): Promise<ClassThemeVoteResult>;
	setVoting(courseId: string, open: boolean): Promise<ClassThemeVotingResult>;
	reset(courseId: string): Promise<ClassThemeVotingResult>;
	setAccent(sectionId: string, accent: string | null): Promise<ClassThemeAccentResult>;
}

/**
 * The sentence for a failure that has no database sentence: a network drop, a
 * malformed answer.
 */
export const CLASS_THEME_UNREACHABLE =
	'The class theme could not be reached. Try again in a moment.';
/** The refusal for a choice this build would never offer, given before any round trip. */
export const CLASS_THEME_NOT_A_CHOICE = 'That is not one of the choices.';
/** A structured vote refusal this build has no word for (0225's contract names only `closed`). */
export const CLASS_THEME_VOTE_NOT_COUNTED = 'That vote was not counted. Try again.';

type RpcError = { code?: string; message?: string } | null;

const unreachable: ClassThemeFailure = {
	ok: false,
	reason: 'error',
	message: CLASS_THEME_UNREACHABLE
};

function failure(error: RpcError, status?: number): ClassThemeFailure {
	if (error?.code === 'PGRST202') return { ok: false, reason: 'unavailable' };
	const said = typeof error?.message === 'string' && error.message ? error.message : null;
	const message = said ?? CLASS_THEME_UNREACHABLE;
	return isSignedOutFailure(error, status)
		? { ok: false, reason: 'error', message, signedOut: true }
		: { ok: false, reason: 'error', message };
}

function parseChoice(raw: unknown): ClassThemeChoice | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	if (typeof r.section_id !== 'string' || !r.section_id) return null;
	if (typeof r.course_id !== 'string' || !r.course_id) return null;
	return {
		section_id: r.section_id,
		course_id: r.course_id,
		accent: isSectionAccent(r.accent) ? r.accent : null,
		winners: parseClassThemeWinners(r.winners)
	};
}

function parseVoting(data: unknown): ClassThemeVotingResult {
	if (!data || typeof data !== 'object') return unreachable;
	const r = data as Record<string, unknown>;
	if (r.ok !== true) return unreachable;
	return { ok: true, voting_open: r.voting_open === true, reset_at: stringOrNull(r.reset_at) };
}

/**
 * The six RPCs 0225 adds, each answering one of the result unions above. A
 * throw (the network, not the database) is caught and answered as `error`, so
 * a poll loop never has to wrap a call to keep running.
 */
export function createClassThemeTransports(supabase: SupabaseClient): ClassThemeTransports {
	async function call(fn: string, args: Record<string, unknown>) {
		try {
			const { data, error, status } = await supabase.rpc(fn, args);
			return { data: data as unknown, error: error as RpcError, status, thrown: false };
		} catch {
			return { data: null, error: null, status: 0, thrown: true };
		}
	}

	return {
		async themes(sectionIds) {
			const ids = [...new Set(sectionIds.filter((id) => typeof id === 'string' && id))];
			if (ids.length === 0) return { ok: true, themes: [] };
			const res = await call('classroom_class_themes', { p_section_ids: ids });
			if (res.thrown) return unreachable;
			if (res.error) return failure(res.error, res.status);
			const rows = Array.isArray(res.data) ? res.data : [];
			return {
				ok: true,
				themes: rows.map(parseChoice).filter((c): c is ClassThemeChoice => c !== null)
			};
		},

		async tally(courseId) {
			const res = await call('classroom_theme_tally', { p_course_id: courseId });
			if (res.thrown) return unreachable;
			if (res.error) return failure(res.error, res.status);
			const tally = parseClassThemeTally(res.data);
			return tally ? { ok: true, tally } : unreachable;
		},

		async vote(courseId, feature, option) {
			const known =
				isClassThemeFeature(feature) &&
				(option === null || isClassThemeOption(feature, option));
			if (!known) return { ok: false, reason: 'error', message: CLASS_THEME_NOT_A_CHOICE };
			const res = await call('classroom_theme_vote', {
				p_course_id: courseId,
				p_feature: feature,
				p_option: option
			});
			if (res.thrown) return unreachable;
			if (res.error) return failure(res.error, res.status);
			const r = (res.data ?? {}) as Record<string, unknown>;
			if (r.ok === false) {
				if (r.reason === 'closed') return { ok: false, reason: 'closed' };
				const said = typeof r.message === 'string' && r.message ? r.message : null;
				return { ok: false, reason: 'error', message: said ?? CLASS_THEME_VOTE_NOT_COUNTED };
			}
			if (r.ok !== true) return unreachable;
			// The option is the one this call sent and the catalogue already
			// admitted; the database's echo of it is not trusted over that.
			if (r.withdrawn === true || option === null) {
				const winners = r.winners ? parseClassThemeWinners(r.winners) : null;
				return { ok: true, withdrawn: true, winners };
			}
			return { ok: true, withdrawn: false, option, winners: parseClassThemeWinners(r.winners) };
		},

		async setVoting(courseId, open) {
			const res = await call('classroom_theme_set_voting', {
				p_course_id: courseId,
				p_open: open
			});
			if (res.thrown) return unreachable;
			return res.error ? failure(res.error) : parseVoting(res.data);
		},

		async reset(courseId) {
			const res = await call('classroom_theme_reset', { p_course_id: courseId });
			if (res.thrown) return unreachable;
			return res.error ? failure(res.error) : parseVoting(res.data);
		},

		async setAccent(sectionId, accent) {
			if (accent !== null && !isSectionAccent(accent)) {
				return { ok: false, reason: 'error', message: CLASS_THEME_NOT_A_CHOICE };
			}
			const res = await call('classroom_set_section_accent', {
				p_section_id: sectionId,
				p_accent: accent
			});
			if (res.thrown) return unreachable;
			if (res.error) return failure(res.error, res.status);
			const r = (res.data ?? {}) as Record<string, unknown>;
			if (r.ok !== true) return unreachable;
			return { ok: true, accent: isSectionAccent(r.accent) ? r.accent : null };
		}
	};
}
