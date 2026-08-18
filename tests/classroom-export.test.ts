// tests/classroom-export.test.ts
//
// The GitHub export (Phase 2): the folder layout, the commit, and the rules
// about WHAT gets exported at all.
//
// NO NETWORK AND NO TOKEN, ever. The GitHub API is a mock `fetch` that records
// every request and answers the Git Data endpoints the way GitHub does; the
// token is a string the test made up. A test that reached api.github.com would
// need a real credential to run, would fail in CI without one, and would push
// commits to a real repo -- which is the opposite of what a test suite is for.
//
// WHAT EARNS ITS PLACE HERE. Everything covered fails SILENTLY:
//
//   * a slug that is recomputed per save moves an item's folder the first time
//     someone fixes its title, leaving the old copy behind with nothing linking
//     the two -- and nothing about that looks wrong until a term later;
//   * a non-idempotent retry adds an empty commit every time the chip is
//     pressed, which nobody notices until the history is unreadable;
//   * an export that runs for an item with no spec fills the repo with folders
//     a reader has to learn to ignore;
//   * a failure that throws instead of being recorded would take down the save
//     that fired it, which is the ONE thing the export is not allowed to do.
//
// The token NEVER appearing in an error message is here for the same reason: a
// leak into a message ends up in a log, and nothing about the message would
// look wrong.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	buildExportFiles,
	exportClassroomItem,
	exportCommitMessage,
	exportCourseDir,
	exportSlug,
	pushFilesToGitHub,
	EXPORT_MAX_ATTEMPTS,
	type ExportFile,
	type ExportSubject
} from '../src/lib/server/classroom-export';
import {
	classifyExportError,
	exportFailureLabel,
	exportFailureMessage
} from '../src/lib/classroom/revisions';
import {
	createClassroomTransports,
	createTeacherEngineTransports
} from '../src/lib/classroom/transports';

const API = 'https://mock.github.test';
const TOKEN = 'ghp_not-a-real-token-0000';

interface Recorded {
	method: string;
	path: string;
	body: Record<string, unknown> | null;
	auth: string | null;
}

/**
 * A mock GitHub that behaves like the Git Data API: a ref, a commit, a tree
 * builder that returns a DIFFERENT sha only when the content actually differs,
 * and a ref update. That last property is the whole point -- it is what lets
 * the idempotency test be a real measurement rather than an assertion about
 * our own code talking to itself.
 *
 * IT REFUSES A NON-FAST-FORWARD, which the first version of this mock did not.
 * The old PATCH handler accepted whatever sha it was handed and moved the head
 * to it, so every test passed against a branch that could not move -- and the
 * one condition this repo produces constantly, somebody else committing to main
 * mid-export, was the one condition the suite could not express. A mock that is
 * more permissive than the real thing does not fail loudly; it certifies a bug.
 * So a commit whose parent is no longer the head is answered 422 "Reference
 * cannot be updated", verbatim, exactly as api.github.com answers it.
 *
 * `collide` is the concurrent writer: `at: 'trees'` lands a commit in the
 * window between the head read and the update (which is where the race
 * actually happens), `at: 'patch'` lands it at the last possible instant, so
 * the update itself is what comes back 422. Both are real; the second is the
 * one no amount of re-reading beforehand can prevent.
 */
