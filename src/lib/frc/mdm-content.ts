/**
 * CAD and Mechanical Design unit content, parsed at build time from the
 * authored seed `mdm-content-seed.md` at the repo root (imported raw, the same
 * `?raw` convention the legacy loaders use). The seed stays the single source
 * of truth: edit the markdown, not this file.
 *
 * The seed is ten units separated by lines of `===`, each starting with plain
 * `key: value` frontmatter (id, title, domain, order, prerequisite, gate,
 * gatePass) followed by four `## ` sections: Brief, Drill, Gate, Apply. This
 * module parses that into a typed model, one entry per unit. Content only:
 * gate execution and progression are NOT modeled here (the Gate section is
 * kept as its description text only).
 */
// The seed lives at the repo root (provenance), imported raw. The relative
// hop out of src is deliberate so there is exactly one copy of the content.
import seedRaw from '../../../mdm-content-seed.md?raw';
import { parseDiagram } from '$lib/frc/inline-markup';

export interface MdmUnit {
	/** Seed id, e.g. "MDM-1". */
	id: string;
	/** 1-based order within the domain (from frontmatter `order`). */
	n: number;
	title: string;
	domain: string;
	/** Prerequisite unit id, or "none". */
	prerequisite: string;
	/** Raw gate token, e.g. "quiz" or "gauntlet:drawing-reading". */
	gate: string;
	/** Passing threshold percent. */
	gatePass: number;
	/**
	 * Brief section, one string per paragraph, with light markdown added: the
	 * "Worked example" paragraph is prefixed `> ` (a blockquote marker, so the
	 * renderer can show it as a distinct callout), a `[[diagram:KEY|caption]]`
	 * paragraph is passed through verbatim (a concept-diagram token, see
	 * `parseDiagram`), and any other paragraph whose opening sentence reads as
	 * a short label (see `markupBriefParagraph`) has that sentence wrapped
	 * `**like this**`. Render with `renderInline` / `isBlockquote` /
	 * `parseDiagram` from `$lib/frc/inline-markup`.
	 */
	brief: string[];
	/** Drill prompts (leading "N. " stripped). */
	drill: string[];
	/**
	 * Per-question answer text, aligned by index to `drill` (same length).
	 * `undefined` at an index means no answer key exists yet for that question
	 * — the unit has no trailing "Answers:" text at all (units MDM-2 through
	 * MDM-10, currently), or that question's answer could not be split out of
	 * it. Never fabricated; the page must show this as visibly incomplete.
	 */
	drillAnswers: (string | undefined)[];
	/** Gate section description text (description only; no execution). */
	gateDescription: string;
	/** Apply section, one string per paragraph. */
	apply: string[];
}

/** Split a block of prose into paragraphs on blank lines. */
function paragraphs(block: string): string[] {
	return block
		.split(/\n\s*\n/)
		.map((p) => p.trim().replace(/\s*\n\s*/g, ' '))
		.filter(Boolean);
}

/**
 * A Brief paragraph's opening sentence counts as a short "lead" label (like
 * "Define the problem." or "Views.") when it is this many words or fewer.
 * Chosen empirically against the ten authored Briefs: every deliberate label
 * sentence in the seed is 8 words or under, while every general intro/closing
 * sentence runs 9+ words, so this cleanly separates the two without hand
 * per-paragraph tagging.
 */
const MAX_LEAD_WORDS = 8;

/**
 * Add light markdown to one Brief paragraph:
 *  - A `[[diagram:KEY|caption]]` paragraph passes through untouched: it is a
 *    structured token, not prose, so it must never be bolded or misread as a
 *    "Worked example" lead.
 *  - The "Worked example" paragraph becomes a markdown blockquote (a leading
 *    `> `), so UnitPage can render it as a distinct callout.
 *  - Otherwise, if the paragraph opens with a short label sentence followed by
 *    more text, that opening sentence is bolded (`**...**`), matching the
 *    seed's own writing style of a short lead ("Define the problem.",
 *    "Views.", "Feature order matters.") followed by elaboration.
 * Plain prose (an intro or closing paragraph with no short lead) passes
 * through unchanged.
 */
