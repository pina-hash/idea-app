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
 * assignment spec or a reference spec. A plain announcement has nothing to
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
import type { ExportOutcome } from '$lib/classroom/revisions';

export type { ExportOutcome };

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
	specKind: 'assignment' | 'reference';
	spec: unknown;
	rubric: unknown | null;
	sectionIds: string[];
	courseDir: string;
	slug: string;
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
	const dir = `${EXPORT_ROOT}/${subject.courseDir}/${subject.slug}`;
	const specName = subject.specKind === 'reference' ? 'reference.json' : 'assignment.json';
	const files: ExportFile[] = [
		jsonFile(`${dir}/${specName}`, subject.spec),
		jsonFile(`${dir}/material.json`, {
			title: subject.title,
			kind: subject.kind,
			specKind: subject.specKind,
			itemId: subject.itemId,
			revision: subject.revision,
			author: subject.author,
			sectionIds: subject.sectionIds,
			exportedAt: subject.exportedAt
		})
	];
	if (subject.rubric != null) files.push(jsonFile(`${dir}/rubric.json`, subject.rubric));
	return files;
}

/** `classroom: <title> (<kind>) r<revision>` -- the brief's format, verbatim. */
export function exportCommitMessage(subject: {
	title: string | null;
	specKind: 'assignment' | 'reference';
	revision: number;
}): string {
	const title = (subject.title ?? '').trim() || 'Untitled';
	return `classroom: ${title} (${subject.specKind}) r${subject.revision}`;
}

class GitHubError extends Error {}

/**
 * Pushes a set of files to the export repo as ONE commit on the default branch.
 *
 * Five requests whatever the file count, because a tree entry may carry its
 * `content` inline -- there is no separate blob-creation round trip per file.
 *
 * Returns `unchanged: true` when the resulting tree is byte-identical to the
 * branch's current one, having committed nothing. That is the whole idempotency
 * story: a retry of a push that already landed, or an export of content that
 * has not moved, is a no-op rather than an empty commit.
 */
export async function pushFilesToGitHub(opts: {
	token: string;
	files: readonly ExportFile[];
	message: string;
	deps?: ExportDeps;
}): Promise<{ sha: string; unchanged: boolean }> {
	const doFetch = opts.deps?.fetchImpl ?? fetch;
	const base = opts.deps?.apiBase ?? GITHUB_API_BASE;
	const { owner, repo, branch } = EXPORT_REPO;
	const root = `${base}/repos/${owner}/${repo}`;

	async function call<T>(path: string, init?: RequestInit): Promise<T> {
		const res = await doFetch(`${root}${path}`, {
			...init,
			headers: {
				accept: 'application/vnd.github+json',
				authorization: `Bearer ${opts.token}`,
				'content-type': 'application/json',
				'x-github-api-version': '2022-11-28',
				...(init?.headers as Record<string, string> | undefined)
			}
		});
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { message?: string } | null;
			// The status and GitHub's own message, never the token or the headers.
			throw new GitHubError(`GitHub ${res.status}: ${body?.message ?? 'request refused'}`);
		}
		return (await res.json()) as T;
	}

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

	if (tree.sha === headCommit.tree.sha) {
		return { sha: headSha, unchanged: true };
	}

	const commit = await call<{ sha: string }>('/git/commits', {
		method: 'POST',
		body: JSON.stringify({ message: opts.message, tree: tree.sha, parents: [headSha] })
	});

	await call(`/git/refs/heads/${branch}`, {
		method: 'PATCH',
		body: JSON.stringify({ sha: commit.sha })
	});

	return { sha: commit.sha, unchanged: false };
}

interface ItemRow {
	id: string;
	kind: string;
	title: string | null;
	author_name: string | null;
	author_email: string | null;
	export_slug: string | null;
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

	const { data: itemRow } = await supabase
		.from('classroom_items')
		.select('id, kind, title, author_name, author_email, export_slug')
		.eq('id', itemId)
		.maybeSingle();
	const item = itemRow as ItemRow | null;
	if (!item) return { status: 'skipped', reason: 'not_found' };
	if (item.kind !== 'assignment' && item.kind !== 'material') {
		return { status: 'skipped', reason: 'no_spec' };
	}

	const [assignmentRes, referenceRes, rubricRes, postingRes, revisionRes] = await Promise.all([
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
			.eq('item_id', itemId)
	]);

	const assignmentSpec = (assignmentRes.data as { spec?: unknown } | null)?.spec ?? null;
	const referenceSpec = (referenceRes.data as { spec?: unknown } | null)?.spec ?? null;
	const spec = assignmentSpec ?? referenceSpec;
	if (spec == null) return { status: 'skipped', reason: 'no_spec' };
	const specKind: 'assignment' | 'reference' = assignmentSpec != null ? 'assignment' : 'reference';

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
		rubric: (rubricRes.data as { criteria?: unknown } | null)?.criteria ?? null,
		sectionIds,
		courseDir,
		slug,
		revision,
		author: item.author_name ?? item.author_email ?? null,
		exportedAt: new Date().toISOString()
	};

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
		const message = e instanceof Error ? e.message : 'The export failed.';
		// Recorded, not thrown: the caller is a fire-and-forget ping and the
		// teacher's own surface for this is the chip, not an exception.
		await supabase.rpc('classroom_record_export', {
			p_item_id: itemId,
			p_slug: slug,
			p_sha: null,
			p_error: message.slice(0, 400)
		});
		return { status: 'failed', error: message, slug };
	}
}
