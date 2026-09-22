/**
 * THE CODE CENSUS: how much code is in this repository, what kind it is, and
 * where it lives. PLAIN DATA + PURE FUNCTIONS, client-safe, no `node:` imports
 * -- the `site-versions.ts` shape, and for the same reason.
 *
 * THE NUMBER IS DERIVED AT BUILD TIME AND IS NEVER WRITTEN DOWN. `vite.config.ts`
 * lists the tracked files, reads them, and hands them to `buildCodeCensus`
 * below; the result is emitted as `virtual:site-code` and rendered in the home
 * page's banner. THAT FILE ONLY GATHERS. Every rule about what counts, what is
 * excluded and how a line is classified lives here, where a test can reach it
 * -- a build config is the one file in the repo a test cannot.
 *
 * WHAT THIS REPLACES. The only lines-of-code figure this repository has ever
 * carried is a hardcoded `35,000+ lines` inside the FSP day-one slide deck
 * (`src/lib/fsp/day1-slides.ts`), whose own speaker note reads "Edit the
 * lines-of-code figure to the real number." A number a person has to remember
 * to update is a number that is wrong, and that one is wrong by more than an
 * order of magnitude. Nothing here is edited per release.
 *
 * ================= WHAT IS COUNTED, AND WHY THAT SET =================
 *
 * THE CENSUS IS `git ls-files`, WHICH IS THE WHOLE ANSWER TO "does this count
 * node_modules". Only TRACKED files are offered to this module at all, so
 * `node_modules/`, `.svelte-kit/`, the build output, `.env` and every other
 * gitignored path are outside it BY CONSTRUCTION rather than by an exclusion
 * somebody has to keep current. A dependency this project installs is not code
 * this project wrote, and the one census that already knows the difference is
 * the one git keeps.
 *
 * CODE, NOT PROSE. Markdown and JSON are excluded by simply not being
 * languages here. There are 921 tracked `.md` files -- `docs/history/` alone is
 * one per bundle -- and counting them would roughly double the figure with
 * writing rather than code; `.json` is configuration and exported data, of
 * which 97 files are the classroom export the app writes by itself. Neither is
 * a number anybody should be proud of, and both would make the headline
 * unfalsifiable.
 *
 * THE FOUR EXCLUSIONS ARE NAMED, REASONED AND RENDERED. `CENSUS_EXCLUSIONS`
 * below carries a sentence per rule and the panel prints it, because a total
 * with no stated boundary is a total nobody can check. They are: the archived
 * copy of the retired Sheets coin system, the vendored WASM bindings, a
 * delivered design-system bundle, and the directory the app writes by itself.
 */

import { appForPath, appLabel } from './site-manifest';

/** One tracked file, as the build hands it over. */
export interface CensusFile {
	/** Repo-relative, forward slashes. */
	path: string;
	/** The file's text. */
	text: string;
}

/**
 * HOW ONE LANGUAGE'S COMMENTS ARE SPELLED. A language is in this table if and
 * only if it is counted: the extension map below IS the allowlist, so a `.wav`
 * or a `.png` is not excluded anywhere, it simply never matches.
 */
export interface CensusLanguage {
	id: string;
	label: string;
	/** Extensions, lowercase, no dot. */
	ext: string[];
	/** A line whose first non-space characters are one of these is a comment. */
	line: string[];
	/** Block comment delimiters, opener and closer. */
	block: [string, string][];
}

const C_LINE = ['//'];
const C_BLOCK: [string, string][] = [['/*', '*/']];
const HTML_BLOCK: [string, string][] = [['<!--', '-->']];

/**
 * THE LANGUAGES, IN THE ORDER THEY ARE WORTH READING rather than alphabetically
 * -- the two that are most of this repository first. A renderer sorts by size
 * anyway; this order is what a tie falls back to.
 *
 * `.svelte` CARRIES BOTH COMMENT SYNTAXES, which is not a shortcut: one file
 * genuinely holds markup (`<!-- -->`), script (`//`, `/* *\/`) and style
 * (`/* *\/`), and a classifier given only one of them mislabels the other two.
 */