function mockGitHub(
	opts: {
		existing?: Record<string, string>;
		failOn?: string;
		status?: number;
		message?: string;
		collide?: { at: 'trees' | 'patch'; times: number; writes?: readonly ExportFile[] };
	} = {}
) {
	const files = new Map<string, string>(Object.entries(opts.existing ?? {}));
	const calls: Recorded[] = [];
	/** Every commit object ever created, so the ref update can check its parent. */
	const commits = new Map<
		string,
		{ parent: string | null; tree: string; staged: Map<string, string> }
	>();
	let headSha = 'head-sha-0';
	let treeSha = treeShaFor(files);
	let outsideWrites = 0;
	let collisionsLeft = opts.collide?.times ?? 0;

	function treeShaFor(map: Map<string, string>): string {
		const flat = [...map.entries()].sort().map(([k, v]) => `${k}:${v}`).join('|');
		return `tree-${flat.length}-${hash(flat)}`;
	}
	function hash(text: string): string {
		let h = 0;
		for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
		return String(h >>> 0);
	}

	/**
	 * SOMEBODY ELSE COMMITS TO MAIN. The head moves and the tree moves with it;
	 * nothing already on the branch is disturbed, which is the point -- the
	 * export's job is to land on top of this, never to erase it.
	 */
	function outsideCommit() {
		outsideWrites++;
		for (const file of opts.collide?.writes ?? []) files.set(file.path, file.content);
		if (!opts.collide?.writes) {
			files.set(`other/${outsideWrites}.txt`, `someone else, commit ${outsideWrites}\n`);
		}
		headSha = `outside-sha-${outsideWrites}`;
		treeSha = treeShaFor(files);
	}

	const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
		const full = String(url);
		const path = full.slice(API.length);
		const method = init?.method ?? 'GET';
		const headers = (init?.headers ?? {}) as Record<string, string>;
		const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
		calls.push({ method, path, body, auth: headers.authorization ?? null });

		if (opts.failOn && path.includes(opts.failOn)) {
			return new Response(
				JSON.stringify({
					message: opts.message ?? 'Resource not accessible by personal access token'
				}),
				{ status: opts.status ?? 403 }
			);
		}

		if (method === 'GET' && path.endsWith('/git/ref/heads/main')) {
			return json({ object: { sha: headSha } });
		}
		if (method === 'GET' && path.includes('/git/commits/')) {
			return json({ tree: { sha: treeSha } });
		}
		if (method === 'POST' && path.endsWith('/git/trees')) {
			const next = new Map(files);
			for (const entry of (body?.tree ?? []) as { path: string; content: string }[]) {
				next.set(entry.path, entry.content);
			}
			// Staged, not committed: a tree that is never referenced by a commit
			// leaves the repo exactly as it was, which is what GitHub does too.
			pending = next;
			const sha = treeShaFor(next);
			// The window. Computed BEFORE the outside commit lands, because the
			// tree we asked for is built from the base we named, not from whatever
			// main becomes a moment later.
			if (opts.collide?.at === 'trees' && collisionsLeft > 0) {
				collisionsLeft--;
				outsideCommit();
			}
			return json({ sha });
		}
		if (method === 'POST' && path.endsWith('/git/commits')) {
			const sha = `commit-${calls.length}`;
			commits.set(sha, {
				parent: ((body?.parents ?? []) as string[])[0] ?? null,
				tree: String(body?.tree ?? ''),
				staged: new Map(pending)
			});
			return json({ sha });
		}
		if (method === 'PATCH' && path.includes('/git/refs/heads/main')) {
			if (opts.collide?.at === 'patch' && collisionsLeft > 0) {
				collisionsLeft--;
				outsideCommit();
			}
			const target = String(body?.sha ?? '');
			const record = commits.get(target);
			// THE REFUSAL THIS SUITE EXISTS FOR. No `force` is honoured, because
			// the export must never send one: main's history lives nowhere else.
			if (!record || record.parent !== headSha) {
				return new Response(JSON.stringify({ message: 'Reference cannot be updated' }), {
					status: 422
				});
			}
			headSha = target;
			for (const [k, v] of record.staged) files.set(k, v);
			treeSha = treeShaFor(files);
			return json({ object: { sha: headSha } });
		}
		return new Response(JSON.stringify({ message: `unexpected ${method} ${path}` }), { status: 404 });
	}) as unknown as typeof fetch;

	let pending = new Map<string, string>();

	function json(value: unknown) {
		return new Response(JSON.stringify(value), { status: 200 });
	}

	return {
		fetchImpl,
		calls,
		files,
		head: () => headSha,
		// No backoff in tests: the wait is real in production and pure cost here.
		deps: { fetchImpl, apiBase: API, token: TOKEN, sleepImpl: async () => {} }
	};
}

const SPEC = {
	schemaVersion: 1,
	meta: { assignmentId: 'bridge', title: 'Bridge stackup', totalPoints: 20 },
	modules: [{ id: 'm1', title: 'Measure', points: 20, blocks: [] }]
};

function subject(over: Partial<ExportSubject> = {}): ExportSubject {
	return {
		itemId: '11111111-2222-3333-4444-555555555555',
		title: 'Bridge stackup',
		kind: 'assignment',
		specKind: 'assignment',
		spec: SPEC,
		rubric: null,
		sectionIds: ['s-2', 's-1'],
		courseDir: 'idea209h',
		slug: 'bridge-stackup',
		revision: 3,
		author: 'T. Vargas',
		exportedAt: '2026-08-15T12:00:00.000Z',
		...over
	};
}

describe('the slug is a name, not a hash', () => {
	it('slugifies a real title', () => {
		expect(exportSlug('Bridge Stackup: Lab 3', 'aaaa-bbbb')).toBe('bridge-stackup-lab-3');
	});

	it('strips accents rather than dropping the word', () => {
		expect(exportSlug('Précis: Résumé', 'aaaa-bbbb')).toBe('precis-resume');
	});

	it('falls back to the item id when a title slugifies to nothing', () => {
		// A title of pure punctuation, or none at all, must not produce an empty
		// path segment -- materials//assignment.json is not a path.
		expect(exportSlug('!!! ???', 'abcd1234-ffff')).toBe('item-abcd1234');
		expect(exportSlug(null, 'abcd1234-ffff')).toBe('item-abcd1234');
		expect(exportSlug('   ', 'abcd1234-ffff')).toBe('item-abcd1234');
	});

	it('caps length so a paragraph-long title cannot become a folder name', () => {
		const slug = exportSlug('a'.repeat(200), 'aaaa-bbbb');
		expect(slug.length).toBeLessThanOrEqual(60);
	});
});

