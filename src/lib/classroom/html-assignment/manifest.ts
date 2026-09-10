/**
 * THE HTML ASSIGNMENT MANIFEST, and the validator that refuses a document
 * rather than accepting part of one.
 *
 * A ported HTML assignment is a whole document a student works inside, served
 * from a second origin under `sandbox="allow-scripts"` with no
 * `allow-same-origin`. The document is opaque to us -- we do not rewrite it,
 * we do not read its DOM, and the frame never learns anything about the
 * session. What makes it gradeable is the MANIFEST it carries:
 *
 *     <script type="application/json" id="idea-manifest">
 *
 * which declares the modules, the fillable blocks and the rubric. The parent
 * reads that at IMPORT, stores it, and from then on maps every `field` the
 * frame reports to a `block_id` THROUGH THE STORED COPY. A frame naming a
 * `block_id` directly would be writing to an arbitrary row, so it never gets
 * to; the manifest is the whole of the translation.
 *
 * WHY `id` AND `field` ARE SEPARATE, and this is the load-bearing pair. `field`
 * is the document author's own name for an input and may be renamed in a later
 * revision of the document. `id` is the join key for every answer ever stored
 * under `(item_id, student_email, block_id)` and may never be. A renamed block
 * id orphans student work SILENTLY -- the row is still there and the answer
 * simply stops rendering -- which is why the two are different fields rather
 * than one, and why this validator refuses a duplicate id anywhere in a
 * document.
 *
 * WHY `short` EXISTS. On 2026-09-08 an instructor edited rubric descriptors and
 * saw no change on the grading console, because `levelShort` renders `short`
 * first and nothing in the product could edit it. The manifest carries both,
 * every level, every time, so that cannot recur.
 *
 * THE VALIDATOR REFUSES; IT NEVER REPAIRS. There is no coercion, no default
 * filled in, no "close enough". A document that fails comes back with every
 * problem named, and nothing is stored. Half a manifest is worse than none: the
 * blocks it did read would take real student answers, and the ones it dropped
 * would take them nowhere.
 *
 * WHAT IT SHARES RATHER THAN COPIES. The level and points rules are
 * `assignment-spec.ts`'s -- `criterionIssues`, `criterionMax`, `MIN_LEVELS`,
 * `MAX_LEVELS` -- called, not mirrored. A manifest criterion is shaped into a
 * `RubricCriterion` and handed to the same function the spec importer and the
 * rubric builder use, so a change to what a leveled criterion means reaches all
 * three at once. The rules that are genuinely this format's own (the manifest
 * script tag, the field/`data-field` correspondence, `short`) live here.
 */

import {
	MAX_LEVELS,
	MIN_LEVELS,
	criterionIssues,
	criterionMax,
	type RubricCriterion,
	type RubricLevel
} from '$lib/classroom/assignment-spec';

// ---------------------------------------------------------------------------
// The contract's types, verbatim.
// ---------------------------------------------------------------------------

export interface HtmlLevel {
	points: number;
	label: string;
	/** What the grading console renders on the level button. Six words, max. */
	short: string;
	/** The full description: what settles a dispute, and what a student reads. */
	descriptor: string;
}

export interface HtmlCriterion {
	/**
	 * Unique WITHIN its module. Across modules a repeat is harmless, because
	 * `rubricFromSpec` namespaces a criterion as `<moduleId>-<criterionId>`.
	 */
	id: string;
	text: string;
	points: number;
	/** Three or four, never two. */
	levels: HtmlLevel[];
}

export type HtmlBlockType = 'text' | 'longText' | 'checkbox' | 'radio' | 'image' | 'table';

export interface HtmlBlock {
	/** BECOMES block_id in classroom_responses. Permanent. */
	id: string;
	/** The document's own data-field attribute. Renameable. */
	field: string;
	type: HtmlBlockType;
	minSentences?: number;
}

