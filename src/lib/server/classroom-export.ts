/**
 * Classroom specs, exported to the repo on every save.
 *
 * $lib/server, so SvelteKit refuses to bundle any of it client-side -- the
 * one-egress-point convention notebook-drive.ts and push.ts already follow.
 * GITHUB_EXPORT_TOKEN is read HERE and nowhere else, is never returned to a
 * caller, and never appears in a message, a log line or a thrown error.
 *
 * WHAT THIS IS FOR. A spec authored in the app lives in one jsonb column, and
 * the only way to read what it used to say is the revision history (0110). The
 * repo is where every other authored artifact already lives -- materials/
 * carries the IDEA209H syllabus and its assets -- so pushing each item's spec
 * there gives the material a diffable, reviewable, greppable history in the
 * place people already look, and a copy that survives the database.
 *
 * WHAT IS EXPORTED, AND WHAT IS NOT. Only an item that actually carries an
 * assignment spec, a reference spec or (ledger 0431) a ported HTML document,
 * which exports as the document verbatim (`assignment.html`), the manifest
 * stored at import (`manifest.json`) and its rubric. A schema-3 item that
 * also keeps a superseded spec exports the document: the manifest decides,
 * the order every rendering surface takes. A plain announcement has nothing to
 * export, and a material with only a written body is not a spec -- exporting
 * either would fill the repo with empty folders that a reader has to learn to
 * ignore. The rubric rides along when one exists, because a rubric is part of
 * what the assignment IS.
 *
 * ONE COMMIT, NOT ONE PER FILE. The Contents API writes a file at a time and
 * would land three commits for one save, all with the same message. The Git
 * Data API builds a tree and commits it once, which is what the brief's single
 * commit-message format describes and what makes the export atomic: a reader
 * never sees a spec updated without its metadata.
 *
 * IDEMPOTENT BY CONSTRUCTION. The new tree is compared to the base commit's
 * tree, and an identical one is not committed at all -- so Retry after a
 * partial failure, or a save that changed nothing this export can see, adds
 * nothing to the history. That is what makes the failure chip's Retry safe to
 * press repeatedly.
 *
 * BEST-EFFORT, ALWAYS. Nothing here is allowed to fail a save. The route that
 * calls it is fired by the client AFTER the write has already committed, so a
 * refusal from GitHub, an unset token or a network failure costs the export and
 * nothing else; the outcome is recorded on the item and surfaced as a quiet
 * chip with a Retry, never as a failed publish.
 */

import { env } from '$env/dynamic/private';
import type { SupabaseClient } from '@supabase/supabase-js';
// The outcome type lives in the CLIENT-SAFE module and is imported here, not
// declared here and imported there: a client module may never reach into
// $lib/server, so types flow outward only. See revisions.ts.
import type { ExportOutcome, ExportFailureKind } from '$lib/classroom/revisions';
// The failure WORDING is imported the same direction, and for the same reason it
// is not duplicated here: the chip classifies a stored message by matching the
// phrases this builder writes, so one file has to own both halves.
import { exportFailureMessage } from '$lib/classroom/revisions';

export type { ExportOutcome, ExportFailureKind };

/** The one repo this exports to. Direct to the default branch, no branches. */
export const EXPORT_REPO = { owner: 'pina-hash', repo: 'idea-app', branch: 'main' } as const;

export const GITHUB_API_BASE = 'https://api.github.com';

/** Everything under this prefix is exported material, matching materials/idea209h/. */
export const EXPORT_ROOT = 'materials';

/** Where an item lands when its classes span more than one course. */
export const SHARED_COURSE_DIR = '_shared';

/** Injected in tests; production uses the real ones. */
export interface ExportDeps {
	fetchImpl?: typeof fetch;
	apiBase?: string;
	token?: string;
	/** Injected so the collision backoff costs a test no wall-clock time. */
	sleepImpl?: (ms: number) => Promise<void>;
}

/** Present only when the deployment is configured to export at all. */
export function exportConfigured(): boolean {
	return exportToken().length > 0;
}

function exportToken(): string {
	return (env.GITHUB_EXPORT_TOKEN ?? '').trim();
}