describe('the course folder', () => {
	it('uses the one course when every posting shares it', () => {
		expect(exportCourseDir(['IDEA209H', 'idea209h'])).toBe('idea209h');
	});

	it('uses _shared when postings span two courses', () => {
		expect(exportCourseDir(['IDEA209H', 'IDEA100'])).toBe('_shared');
	});

	it('uses _shared when there is no course at all', () => {
		expect(exportCourseDir([])).toBe('_shared');
	});
});

describe('the files one export writes', () => {
	it('writes the spec and the metadata under materials/<course>/<slug>/', () => {
		const files = buildExportFiles(subject());
		expect(files.map((f) => f.path)).toEqual([
			'materials/idea209h/bridge-stackup/assignment.json',
			'materials/idea209h/bridge-stackup/material.json'
		]);
	});

	it('names a reference document reference.json', () => {
		const files = buildExportFiles(subject({ specKind: 'reference', kind: 'material' }));
		expect(files[0].path).toBe('materials/idea209h/bridge-stackup/reference.json');
	});

	it('includes the rubric only when there is one', () => {
		expect(buildExportFiles(subject()).map((f) => f.path)).not.toContain(
			'materials/idea209h/bridge-stackup/rubric.json'
		);
		const withRubric = buildExportFiles(subject({ rubric: [{ id: 'r1', criterion: 'Accuracy' }] }));
		expect(withRubric.map((f) => f.path)).toContain(
			'materials/idea209h/bridge-stackup/rubric.json'
		);
	});

	it('carries exactly the metadata the brief asks for', () => {
		const files = buildExportFiles(subject());
		const meta = JSON.parse(files[1].content) as Record<string, unknown>;
		expect(meta.title).toBe('Bridge stackup');
		expect(meta.kind).toBe('assignment');
		expect(meta.itemId).toBe('11111111-2222-3333-4444-555555555555');
		expect(meta.revision).toBe(3);
		expect(meta.author).toBe('T. Vargas');
		expect(meta.sectionIds).toEqual(['s-2', 's-1']);
	});

	it('pretty-prints with a trailing newline, because these are read in diffs', () => {
		const files = buildExportFiles(subject());
		expect(files[0].content).toContain('\n  ');
		expect(files[0].content.endsWith('\n')).toBe(true);
	});
});

describe('the commit message', () => {
	it('is the brief format', () => {
		expect(exportCommitMessage({ title: 'Bridge stackup', specKind: 'assignment', revision: 3 })).toBe(
			'classroom: Bridge stackup (assignment) r3'
		);
		expect(exportCommitMessage({ title: 'Syllabus', specKind: 'reference', revision: 1 })).toBe(
			'classroom: Syllabus (reference) r1'
		);
	});

	it('names an untitled item rather than leaving a gap in the subject line', () => {
		expect(exportCommitMessage({ title: null, specKind: 'assignment', revision: 2 })).toBe(
			'classroom: Untitled (assignment) r2'
		);
	});
});

