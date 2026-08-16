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
	type ExportSubject
} from '../src/lib/server/classroom-export';

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
 */
function mockGitHub(opts: { existing?: Record<string, string>; failOn?: string; status?: number } = {}) {
	const files = new Map<string, string>(Object.entries(opts.existing ?? {}));
	const calls: Recorded[] = [];
	let headSha = 'head-sha-0';
	let treeSha = treeShaFor(files);

	function treeShaFor(map: Map<string, string>): string {
		const flat = [...map.entries()].sort().map(([k, v]) => `${k}:${v}`).join('|');
		return `tree-${flat.length}-${hash(flat)}`;
	}
	function hash(text: string): string {
		let h = 0;
		for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
		return String(h >>> 0);
	}

	const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
		const full = String(url);
		const path = full.slice(API.length);
		const method = init?.method ?? 'GET';
		const headers = (init?.headers ?? {}) as Record<string, string>;
		const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
		calls.push({ method, path, body, auth: headers.authorization ?? null });

		if (opts.failOn && path.includes(opts.failOn)) {
			return new Response(JSON.stringify({ message: 'Resource not accessible by personal access token' }), {
				status: opts.status ?? 403
			});
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
			return json({ sha: treeShaFor(next) });
		}
		if (method === 'POST' && path.endsWith('/git/commits')) {
			return json({ sha: `commit-${calls.length}` });
		}
		if (method === 'PATCH' && path.includes('/git/refs/heads/main')) {
			headSha = String(body?.sha ?? headSha);
			for (const [k, v] of pending) files.set(k, v);
			treeSha = treeShaFor(files);
			return json({ object: { sha: headSha } });
		}
		return new Response(JSON.stringify({ message: `unexpected ${method} ${path}` }), { status: 404 });
	}) as unknown as typeof fetch;

	let pending = new Map<string, string>();

	function json(value: unknown) {
		return new Response(JSON.stringify(value), { status: 200 });
	}

	return { fetchImpl, calls, files, deps: { fetchImpl, apiBase: API, token: TOKEN } };
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