/**
 * A stable, url-safe folder name for an item.
 *
 * ASSIGNED ONCE AND THEN FROZEN -- classroom_record_export refuses to overwrite
 * an existing export_slug, so this is only ever consulted for an item that has
 * never been exported. Recomputing it per save would move a material's folder
 * the first time anyone fixed a typo in its title, leaving the old folder
 * behind as a second copy with nothing linking them.
 *
 * The item id's first segment is appended when the title slugifies to nothing
 * (a title of only punctuation, or no title at all), so the folder is always a
 * real name rather than an empty path segment.
 */
export function exportSlug(title: string | null | undefined, itemId: string): string {
	return slugifyName(title) || `item-${itemId.split('-')[0]}`;
}

/** May legitimately return '' -- callers decide what an unusable name becomes. */
function slugifyName(text: string | null | undefined): string {
	return (text ?? '')
		.normalize('NFKD')
		// Explicit escapes rather than literal combining marks: those do not
		// survive every editor and toolchain the way an escape does.
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/g, '');
}

/**
 * The course folder for a set of course codes.
 *
 * Exactly one distinct course means that course's own folder; anything else --
 * an item posted across two courses, or an item whose postings resolve to no
 * course at all -- goes to _shared, which is the honest answer rather than
 * arbitrarily picking one of them.
 */
export function exportCourseDir(courseCodes: readonly string[]): string {
	const distinct = Array.from(
		new Set(courseCodes.map((c) => c.trim().toLowerCase()).filter(Boolean))
	);
	if (distinct.length === 1) return slugifyName(distinct[0]) || SHARED_COURSE_DIR;
	return SHARED_COURSE_DIR;
}

export interface ExportFile {
	path: string;
	content: string;
}

export interface ExportSubject {
	itemId: string;
	title: string | null;
	kind: 'assignment' | 'material';
	specKind: 'assignment' | 'reference' | 'html';
	/** The spec, or for `html` the manifest stored at import. */
	spec: unknown;
	/** For `html` only: the document, byte for byte as stored. */
	document?: string | null;
	/** For `html` only: what the teacher uploaded it as. */
	filename?: string | null;
	/** For `html` only: when the stored document last changed (its cache version). */
	documentUpdatedAt?: string | null;
	rubric: unknown | null;
	sectionIds: string[];
	courseDir: string;
	slug: string;
	/** The slug was recorded by an earlier export and can no longer change. */
	slugFrozen?: boolean;
	revision: number;
	author: string | null;
	exportedAt: string;
}

/** Pretty-printed with a trailing newline: these are files people read in diffs. */
function jsonFile(path: string, value: unknown): ExportFile {
	return { path, content: `${JSON.stringify(value, null, 2)}\n` };
}

/**
 * The files one export writes. Pure, so the layout is testable without a
 * network, a database or a token.
 *
 * The metadata file is deliberately small and deliberately NOT the spec's own
 * meta block: it answers "what is this folder, which item is it, and how did it
 * get here", which is the question someone reading the repo has and the spec
 * itself cannot answer.
 */
export function buildExportFiles(subject: ExportSubject): ExportFile[] {
	const dir = exportDir(subject);
	const meta = {
		title: subject.title,
		kind: subject.kind,
		specKind: subject.specKind,
		itemId: subject.itemId,
		revision: subject.revision,
		author: subject.author,
		sectionIds: subject.sectionIds,
		exportedAt: subject.exportedAt
	};
	if (subject.specKind === 'html') {
		// THE DOCUMENT VERBATIM. Nothing rewrites a stored byte (0195), and the
		// copy in the repo is only worth having if it is exactly what students
		// were served: no trailing newline added, no re-encoding.
		const files: ExportFile[] = [
			{ path: `${dir}/assignment.html`, content: subject.document ?? '' },
			jsonFile(`${dir}/manifest.json`, subject.spec),
			// NO EXPORT TIME FOR A DOCUMENT, and that is what makes a rerun free:
			// the stored document's own version instant instead, so exporting an
			// unchanged worksheet again builds the identical tree and commits
			// nothing (every commit to main is a deploy).
			jsonFile(`${dir}/material.json`, {
				...meta,
				exportedAt: undefined,
				documentUpdatedAt: subject.documentUpdatedAt ?? null,
				filename: subject.filename ?? null
			})
		];
		if (subject.rubric != null) files.push(jsonFile(`${dir}/rubric.json`, subject.rubric));
		return files;
	}
	const specName = subject.specKind === 'reference' ? 'reference.json' : 'assignment.json';
	const files: ExportFile[] = [jsonFile(`${dir}/${specName}`, subject.spec), jsonFile(`${dir}/material.json`, meta)];
	if (subject.rubric != null) files.push(jsonFile(`${dir}/rubric.json`, subject.rubric));
	return files;
}