describe('pushing to GitHub', () => {
	it('lands every file in ONE commit', async () => {
		const gh = mockGitHub();
		const files = buildExportFiles(subject({ rubric: [{ id: 'r1' }] }));
		const res = await pushFilesToGitHub({
			token: TOKEN,
			files,
			message: 'classroom: Bridge stackup (assignment) r3',
			deps: gh.deps
		});

		expect(res.unchanged).toBe(false);
		// Exactly one commit for three files -- the Contents API would have made
		// three, all with the same message.
		const commits = gh.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/git/commits'));
		expect(commits).toHaveLength(1);
		expect(commits[0].body?.message).toBe('classroom: Bridge stackup (assignment) r3');
		expect(gh.files.size).toBe(3);
	});

	it('sends file content inline in the tree, with no per-file blob round trip', async () => {
		const gh = mockGitHub();
		await pushFilesToGitHub({ token: TOKEN, files: buildExportFiles(subject()), message: 'm', deps: gh.deps });
		expect(gh.calls.some((c) => c.path.endsWith('/git/blobs'))).toBe(false);
		const tree = gh.calls.find((c) => c.path.endsWith('/git/trees'));
		expect((tree?.body?.tree as { content: string }[])[0].content).toContain('Bridge stackup');
	});

	it('targets pina-hash/idea-app on main, with no branch anywhere', async () => {
		const gh = mockGitHub();
		await pushFilesToGitHub({ token: TOKEN, files: buildExportFiles(subject()), message: 'm', deps: gh.deps });
		for (const call of gh.calls) expect(call.path.startsWith('/repos/pina-hash/idea-app/')).toBe(true);
		expect(gh.calls.some((c) => c.method === 'PATCH' && c.path.endsWith('/git/refs/heads/main'))).toBe(
			true
		);
		expect(gh.calls.some((c) => c.path.includes('/pulls') || c.path.includes('/branches'))).toBe(false);
	});

	it('authenticates as a bearer token on every call', async () => {
		const gh = mockGitHub();
		await pushFilesToGitHub({ token: TOKEN, files: buildExportFiles(subject()), message: 'm', deps: gh.deps });
		for (const call of gh.calls) expect(call.auth).toBe(`Bearer ${TOKEN}`);
	});

	/**
	 * THE IDEMPOTENCY GUARANTEE, measured rather than asserted: the same push
	 * run twice leaves ONE commit, because the second one produces a tree
	 * identical to what is already there and is not committed at all.
	 */
	it('commits nothing the second time, so Retry is safe to press', async () => {
		const gh = mockGitHub();
		const files = buildExportFiles(subject());
		const first = await pushFilesToGitHub({ token: TOKEN, files, message: 'm', deps: gh.deps });
		const second = await pushFilesToGitHub({ token: TOKEN, files, message: 'm', deps: gh.deps });

		expect(first.unchanged).toBe(false);
		expect(second.unchanged).toBe(true);
		expect(second.sha).toBe(first.sha);
		expect(gh.calls.filter((c) => c.path.endsWith('/git/commits') && c.method === 'POST')).toHaveLength(1);
	});

	it('does commit again when the content really moved', async () => {
		const gh = mockGitHub();
		await pushFilesToGitHub({ token: TOKEN, files: buildExportFiles(subject()), message: 'm', deps: gh.deps });
		const changed = await pushFilesToGitHub({
			token: TOKEN,
			files: buildExportFiles(subject({ revision: 4 })),
			message: 'm2',
			deps: gh.deps
		});
		expect(changed.unchanged).toBe(false);
		expect(gh.calls.filter((c) => c.path.endsWith('/git/commits') && c.method === 'POST')).toHaveLength(2);
	});

	it('reports GitHub refusals WITHOUT the token in the message', async () => {
		const gh = mockGitHub({ failOn: '/git/trees' });
		await expect(
			pushFilesToGitHub({ token: TOKEN, files: buildExportFiles(subject()), message: 'm', deps: gh.deps })
		).rejects.toThrow(/GitHub 403: Resource not accessible/);

		try {
			await pushFilesToGitHub({ token: TOKEN, files: buildExportFiles(subject()), message: 'm', deps: gh.deps });
		} catch (e) {
			const text = `${(e as Error).message}\n${(e as Error).stack ?? ''}`;
			expect(text).not.toContain(TOKEN);
			expect(text).not.toContain('ghp_');
		}
	});
});

/**
 * A stub Supabase client: enough of the query builder for the orchestrator's
 * own reads, and a recorder for the one RPC it calls.
 *
 * A STUB IS HONEST HERE and would not be for anything about authorization: the
 * orchestrator's authority comes entirely from running as the caller's session,
 * which the migration suite covers against a real Postgres with real policies.
 * What is left in this file is the decision logic -- what to export, what to
 * skip, what to record -- and that is exercised faithfully by controlled reads.
 */
function stubSupabase(tables: Record<string, unknown>) {
	const rpcs: { name: string; args: Record<string, unknown> }[] = [];
	const client = {
		from(table: string) {
			const builder = {
				select() {
					return builder;
				},
				eq() {
					return builder;
				},
				maybeSingle() {
					return Promise.resolve({ data: tables[table] ?? null, error: null });
				},
				then(resolve: (v: unknown) => unknown) {
					const value = tables[table];
					const isCount = table.endsWith('#count');
					return Promise.resolve(
						isCount ? { count: value, error: null } : { data: value ?? [], error: null }
					).then(resolve);
				}
			};
			// The revision COUNT read asks for a head-only count on the same
			// table name, so it is keyed separately in the fixture.
			if (table === 'classroom_content_revisions') {
				return {
					select() {
						return {
							eq: () => Promise.resolve({ count: tables['revision_count'] ?? 0, error: null })
						};
					}
				};
			}
			return builder;
		},
		rpc(name: string, args: Record<string, unknown>) {
			rpcs.push({ name, args });
			return Promise.resolve({ data: { ok: true }, error: null });
		}
	};
	return { client: client as never, rpcs };
}

const ITEM = {
	id: '11111111-2222-3333-4444-555555555555',
	kind: 'assignment',
	title: 'Bridge stackup',
	author_name: 'T. Vargas',
	author_email: 't.vargas@boscotech.edu',
	export_slug: null
};