export interface HtmlModule {
	/** Semantic and permanent, unique across the manifest. */
	id: string;
	title: string;
	points: number;
	audience?: 'team' | 'individual';
	blocks: HtmlBlock[];
	criteria: HtmlCriterion[];
}

export interface HtmlAssignmentManifest {
	schemaVersion: 3;
	kind: 'html-assignment';
	title: string;
	course: string;
	points: number;
	modules: HtmlModule[];
}

export const HTML_MANIFEST_SCHEMA_VERSION = 3;
export const HTML_MANIFEST_KIND = 'html-assignment';

/** The element id the manifest is carried on, inside the document. */
export const HTML_MANIFEST_SCRIPT_ID = 'idea-manifest';

export const HTML_BLOCK_TYPES: readonly HtmlBlockType[] = [
	'text',
	'longText',
	'checkbox',
	'radio',
	'image',
	'table'
];

/**
 * THE ID SHAPE IS `classroom_responses`'s, NOT THIS FORMAT'S.
 *
 * A block id lands in `classroom_responses.block_id`, whose CHECK is 1-64
 * characters and whose authored ids are validated to `[A-Za-z0-9_-]{1,40}`
 * everywhere in 0086. Answers to an HTML assignment are ORDINARY response rows
 * -- that is the whole reason grading, extra credit, bulk grading and the FACTS
 * export are untouched by this feature -- so they live under the same rule.
 * 0195 re-states this pattern in SQL and the pair is asserted against each
 * other; a pattern loosened on one side alone is a row the other refuses.
 */
export const HTML_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** Modules and blocks, in the shape the whole document has to fit inside. */
export const HTML_MAX_MODULES = 40;
export const HTML_MAX_BLOCKS = 400;

/** Six words, per IDEA_RUBRIC_STANDARDS. */
export const HTML_SHORT_MAX_WORDS = 6;

// ---------------------------------------------------------------------------
// Copy rules that are the PROGRAMME's, not this format's.
// ---------------------------------------------------------------------------

/**
 * A WEEKDAY IS REFUSED IN STUDENT-FACING COPY, and the reason is a reprint. A
 * document naming "Friday" is correct for exactly one section in exactly one
 * term; every other class reads a date that is wrong, and the author is never
 * the person who finds out.
 *
 * THIS IS THE SECOND COPY OF A LIST `tools/validate-assignment-spec.py` ALREADY
 * HOLDS, and it is deliberate rather than an oversight: python cannot import
 * TypeScript and the browser cannot run the python tool, so the two are a
 * MIRROR in the sense `docText` mirrors `_classroom_doc_text`. What keeps them
 * honest is not discipline -- `tests/html-assignment-manifest-parity.test.ts`
 * reads the python source and asserts both lists match term for term.
 */
export const WEEKDAYS: readonly string[] = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday'
];

/** The British spellings the python tool refuses, as one alternation. */
export const BRITISH_SPELLING_RE =
	/\b(centre[sd]?|colour[s]?|behaviour[s]?|organis\w+|recognis\w+|modell\w+|labour|defence|licence|programme|whilst|amongst)\b/gi;

// ---------------------------------------------------------------------------
// Reading the document.
// ---------------------------------------------------------------------------

/**
 * COMMENTS, SCRIPTS AND STYLES COME OUT FIRST, on every scan of the document.
 *
 * A `data-field` inside a comment is not an input, and a `data-field` written
 * as a string inside the document's own JavaScript is the shape a ported
 * document routinely carries (its autosave enumerates them). Counting either as
 * a real field makes the manifest look incomplete and refuses a sound document.
 * The manifest script is itself a `<script>`, so it is read BEFORE this runs.
 */
function stripInertRegions(html: string): string {
	return html
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
		.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ');
}

const DATA_FIELD_RE = /\sdata-field\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/gi;