function markupBriefParagraph(p: string): string {
	if (parseDiagram(p)) return p;
	if (/^worked example\b/i.test(p)) return `> ${p}`;

	// The opening sentence: up to the first '.', '!', or '?' that is followed
	// by whitespace + an uppercase letter/quote (the next sentence starting),
	// or by the end of the paragraph.
	const m = p.match(/^(.+?[.!?])(?:\s+(?=[A-Z"])|$)/);
	if (!m) return p;
	const lead = m[1];
	const rest = p.slice(m[0].length);
	const wordCount = lead.trim().split(/\s+/).filter(Boolean).length;
	if (!rest.trim() || wordCount > MAX_LEAD_WORDS) return p;
	return `**${lead}** ${rest}`;
}

interface AnswerMarker {
	num: number;
	/** Index of the digit itself (start of "N. "). */
	markerStart: number;
	/** Index right after "N. ", where that answer's text begins. */
	textStart: number;
}

/**
 * Split a consolidated "Answers: 1. ... 2. ... 3. ..." string into one answer
 * per drill question, aligned to `count` questions. Only markers that
 * continue the expected 1, 2, 3, ... sequence are honored, so a stray digit
 * inside an answer's own text (e.g. a measurement) can never be mistaken for
 * a question marker. Returns `undefined` for any question whose numbered
 * answer cannot be found.
 */
function splitConsolidatedAnswers(consolidated: string, count: number): (string | undefined)[] {
	const markers: AnswerMarker[] = [];
	const re = /(^|\s)(\d+)\.\s+/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(consolidated))) {
		markers.push({
			num: Number(match[2]),
			markerStart: match.index + match[1].length,
			textStart: match.index + match[0].length
		});
	}

	const ordered: AnswerMarker[] = [];
	let expected = 1;
	for (const marker of markers) {
		if (marker.num === expected) {
			ordered.push(marker);
			expected++;
		}
	}

	const answers: (string | undefined)[] = Array(count).fill(undefined);
	for (let i = 0; i < ordered.length; i++) {
		const qIndex = ordered[i].num - 1;
		if (qIndex >= count) continue;
		const end = i + 1 < ordered.length ? ordered[i + 1].markerStart : consolidated.length;
		answers[qIndex] = consolidated.slice(ordered[i].textStart, end).trim().replace(/\s+/g, ' ');
	}
	return answers;
}

/**
 * Parse the `## Drill` block. Items are one per line, numbered `N.` with no
 * blank line between them; an optional trailing `Answers:` paragraph is the
 * consolidated key, split per question (see `splitConsolidatedAnswers`).
 * Leading numbers are stripped from questions; a wrapped continuation line
 * folds into the current item. Units with no `Answers:` text return an
 * all-`undefined` `drillAnswers` array, never fabricated.
 */
function parseDrill(block: string): { drill: string[]; drillAnswers: (string | undefined)[] } {
	const drill: string[] = [];
	let consolidatedAnswers: string | undefined;
	let inAnswers = false;
	for (const rawLine of block.split('\n')) {
		const line = rawLine.trim();
		if (!line) continue;
		const ans = line.match(/^Answers?:\s*(.*)$/i);
		if (ans) {
			inAnswers = true;
			consolidatedAnswers = ans[1].trim();
			continue;
		}
		if (inAnswers) {
			consolidatedAnswers = `${consolidatedAnswers} ${line}`.trim();
			continue;
		}
		const item = line.match(/^\d+\.\s+(.*)$/);
		if (item) drill.push(item[1].trim());
		else if (drill.length) drill[drill.length - 1] = `${drill[drill.length - 1]} ${line}`;
		else drill.push(line);
	}
	const drillAnswers = consolidatedAnswers
		? splitConsolidatedAnswers(consolidatedAnswers, drill.length)
		: Array(drill.length).fill(undefined);
	return { drill, drillAnswers };
}

/** Split one unit chunk into its frontmatter map and its `## ` sections. */
function parseUnit(chunk: string): MdmUnit | null {
	const firstHeading = chunk.indexOf('\n## ');
	if (firstHeading === -1) return null;

	const frontMatter = chunk.slice(0, firstHeading);
	const body = chunk.slice(firstHeading + 1);

	const meta: Record<string, string> = {};
	for (const line of frontMatter.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const colon = trimmed.indexOf(':');
		if (colon === -1) continue;
		meta[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim();
	}
	if (!meta.id) return null;

	// Sections: split on `## Name` headings into a name -> content map.
	const sections: Record<string, string> = {};
	const parts = body.split(/^##\s+(.+)$/m);
	for (let i = 1; i < parts.length; i += 2) {
		sections[parts[i].trim().toLowerCase()] = (parts[i + 1] ?? '').trim();
	}

	const { drill, drillAnswers } = parseDrill(sections['drill'] ?? '');

	return {
		id: meta.id,
		n: Number(meta.order) || 0,
		title: meta.title ?? meta.id,
		domain: meta.domain ?? '',
		prerequisite: meta.prerequisite ?? 'none',
		gate: meta.gate ?? '',
		gatePass: Number(meta.gatePass) || 0,
		brief: paragraphs(sections['brief'] ?? '').map(markupBriefParagraph),
		drill,
		drillAnswers,
		gateDescription: (sections['gate'] ?? '').replace(/\s*\n\s*/g, ' ').trim(),
		apply: paragraphs(sections['apply'] ?? '')
	};
}

function parseSeed(raw: string): MdmUnit[] {
	// Drop the leading `--- ... ---` header/comment block, then split on `===`.
	const withoutHeader = raw.replace(/^---[\s\S]*?---\s*/, '');
	return withoutHeader
		.split(/^===\s*$/m)
		.map((chunk) => chunk.trim())
		.filter(Boolean)
		.map(parseUnit)
		.filter((u): u is MdmUnit => u !== null)
		.sort((a, b) => a.n - b.n);
}

/** The ten authored CAD and Mechanical Design units, in order. */
export const MDM_UNITS: MdmUnit[] = parseSeed(seedRaw);

export function mdmUnitByNumber(n: number): MdmUnit | undefined {
	return MDM_UNITS.find((u) => u.n === n);
}

export function mdmUnitById(id: string): MdmUnit | undefined {
	return MDM_UNITS.find((u) => u.id.toLowerCase() === id.toLowerCase());
}

/**
 * Human label for a gate token: "quiz" -> "Quiz",
 * "gauntlet:drawing-reading" -> "GAUNTLET · Drawing Reading".
 */
export function gateLabel(gate: string): string {
	if (!gate) return 'Gate';
	if (gate.startsWith('gauntlet:')) {
		const mode = gate
			.slice('gauntlet:'.length)
			.split('-')
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
			.join(' ')
			.replace(/\bGd T\b/i, 'GD&T');
		return `GAUNTLET · ${mode}`;
	}
	return gate.charAt(0).toUpperCase() + gate.slice(1);
}
