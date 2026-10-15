import { ByteBudget, inflateEntry, readCentralDirectory, ZipBudgetError } from '$lib/foundry/zip';
import { buildZip, type ZipEntry } from '$lib/foundry/zip-write';
import {
	CERT_RENEWALS,
	EVIDENCE_KINDS,
	FADE_LEVELS,
	QUESTION_TYPES,
	WAIVABLE_PARTS,
	type CertPackage,
	type CertParts,
	type CheckoutSpec,
	type CommonMistake,
	type ExamAnswerKey,
	type ExamConfig,
	type ExamOption,
	type ExamQuestion,
	type PracticeQuestion,
	type ProjectSpec,
	type QuestionType,
	type QuickCheck,
	type TrainingItem
} from '$lib/certifications/types';

/**
 * THE CERTIFICATION PACKAGE, BUILT AND READ (ledger 0391). The format is
 * `docs/certifications/PACKAGE_FORMAT.md`, version 1, and this module is its
 * one implementation on the portal side: `buildPackageZip` writes every file
 * the format names (empty where the kit has nothing, README included) and
 * `parsePackageZip` reads one back, validating every file against the format
 * and answering a PROBLEM LIST that names the file and the field rather than
 * throwing on bad input. `diffPackages` is the engine's diff view: every path
 * whose value changed, with before and after.
 *
 * THE ZIP CODE IS FOUNDRY'S (`$lib/foundry/zip.ts`, `zip-write.ts`), the only
 * zip reader and writer in the repository; nothing about the archive format is
 * restated here. The reader's uncompressed budget is enforced while inflating,
 * so a hostile archive stops partway.
 *
 * ROUND TRIP IS A PROPERTY, NOT A HOPE: `parse(build(x))` then `build` again
 * yields byte-identical JSON files, because every object is written in a fixed
 * key order from a normalized shape and the parser produces exactly that shape.
 * `tests/cert-server-package.test.ts` holds it.
 */

export const PACKAGE_FORMAT = 'idea-certification';
export const PACKAGE_VERSION = 1;

export const PACKAGE_FILES = {
	manifest: 'certification.json',
	studyGuide: 'study-guide.md',
	commonMistakes: 'common-mistakes.json',
	practiceQuiz: 'practice-quiz.json',
	examPool: 'exam-pool.json',
	guided: 'guided-project.json',
	autonomous: 'autonomous-project.json',
	checkout: 'checkout.json',
	videos: 'videos.json',
	readme: 'README.md',
	lessonsDir: 'lessons/'
} as const;

/** A package ZIP is small text; these caps are generous and refuse a bomb. */
export const PACKAGE_ZIP_MAX_BYTES = 20 * 1024 * 1024;
export const PACKAGE_UNPACKED_MAX_BYTES = 48 * 1024 * 1024;
/** `cert_lessons.document` CHECK (0260). */
export const LESSON_DOCUMENT_MAX_CHARS = 1_500_000;

export const CODE_RE = /^[A-Z0-9][A-Z0-9-]{0,31}$/;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const TOPIC_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export const OPTION_KEY_RE = /^[a-z]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PackageLesson {
	slug: string;
	title: string;
	document: string;
	manifest: Record<string, unknown>;
}

export interface PackageBundle {
	package: CertPackage;
	pool: ExamQuestion[];
	lessons: PackageLesson[];
}

export interface ParsedPackage {
	package: CertPackage | null;
	pool: ExamQuestion[];
	lessons: PackageLesson[];
	problems: string[];
}

export interface PackageChange {
	path: string;
	before: unknown;
	after: unknown;
}

export function packageZipName(code: string): string {
	return `${code || 'certification'}.idea-certification.zip`;
}

/* ------------------------------------------------------------------------ */
/* Normalized shapes, in the key order the files are written in              */
/* ------------------------------------------------------------------------ */

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

function jsonBytes(value: unknown): Uint8Array {
	return encoder.encode(JSON.stringify(value, null, 2) + '\n');
}

function normalizeTrainingItem(item: TrainingItem): TrainingItem {
	if (item.kind === 'lesson') {
		return { kind: 'lesson', key: item.key, title: item.title, slug: item.slug };
	}
	const out: TrainingItem = { kind: 'video', key: item.key, title: item.title, youtube_id: item.youtube_id };
	if (typeof item.start === 'number') out.start = item.start;
	return out;
}

function normalizeQuickCheck(q: QuickCheck): QuickCheck {
	const out: QuickCheck = { id: q.id, after: q.after, prompt: q.prompt, options: [...q.options], answer: q.answer };
	if (typeof q.explain === 'string' && q.explain) out.explain = q.explain;
	return out;
}

function normalizePractice(q: PracticeQuestion): PracticeQuestion {
	const out: PracticeQuestion = { id: q.id, prompt: q.prompt, options: [...q.options], answer: q.answer };
	if (typeof q.explain === 'string' && q.explain) out.explain = q.explain;
	return out;
}

function normalizeMistake(m: CommonMistake): CommonMistake {
	return { title: m.title, body: m.body };
}

function normalizeExam(e: ExamConfig | null): ExamConfig | null {
	if (!e) return null;
	return {
		time_limit_minutes: e.time_limit_minutes,
		questions_per_exam: e.questions_per_exam,
		topics: e.topics.map((t) => ({ id: t.id, name: t.name, minimum: t.minimum }))
	};
}

