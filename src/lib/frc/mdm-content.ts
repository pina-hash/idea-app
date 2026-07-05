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
	/** Brief section, one string per paragraph. */
	brief: string[];
	/** Drill prompts (leading "N. " stripped). */
	drill: string[];
	/** Optional consolidated answer key line (only some units have one). */
	drillAnswers?: string;
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
 * Parse the `## Drill` block. Items are one per line, numbered `N.` with no
 * blank line between them; an optional trailing `Answers:` paragraph is the
 * consolidated key. Leading numbers are stripped; a wrapped continuation line
 * folds into the current item.
 */
function parseDrill(block: string): { drill: string[]; drillAnswers?: string } {
	const drill: string[] = [];
	let drillAnswers: string | undefined;
	let inAnswers = false;
	for (const rawLine of block.split('\n')) {
		const line = rawLine.trim();
		if (!line) continue;
		const ans = line.match(/^Answers?:\s*(.*)$/i);
		if (ans) {
			inAnswers = true;
			drillAnswers = ans[1].trim();
			continue;
		}
		if (inAnswers) {
			drillAnswers = `${drillAnswers} ${line}`.trim();
			continue;
		}
		const item = line.match(/^\d+\.\s+(.*)$/);
		if (item) drill.push(item[1].trim());
		else if (drill.length) drill[drill.length - 1] = `${drill[drill.length - 1]} ${line}`;
		else drill.push(line);
	}
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
		brief: paragraphs(sections['brief'] ?? ''),
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