export const CENSUS_LANGUAGES: CensusLanguage[] = [
	{ id: 'ts', label: 'TypeScript', ext: ['ts', 'mts', 'cts'], line: C_LINE, block: C_BLOCK },
	{
		id: 'svelte',
		label: 'Svelte',
		ext: ['svelte'],
		line: C_LINE,
		block: [...C_BLOCK, ...HTML_BLOCK]
	},
	{ id: 'sql', label: 'SQL', ext: ['sql'], line: ['--'], block: C_BLOCK },
	{ id: 'js', label: 'JavaScript', ext: ['js', 'mjs', 'cjs'], line: C_LINE, block: C_BLOCK },
	{ id: 'html', label: 'HTML', ext: ['html', 'htm'], line: [], block: HTML_BLOCK },
	{ id: 'css', label: 'CSS', ext: ['css'], line: [], block: C_BLOCK },
	{ id: 'py', label: 'Python', ext: ['py'], line: ['#'], block: [] },
	{ id: 'cs', label: 'C#', ext: ['cs'], line: C_LINE, block: C_BLOCK },
	{ id: 'sh', label: 'Shell', ext: ['sh', 'bash'], line: ['#'], block: [] },
	{ id: 'yml', label: 'CI workflows', ext: ['yml', 'yaml'], line: ['#'], block: [] },
	{ id: 'svg', label: 'SVG', ext: ['svg'], line: [], block: HTML_BLOCK },
	{ id: 'bat', label: 'Scripts', ext: ['bat', 'ps1', 'bas'], line: ['rem', '::', '#', "'"], block: [] }
];

const BY_EXT = new Map<string, CensusLanguage>();
for (const lang of CENSUS_LANGUAGES) for (const e of lang.ext) BY_EXT.set(e, lang);

/** The language a path is written in, or null when it is not code at all. */
export function languageFor(path: string): CensusLanguage | null {
	const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
	const dot = name.lastIndexOf('.');
	if (dot < 1) return null;
	return BY_EXT.get(name.slice(dot + 1)) ?? null;
}

/**
 * A PATH THAT IS TRACKED, IS CODE, AND STILL DOES NOT COUNT -- each with the
 * sentence the panel prints beside it. Every one of these is a file somebody
 * else wrote, a file the app wrote, or a file kept only as a record of
 * something retired.
 */
export interface CensusExclusion {
	id: string;
	label: string;
	/** Shown in the panel, verbatim. */
	reason: string;
	match: (path: string) => boolean;
}

export const CENSUS_EXCLUSIONS: CensusExclusion[] = [
	{
		id: 'archive',
		label: 'Retired systems kept as a record',
		reason:
			'The archived Sheets-era coin ledger under docs/. It is kept so the old system can be read, never reintroduced, and it is not part of what runs.',
		match: (p) => p.startsWith('docs/')
	},
	{
		id: 'vendor',
		label: 'Third-party code',
		reason:
			'Vendored bindings shipped by somebody else (the Remus WASM kernel IdeaCAD builds on). Installed dependencies are outside the count already, because only tracked files are offered to it at all.',
		match: (p) => p.includes('/vendor/')
	},
	{
		id: 'delivered',
		label: 'Delivered bundles',
		reason:
			'A generated design-system bundle dropped into static/ under its own hashed directory. It was produced by a tool, not written here.',
		match: (p) => p.includes('/_ds/')
	},
	{
		id: 'app-written',
		label: 'Written by the app itself',
		reason:
			'materials/ is the classroom export: the site writes it on every item save, with no person involved. Counting it would credit the repository for its own output.',
		match: (p) => p.startsWith('materials/')
	}
];

/** Which exclusion claims a path, or null when it counts. */
export function exclusionFor(path: string): CensusExclusion | null {
	for (const rule of CENSUS_EXCLUSIONS) if (rule.match(path)) return rule;
	return null;
}

/**
 * THE SECOND AXIS: WHICH LAYER OF THE STACK A FILE BELONGS TO. Four prefixes
 * and a catch-all, matched in order. This is "where is it" in the sense a
 * person asks it about a codebase -- pages, components, tests, database -- and
 * it is deliberately a different question from the per-APP axis below it.
 */
export interface CensusLayer {
	id: string;
	label: string;
	prefixes: string[];
}

export const CENSUS_LAYERS: CensusLayer[] = [
	{ id: 'routes', label: 'Pages and endpoints', prefixes: ['src/routes/'] },
	{ id: 'lib', label: 'Components and libraries', prefixes: ['src/lib/'] },
	{ id: 'db', label: 'Database', prefixes: ['supabase/'] },
	{ id: 'tests', label: 'Tests and harnesses', prefixes: ['tests/'] },
	{ id: 'tools', label: 'Tooling and CI', prefixes: ['tools/', '.github/'] },
	{ id: 'other', label: 'Static assets and config', prefixes: [] }
];

export function layerFor(path: string): CensusLayer {
	for (const layer of CENSUS_LAYERS) {
		if (layer.prefixes.some((pre) => path.startsWith(pre))) return layer;
	}
	return CENSUS_LAYERS[CENSUS_LAYERS.length - 1];
}

/** Blank / comment / code, for one file or one bucket. */
export interface LineTally {
	blank: number;
	comment: number;
	code: number;
	total: number;
}

const zero = (): LineTally => ({ blank: 0, comment: 0, code: 0, total: 0 });