function normalizeProject(p: ProjectSpec | null, guided: boolean): ProjectSpec | null {
	if (!p) return null;
	const out: ProjectSpec = {
		objective: p.objective,
		spec: p.spec,
		acceptance: [...p.acceptance],
		references: p.references.map((r) => ({ label: r.label, href: r.href })),
		self_inspection: [...p.self_inspection],
		evidence: p.evidence.map((e) => ({ kind: e.kind, label: e.label, required: e.required }))
	};
	if (guided) {
		out.steps = (p.steps ?? []).map((s) => {
			const step: NonNullable<ProjectSpec['steps']>[number] = { title: s.title, body: s.body, fade: s.fade };
			if (typeof s.hint === 'string' && s.hint) step.hint = s.hint;
			return step;
		});
		// Key order: objective, spec, acceptance, references, steps, self_inspection, evidence.
		return {
			objective: out.objective,
			spec: out.spec,
			acceptance: out.acceptance,
			references: out.references,
			steps: out.steps,
			self_inspection: out.self_inspection,
			evidence: out.evidence
		};
	}
	return out;
}

function normalizeCheckout(c: CheckoutSpec | null): CheckoutSpec | null {
	return c ? { card: c.card, filming_guide: c.filming_guide } : null;
}

function normalizeAnswer(type: QuestionType, answer: ExamAnswerKey): ExamAnswerKey {
	if (type === 'multiple_choice') return String(answer);
	if (type === 'multiple_select') return Array.isArray(answer) ? [...answer] : [String(answer)];
	if (type === 'numeric') {
		const a = answer as { value: number; tolerance: number; unit?: string };
		const out: { value: number; tolerance: number; unit?: string } = { value: a.value, tolerance: a.tolerance };
		if (typeof a.unit === 'string' && a.unit) out.unit = a.unit;
		return out;
	}
	const a = answer as { accept: string[] };
	return { accept: [...a.accept] };
}

function normalizeQuestion(q: ExamQuestion): ExamQuestion {
	const out: ExamQuestion = {
		...(typeof q.id === 'string' && UUID_RE.test(q.id) ? { id: q.id } : {}),
		topic: q.topic,
		type: q.type,
		prompt: q.prompt,
		options: q.options ? q.options.map((o) => ({ key: o.key, text: o.text })) : null,
		answer: normalizeAnswer(q.type, q.answer),
		active: q.active !== false
	};
	if (typeof q.explain === 'string' && q.explain) {
		return { ...(out.id ? { id: out.id } : {}), topic: out.topic, type: out.type, prompt: out.prompt, options: out.options, answer: out.answer, explain: q.explain, active: out.active };
	}
	return out;
}

/** The whole package in the fixed key order every file is written in. */
export function normalizePackage(p: CertPackage): CertPackage {
	return {
		format: PACKAGE_FORMAT,
		version: PACKAGE_VERSION,
		code: p.code,
		name: p.name,
		level: p.level,
		category: p.category,
		sort_order: p.sort_order,
		renewal: p.renewal,
		definition: p.definition,
		allows: p.allows,
		does_not_allow: p.does_not_allow,
		prerequisites: [...p.prerequisites],
		parts: { guided: !!p.parts.guided, exam: !!p.parts.exam, autonomous: !!p.parts.autonomous, checkout: !!p.parts.checkout },
		training: {
			items: p.training.items.map(normalizeTrainingItem),
			quick_checks: p.training.quick_checks.map(normalizeQuickCheck)
		},
		practice_quiz: p.practice_quiz.map(normalizePractice),
		study_guide: p.study_guide,
		common_mistakes: p.common_mistakes.map(normalizeMistake),
		exam: normalizeExam(p.exam),
		guided_project: normalizeProject(p.guided_project, true),
		autonomous_project: normalizeProject(p.autonomous_project, false),
		checkout: normalizeCheckout(p.checkout)
	};
}

/** `certification.json`: the identity and the exam config, never the kit files. */
export function manifestOf(p: CertPackage): Record<string, unknown> {
	const n = normalizePackage(p);
	return {
		format: n.format,
		version: n.version,
		code: n.code,
		name: n.name,
		level: n.level,
		category: n.category,
		sort_order: n.sort_order,
		renewal: n.renewal,
		definition: n.definition,
		allows: n.allows,
		does_not_allow: n.does_not_allow,
		prerequisites: n.prerequisites,
		parts: n.parts,
		exam: n.exam
	};
}