describe('what actually gets exported', () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	it('skips silently with no token, and records nothing', async () => {
		const { client, rpcs } = stubSupabase({ classroom_items: ITEM });
		const out = await exportClassroomItem(client, ITEM.id, { token: '' });
		expect(out).toEqual({ status: 'skipped', reason: 'no_token' });
		// The important half: no bookkeeping write, so an unconfigured
		// deployment never grows a failure chip on every item.
		expect(rpcs).toHaveLength(0);
	});

	it('skips an item with no spec of either kind', async () => {
		const gh = mockGitHub();
		const { client, rpcs } = stubSupabase({ classroom_items: ITEM });
		const out = await exportClassroomItem(client, ITEM.id, gh.deps);
		expect(out).toEqual({ status: 'skipped', reason: 'no_spec' });
		expect(gh.calls).toHaveLength(0);
		expect(rpcs).toHaveLength(0);
	});

	it('skips an announcement outright', async () => {
		const gh = mockGitHub();
		const { client } = stubSupabase({
			classroom_items: { ...ITEM, kind: 'post' },
			classroom_assignment_specs: { spec: SPEC }
		});
		const out = await exportClassroomItem(client, ITEM.id, gh.deps);
		expect(out).toEqual({ status: 'skipped', reason: 'no_spec' });
		expect(gh.calls).toHaveLength(0);
	});

	it('exports an assignment spec, and records the commit', async () => {
		const gh = mockGitHub();
		const { client, rpcs } = stubSupabase({
			classroom_items: ITEM,
			classroom_assignment_specs: { spec: SPEC },
			classroom_postings: [
				{ section_id: 's-1', classroom_sections: { classroom_courses: { code: 'IDEA209H' } } }
			],
			revision_count: 2
		});

		const out = await exportClassroomItem(client, ITEM.id, gh.deps);
		expect(out.status).toBe('ok');
		if (out.status !== 'ok') return;
		expect(out.path).toBe('materials/idea209h/bridge-stackup');
		expect(out.slug).toBe('bridge-stackup');

		// The head's own version number is one MORE than the revisions recorded.
		const commit = gh.calls.find((c) => c.method === 'POST' && c.path.endsWith('/git/commits'));
		expect(commit?.body?.message).toBe('classroom: Bridge stackup (assignment) r3');

		const record = rpcs.find((r) => r.name === 'classroom_record_export');
		expect(record?.args.p_slug).toBe('bridge-stackup');
		expect(record?.args.p_error).toBeNull();
		expect(record?.args.p_sha).toBe(out.sha);
	});

	it('keeps a slug already assigned, so a retitled item does not move folders', async () => {
		const gh = mockGitHub();
		const { client, rpcs } = stubSupabase({
			classroom_items: { ...ITEM, title: 'Bridge stackup (revised)', export_slug: 'bridge-stackup' },
			classroom_assignment_specs: { spec: SPEC },
			classroom_postings: [
				{ section_id: 's-1', classroom_sections: { classroom_courses: { code: 'IDEA209H' } } }
			],
			revision_count: 0
		});
		const out = await exportClassroomItem(client, ITEM.id, gh.deps);
		expect(out.status === 'ok' && out.path).toBe('materials/idea209h/bridge-stackup');
		expect(rpcs[0].args.p_slug).toBe('bridge-stackup');
	});

	it('puts a two-course item in _shared', async () => {
		const gh = mockGitHub();
		const { client } = stubSupabase({
			classroom_items: { ...ITEM, kind: 'material' },
			classroom_reference_specs: { spec: { kind: 'reference' } },
			classroom_postings: [
				{ section_id: 's-1', classroom_sections: { classroom_courses: { code: 'IDEA209H' } } },
				{ section_id: 's-9', classroom_sections: { classroom_courses: { code: 'IDEA100' } } }
			],
			revision_count: 0
		});
		const out = await exportClassroomItem(client, ITEM.id, gh.deps);
		expect(out.status === 'ok' && out.path).toBe('materials/_shared/bridge-stackup');
	});

	/**
	 * THE ONE THING THE EXPORT MAY NEVER DO. It is fired after a save has
	 * already committed, so throwing here would surface as a failed publish for
	 * content that is safely stored.
	 */
	it('records a failure and RESOLVES, rather than throwing', async () => {
		const gh = mockGitHub({ failOn: '/git/trees' });
		const { client, rpcs } = stubSupabase({
			classroom_items: ITEM,
			classroom_assignment_specs: { spec: SPEC },
			classroom_postings: [],
			revision_count: 0
		});

		const out = await exportClassroomItem(client, ITEM.id, gh.deps);
		expect(out.status).toBe('failed');
		if (out.status !== 'failed') return;
		expect(out.error).toContain('GitHub 403');
		expect(out.error).not.toContain(TOKEN);

		const record = rpcs.find((r) => r.name === 'classroom_record_export');
		expect(record?.args.p_error).toContain('GitHub 403');
		expect(record?.args.p_sha).toBeNull();
	});
});
/**
 * THE BUG THIS SECTION EXISTS FOR.
 *
 * main is a shared branch with people committing to it all day, and the export
 * is itself a burst writer -- saving a spec, then its rubric, then publishing
 * fires three exports at one item. So the branch moving between the head read
 * and the ref update is the ORDINARY case here, and a push that reads the head
 * once and hopes loses that race often enough to look permanently broken: the
 * chip said "GitHub 422: Reference cannot be updated" and Retry, being one more
 * single-shot attempt, produced the identical refusal.
 *
 * Retry was never rebuilding on a stale parent -- it re-read the head every
 * time, and a measurement against the pre-fix code confirmed it. What it could
 * not do was survive losing the race again, which under a steady writer is
 * every time. So the fix is not "read it fresh"; it is "keep rebuilding on
 * whatever the head has become, a bounded number of times".
 *
 * FORCE IS NOT A FIX AND MUST NEVER APPEAR. These commits are written
 * unattended to a branch whose history exists nowhere else; an export losing a
 * race is never a reason to discard the commit that beat it.
 */