/**
 * CLASSIFY ONE FILE'S LINES INTO BLANK, COMMENT AND CODE.
 *
 * WHY THE SPLIT EXISTS AT ALL: a bare line count says nothing about a
 * codebase whose house style is a paragraph of reasoning above every rule. The
 * comment column is the interesting one here, and folding it into a single
 * total would hide the thing that actually distinguishes this repository.
 *
 * MIXED LINES COUNT AS CODE, which is the standard convention and the
 * conservative one: `foo(); // why` is a line of code that happens to carry a
 * note, and calling it a comment would inflate the column this repository
 * already leads on.
 *
 * THE ONE KNOWN IMPRECISION, STATED RATHER THAN HIDDEN: this is a line
 * classifier, not a parser, so it has no idea about string literals. A line
 * whose first non-space characters are a comment opener INSIDE a string --
 * `const s = ...` is safe, but a continuation line beginning `'//'` is not --
 * is read as a comment, and a `/*` inside a string opens a block that the
 * matching `*\/` inside the same string then closes. Both are rare enough to
 * be invisible at this scale and neither can drift the total: a misread line
 * moves between two columns of the same sum.
 */
export function tallyLines(text: string, lang: CensusLanguage): LineTally {
	const out = zero();
	// A file saved by a Windows editor must not make every line differ from the
	// same file saved anywhere else; line numbers are counts of \n either way.
	const lines = text.replace(/\r/g, '').split('\n');
	// A trailing newline produces one empty final element that is not a line.
	if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();

	let closer: string | null = null;
	for (const raw of lines) {
		out.total++;
		const trimmed = raw.trim();

		// A WHITESPACE-ONLY LINE IS BLANK WHEREVER IT IS, INSIDE AN OPEN BLOCK
		// COMMENT INCLUDED, and this test comes FIRST for that reason. The
		// alternative -- charging an empty line inside a JSDoc block to the
		// comment column -- inflates the one column this repository already
		// leads on, and it makes the total impossible to reproduce with an
		// ordinary `grep -c '^[[:space:]]*$'`, which is exactly how the figure
		// gets checked. Measured on this tree, the two conventions differ by
		// 1,226 lines; this is the one a second instrument agrees with.
		if (!trimmed) {
			out.blank++;
			continue;
		}

		if (closer !== null) {
			const end = trimmed.indexOf(closer);
			if (end === -1) {
				out.comment++;
				continue;
			}
			const after = trimmed.slice(end + closer.length).trim();
			closer = null;
			if (!after) {
				out.comment++;
				continue;
			}
			// Something real followed the close on the same line.
			closer = openBlockAfter(after, lang);
			out.code++;
			continue;
		}

		if (lang.line.some((tok) => startsWithToken(trimmed, tok))) {
			out.comment++;
			continue;
		}

		const opener = lang.block.find(([open]) => trimmed.startsWith(open));
		if (opener) {
			const [open, close] = opener;
			const end = trimmed.indexOf(close, open.length);
			if (end === -1) {
				out.comment++;
				closer = close;
				continue;
			}
			const after = trimmed.slice(end + close.length).trim();
			if (!after) {
				out.comment++;
				continue;
			}
			closer = openBlockAfter(after, lang);
			out.code++;
			continue;
		}

		closer = openBlockAfter(trimmed, lang);
		out.code++;
	}
	return out;
}

/**
 * A line comment token is matched on the characters alone EXCEPT for a word
 * like `rem`, where a bare prefix test would claim `remove(...)`. Any token
 * that is letters requires a following space or end of line.
 */
function startsWithToken(trimmed: string, token: string): boolean {
	if (!trimmed.startsWith(token)) return false;
	if (!/[a-z]/i.test(token)) return true;
	const next = trimmed.charAt(token.length);
	return next === '' || next === ' ' || next === '\t';
}

/**
 * Walk a line of CODE and report the block comment it leaves OPEN, if any.
 * Alternating open/close scan: a `/* ... *\/` inside the line closes itself and
 * contributes nothing, and only a trailing unclosed opener carries to the next
 * line. Without this, `const x = 1; /* note` would leave the following lines
 * classified as code.
 */
function openBlockAfter(line: string, lang: CensusLanguage): string | null {
	let i = 0;
	let open: string | null = null;
	while (i < line.length) {
		if (open === null) {
			let best = -1;
			let bestClose: string | null = null;
			let bestLen = 0;
			for (const [o, c] of lang.block) {
				const at = line.indexOf(o, i);
				if (at !== -1 && (best === -1 || at < best)) {
					best = at;
					bestClose = c;
					bestLen = o.length;
				}
			}
			if (best === -1) return null;
			open = bestClose;
			i = best + bestLen;
		} else {
			const at = line.indexOf(open, i);
			if (at === -1) return open;
			i = at + open.length;
			open = null;
		}
	}
	return open;
}

/** One row of any of the three breakdowns. */
export interface CensusBucket extends LineTally {
	id: string;
	label: string;
	files: number;
}