export function packageReadme(p: CertPackage, lessons: PackageLesson[]): string {
	const lessonLines = lessons.length
		? lessons.map((l) => `- \`lessons/${l.slug}.html\` and \`lessons/${l.slug}.manifest.json\`: the lesson "${l.title}".`).join('\n')
		: '- (this certification has no HTML lessons)';
	return [
		`# ${p.code}: ${p.name}`,
		'',
		'This ZIP is one IDEA certification in the IDEA certification package format, version 1, exported from the IDEA Certification Portal (ideabosco.com/certifications). It is written for an AI tool as much as for a person: read, critique or refine the files, keep every key spelling exactly as it is, and the portal will import the result and show a diff before anything changes.',
		'',
		'The format is documented in the portal repository at `docs/certifications/PACKAGE_FORMAT.md`. In short:',
		'',
		'- `certification.json`: the manifest. Identity (code, name, level, category, sort order), meaning (definition, what it allows, what it does not allow), prerequisites (codes of other certifications), which parts are used, and the exam configuration (time limit, questions per exam, topics with their per-exam minimums).',
		'- `study-guide.md`: the study guide, markdown.',
		'- `common-mistakes.json`: an array of `{ "title", "body" }`.',
		'- `practice-quiz.json`: ungraded practice questions, each `{ "id", "prompt", "options", "answer" (the index of the right option), "explain" }`. Paraphrase the exam topics; never reuse an exam question.',
		'- `exam-pool.json`: the real exam questions WITH their answer keys. Each has a `topic` (a topic id from the manifest), a `type` (`multiple_choice`, `multiple_select`, `numeric`, `short`), a `prompt`, `options` for the choice types (2 to 8, each `{ "key": "a", "text": "..." }`), an `answer` in the shape its type needs, an optional `explain`, and `active`. The pool must hold at least twice `questions_per_exam` active questions and every topic at least its minimum.',
		'- `guided-project.json`: the teaching project, with `steps` whose `fade` (`full`, `goal`, `hint`) makes the help fall away toward the end.',
		'- `autonomous-project.json`: the proving project. Objective only: no steps.',
		'- `checkout.json`: `{ "card", "filming_guide" }`, markdown.',
		'- `videos.json`: `{ "items", "quick_checks" }`. Items are the training content in order: `{ "kind": "video", "key": "yt:<id>", "title", "youtube_id", "start" }` or `{ "kind": "lesson", "key": "lesson:<slug>", "title", "slug" }`. Quick checks are ungraded questions that follow an item.',
		lessonLines,
		'- `README.md`: this file. It is ignored on import.',
		'',
		'Importing a code the portal already has creates a new revision of that certification; a new code creates a draft. Nothing is published by importing.',
		''
	].join('\n');
}

/* ------------------------------------------------------------------------ */
/* Build                                                                      */
/* ------------------------------------------------------------------------ */

export async function buildPackageZip(
	adminGet: { package: CertPackage },
	pool: ExamQuestion[],
	lessons: PackageLesson[]
): Promise<Uint8Array> {
	const p = normalizePackage(adminGet.package);
	const sortedLessons = [...lessons].sort((a, b) => a.slug.localeCompare(b.slug));
	const entries: ZipEntry[] = [
		{ path: PACKAGE_FILES.manifest, bytes: jsonBytes(manifestOf(p)) },
		{ path: PACKAGE_FILES.studyGuide, bytes: encoder.encode(p.study_guide) },
		{ path: PACKAGE_FILES.commonMistakes, bytes: jsonBytes(p.common_mistakes) },
		{ path: PACKAGE_FILES.practiceQuiz, bytes: jsonBytes(p.practice_quiz) },
		{ path: PACKAGE_FILES.examPool, bytes: jsonBytes(pool.map(normalizeQuestion)) },
		{ path: PACKAGE_FILES.guided, bytes: jsonBytes(p.guided_project ?? {}) },
		{ path: PACKAGE_FILES.autonomous, bytes: jsonBytes(p.autonomous_project ?? {}) },
		{ path: PACKAGE_FILES.checkout, bytes: jsonBytes(p.checkout ?? { card: '', filming_guide: '' }) },
		{ path: PACKAGE_FILES.videos, bytes: jsonBytes(p.training) }
	];
	for (const lesson of sortedLessons) {
		entries.push({ path: `${PACKAGE_FILES.lessonsDir}${lesson.slug}.html`, bytes: encoder.encode(lesson.document) });
		entries.push({ path: `${PACKAGE_FILES.lessonsDir}${lesson.slug}.manifest.json`, bytes: jsonBytes(lesson.manifest ?? {}) });
	}
	entries.push({ path: PACKAGE_FILES.readme, bytes: encoder.encode(packageReadme(p, sortedLessons)) });
	return buildZip(entries);
}

/* ------------------------------------------------------------------------ */
/* Parse                                                                      */
/* ------------------------------------------------------------------------ */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

class Problems {
	readonly list: string[] = [];
	add(file: string, sentence: string): void {
		this.list.push(`${file}: ${sentence}`);
	}
}

function parseJson(file: string, text: string | undefined, problems: Problems): unknown {
	if (text === undefined) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		problems.add(file, 'is not valid JSON.');
		return undefined;
	}
}

function str(obj: Obj, key: string, file: string, problems: Problems, opts: { required?: boolean; nonEmpty?: boolean } = {}): string {
	const v = obj[key];
	if (v === undefined || v === null) {
		if (opts.required || opts.nonEmpty) problems.add(file, `"${key}" is required and must be a string.`);
		return '';
	}
	if (!isStr(v)) {
		problems.add(file, `"${key}" must be a string.`);
		return '';
	}
	if (opts.nonEmpty && !v.trim()) problems.add(file, `"${key}" must not be empty.`);
	return v;
}

function strArray(obj: Obj, key: string, file: string, problems: Problems): string[] {
	const v = obj[key];
	if (v === undefined || v === null) return [];
	if (!Array.isArray(v)) {
		problems.add(file, `"${key}" must be an array of strings.`);
		return [];
	}
	const out: string[] = [];
	v.forEach((item, i) => {
		if (isStr(item)) out.push(item);
		else problems.add(file, `"${key}[${i}]" must be a string.`);
	});
	return out;
}