/**
 * Every `data-field` the document declares on a real element, deduped.
 *
 * A regex over the source rather than a DOM parse, on purpose: this runs in the
 * composer, in a node test and in the import path, and all three have to agree
 * exactly. A DOM is available in only one of them, and a document that parsed
 * differently in the browser than it validated in a test is the failure this
 * whole format is trying not to have.
 */
export function documentFields(html: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	const text = stripInertRegions(html ?? '');
	for (const m of text.matchAll(DATA_FIELD_RE)) {
		const value = (m[2] ?? m[3] ?? m[4] ?? '').trim();
		if (!value || seen.has(value)) continue;
		seen.add(value);
		out.push(value);
	}
	return out;
}

/** The document's visible prose: tags, scripts, styles and comments removed. */
export function documentText(html: string): string {
	return stripInertRegions(html ?? '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

const MANIFEST_SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

function attributeValue(attrs: string, name: string): string | null {
	const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'\`=<>]+))`, 'i');
	const m = re.exec(attrs);
	if (!m) return null;
	return (m[2] ?? m[3] ?? m[4] ?? '').trim();
}

export interface ManifestScript {
	/** The raw JSON text, or null when the document carries no manifest. */
	json: string | null;
	/** How many manifest scripts were found. More than one is refused. */
	count: number;
}

/**
 * THE MANIFEST SCRIPT, located by BOTH its type and its id.
 *
 * A document may legitimately carry other `application/json` scripts, and it
 * may carry other elements with an id. It is the pair that names this one, so
 * the pair is what is matched -- and a document carrying TWO is refused rather
 * than resolved by taking the first, because which one a browser's
 * `getElementById` returns is not a thing an author should have to know.
 */
export function extractManifestScript(html: string): ManifestScript {
	let json: string | null = null;
	let count = 0;
	for (const m of (html ?? '').matchAll(MANIFEST_SCRIPT_RE)) {
		const attrs = m[1] ?? '';
		const type = (attributeValue(attrs, 'type') ?? '').toLowerCase();
		const id = attributeValue(attrs, 'id') ?? '';
		if (type !== 'application/json' || id !== HTML_MANIFEST_SCRIPT_ID) continue;
		count += 1;
		if (count === 1) json = m[2] ?? '';
	}
	return { json, count };
}

// ---------------------------------------------------------------------------
// Validation.
// ---------------------------------------------------------------------------

export interface ManifestValidation {
	/** The manifest, or NULL. There is no partial result. */
	manifest: HtmlAssignmentManifest | null;
	errors: string[];
	warnings: string[];
}

function isWholeNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

function wordCount(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Copy scanned for a weekday and for a British spelling, with WHERE it was
 * found, because a document has hundreds of strings and "British spellings:
 * [licence]" on its own sends an author to read the whole thing.
 */
function copyIssues(where: string, text: string): string[] {
	const out: string[] = [];
	if (!text) return out;
	for (const day of WEEKDAYS) {
		if (new RegExp(`\\b${day}\\b`).test(text)) {
			out.push(
				`${where} names a weekday ("${day}"). A weekday is right for one section in one term and wrong everywhere else. Say "the next class meeting" or give no day at all.`
			);
		}
	}
	// A fresh regex each call: the module-level one is /g and carries lastIndex.
	const brit = text.match(new RegExp(BRITISH_SPELLING_RE.source, 'gi'));
	if (brit?.length) {
		const unique = [...new Set(brit.map((b) => b.toLowerCase()))].sort();
		out.push(`${where} uses British spellings: ${unique.join(', ')}.`);
	}
	return out;
}

/**
 * VALIDATE A DOCUMENT AND THE MANIFEST INSIDE IT.
 *
 * `html` is the whole uploaded document. The manifest is read from it; the
 * optional `parsed` argument exists only so a caller that already has the
 * object (a test, a re-validation of something stored) can skip the extraction
 * without a second copy of it existing anywhere.
 *
 * EVERY PROBLEM IS COLLECTED, never just the first: an author fixing one refusal
 * at a time through six round trips of a whole document upload is how a format
 * gets abandoned. The one exception is a shape so broken that continuing would
 * produce noise -- no manifest at all, unparseable JSON, no modules array --
 * where the later checks would report the absence of things nobody wrote.
 */
export function validateHtmlManifest(html: string, parsed?: unknown): ManifestValidation {
	const errors: string[] = [];
	const warnings: string[] = [];
	const fail = (): ManifestValidation => ({ manifest: null, errors, warnings });

	let raw: unknown = parsed;
	if (raw === undefined) {
		const found = extractManifestScript(html);
		if (found.count > 1) {
			errors.push(
				`The document carries ${found.count} <script type="application/json" id="${HTML_MANIFEST_SCRIPT_ID}"> blocks. There must be exactly one.`
			);
			return fail();
		}
		if (found.json === null) {
			errors.push(
				`The document carries no manifest. Add one <script type="application/json" id="${HTML_MANIFEST_SCRIPT_ID}"> block declaring the modules, blocks and rubric.`
			);
			return fail();
		}
		try {
			raw = JSON.parse(found.json);
		} catch (e) {
			errors.push(`The manifest is not valid JSON: ${(e as Error).message}`);
			return fail();
		}
	}

	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		errors.push('The manifest must be a JSON object.');
		return fail();
	}
	const m = raw as Record<string, unknown>;

	if (m.schemaVersion !== HTML_MANIFEST_SCHEMA_VERSION) {
		errors.push(
			`The manifest needs schemaVersion ${HTML_MANIFEST_SCHEMA_VERSION} (this one has ${JSON.stringify(m.schemaVersion) ?? 'none'}).`
		);
	}
	if (m.kind !== HTML_MANIFEST_KIND) {
		errors.push(
			`The manifest needs kind "${HTML_MANIFEST_KIND}" (this one has ${JSON.stringify(m.kind) ?? 'none'}).`
		);
	}
	if (!String(m.title ?? '').trim()) errors.push('The manifest needs a title.');
	if (!String(m.course ?? '').trim()) errors.push('The manifest needs a course.');
	if (!isWholeNumber(m.points) || (m.points as number) < 0 || (m.points as number) > 10000) {
		errors.push('The manifest needs a whole points value between 0 and 10000.');
	}

	const modules = m.modules;
	if (!Array.isArray(modules) || modules.length === 0) {
		errors.push('The manifest needs a non-empty modules array.');
		return fail();
	}
	if (modules.length > HTML_MAX_MODULES) {
		errors.push(`At most ${HTML_MAX_MODULES} modules per document (this one has ${modules.length}).`);
	}

	const moduleIds = new Set<string>();
	/** Block ids are unique across the WHOLE manifest: they key a response row. */
	const blockIds = new Set<string>();
	/** field -> the block that claimed it, so a repeat can name both. */
	const fieldOwner = new Map<string, string>();
	let blockCount = 0;
	let modulePointsSum = 0;

	modules.forEach((rawModule, mi) => {
		const mod = rawModule as Record<string, unknown>;
		const where = `Module ${mi + 1}`;
		const id = String(mod.id ?? '');
		if (!HTML_ID_RE.test(id)) {
			errors.push(`${where} needs an id (letters, digits, - and _, up to 40 characters).`);
		} else if (moduleIds.has(id)) {
			errors.push(`Duplicate module id "${id}".`);
		} else {
			moduleIds.add(id);
		}
		const name = id || where;
		const title = String(mod.title ?? '').trim();
		if (!title) errors.push(`Module "${name}" needs a title.`);
		errors.push(...copyIssues(`Module "${name}" title`, title));

		const modPoints = mod.points;
		if (!isWholeNumber(modPoints) || (modPoints as number) < 0 || (modPoints as number) > 10000) {
			errors.push(`Module "${name}" needs a whole points value between 0 and 10000.`);
		} else {
			modulePointsSum += modPoints as number;
		}
		if (mod.audience != null && mod.audience !== 'team' && mod.audience !== 'individual') {
			errors.push(`Module "${name}" audience must be "team" or "individual" when present.`);
		}

		// --- blocks ---------------------------------------------------------
		const blocks = mod.blocks;
		if (!Array.isArray(blocks)) {
			errors.push(`Module "${name}" needs a blocks array.`);
		} else {
			blockCount += blocks.length;
			blocks.forEach((rawBlock, bi) => {
				const b = rawBlock as Record<string, unknown>;
				const bWhere = `Module "${name}" block ${bi + 1}`;
				const bid = String(b.id ?? '');
				if (!HTML_ID_RE.test(bid)) {
					errors.push(`${bWhere} needs an id (letters, digits, - and _, up to 40 characters).`);
				} else if (blockIds.has(bid)) {
					// The one that orphans student work. It is refused ANYWHERE in
					// the manifest, not just inside one module, because block_id is
					// unique per (item, student) across the whole document.
					errors.push(
						`Duplicate block id "${bid}". Block ids key every stored answer, so two blocks sharing one would write to the same row.`
					);
				} else {
					blockIds.add(bid);
				}
				const field = String(b.field ?? '').trim();
				if (!field) {
					errors.push(`${bWhere} needs a field naming the document's data-field attribute.`);
				} else if (fieldOwner.has(field)) {
					errors.push(
						`Blocks "${fieldOwner.get(field)}" and "${bid || bWhere}" both claim the field "${field}". One input cannot answer two blocks.`
					);
				} else {
					fieldOwner.set(field, bid || bWhere);
				}
				if (!HTML_BLOCK_TYPES.includes(b.type as HtmlBlockType)) {
					errors.push(
						`${bWhere} has type ${JSON.stringify(b.type) ?? 'none'}; it must be one of ${HTML_BLOCK_TYPES.join(', ')}.`
					);
				}
				const min = b.minSentences;
				if (min != null && (!isWholeNumber(min) || (min as number) < 0 || (min as number) > 100)) {
					errors.push(`${bWhere} minSentences must be a whole number between 0 and 100.`);
				}
				if (min != null && b.type !== 'longText' && b.type !== 'text') {
					warnings.push(
						`${bWhere} sets minSentences on a ${String(b.type)} block, where nothing counts sentences.`
					);
				}
			});
		}

		// --- criteria -------------------------------------------------------
		const criteria = mod.criteria;
		const declared = isWholeNumber(modPoints) ? (modPoints as number) : 0;
		if (!Array.isArray(criteria) || criteria.length === 0) {
			if (declared > 0) {
				errors.push(`Module "${name}" carries ${declared} points but has no criteria.`);
			} else {
				errors.push(`Module "${name}" needs a criteria array.`);
			}
		} else {
			const critIds = new Set<string>();
			let criteriaSum = 0;
			/** A criterion with no readable maximum would make the module sum
			 *  fire as a second, misleading error on top of the real one. */
			let unreadable = false;

			criteria.forEach((rawCrit, ci) => {
				const c = rawCrit as Record<string, unknown>;
				const cid = String(c.id ?? '');
				const cWhere = `Module "${name}" criterion ${cid ? `"${cid}"` : ci + 1}`;
				if (!HTML_ID_RE.test(cid)) {
					errors.push(`${cWhere} needs an id (letters, digits, - and _, up to 40 characters).`);
				} else if (critIds.has(cid)) {
					// WITHIN the module only. rubricFromSpec namespaces a criterion
					// as `<moduleId>-<criterionId>`, so m1-r2 and m2-r2 are distinct
					// and a cross-module repeat collides with nothing.
					errors.push(`Module "${name}" repeats the criterion id "${cid}".`);
				} else {
					critIds.add(cid);
				}
				const text = String(c.text ?? '').trim();
				if (!text) errors.push(`${cWhere} needs text.`);
				errors.push(...copyIssues(`${cWhere} text`, text));

				const levels = c.levels;
				if (!Array.isArray(levels) || levels.length === 0) {
					errors.push(
						`${cWhere} has no levels. A criterion carries ${MIN_LEVELS} or ${MAX_LEVELS} levels, the top worth the criterion maximum and the bottom worth 0. Two levels is a checklist item and belongs in a checkbox block.`
					);
					unreadable = true;
					return;
				}
				// `criterionIssues` below already reports the COUNT. What it cannot
				// say is what to do about the two-level case specifically, which is
				// the one an author reaches for most: two levels is a checklist
				// item, and it has somewhere else to go.
				if (levels.length === 2) {
					errors.push(
						`${cWhere} has two levels, which is a pass/fail check rather than a criterion. Give it ${MIN_LEVELS} or ${MAX_LEVELS} levels, or move it to a checkbox block and take its points off the module.`
					);
				}

				const top = (levels[0] as Record<string, unknown>)?.points;
				if (!isWholeNumber(top) || (top as number) < 0 || (top as number) > 1000) {
					errors.push(`${cWhere} level 1 needs a whole point value between 0 and 1000.`);
					unreadable = true;
					return;
				}

				// THE SHARED RULE. criterionIssues is assignment-spec.ts's own --
				// the count, the strict descent, the bottom at 0, the top at the
				// maximum, a label and a descriptor on every level. It is CALLED
				// rather than mirrored so a change to what a leveled criterion
				// means reaches the spec importer, the rubric builder and this in
				// the same commit.
				const asCriterion: RubricCriterion = {
					id: cid || `c${ci + 1}`,
					criterion: text || `criterion ${ci + 1}`,
					points: top as number,
					levels: levels as RubricLevel[]
				};
				for (const issue of criterionIssues(asCriterion)) errors.push(`${cWhere}: ${issue}`);

				// POINTS, WAY ONE OF THREE: a criterion's declared points are its
				// top level's. criterionMax is the one place that is decided.
				const max = criterionMax(asCriterion);
				if (c.points != null && Number(c.points) !== max) {
					errors.push(`${cWhere} declares ${String(c.points)} points but its top level is worth ${max}.`);
				}
				if (c.points == null) {
					errors.push(`${cWhere} needs a points value (it is the top level's, ${max}).`);
				}

				// A criterion worth less than 2 cannot carry three DISTINCT values
				// above zero, because maxima are whole numbers and the bottom level
				// is 0. Three levels need [max, mid, 0] with max > mid > 0, so max
				// is at least 2; four need at least 3. Without this the criterion
				// fails on the descent rule instead, which sends an author to
				// rewrite levels that were never the problem.
				const needed = levels.length - 1;
				if (max < needed) {
					errors.push(
						`${cWhere} is worth ${max} but carries ${levels.length} levels, which need ${needed} distinct values above zero. Give it at least ${needed} points, or merge it into another criterion.`
					);
				}

				levels.forEach((rawLevel, li) => {
					const l = rawLevel as Record<string, unknown>;
					const lWhere = `${cWhere} level ${li + 1}`;
					const short = String(l.short ?? '').trim();
					// `short` IS REQUIRED HERE and is not optional as it is on a
					// spec level. levelShort renders it FIRST, and the whole reason
					// this format carries both is the 2026-09-08 report of edited
					// descriptors that changed nothing on screen.
					if (!short) {
						errors.push(
							`${lWhere} needs a short form. The grading console renders it on the level button, ahead of the descriptor.`
						);
					} else {
						if (wordCount(short) > HTML_SHORT_MAX_WORDS) {
							errors.push(
								`${lWhere} short "${short}" is ${wordCount(short)} words; the maximum is ${HTML_SHORT_MAX_WORDS}.`
							);
						}
						if ('.!?'.includes(short[short.length - 1])) {
							errors.push(`${lWhere} short "${short}" ends in punctuation.`);
						}
					}
					errors.push(...copyIssues(`${lWhere} label`, String(l.label ?? '')));
					errors.push(...copyIssues(`${lWhere} short`, short));
					errors.push(...copyIssues(`${lWhere} descriptor`, String(l.descriptor ?? '')));
				});

				criteriaSum += max;
			});

			// POINTS, WAY TWO OF THREE: the module's criteria sum to the module.
			if (!unreadable && criteriaSum !== declared) {
				errors.push(
					`Module "${name}" criteria sum to ${criteriaSum} but the module is worth ${declared} points.`
				);
			}
		}
	});

	if (blockCount > HTML_MAX_BLOCKS) {
		errors.push(`At most ${HTML_MAX_BLOCKS} blocks per document (this one has ${blockCount}).`);
	}

	// POINTS, WAY THREE OF THREE: the modules sum to the declared total.
	if (isWholeNumber(m.points) && modulePointsSum !== (m.points as number)) {
		errors.push(
			`Modules sum to ${modulePointsSum} points but the manifest declares ${m.points as number}.`
		);
	}

	// --- the document and the manifest have to describe the same inputs -----
	//
	// BOTH DIRECTIONS, and neither is the cosmetic one. A manifest field with no
	// `[data-field]` is a block that can never be answered -- it takes up points
	// and renders nothing. A `[data-field]` absent from the manifest is worse and
	// quieter: the student fills it in, the frame reports a change, the parent
	// has nothing to map it to, and the answer is dropped with no error anywhere.
	if (typeof html === 'string' && html.length > 0) {
		const inDocument = new Set(documentFields(html));
		const declaredFields = [...fieldOwner.keys()];
		const missing = declaredFields.filter((f) => !inDocument.has(f)).sort();
		if (missing.length) {
			errors.push(
				`The manifest declares ${missing.length === 1 ? 'a field' : 'fields'} the document has no [data-field] for: ${missing.join(', ')}. A block with no input can never be answered.`
			);
		}
		const undeclared = [...inDocument].filter((f) => !fieldOwner.has(f)).sort();
		if (undeclared.length) {
			errors.push(
				`The document has [data-field] ${undeclared.length === 1 ? 'attribute' : 'attributes'} the manifest does not declare: ${undeclared.join(', ')}. A student's answer there would be dropped with nothing to say so.`
			);
		}
		errors.push(...copyIssues('The document', documentText(html)));
	}

	if (errors.length) return fail();
	return { manifest: raw as HtmlAssignmentManifest, errors: [], warnings };
}

// ---------------------------------------------------------------------------
// The mapping the parent does on every message.
// ---------------------------------------------------------------------------

/**
 * `field` -> `block_id`, FROM THE STORED MANIFEST AND NOTHING ELSE.
 *
 * The bridge's `idea:change` names a `field`, never a `block_id`, and this is
 * why: a frame naming a block id directly is writing to an arbitrary row. The
 * parent looks the field up in the manifest it stored AT IMPORT, and a field
 * that is not in there is DROPPED rather than guessed at.
 *
 * A plain Map so a caller cannot pass the frame's own object in by accident.
 */
export function fieldBlockMap(manifest: HtmlAssignmentManifest): Map<string, string> {
	const map = new Map<string, string>();
	for (const mod of manifest.modules ?? []) {
		for (const b of mod.blocks ?? []) {
			if (!map.has(b.field)) map.set(b.field, b.id);
		}
	}
	return map;
}

/** Every block in the manifest, flattened, in document order. */
export function manifestBlocks(manifest: HtmlAssignmentManifest): HtmlBlock[] {
	return (manifest.modules ?? []).flatMap((mod) => mod.blocks ?? []);
}