/** The one folder an item's export writes: `materials/<course>/<slug>`. */
export function exportDir(subject: { courseDir: string; slug: string }): string {
	return `${EXPORT_ROOT}/${subject.courseDir}/${subject.slug}`;
}

/** `classroom: <title> (<kind>) r<revision>` -- the brief's format, verbatim. */
export function exportCommitMessage(subject: {
	title: string | null;
	specKind: 'assignment' | 'reference' | 'html';
	revision: number;
}): string {
	const title = (subject.title ?? '').trim() || 'Untitled';
	return `classroom: ${title} (${subject.specKind}) r${subject.revision}`;
}

/**
 * A refusal from GitHub, carrying enough to decide whether trying again is
 * pointless or is exactly the right move.
 *
 * The message is GitHub's own text and the status, never the token and never
 * the headers -- the teacher-facing sentence is composed later, at the point
 * the outcome is recorded.
 */
class GitHubError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly kind: ExportFailureKind
	) {
		super(message);
	}
}

/**
 * How many times ONE push may rebuild on a fresh head before it gives up.
 *
 * Four -- one first try and three rebuilds. Each attempt is six sequential
 * round trips to GitHub, so four of them is a few seconds at worst, which fits
 * inside a serverless invocation with room to spare and inside the patience of
 * someone who just pressed Retry. Higher would mostly buy the ability to lose a
 * race four times running to the SAME concurrent writer, which is a sign that
 * something else is wrong and is better reported than absorbed; lower would not
 * survive the ordinary case this repo actually produces, where saving a spec,
 * its rubric and a publish fires three overlapping exports of one item.
 */
export const EXPORT_MAX_ATTEMPTS = 4;

/**
 * Phrases GitHub uses when a rule on the branch -- not a race -- is the reason.
 *
 * Matched BEFORE the status code, because branch protection and a lost race both
 * come back 422 from the same endpoint, and only one of them is worth retrying.
 * Anything not matched here that 422s on the ref endpoint is treated as a race,
 * which is the safe way round: retrying against a protected branch costs three
 * wasted requests and still reports honestly, while giving up on a race turns a
 * two-second collision into a permanent failure with a chip on it.
 */
const PROTECTION_MARKERS = [
	'protected branch',
	'pull request',
	'status check',
	'required review',
	'review is required',
	'not authorized',
	'repository rule'
];

function classifyRefusal(status: number, message: string, path: string): ExportFailureKind {
	const text = message.toLowerCase();
	if (PROTECTION_MARKERS.some((marker) => text.includes(marker))) return 'refused';
	// Credentials and reach are settled facts, not timing.
	if (status === 401 || status === 403 || status === 404) return 'refused';
	// 422 on the UPDATE-REF endpoint, with nothing about a rule in it, is the
	// non-fast-forward: the commit's parent is no longer the head, because the
	// head moved after it was read. That is the whole of this bug.
	if (status === 422 && path.includes('/git/ref')) return 'collision';
	return 'unknown';
}

/**
 * Pushes a set of files to the export repo as ONE commit on the default branch.
 *
 * MAIN IS SHARED, AND THIS IS NOT THE ONLY WRITER. People commit to this repo
 * all day, and the export is itself a burst writer -- saving a spec, then its
 * rubric, then publishing fires three of these at one item. So the branch moving
 * between the head read and the ref update is the NORMAL case here, not a rare
 * race, and a single-shot push loses that race often enough to look permanently
 * broken from the outside.
 *
 * The answer is to rebuild, never to overwrite. Every attempt re-reads the head,
 * re-bases the tree on it, re-decides whether there is anything to commit at all,
 * and builds a commit whose parent IS the current head; the ref is read once more
 * immediately before the update, so a moved branch is caught before a commit is
 * pointed at it. `force` appears nowhere in this file and must not: these commits
 * are written unattended to a branch whose history exists nowhere else, and an
 * export losing a race is never a reason to discard somebody else's work.
 *
 * Returns `unchanged: true` when the resulting tree is byte-identical to the
 * branch's current one, having committed nothing -- re-decided on each attempt,
 * because a tree that was a no-op against the head we read may be a real change
 * against the head we ended up with, and the reverse.
 */