function simpleQuestion(file: string, raw: unknown, index: number, problems: Problems, fallbackId: string): PracticeQuestion | null {
	const where = `"[${index}]"`;
	if (!isObj(raw)) {
		problems.add(file, `${where} must be an object.`);
		return null;
	}
	const id = isStr(raw.id) && raw.id.trim() ? raw.id : fallbackId;
	const prompt = str(raw, 'prompt', file, problems, { nonEmpty: true });
	const options = strArray(raw, 'options', file, problems);
	if (options.length < 2) problems.add(file, `${where} "options" needs at least two choices.`);
	if (!isInt(raw.answer) || raw.answer < 0 || raw.answer >= options.length) {
		problems.add(file, `${where} "answer" must be the index of the right option (0 to ${Math.max(0, options.length - 1)}).`);
	}
	const q: PracticeQuestion = { id, prompt, options, answer: isInt(raw.answer) ? raw.answer : 0 };
	if (isStr(raw.explain) && raw.explain) q.explain = raw.explain;
	else if (raw.explain !== undefined && raw.explain !== null && !isStr(raw.explain)) problems.add(file, `${where} "explain" must be a string.`);
	return q;
}

function parseManifest(text: string | undefined, problems: Problems): Omit<CertPackage, 'training' | 'practice_quiz' | 'study_guide' | 'common_mistakes' | 'guided_project' | 'autonomous_project' | 'checkout'> | null {
	const file = PACKAGE_FILES.manifest;
	if (text === undefined) {
		problems.add(file, 'is missing. A package needs its manifest.');
		return null;
	}
	const raw = parseJson(file, text, problems);
	if (raw === undefined) return null;
	if (!isObj(raw)) {
		problems.add(file, 'must be a JSON object.');
		return null;
	}
	if (raw.format !== PACKAGE_FORMAT) problems.add(file, `"format" must be exactly "${PACKAGE_FORMAT}".`);
	if (raw.version !== PACKAGE_VERSION) problems.add(file, `"version" must be ${PACKAGE_VERSION}.`);
	const code = str(raw, 'code', file, problems, { nonEmpty: true });
	if (code && !CODE_RE.test(code)) problems.add(file, '"code" must be 1 to 32 uppercase letters, digits and hyphens, starting with a letter or digit.');
	const name = str(raw, 'name', file, problems, { nonEmpty: true });
	if (!isInt(raw.level) || raw.level < 1 || raw.level > 9) problems.add(file, '"level" must be an integer from 1 to 9.');
	const category = str(raw, 'category', file, problems, { nonEmpty: true });
	if (raw.sort_order !== undefined && !isInt(raw.sort_order)) problems.add(file, '"sort_order" must be an integer.');
	const renewal = isStr(raw.renewal) ? raw.renewal : 'never';
	if (!(CERT_RENEWALS as readonly string[]).includes(renewal)) problems.add(file, `"renewal" must be one of ${CERT_RENEWALS.map((r) => `"${r}"`).join(', ')}.`);
	const definition = str(raw, 'definition', file, problems);
	const allows = str(raw, 'allows', file, problems);
	const does_not_allow = str(raw, 'does_not_allow', file, problems);
	const prerequisites = strArray(raw, 'prerequisites', file, problems).map((c) => c.trim().toUpperCase());
	prerequisites.forEach((c, i) => {
		if (!CODE_RE.test(c)) problems.add(file, `"prerequisites[${i}]" is not a certification code.`);
		else if (c === code) problems.add(file, '"prerequisites" may not name the certification itself.');
	});

	const parts: CertParts = { guided: true, exam: true, autonomous: true, checkout: true };
	if (raw.parts !== undefined) {
		if (!isObj(raw.parts)) problems.add(file, '"parts" must be an object with guided, exam, autonomous and checkout booleans.');
		else {
			for (const part of WAIVABLE_PARTS) {
				const v = raw.parts[part];
				if (v === undefined) continue;
				if (!isBool(v)) problems.add(file, `"parts.${part}" must be true or false.`);
				else parts[part] = v;
			}
		}
	}

	let exam: ExamConfig | null = null;
	if (raw.exam === undefined || raw.exam === null) {
		if (parts.exam) problems.add(file, '"exam" is required while parts.exam is true.');
	} else if (!isObj(raw.exam)) {
		problems.add(file, '"exam" must be an object.');
	} else {
		const e = raw.exam;
		if (!isInt(e.time_limit_minutes) || e.time_limit_minutes < 1) problems.add(file, '"exam.time_limit_minutes" must be a whole number of minutes, at least 1.');
		if (!isInt(e.questions_per_exam) || e.questions_per_exam < 1) problems.add(file, '"exam.questions_per_exam" must be a whole number, at least 1.');
		const topics: ExamConfig['topics'] = [];
		if (!Array.isArray(e.topics)) problems.add(file, '"exam.topics" must be an array.');
		else {
			const ids = new Set<string>();
			e.topics.forEach((t, i) => {
				if (!isObj(t)) {
					problems.add(file, `"exam.topics[${i}]" must be an object.`);
					return;
				}
				const id = str(t, 'id', file, problems, { nonEmpty: true });
				if (id && !TOPIC_ID_RE.test(id)) problems.add(file, `"exam.topics[${i}].id" must be lowercase letters, digits and hyphens.`);
				if (ids.has(id)) problems.add(file, `"exam.topics[${i}].id" repeats "${id}"; topic ids must be unique.`);
				ids.add(id);
				const tname = str(t, 'name', file, problems, { nonEmpty: true });
				if (!isInt(t.minimum) || t.minimum < 1) problems.add(file, `"exam.topics[${i}].minimum" must be a whole number, at least 1.`);
				topics.push({ id, name: tname, minimum: isInt(t.minimum) ? t.minimum : 1 });
			});
			const sum = topics.reduce((n, t) => n + t.minimum, 0);
			if (isInt(e.questions_per_exam) && sum > e.questions_per_exam) problems.add(file, `the topic minimums add up to ${sum}, more than "exam.questions_per_exam" (${e.questions_per_exam}).`);
		}
		exam = {
			time_limit_minutes: isInt(e.time_limit_minutes) ? e.time_limit_minutes : 30,
			questions_per_exam: isInt(e.questions_per_exam) ? e.questions_per_exam : 20,
			topics
		};
	}

	return {
		format: PACKAGE_FORMAT,
		version: PACKAGE_VERSION,
		code,
		name,
		level: isInt(raw.level) ? raw.level : 1,
		category,
		sort_order: isInt(raw.sort_order) ? raw.sort_order : 0,
		renewal: (CERT_RENEWALS as readonly string[]).includes(renewal) ? (renewal as CertPackage['renewal']) : 'never',
		definition,
		allows,
		does_not_allow,
		prerequisites,
		parts,
		exam
	};
}