/** One excluded rule, with what it actually caught. */
export interface CensusExcluded {
	id: string;
	label: string;
	reason: string;
	files: number;
	total: number;
}

export interface CodeCensus extends LineTally {
	/** Files counted. */
	files: number;
	/** By language: "what type of code it is". */
	languages: CensusBucket[];
	/** By layer: pages, libraries, database, tests, tooling. */
	layers: CensusBucket[];
	/** By app, through the SAME ownership map the per-app versions use. */
	areas: CensusBucket[];
	/** What was left out, and why. */
	excluded: CensusExcluded[];
	/**
	 * FALSE WHEN THE BUILD COULD NOT LIST THE TREE (no git, a checkout with no
	 * history). Every number is then zero and the banner renders NOTHING rather
	 * than a smaller figure -- the same rule `site-versions.ts` applies to a
	 * shallow clone, and for the same reason: a count that can silently come out
	 * low is worse than no count.
	 */
	complete: boolean;
}

function bucket(id: string, label: string): CensusBucket {
	return { id, label, files: 0, ...zero() };
}

function add(into: LineTally, from: LineTally): void {
	into.blank += from.blank;
	into.comment += from.comment;
	into.code += from.code;
	into.total += from.total;
}

const bySize = (a: CensusBucket, b: CensusBucket) => b.total - a.total;

/**
 * THE CENSUS. Pure: files in, numbers out, nothing read from disk and nothing
 * cached. `complete: false` yields a zeroed census with its breakdowns empty,
 * which is what the banner keys on.
 */
export function buildCodeCensus(files: CensusFile[], opts: { complete: boolean }): CodeCensus {
	const out: CodeCensus = {
		files: 0,
		...zero(),
		languages: [],
		layers: [],
		areas: [],
		excluded: [],
		complete: opts.complete
	};
	if (!opts.complete) return out;

	const languages = new Map<string, CensusBucket>();
	const layers = new Map<string, CensusBucket>();
	const areas = new Map<string, CensusBucket>();
	const excluded = new Map<string, CensusExcluded>();

	for (const file of files) {
		const path = file.path.replace(/\\/g, '/');
		const lang = languageFor(path);
		if (!lang) continue;

		const rule = exclusionFor(path);
		const tally = tallyLines(file.text, lang);

		if (rule) {
			const row = excluded.get(rule.id) ?? {
				id: rule.id,
				label: rule.label,
				reason: rule.reason,
				files: 0,
				total: 0
			};
			row.files++;
			row.total += tally.total;
			excluded.set(rule.id, row);
			continue;
		}

		out.files++;
		add(out, tally);

		const lb = languages.get(lang.id) ?? bucket(lang.id, lang.label);
		lb.files++;
		add(lb, tally);
		languages.set(lang.id, lb);

		const layer = layerFor(path);
		const yb = layers.get(layer.id) ?? bucket(layer.id, layer.label);
		yb.files++;
		add(yb, tally);
		layers.set(layer.id, yb);

		// THE APP AXIS IS `appForPath`, THE ONE ALREADY IN THE TREE. It is what
		// decides which app a commit bumped the version of, so "where is the
		// code" and "which app did this commit touch" cannot come apart. A
		// second ownership table is exactly the thing that stops matching.
		const appId = appForPath(path);
		const ab = areas.get(appId) ?? bucket(appId, appLabel(appId));
		ab.files++;
		add(ab, tally);
		areas.set(appId, ab);
	}

	out.languages = [...languages.values()].sort(bySize);
	out.layers = [...layers.values()].sort(bySize);
	out.areas = [...areas.values()].sort(bySize);
	// Registry order, so the panel reads the exclusions in the order they are
	// reasoned about above rather than by whichever happened to catch most.
	out.excluded = CENSUS_EXCLUSIONS.map((r) => excluded.get(r.id)).filter(
		(r): r is CensusExcluded => !!r
	);
	return out;
}

/**
 * THE HEADLINE, GROUPED WITH SPACES RATHER THAN COMMAS. The banner sits beside
 * Orbitron display type where a comma is visual noise at 0.6rem, and a thin
 * space is what a technical readout uses. `toLocaleString` is refused on
 * purpose: it would render differently for a visitor whose browser is set to a
 * locale that groups by lakh, on a number two people are meant to compare.
 */
export function groupDigits(n: number): string {
	return String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** `12%`, floored, for a share-of-total readout. Never `NaN%` on an empty census. */
export function sharePercent(part: number, whole: number): number {
	return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** The sentence under the headline, stating exactly what the number is. */
export function censusSummary(census: CodeCensus): string {
	return `${groupDigits(census.total)} lines across ${groupDigits(census.files)} files: ${groupDigits(census.code)} code, ${groupDigits(census.comment)} comment, ${groupDigits(census.blank)} blank.`;
}