describe('when main moves under the export', () => {
	it('rebuilds on the new head when a commit lands mid-export', async () => {
		const gh = mockGitHub({ collide: { at: 'trees', times: 1 } });
		const res = await pushFilesToGitHub({
			token: TOKEN,
			files: buildExportFiles(subject()),
			message: 'classroom: Bridge stackup (assignment) r3',
			deps: gh.deps
		});

		expect(res.unchanged).toBe(false);
		expect(res.attempts).toBe(2);
		// The whole point: the other commit is STILL THERE, and ours is on top.
		expect(gh.files.get('other/1.txt')).toContain('someone else');
		expect(gh.files.has('materials/idea209h/bridge-stackup/assignment.json')).toBe(true);
	});

	it('recovers when the ref update ITSELF comes back 422', async () => {
		// The window a pre-write re-read cannot close: the branch moves after the
		// check and before the update. Only the update is atomic, so the 422 has
		// to be handled, not merely avoided.
		const gh = mockGitHub({ collide: { at: 'patch', times: 1 } });
		const res = await pushFilesToGitHub({
			token: TOKEN,
			files: buildExportFiles(subject()),
			message: 'm',
			deps: gh.deps
		});
		expect(res.unchanged).toBe(false);
		expect(res.attempts).toBe(2);
		expect(gh.calls.filter((c) => c.method === 'PATCH')).toHaveLength(2);
	});

	it('re-reads the ref immediately before every update', async () => {
		const gh = mockGitHub();
		await pushFilesToGitHub({
			token: TOKEN,
			files: buildExportFiles(subject()),
			message: 'm',
			deps: gh.deps
		});
		const refReads = gh.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/git/ref/heads/main'));
		// One to build on, one immediately before the write.
		expect(refReads).toHaveLength(2);
		const order = gh.calls.map((c) => `${c.method} ${c.path.split('/repos/pina-hash/idea-app')[1]}`);
		expect(order[order.length - 2]).toBe('GET /git/ref/heads/main');
		expect(order[order.length - 1]).toBe('PATCH /git/refs/heads/main');
	});

	it('NEVER sends force, however many times it has to rebuild', async () => {
		// At the PATCH, so the update is genuinely re-attempted rather than being
		// short-circuited by the pre-write re-read.
		const gh = mockGitHub({ collide: { at: 'patch', times: 2 } });
		await pushFilesToGitHub({
			token: TOKEN,
			files: buildExportFiles(subject()),
			message: 'm',
			deps: gh.deps
		});
		const updates = gh.calls.filter((c) => c.method === 'PATCH');
		expect(updates).toHaveLength(3);
		// Not on the ref update, and not smuggled into any other request either.
		for (const call of gh.calls) expect(call.body ?? {}).not.toHaveProperty('force');
	});

	it('gives up after EXPORT_MAX_ATTEMPTS rather than trying forever', async () => {
		// PINNED TO A LITERAL on purpose. Asserting the count against the constant
		// would make this test agree with any bound at all, including none -- and
		// the bound is a judgement about how long a serverless invocation may sit
		// there losing a race, which is exactly the kind of thing that should not
		// be changeable without a test saying so out loud.
		expect(EXPORT_MAX_ATTEMPTS).toBe(4);
		// A branch that moves on every single attempt is not a race this can win,
		// and pretending otherwise would hold a serverless invocation open until
		// it was killed. It is reported instead -- with words that say to retry.
		const gh = mockGitHub({ collide: { at: 'trees', times: 99 } });
		await expect(
			pushFilesToGitHub({ token: TOKEN, files: buildExportFiles(subject()), message: 'm', deps: gh.deps })
		).rejects.toThrow(/GitHub 422/);

		const commits = gh.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/git/commits'));
		expect(commits).toHaveLength(EXPORT_MAX_ATTEMPTS);
		// Each one on a DIFFERENT parent: every attempt rebuilt from a fresh head
		// rather than re-sending the same doomed commit.
		const parents = commits.map((c) => ((c.body?.parents ?? []) as string[])[0]);
		expect(new Set(parents).size).toBe(EXPORT_MAX_ATTEMPTS);
	});

	/**
	 * IDEMPOTENCY IS RE-DECIDED AGAINST THE HEAD WE ENDED UP WITH, not the one we
	 * first read. If the writer that beat us happened to write exactly this
	 * content -- a duplicate export of the same item, which this app produces --
	 * then there is now nothing to commit, and committing anyway would add an
	 * empty commit for every collision.
	 *
	 * The converse direction (a tree that matched the FIRST head but not the
	 * second) cannot be reached from here: matching the first head returns
	 * `unchanged` before any commit exists to collide. The check still has to sit
	 * inside the attempt for this case to work at all.
	 */
	it('commits nothing when the writer that beat us wrote exactly this content', async () => {
		const files = buildExportFiles(subject());
		const gh = mockGitHub({ collide: { at: 'trees', times: 1, writes: files } });
		const res = await pushFilesToGitHub({ token: TOKEN, files, message: 'm', deps: gh.deps });

		expect(res.unchanged).toBe(true);
		expect(res.attempts).toBe(2);
		const commits = gh.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/git/commits'));
		// One built on the doomed first head; NONE on the second, because by then
		// there was nothing left to say.
		expect(commits).toHaveLength(1);
	});

	/**
	 * A RULE ON THE BRANCH IS NOT A RACE. Both come back 422 from the same
	 * endpoint, and retrying the first is right while retrying the second burns
	 * three more requests to be told the identical thing. They are told apart by
	 * GitHub's own words, and the wrong one must not be absorbed as the other.
	 */
	it('does not retry a branch-protection refusal', async () => {
		const gh = mockGitHub({
			failOn: '/git/refs/heads/main',
			status: 422,
			message: 'Changes must be made through a pull request.'
		});
		await expect(
			pushFilesToGitHub({ token: TOKEN, files: buildExportFiles(subject()), message: 'm', deps: gh.deps })
		).rejects.toThrow(/must be made through a pull request/);

		expect(gh.calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
	});
});

describe('what the chip is told', () => {
	/**
	 * `classroom_record_export` stores ONE text column, so after a reload the
	 * stored sentence is the whole of what the chip has. The class of failure
	 * therefore has to be legible in the words themselves, and readable back out
	 * of them -- which is what ties exportFailureMessage and classifyExportError
	 * together and why they live in one file.
	 */
	it('round-trips every failure class through the stored message', () => {
		for (const kind of ['collision', 'refused', 'network'] as const) {
			expect(classifyExportError(exportFailureMessage(kind, 'GitHub 422: whatever'))).toBe(kind);
		}
		// A message from anywhere else is not confidently labelled.
		expect(classifyExportError('GitHub 500: Internal Server Error')).toBe('unknown');
		expect(classifyExportError(null)).toBe('unknown');
		expect(classifyExportError('')).toBe('unknown');
	});

	it('gives a lost race, a refusal and a JSON problem three different chips', () => {
		const collision = exportFailureLabel(classifyExportError(exportFailureMessage('collision', '')));
		const refused = exportFailureLabel(classifyExportError(exportFailureMessage('refused', '')));
		const unknown = exportFailureLabel(classifyExportError('GitHub 400: Problems parsing JSON'));
		expect(new Set([collision, refused, unknown]).size).toBe(3);
		// The one a teacher can act on says so, and the one they cannot does not.
		expect(exportFailureMessage('collision', '')).toMatch(/press Retry/i);
		expect(exportFailureMessage('refused', '')).toMatch(/retrying will not change that/i);
	});

	it('records a collision as a transient race, not as a rejected file', async () => {
		// At the PATCH, so the recorded sentence is built from GitHub's OWN 422 --
		// 'Reference cannot be updated', the exact string this was reported as --
		// rather than from the pre-write check's synthetic one.
		const gh = mockGitHub({ collide: { at: 'patch', times: 99 } });
		const { client, rpcs } = stubSupabase({
			classroom_items: ITEM,
			classroom_assignment_specs: { spec: SPEC },
			classroom_postings: [],
			revision_count: 0
		});

		const out = await exportClassroomItem(client, ITEM.id, gh.deps);
		expect(out.status).toBe('failed');
		if (out.status !== 'failed') return;
		expect(out.kind).toBe('collision');
		expect(out.error).toMatch(/Nothing was lost/);
		// GitHub's own words are kept, because they are what makes a report
		// actionable for whoever holds the token.
		expect(out.error).toMatch(/GitHub 422: Reference cannot be updated/);
		expect(out.error).not.toContain(TOKEN);

		const record = rpcs.find((r) => r.name === 'classroom_record_export');
		expect(String(record?.args.p_error)).toMatch(/press Retry/);
		expect(String(record?.args.p_error).length).toBeLessThanOrEqual(400);
	});

	it('records a branch-protection refusal as one, and says retrying will not help', async () => {
		const gh = mockGitHub({
			failOn: '/git/refs/heads/main',
			status: 422,
			message: 'Protected branch update failed for refs/heads/main.'
		});
		const { client, rpcs } = stubSupabase({
			classroom_items: ITEM,
			classroom_assignment_specs: { spec: SPEC },
			classroom_postings: [],
			revision_count: 0
		});

		const out = await exportClassroomItem(client, ITEM.id, gh.deps);
		expect(out.status === 'failed' && out.kind).toBe('refused');
		expect(String(rpcs[0].args.p_error)).toMatch(/retrying will not change that/i);
		expect(String(rpcs[0].args.p_error)).not.toMatch(/press Retry/);
	});

	it('records an unreachable GitHub as neither of those', async () => {
		const deps = {
			apiBase: API,
			token: TOKEN,
			sleepImpl: async () => {},
			fetchImpl: (async () => {
				throw new TypeError('fetch failed');
			}) as unknown as typeof fetch
		};
		const { client } = stubSupabase({
			classroom_items: ITEM,
			classroom_assignment_specs: { spec: SPEC },
			classroom_postings: [],
			revision_count: 0
		});
		const out = await exportClassroomItem(client, ITEM.id, deps);
		expect(out.status === 'failed' && out.kind).toBe('network');
		expect(out.status === 'failed' && out.error).toMatch(/Could not reach GitHub/);
	});
});

describe('Retry starts the whole sequence over', () => {
	/**
	 * The manage console's Retry is a fresh POST carrying nothing but the item
	 * id, so the server re-reads the item, the spec, the postings AND the head.
	 * Nothing is carried across, and nothing may be: a retry that rebuilt on a
	 * remembered parent would turn one lost race into a failure that could never
	 * clear, which is exactly what this bug was reported as.
	 */
	it('rebuilds on the CURRENT head, never on the parent the last attempt used', async () => {
		const gh = mockGitHub({ collide: { at: 'trees', times: 1 } });
		const fixture = {
			classroom_items: ITEM,
			classroom_assignment_specs: { spec: SPEC },
			classroom_postings: [],
			revision_count: 0
		};

		// Force the first call to exhaust its rebuilds, so the SECOND call is a
		// genuine retry of a failure rather than a second happy path.
		const failing = mockGitHub({ collide: { at: 'trees', times: 99 } });
		const first = await exportClassroomItem(stubSupabase(fixture).client, ITEM.id, failing.deps);
		expect(first.status).toBe('failed');

		const second = await exportClassroomItem(stubSupabase(fixture).client, ITEM.id, gh.deps);
		expect(second.status).toBe('ok');

		const refReads = gh.calls.filter((c) => c.method === 'GET' && c.path.endsWith('/git/ref/heads/main'));
		expect(refReads.length).toBeGreaterThan(0);
		const landed = gh.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/git/commits'));
		expect(((landed[landed.length - 1].body?.parents ?? []) as string[])[0]).toBe('outside-sha-1');
	});
});

describe('a failed export costs the export and nothing else', () => {
	/**
	 * THE ONE PROMISE. The spec is already written when the export is fired --
	 * the RPC has returned, the revision is recorded -- and the ping is a
	 * `void fetch(...)` whose rejection is swallowed. This measures that against
	 * the REAL transport rather than trusting the comment above it: with the
	 * export request failing outright, the attach still reports success.
	 */
	it('still attaches the spec when the export request fails', async () => {
		const rpcs: string[] = [];
		const supabase = {
			rpc(name: string) {
				rpcs.push(name);
				return Promise.resolve({ data: null, error: null });
			}
		} as never;

		let pinged = 0;
		vi.stubGlobal('fetch', async () => {
			pinged++;
			throw new TypeError('fetch failed');
		});
		try {
			const tx = createTeacherEngineTransports(supabase);
			const attach = await tx.setSpec('i-1', SPEC as never);
			const rubric = await tx.setRubric('i-1', [] as never);
			const publish = await createClassroomTransports(supabase).setPublished('i-1', true);

			expect(attach.ok).toBe(true);
			expect(rubric.ok).toBe(true);
			expect(publish.ok).toBe(true);
			// The writes ran, in order, and the export was fired after each.
			expect(rpcs).toEqual([
				'classroom_set_assignment_spec',
				'classroom_set_rubric',
				'classroom_set_published'
			]);
			expect(pinged).toBe(3);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('resolves rather than throwing when the branch will not budge', async () => {
		const gh = mockGitHub({ collide: { at: 'trees', times: 99 } });
		const { client, rpcs } = stubSupabase({
			classroom_items: ITEM,
			classroom_assignment_specs: { spec: SPEC },
			classroom_postings: [],
			revision_count: 0
		});
		// No rejection: the caller is a fire-and-forget ping, and a throw here
		// would surface as a failed publish for content that is safely stored.
		await expect(exportClassroomItem(client, ITEM.id, gh.deps)).resolves.toMatchObject({
			status: 'failed'
		});
		expect(rpcs.find((r) => r.name === 'classroom_record_export')?.args.p_sha).toBeNull();
	});
});