function parseVideos(text: string | undefined, problems: Problems): CertPackage['training'] {
	const file = PACKAGE_FILES.videos;
	const empty: CertPackage['training'] = { items: [], quick_checks: [] };
	if (text === undefined) return empty;
	const raw = parseJson(file, text, problems);
	if (raw === undefined) return empty;
	let itemsRaw: unknown;
	let checksRaw: unknown = [];
	if (Array.isArray(raw)) itemsRaw = raw;
	else if (isObj(raw)) {
		itemsRaw = raw.items ?? [];
		checksRaw = raw.quick_checks ?? [];
	} else {
		problems.add(file, 'must be an array of training items or an object with "items" and "quick_checks".');
		return empty;
	}
	const items: TrainingItem[] = [];
	if (!Array.isArray(itemsRaw)) problems.add(file, '"items" must be an array.');
	else {
		const keys = new Set<string>();
		itemsRaw.forEach((it, i) => {
			if (!isObj(it)) {
				problems.add(file, `"items[${i}]" must be an object.`);
				return;
			}
			const title = str(it, 'title', file, problems, { nonEmpty: true });
			if (it.kind === 'video') {
				const youtube_id = str(it, 'youtube_id', file, problems, { nonEmpty: true });
				if (youtube_id && !YOUTUBE_ID_RE.test(youtube_id)) problems.add(file, `"items[${i}].youtube_id" must be the 11 character YouTube video id.`);
				const key = isStr(it.key) && it.key ? it.key : `yt:${youtube_id}`;
				if (key !== `yt:${youtube_id}`) problems.add(file, `"items[${i}].key" must be "yt:${youtube_id}".`);
				const item: TrainingItem = { kind: 'video', key, title, youtube_id };
				if (it.start !== undefined && it.start !== null) {
					if (!isInt(it.start) || it.start < 0) problems.add(file, `"items[${i}].start" must be a whole number of seconds.`);
					else item.start = it.start;
				}
				if (keys.has(key)) problems.add(file, `"items[${i}].key" repeats "${key}".`);
				keys.add(key);
				items.push(item);
			} else if (it.kind === 'lesson') {
				const slug = str(it, 'slug', file, problems, { nonEmpty: true });
				if (slug && !SLUG_RE.test(slug)) problems.add(file, `"items[${i}].slug" must be lowercase letters, digits and hyphens.`);
				const key = isStr(it.key) && it.key ? it.key : `lesson:${slug}`;
				if (key !== `lesson:${slug}`) problems.add(file, `"items[${i}].key" must be "lesson:${slug}".`);
				if (keys.has(key)) problems.add(file, `"items[${i}].key" repeats "${key}".`);
				keys.add(key);
				items.push({ kind: 'lesson', key, title, slug });
			} else {
				problems.add(file, `"items[${i}].kind" must be "video" or "lesson".`);
			}
		});
	}
	const quick_checks: QuickCheck[] = [];
	if (!Array.isArray(checksRaw)) problems.add(file, '"quick_checks" must be an array.');
	else {
		const itemKeys = new Set(items.map((i) => i.key));
		checksRaw.forEach((raw, i) => {
			const q = simpleQuestion(file, raw, i, problems, `qc-${i + 1}`);
			if (!q) return;
			const after = isObj(raw) ? str(raw, 'after', file, problems, { nonEmpty: true }) : '';
			if (after && !itemKeys.has(after)) problems.add(file, `"quick_checks[${i}].after" names "${after}", which is not one of the items.`);
			const qc: QuickCheck = { id: q.id, after, prompt: q.prompt, options: q.options, answer: q.answer };
			if (q.explain) qc.explain = q.explain;
			quick_checks.push(qc);
		});
	}
	return { items, quick_checks };
}

function parsePractice(text: string | undefined, problems: Problems): PracticeQuestion[] {
	const file = PACKAGE_FILES.practiceQuiz;
	if (text === undefined) return [];
	const raw = parseJson(file, text, problems);
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) {
		problems.add(file, 'must be an array of questions.');
		return [];
	}
	const out: PracticeQuestion[] = [];
	raw.forEach((q, i) => {
		const parsed = simpleQuestion(file, q, i, problems, `pq-${i + 1}`);
		if (parsed) out.push(parsed);
	});
	return out;
}

function parseMistakes(text: string | undefined, problems: Problems): CommonMistake[] {
	const file = PACKAGE_FILES.commonMistakes;
	if (text === undefined) return [];
	const raw = parseJson(file, text, problems);
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) {
		problems.add(file, 'must be an array of { "title", "body" }.');
		return [];
	}
	const out: CommonMistake[] = [];
	raw.forEach((m, i) => {
		if (!isObj(m)) {
			problems.add(file, `"[${i}]" must be an object.`);
			return;
		}
		out.push({ title: str(m, 'title', file, problems, { nonEmpty: true }), body: str(m, 'body', file, problems, { nonEmpty: true }) });
	});
	return out;
}