export async function pushFilesToGitHub(opts: {
	token: string;
	files: readonly ExportFile[];
	message: string;
	deps?: ExportDeps;
}): Promise<{ sha: string; unchanged: boolean; attempts: number }> {
	const doFetch = opts.deps?.fetchImpl ?? fetch;
	const base = opts.deps?.apiBase ?? GITHUB_API_BASE;
	const sleep =
		opts.deps?.sleepImpl ??
		((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
	const { owner, repo, branch } = EXPORT_REPO;
	const root = `${base}/repos/${owner}/${repo}`;

	async function call<T>(path: string, init?: RequestInit): Promise<T> {
		let res: Response;
		try {
			res = await doFetch(`${root}${path}`, {
				...init,
				headers: {
					accept: 'application/vnd.github+json',
					authorization: `Bearer ${opts.token}`,
					'content-type': 'application/json',
					'x-github-api-version': '2022-11-28',
					...(init?.headers as Record<string, string> | undefined)
				}
			});
		} catch (e) {
			// A transport failure is not a refusal and must not be described as one:
			// nothing about the token or the branch is implicated by a dropped socket.
			throw new GitHubError(
				(e as Error)?.message || 'the request did not complete',
				0,
				'network'
			);
		}
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { message?: string } | null;
			const detail = body?.message ?? 'request refused';
			// The status and GitHub's own message, never the token or the headers.
			throw new GitHubError(
				`GitHub ${res.status}: ${detail}`,
				res.status,
				classifyRefusal(res.status, detail, path)
			);
		}
		return (await res.json()) as T;
	}

	/** One whole read-build-commit-update sequence, from a FRESH head every time. */
	async function attempt(): Promise<{ sha: string; unchanged: boolean }> {
		const ref = await call<{ object: { sha: string } }>(`/git/ref/heads/${branch}`);
		const headSha = ref.object.sha;
		const headCommit = await call<{ tree: { sha: string } }>(`/git/commits/${headSha}`);

		const tree = await call<{ sha: string }>('/git/trees', {
			method: 'POST',
			body: JSON.stringify({
				base_tree: headCommit.tree.sha,
				tree: opts.files.map((f) => ({
					path: f.path,
					mode: '100644',
					type: 'blob',
					content: f.content
				}))
			})
		});

		// Against THIS head. Re-asked on every attempt on purpose: whoever moved the
		// branch may have written exactly this content (a duplicate export of the
		// same item), in which case there is now nothing to commit -- and equally, a
		// tree that matched the head we first read may be a real change against the
		// one we have ended up building on.
		if (tree.sha === headCommit.tree.sha) {
			return { sha: headSha, unchanged: true };
		}

		const commit = await call<{ sha: string }>('/git/commits', {
			method: 'POST',
			body: JSON.stringify({ message: opts.message, tree: tree.sha, parents: [headSha] })
		});

		// IMMEDIATELY BEFORE THE WRITE. This does not close the window -- only the
		// update itself is atomic, and the 422 below is still the authority -- but it
		// catches the common case one round trip earlier, without pointing the branch
		// at a commit whose parent has already stopped being the head.
		const current = await call<{ object: { sha: string } }>(`/git/ref/heads/${branch}`);
		if (current.object.sha !== headSha) {
			throw new GitHubError(
				`GitHub 422: ${branch} moved to ${current.object.sha.slice(0, 7)} while this export was being built`,
				422,
				'collision'
			);
		}

		// NO `force`, here or anywhere. A non-fast-forward comes back 422 and is
		// rebuilt above; it is never resolved by overwriting the ref.
		await call(`/git/refs/heads/${branch}`, {
			method: 'PATCH',
			body: JSON.stringify({ sha: commit.sha })
		});

		return { sha: commit.sha, unchanged: false };
	}

	for (let n = 1; ; n++) {
		try {
			return { ...(await attempt()), attempts: n };
		} catch (e) {
			const racing = e instanceof GitHubError && e.kind === 'collision';
			if (!racing || n >= EXPORT_MAX_ATTEMPTS) throw e;
			// Jittered, so two exports of the same item racing each other do not line
			// their retries up and collide again in step.
			await sleep(n * 120 + Math.floor(Math.random() * 120));
		}
	}
}

interface ItemRow {
	id: string;
	kind: string;
	title: string | null;
	author_name: string | null;
	author_email: string | null;
	export_slug: string | null;
	assignment_schema_version?: number | null;
}

/**
 * Exports one item, end to end.
 *
 * EVERY READ RUNS AS THE CALLER, through their own cookie-session client. So
 * this can never export something the caller could not already see, and the
 * bookkeeping write is refused by classroom_record_export for anyone who does
 * not manage the item -- there is no service-role client anywhere in this path,
 * exactly as there is none in the public coin read path.
 *
 * It resolves everything it needs and then decides; a `skipped` outcome is a
 * normal answer, not a failure, and leaves the item's export bookkeeping
 * completely alone (so an announcement never grows a failure chip).
 */
/**
 * WHAT ONE ITEM WOULD EXPORT, read as the caller, or why it exports nothing.
 * Shared by the per-save export and the one-time HTML backfill, so the two
 * cannot disagree about the folder, the files or the slug.
 */
export async function readExportSubject(
	supabase: SupabaseClient,
	itemId: string
): Promise<{ subject: ExportSubject } | { skipped: 'not_found' | 'no_spec' }> {
	const { data: itemRow } = await supabase
		.from('classroom_items')
		.select('id, kind, title, author_name, author_email, export_slug, assignment_schema_version')
		.eq('id', itemId)
		.maybeSingle();
	const item = itemRow as ItemRow | null;
	if (!item) return { skipped: 'not_found' };
	if (item.kind !== 'assignment' && item.kind !== 'material') {
		return { skipped: 'no_spec' };
	}

	const [assignmentRes, referenceRes, rubricRes, postingRes, revisionRes, htmlRes] = await Promise.all([
		supabase.from('classroom_assignment_specs').select('spec').eq('item_id', itemId).maybeSingle(),
		supabase.from('classroom_reference_specs').select('spec').eq('item_id', itemId).maybeSingle(),
		supabase.from('classroom_rubrics').select('criteria').eq('item_id', itemId).maybeSingle(),
		supabase
			.from('classroom_postings')
			.select('section_id, classroom_sections(course_id, classroom_courses(code))')
			.eq('item_id', itemId),
		supabase
			.from('classroom_content_revisions')
			.select('id', { count: 'exact', head: true })
			.eq('item_id', itemId),
		// ledger 0431: the ported document, read only for an item that IS one,
		// so a deployment without 0195 never asks for a table it lacks.
		item.assignment_schema_version === 3
			? supabase
					.from('classroom_html_assignments')
					.select('document, manifest, filename, updated_at')
					.eq('item_id', itemId)
					.maybeSingle()
			: Promise.resolve({ data: null })
	]);

	const html =
		(htmlRes.data as { document?: string; manifest?: unknown; filename?: string; updated_at?: string } | null) ??
		null;
	const assignmentSpec = (assignmentRes.data as { spec?: unknown } | null)?.spec ?? null;
	const referenceSpec = (referenceRes.data as { spec?: unknown } | null)?.spec ?? null;
	const hasHtml = html != null && typeof html.document === 'string' && html.manifest != null;
	const spec = hasHtml ? html.manifest : (assignmentSpec ?? referenceSpec);
	if (spec == null) return { skipped: 'no_spec' };
	const specKind: ExportSubject['specKind'] = hasHtml
		? 'html'
		: assignmentSpec != null
			? 'assignment'
			: 'reference';

	const postings = (postingRes.data ?? []) as {
		section_id: string;
		classroom_sections?: { classroom_courses?: { code?: string } | null } | null;
	}[];
	const sectionIds = postings.map((p) => p.section_id).sort();
	const courseCodes = postings
		.map((p) => p.classroom_sections?.classroom_courses?.code ?? '')
		.filter(Boolean);

	const slug = item.export_slug ?? exportSlug(item.title, item.id);
	const courseDir = exportCourseDir(courseCodes);
	// The head's own version number: one more than the revisions recorded, which
	// is the same derivation classroom_item_revisions reports as head_revision.
	// Counted across every target on purpose -- this is "the Nth version of this
	// material", the number a commit message wants, not a per-column counter a
	// reader of the repo would have no way to interpret.
	const revision = (revisionRes.count ?? 0) + 1;

	const subject: ExportSubject = {
		itemId: item.id,
		title: item.title,
		kind: item.kind,
		specKind,
		spec,
		document: hasHtml ? html.document : null,
		filename: hasHtml ? (html.filename ?? null) : null,
		documentUpdatedAt: hasHtml ? (html.updated_at ?? null) : null,
		rubric: (rubricRes.data as { criteria?: unknown } | null)?.criteria ?? null,
		sectionIds,
		courseDir,
		slug,
		slugFrozen: item.export_slug != null,
		revision,
		author: item.author_name ?? item.author_email ?? null,
		exportedAt: new Date().toISOString()
	};
	return { subject };
}

export async function exportClassroomItem(
	supabase: SupabaseClient,
	itemId: string,
	deps: ExportDeps = {}
): Promise<ExportOutcome> {
	const token = deps.token ?? exportToken();
	// UNSET IS SILENT, and deliberately so: local development has no token, and
	// a deployment that has not been given one is not misconfigured, it is not
	// exporting. Recording a failure here would put a chip on every item.
	if (!token) return { status: 'skipped', reason: 'no_token' };

	const read = await readExportSubject(supabase, itemId);
	if ('skipped' in read) return { status: 'skipped', reason: read.skipped };
	const { subject } = read;
	const { slug, courseDir } = subject;
	const files = buildExportFiles(subject);

	try {
		const { sha, unchanged } = await pushFilesToGitHub({
			token,
			files,
			message: exportCommitMessage(subject),
			deps
		});
		await supabase.rpc('classroom_record_export', {
			p_item_id: itemId,
			p_slug: slug,
			p_sha: sha,
			p_error: null
		});
		return {
			status: 'ok',
			sha,
			slug,
			unchanged,
			path: `${EXPORT_ROOT}/${courseDir}/${slug}`,
			files: files.map((f) => f.path)
		};
	} catch (e) {
		const detail = e instanceof Error ? e.message : 'The export failed.';
		// WHAT KIND OF WRONG, not just how wrong. The chip is the whole of what a
		// teacher sees, and "GitHub 422: Reference cannot be updated" reads to them
		// like their own content was rejected -- when it means a colleague committed
		// two seconds earlier and Retry will land it. A refusal from a branch rule,
		// which Retry will never clear, has to read differently again.
		const kind: ExportFailureKind = e instanceof GitHubError ? e.kind : 'unknown';
		const message = exportFailureMessage(kind, detail);
		// Recorded, not thrown: the caller is a fire-and-forget ping and the
		// teacher's own surface for this is the chip, not an exception.
		await supabase.rpc('classroom_record_export', {
			p_item_id: itemId,
			p_slug: slug,
			p_sha: null,
			// The stored string is the only thing that survives a reload, so the
			// class has to be legible IN it -- see exportFailureMessage.
			p_error: message.slice(0, 400)
		});
		return { status: 'failed', error: message, slug, kind };
	}
}

/**
 * THE ONE-TIME HTML BACKFILL (ledger 0431, report a71b7b8a): every ported HTML
 * assignment the caller can read, exported to `materials/<course>/<slug>/`
 * exactly as a save would export it, for the documents that existed before
 * the per-save export knew about them (IDEA209H Unit 3 among them).
 *
 * IT IS SAFE TO RUN AGAIN, which is what makes it safe to run once. Every
 * batch is one commit built on the live head, and a tree identical to the
 * head is not committed at all, so a second run writes nothing that is
 * already there. Folders are batched up to `HTML_BACKFILL_BATCH_BYTES` per
 * commit rather than one commit per item, because every push to `main`
 * deploys the site.
 *
 * TWO ITEMS NEVER SHARE A FOLDER IN ONE RUN. A slug is frozen once recorded;
 * an item with no recorded slug whose title slugifies to a folder another item
 * in this run already takes gets its id's first segment appended.
 *
 * As the caller, like the per-save export: an admin reads every document, a
 * teacher only their own, and `classroom_record_export` refuses anyone who
 * does not manage the item.
 */
export const HTML_BACKFILL_BATCH_BYTES = 3_000_000;

export interface HtmlBackfillResult {
	status: 'ok' | 'skipped' | 'failed';
	reason?: string;
	/** HTML assignments found. */
	found: number;
	/** Folders written (or already identical) per item. */
	exported: { itemId: string; title: string | null; path: string }[];
	/** Items that could not be exported, with why. */
	failed: { itemId: string; title: string | null; error: string }[];
	commits: { sha: string; unchanged: boolean; items: number }[];
}

export async function exportHtmlBackfill(
	supabase: SupabaseClient,
	deps: ExportDeps = {}
): Promise<HtmlBackfillResult> {
	const empty = { found: 0, exported: [], failed: [], commits: [] };
	const token = deps.token ?? exportToken();
	if (!token) return { status: 'skipped', reason: 'no_token', ...empty };

	const { data, error } = await supabase
		.from('classroom_html_assignments')
		.select('item_id')
		.order('item_id');
	if (error) return { status: 'failed', reason: 'The list of HTML assignments could not be read.', ...empty };
	const ids = ((data ?? []) as { item_id: string }[]).map((r) => r.item_id);

	const subjects: ExportSubject[] = [];
	const failed: HtmlBackfillResult['failed'] = [];
	const taken = new Map<string, string>();
	for (const id of ids) {
		const read = await readExportSubject(supabase, id);
		if ('skipped' in read) {
			failed.push({ itemId: id, title: null, error: `Skipped (${read.skipped}).` });
			continue;
		}
		const subject = read.subject;
		if (subject.specKind !== 'html') {
			failed.push({ itemId: id, title: subject.title, error: 'Skipped (not marked as an HTML assignment).' });
			continue;
		}
		const holder = taken.get(exportDir(subject));
		if (holder && holder !== subject.itemId && !subject.slugFrozen) subject.slug = `${subject.slug}-${subject.itemId.split('-')[0]}`;
		taken.set(exportDir(subject), subject.itemId);
		subjects.push(subject);
	}

	// Batches by size, in id order, so a rerun builds the same batches.
	const batches: { subjects: ExportSubject[]; files: ExportFile[]; bytes: number }[] = [];
	for (const subject of subjects) {
		const files = buildExportFiles(subject);
		const bytes = files.reduce((n, f) => n + f.content.length, 0);
		const last = batches[batches.length - 1];
		if (last && last.bytes + bytes <= HTML_BACKFILL_BATCH_BYTES) {
			last.subjects.push(subject);
			last.files.push(...files);
			last.bytes += bytes;
		} else batches.push({ subjects: [subject], files: [...files], bytes });
	}

	const exported: HtmlBackfillResult['exported'] = [];
	const commits: HtmlBackfillResult['commits'] = [];
	for (const batch of batches) {
		const n = batch.subjects.length;
		const message =
			n === 1
				? exportCommitMessage(batch.subjects[0])
				: `classroom: ${n} HTML assignments exported (${batch.subjects.map((s) => (s.title ?? '').trim() || 'Untitled').join(', ').slice(0, 200)})`;
		try {
			const { sha, unchanged } = await pushFilesToGitHub({ token, files: batch.files, message, deps });
			commits.push({ sha, unchanged, items: n });
			for (const subject of batch.subjects) {
				await supabase.rpc('classroom_record_export', {
					p_item_id: subject.itemId,
					p_slug: subject.slug,
					p_sha: sha,
					p_error: null
				});
				exported.push({ itemId: subject.itemId, title: subject.title, path: exportDir(subject) });
			}
		} catch (e) {
			const kind: ExportFailureKind = e instanceof GitHubError ? e.kind : 'unknown';
			const message = exportFailureMessage(kind, e instanceof Error ? e.message : 'The export failed.');
			for (const subject of batch.subjects) failed.push({ itemId: subject.itemId, title: subject.title, error: message });
		}
	}
	return {
		status: failed.some((f) => !f.error.startsWith('Skipped')) ? 'failed' : 'ok',
		found: ids.length,
		exported,
		failed,
		commits
	};
}