function parseAnswer(file: string, where: string, type: QuestionType, raw: unknown, optionKeys: string[], problems: Problems): ExamAnswerKey {
	if (type === 'multiple_choice') {
		if (!isStr(raw) || !optionKeys.includes(raw)) problems.add(file, `${where} "answer" must be one of the option keys.`);
		return isStr(raw) ? raw : '';
	}
	if (type === 'multiple_select') {
		if (!Array.isArray(raw) || !raw.length || raw.some((k) => !isStr(k) || !optionKeys.includes(k))) {
			problems.add(file, `${where} "answer" must be a non-empty array of option keys.`);
			return [];
		}
		return [...new Set(raw as string[])];
	}
	if (type === 'numeric') {
		if (!isObj(raw) || typeof raw.value !== 'number' || !Number.isFinite(raw.value) || typeof raw.tolerance !== 'number' || raw.tolerance < 0) {
			problems.add(file, `${where} "answer" must be { "value": number, "tolerance": number >= 0, "unit"?: string }.`);
			return { value: 0, tolerance: 0 };
		}
		const out: { value: number; tolerance: number; unit?: string } = { value: raw.value, tolerance: raw.tolerance };
		if (raw.unit !== undefined && raw.unit !== null) {
			if (!isStr(raw.unit)) problems.add(file, `${where} "answer.unit" must be a string.`);
			else if (raw.unit) out.unit = raw.unit;
		}
		return out;
	}
	if (!isObj(raw) || !Array.isArray(raw.accept) || !raw.accept.length || raw.accept.some((a) => !isStr(a) || !a.trim())) {
		problems.add(file, `${where} "answer" must be { "accept": [ every spelling you accept ] } with at least one.`);
		return { accept: [] };
	}
	return { accept: [...(raw.accept as string[])] };
}

function parsePool(text: string | undefined, exam: ExamConfig | null, problems: Problems): ExamQuestion[] {
	const file = PACKAGE_FILES.examPool;
	if (text === undefined) return [];
	const raw = parseJson(file, text, problems);
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) {
		problems.add(file, 'must be an array of exam questions.');
		return [];
	}
	const topicIds = exam ? new Set(exam.topics.map((t) => t.id)) : null;
	const out: ExamQuestion[] = [];
	raw.forEach((q, i) => {
		const where = `"[${i}]"`;
		if (!isObj(q)) {
			problems.add(file, `${where} must be an object.`);
			return;
		}
		const topic = str(q, 'topic', file, problems, { nonEmpty: true });
		if (topic && topicIds && !topicIds.has(topic)) problems.add(file, `${where} "topic" is "${topic}", which is not a topic id in certification.json.`);
		const type = isStr(q.type) && (QUESTION_TYPES as readonly string[]).includes(q.type) ? (q.type as QuestionType) : null;
		if (!type) {
			problems.add(file, `${where} "type" must be one of ${QUESTION_TYPES.map((t) => `"${t}"`).join(', ')}.`);
			return;
		}
		const prompt = str(q, 'prompt', file, problems, { nonEmpty: true });
		let options: ExamOption[] | null = null;
		const choice = type === 'multiple_choice' || type === 'multiple_select';
		if (choice) {
			if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8) {
				problems.add(file, `${where} "options" must hold 2 to 8 choices for a ${type} question.`);
				options = [];
			} else {
				options = [];
				const keys = new Set<string>();
				q.options.forEach((o, j) => {
					if (!isObj(o) || !isStr(o.key) || !isStr(o.text)) {
						problems.add(file, `${where} "options[${j}]" must be { "key": "a", "text": "..." }.`);
						return;
					}
					if (!OPTION_KEY_RE.test(o.key)) problems.add(file, `${where} "options[${j}].key" must be a single lowercase letter.`);
					if (keys.has(o.key)) problems.add(file, `${where} "options[${j}].key" repeats "${o.key}".`);
					keys.add(o.key);
					(options as ExamOption[]).push({ key: o.key, text: o.text });
				});
			}
		} else if (q.options !== undefined && q.options !== null) {
			problems.add(file, `${where} "options" must be absent or null for a ${type} question.`);
		}
		const answer = parseAnswer(file, where, type, q.answer, (options ?? []).map((o) => o.key), problems);
		if (q.active !== undefined && !isBool(q.active)) problems.add(file, `${where} "active" must be true or false.`);
		const question: ExamQuestion = {
			...(isStr(q.id) && UUID_RE.test(q.id) ? { id: q.id } : {}),
			topic,
			type,
			prompt,
			options,
			answer,
			active: q.active !== false
		};
		if (isStr(q.explain) && q.explain) question.explain = q.explain;
		else if (q.explain !== undefined && q.explain !== null && !isStr(q.explain)) problems.add(file, `${where} "explain" must be a string.`);
		out.push(normalizeQuestion(question));
	});
	return out;
}

function parseProject(file: string, text: string | undefined, guided: boolean, problems: Problems): ProjectSpec | null {
	if (text === undefined) return null;
	const raw = parseJson(file, text, problems);
	if (raw === undefined) return null;
	if (!isObj(raw)) {
		problems.add(file, 'must be a JSON object.');
		return null;
	}
	if (!Object.keys(raw).length) return null;
	const references: ProjectSpec['references'] = [];
	if (raw.references !== undefined && raw.references !== null) {
		if (!Array.isArray(raw.references)) problems.add(file, '"references" must be an array of { "label", "href" }.');
		else
			raw.references.forEach((r, i) => {
				if (!isObj(r)) {
					problems.add(file, `"references[${i}]" must be an object.`);
					return;
				}
				const label = str(r, 'label', file, problems, { nonEmpty: true });
				const href = str(r, 'href', file, problems, { nonEmpty: true });
				if (href && !/^https?:\/\//i.test(href)) problems.add(file, `"references[${i}].href" must be an http or https URL.`);
				references.push({ label, href });
			});
	}
	const evidence: ProjectSpec['evidence'] = [];
	if (raw.evidence !== undefined && raw.evidence !== null) {
		if (!Array.isArray(raw.evidence)) problems.add(file, '"evidence" must be an array of { "kind", "label", "required" }.');
		else
			raw.evidence.forEach((e, i) => {
				if (!isObj(e)) {
					problems.add(file, `"evidence[${i}]" must be an object.`);
					return;
				}
				const kind = isStr(e.kind) && (EVIDENCE_KINDS as readonly string[]).includes(e.kind) ? (e.kind as ProjectSpec['evidence'][number]['kind']) : null;
				if (!kind) problems.add(file, `"evidence[${i}].kind" must be one of ${EVIDENCE_KINDS.map((k) => `"${k}"`).join(', ')}.`);
				const label = str(e, 'label', file, problems, { nonEmpty: true });
				if (e.required !== undefined && !isBool(e.required)) problems.add(file, `"evidence[${i}].required" must be true or false.`);
				evidence.push({ kind: kind ?? 'text', label, required: e.required !== false });
			});
	}
	const spec: ProjectSpec = {
		objective: str(raw, 'objective', file, problems),
		spec: str(raw, 'spec', file, problems),
		acceptance: strArray(raw, 'acceptance', file, problems),
		references,
		self_inspection: strArray(raw, 'self_inspection', file, problems),
		evidence
	};
	if (guided) {
		const steps: NonNullable<ProjectSpec['steps']> = [];
		if (raw.steps !== undefined && raw.steps !== null) {
			if (!Array.isArray(raw.steps)) problems.add(file, '"steps" must be an array.');
			else
				raw.steps.forEach((s, i) => {
					if (!isObj(s)) {
						problems.add(file, `"steps[${i}]" must be an object.`);
						return;
					}
					const title = str(s, 'title', file, problems, { nonEmpty: true });
					const body = str(s, 'body', file, problems);
					const fade = isStr(s.fade) && (FADE_LEVELS as readonly string[]).includes(s.fade) ? (s.fade as ProjectSpec['steps'] extends (infer T)[] | undefined ? T extends { fade: infer F } ? F : never : never) : null;
					if (!fade) problems.add(file, `"steps[${i}].fade" must be one of ${FADE_LEVELS.map((f) => `"${f}"`).join(', ')}.`);
					const step: NonNullable<ProjectSpec['steps']>[number] = { title, body, fade: fade ?? 'full' };
					if (isStr(s.hint) && s.hint) step.hint = s.hint;
					else if (s.hint !== undefined && s.hint !== null && !isStr(s.hint)) problems.add(file, `"steps[${i}].hint" must be a string.`);
					steps.push(step);
				});
		}
		spec.steps = steps;
	} else if (Array.isArray(raw.steps) && raw.steps.length) {
		problems.add(file, 'the autonomous project has no "steps": it is objective only.');
	}
	return normalizeProject(spec, guided);
}

function parseCheckout(text: string | undefined, problems: Problems): CheckoutSpec | null {
	const file = PACKAGE_FILES.checkout;
	if (text === undefined) return null;
	const raw = parseJson(file, text, problems);
	if (raw === undefined) return null;
	if (!isObj(raw)) {
		problems.add(file, 'must be { "card", "filming_guide" }.');
		return null;
	}
	return { card: str(raw, 'card', file, problems), filming_guide: str(raw, 'filming_guide', file, problems) };
}

/** Strips one shared top-level folder when the manifest is not at the root (a re-zipped folder). */
function unwrap(names: Map<string, Uint8Array>): Map<string, Uint8Array> {
	if (names.has(PACKAGE_FILES.manifest)) return names;
	const prefixes = new Set<string>();
	for (const name of names.keys()) {
		const slash = name.indexOf('/');
		if (slash < 1) return names;
		prefixes.add(name.slice(0, slash + 1));
	}
	if (prefixes.size !== 1) return names;
	const prefix = [...prefixes][0];
	const out = new Map<string, Uint8Array>();
	for (const [name, bytes] of names) out.set(name.slice(prefix.length), bytes);
	return out;
}

function isNoise(name: string): boolean {
	return name.startsWith('__MACOSX/') || name.split('/').pop() === '.DS_Store' || name.endsWith('/');
}

export async function parsePackageZip(bytes: Uint8Array): Promise<ParsedPackage> {
	const problems = new Problems();
	const empty: ParsedPackage = { package: null, pool: [], lessons: [], problems: problems.list };
	if (bytes.byteLength > PACKAGE_ZIP_MAX_BYTES) {
		problems.add('package', `the ZIP is ${bytes.byteLength} bytes; the limit is ${PACKAGE_ZIP_MAX_BYTES}.`);
		return empty;
	}
	let records;
	try {
		records = readCentralDirectory(bytes);
	} catch {
		records = null;
	}
	if (!records) {
		problems.add('package', 'the file is not a ZIP archive this portal can read.');
		return empty;
	}
	const files = new Map<string, Uint8Array>();
	const budget = new ByteBudget(PACKAGE_UNPACKED_MAX_BYTES);
	for (const record of records) {
		if (record.directory || record.irregular || isNoise(record.name)) continue;
		try {
			files.set(record.name, await inflateEntry(bytes, record, record.name, budget));
		} catch (e) {
			if (e instanceof ZipBudgetError) {
				problems.add('package', `unpacking passed the ${PACKAGE_UNPACKED_MAX_BYTES} byte limit at ${record.name}.`);
				return empty;
			}
			problems.add(record.name, (e as Error)?.message || 'could not be unpacked.');
		}
	}
	const named = unwrap(files);
	const text = (name: string): string | undefined => {
		const b = named.get(name);
		return b ? decoder.decode(b) : undefined;
	};

	const manifest = parseManifest(text(PACKAGE_FILES.manifest), problems);
	const training = parseVideos(text(PACKAGE_FILES.videos), problems);
	const practice_quiz = parsePractice(text(PACKAGE_FILES.practiceQuiz), problems);
	const common_mistakes = parseMistakes(text(PACKAGE_FILES.commonMistakes), problems);
	const study_guide = text(PACKAGE_FILES.studyGuide) ?? '';
	const pool = parsePool(text(PACKAGE_FILES.examPool), manifest?.exam ?? null, problems);
	const guided_project = parseProject(PACKAGE_FILES.guided, text(PACKAGE_FILES.guided), true, problems);
	const autonomous_project = parseProject(PACKAGE_FILES.autonomous, text(PACKAGE_FILES.autonomous), false, problems);
	const checkout = parseCheckout(text(PACKAGE_FILES.checkout), problems);

	const lessons: PackageLesson[] = [];
	const lessonTitles = new Map<string, string>();
	for (const item of training.items) if (item.kind === 'lesson') lessonTitles.set(item.slug, item.title);
	for (const name of [...named.keys()].sort()) {
		if (!name.startsWith(PACKAGE_FILES.lessonsDir) || !name.endsWith('.html')) continue;
		const slug = name.slice(PACKAGE_FILES.lessonsDir.length, -'.html'.length);
		if (!SLUG_RE.test(slug)) {
			problems.add(name, 'the lesson file name must be lowercase letters, digits and hyphens.');
			continue;
		}
		const document = text(name) ?? '';
		if (document.length > LESSON_DOCUMENT_MAX_CHARS) problems.add(name, `the lesson is ${document.length} characters; the limit is ${LESSON_DOCUMENT_MAX_CHARS}.`);
		let manifestObj: Record<string, unknown> = {};
		const manifestName = `${PACKAGE_FILES.lessonsDir}${slug}.manifest.json`;
		const manifestText = text(manifestName);
		if (manifestText !== undefined) {
			const parsed = parseJson(manifestName, manifestText, problems);
			if (parsed !== undefined) {
				if (isObj(parsed)) manifestObj = parsed;
				else problems.add(manifestName, 'must be a JSON object (the HTML assignment engine manifest; {} for a lesson with nothing to answer).');
			}
		}
		lessons.push({ slug, title: lessonTitles.get(slug) ?? slug, document, manifest: manifestObj });
	}
	for (const name of named.keys()) {
		if (name.startsWith(PACKAGE_FILES.lessonsDir) && name.endsWith('.manifest.json')) {
			const slug = name.slice(PACKAGE_FILES.lessonsDir.length, -'.manifest.json'.length);
			if (!lessons.some((l) => l.slug === slug)) problems.add(name, `has no lessons/${slug}.html beside it.`);
		}
	}

	if (!manifest) return { package: null, pool, lessons, problems: problems.list };
	const pkg: CertPackage = normalizePackage({
		...manifest,
		training,
		practice_quiz,
		study_guide,
		common_mistakes,
		guided_project,
		autonomous_project,
		checkout
	});
	return { package: pkg, pool, lessons, problems: problems.list };
}

/* ------------------------------------------------------------------------ */
/* Diff                                                                      */
/* ------------------------------------------------------------------------ */

function flatten(prefix: string, value: unknown, out: Map<string, unknown>): void {
	if (Array.isArray(value)) {
		if (!value.length) out.set(prefix, []);
		value.forEach((v, i) => flatten(`${prefix}[${i}]`, v, out));
		return;
	}
	if (isObj(value)) {
		const keys = Object.keys(value);
		if (!keys.length) out.set(prefix, {});
		for (const k of keys) flatten(prefix ? `${prefix}.${k}` : k, value[k], out);
		return;
	}
	out.set(prefix, value);
}

function flattenBundle(b: PackageBundle | null): Map<string, unknown> {
	const out = new Map<string, unknown>();
	if (!b) return out;
	flatten('package', normalizePackage(b.package), out);
	b.pool.forEach((q, i) => flatten(`pool[${q.id ?? `#${i + 1}`}]`, normalizeQuestion(q), out));
	for (const l of b.lessons) flatten(`lessons[${l.slug}]`, { title: l.title, document: l.document, manifest: l.manifest }, out);
	return out;
}

/** Every path whose value differs, before and after; a path absent on one side is `undefined` there. */
export function diffPackages(current: PackageBundle | null, incoming: PackageBundle): PackageChange[] {
	const before = flattenBundle(current);
	const after = flattenBundle(incoming);
	const paths = [...before.keys()];
	for (const p of after.keys()) if (!before.has(p)) paths.push(p);
	const out: PackageChange[] = [];
	for (const path of paths) {
		const a = before.get(path);
		const b = after.get(path);
		if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path, before: a, after: b });
	}
	return out;
}
