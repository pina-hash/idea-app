// tests/html-assignment-export.test.ts
//
// LEDGER 0431, report a71b7b8a: every ported HTML assignment exports its
// current document, manifest and rubric to materials/<course>/<slug>/ on every
// save, the way specs do, and a one-time backfill exports every one that
// exists. No network and no token: GitHub is a mock fetch that answers the Git
// Data endpoints and keeps the files it was given, so a test reads back what
// the "repo" holds rather than what the exporter said it sent.
//
// What would fail silently, and so earns a test:
//   * the document re-encoded or given a trailing newline on the way out, so
//     the repo copy is not what students were served;
//   * an item written into ANOTHER course's folder (the mutation proof for
//     this file aims at exactly that);
//   * two items with one title writing one folder, the second over the first;
//   * a rerun of the backfill adding commits, every one of which is a deploy.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	buildExportFiles,
	exportClassroomItem,
	exportHtmlBackfill,
	type ExportSubject
} from '../src/lib/server/classroom-export';
import { createHtmlAssignmentTransports } from '../src/lib/classroom/transports';

const API = 'https://mock.github.test';
const TOKEN = 'ghp_not-a-real-token-0000';

function mockGitHub() {
	const files = new Map<string, string>();
	let head = 'head-0';
	let n = 0;
	const commits: { sha: string; message: string; paths: string[] }[] = [];
	let staged = new Map<string, string>();
	const key = (m: Map<string, string>) => [...m.entries()].sort().map(([k, v]) => `${k}=${v.length}:${v}`).join('|');
	let tree = key(files);
	const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
		const path = String(url).slice(API.length);
		const method = init?.method ?? 'GET';
		const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
		const ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
		if (method === 'GET' && path.endsWith('/git/ref/heads/main')) return ok({ object: { sha: head } });
		if (method === 'GET' && path.includes('/git/commits/')) return ok({ tree: { sha: tree } });
		if (method === 'POST' && path.endsWith('/git/trees')) {
			staged = new Map(files);
			for (const e of (body?.tree ?? []) as { path: string; content: string }[]) staged.set(e.path, e.content);
			return ok({ sha: key(staged) });
		}
		if (method === 'POST' && path.endsWith('/git/commits')) {
			n += 1;
			const sha = `commit-${n}`;
			const paths = [...staged.keys()].filter((p) => staged.get(p) !== files.get(p));
			commits.push({ sha, message: String(body?.message ?? ''), paths });
			return ok({ sha });
		}
		if (method === 'PATCH' && path.includes('/git/refs/heads/main')) {
			head = String(body?.sha ?? '');
			for (const [k, v] of staged) files.set(k, v);
			tree = key(files);
			return ok({ object: { sha: head } });
		}
		return new Response(JSON.stringify({ message: `unexpected ${method} ${path}` }), { status: 404 });
	}) as unknown as typeof fetch;
	return { files, commits, deps: { fetchImpl, apiBase: API, token: TOKEN, sleepImpl: async () => {} } };
}

interface StubItem {
	id: string;
	title: string;
	course: string;
	export_slug?: string | null;
	schema?: number | null;
	html?: { document: string; manifest: unknown; filename: string } | null;
	spec?: unknown;
	rubric?: unknown;
}

/**
 * A stub Supabase client keyed by item: enough of the query builder for the
 * exporter's reads. Authorization is the database suite's business (the
 * exporter reads as the caller); what is tested here is what it writes where.
 */
function stubSupabase(items: StubItem[]) {
	const byId = new Map(items.map((i) => [i.id, i]));
	const rpcs: { name: string; args: Record<string, unknown> }[] = [];
	const client = {
		from(table: string) {
			let id = '';
			const one = () => {
				const it = byId.get(id);
				if (!it) return null;
				switch (table) {
					case 'classroom_items':
						return {
							id: it.id,
							kind: 'assignment',
							title: it.title,
							author_name: 'Mr. Pina',
							author_email: 'apina@boscotech.edu',
							export_slug: it.export_slug ?? null,
							assignment_schema_version: it.schema ?? (it.html ? 3 : null)
						};
					case 'classroom_assignment_specs':
						return it.spec ? { spec: it.spec } : null;
					case 'classroom_reference_specs':
						return null;
					case 'classroom_rubrics':
						return it.rubric ? { criteria: it.rubric } : null;
					case 'classroom_html_assignments':
						return it.html ?? null;
					default:
						return null;
				}
			};
			const builder = {
				select(_cols?: string, opts?: { head?: boolean }) {
					if (table === 'classroom_content_revisions' && opts?.head) {
						return { eq: () => Promise.resolve({ count: 1, error: null }) };
					}
					return builder;
				},
				eq(_col: string, value: string) {
					id = value;
					return builder;
				},
				order() {
					// The backfill's list of every HTML assignment the caller can read.
					return Promise.resolve({
						data: items.filter((i) => i.html).map((i) => ({ item_id: i.id })),
						error: null
					});
				},
				maybeSingle() {
					return Promise.resolve({ data: one(), error: null });
				},
				then(resolve: (v: unknown) => unknown) {
					const it = byId.get(id);
					const value =
						table === 'classroom_postings' && it
							? [{ section_id: `s-${it.course}`, classroom_sections: { classroom_courses: { code: it.course } } }]
							: [];
					return Promise.resolve({ data: value, error: null }).then(resolve);
				}
			};
			return builder;
		},
		rpc(name: string, args: Record<string, unknown>) {
			rpcs.push({ name, args });
			return Promise.resolve({ data: { ok: true }, error: null });
		}
	};
	return { client: client as never, rpcs };
}

const MANIFEST = { schemaVersion: 3, kind: 'html-assignment', title: 'Shop Fix Design 1', course: 'IDEA209H', modules: [] };
/** No trailing newline and a non-ASCII character, so a re-encode or an added newline shows. */
const DOC = '<!doctype html>\n<html><head><title>Shop Fix Design 1</title></head><body><p>Tolerance ±0.005</p></body></html>';
const RUBRIC = [{ id: 'm1-c', criterion: 'Answered', points: 4, levels: [] }];

function subject(over: Partial<ExportSubject> = {}): ExportSubject {
	return {
		itemId: '11111111-2222-3333-4444-555555555555',
		title: 'Shop Fix Design 1',
		kind: 'assignment',
		specKind: 'html',
		spec: MANIFEST,
		document: DOC,
		filename: 'shop-fix-1.html',
		documentUpdatedAt: '2026-10-20T08:00:00.000Z',
		rubric: RUBRIC,
		sectionIds: ['s-1'],
		courseDir: 'idea209h',
		slug: 'shop-fix-design-1',
		revision: 2,
		author: 'Mr. Pina',
		exportedAt: '2026-10-23T12:00:00.000Z',
		...over
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('the files an HTML assignment exports', () => {
	it('writes the document verbatim, the manifest, the rubric and the metadata, and no spec', () => {
		const files = buildExportFiles(subject());
		const byPath = new Map(files.map((f) => [f.path, f.content]));
		expect([...byPath.keys()].sort()).toEqual([
			'materials/idea209h/shop-fix-design-1/assignment.html',
			'materials/idea209h/shop-fix-design-1/manifest.json',
			'materials/idea209h/shop-fix-design-1/material.json',
			'materials/idea209h/shop-fix-design-1/rubric.json'
		]);
		expect(byPath.get('materials/idea209h/shop-fix-design-1/assignment.html')).toBe(DOC);
		expect(JSON.parse(byPath.get('materials/idea209h/shop-fix-design-1/manifest.json')!)).toEqual(MANIFEST);
		const meta = JSON.parse(byPath.get('materials/idea209h/shop-fix-design-1/material.json')!);
		expect(meta).toMatchObject({ specKind: 'html', filename: 'shop-fix-1.html', title: 'Shop Fix Design 1' });
		// No export time: a rerun of an unchanged document must build the same tree.
		expect('exportedAt' in meta).toBe(false);
		expect(meta.documentUpdatedAt).toBe('2026-10-20T08:00:00.000Z');
	});

	it('a spec assignment still writes exactly what it did (the control)', () => {
		const files = buildExportFiles(subject({ specKind: 'assignment', spec: { schemaVersion: 1 }, document: null }));
		expect(files.map((f) => f.path.split('/').pop()).sort()).toEqual(['assignment.json', 'material.json', 'rubric.json']);
	});
});

describe('the per-save export', () => {
	it('exports a ported document, even beside a superseded spec: the manifest decides', async () => {
		const gh = mockGitHub();
		const { client, rpcs } = stubSupabase([
			{
				id: 'aaaaaaaa-0000-0000-0000-000000000001',
				title: 'Shop Fix Design 1',
				course: 'IDEA209H',
				html: { document: DOC, manifest: MANIFEST, filename: 'shop-fix-1.html' },
				spec: { schemaVersion: 1, old: true },
				rubric: RUBRIC
			}
		]);
		const out = await exportClassroomItem(client, 'aaaaaaaa-0000-0000-0000-000000000001', gh.deps);
		expect(out.status).toBe('ok');
		expect(out.status === 'ok' && out.path).toBe('materials/idea209h/shop-fix-design-1');
		expect(gh.files.get('materials/idea209h/shop-fix-design-1/assignment.html')).toBe(DOC);
		expect(gh.files.has('materials/idea209h/shop-fix-design-1/assignment.json')).toBe(false);
		expect(gh.commits[0].message).toBe('classroom: Shop Fix Design 1 (html) r2');
		expect(rpcs.find((r) => r.name === 'classroom_record_export')?.args.p_error).toBeNull();
	});

	it('an item not marked as an HTML assignment never asks for a document', async () => {
		const gh = mockGitHub();
		const { client } = stubSupabase([
			{ id: 'aaaaaaaa-0000-0000-0000-000000000002', title: 'Bridge', course: 'IDEA209H', schema: null, spec: { schemaVersion: 1 } }
		]);
		const out = await exportClassroomItem(client, 'aaaaaaaa-0000-0000-0000-000000000002', gh.deps);
		expect(out.status === 'ok' && out.files.map((f) => f.split('/').pop()).sort()).toEqual(['assignment.json', 'material.json']);
	});

	it('uploading a document pings the export, after the write and only when it landed', async () => {
		const pinged: string[] = [];
		vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
			pinged.push(`${url} ${String(init?.body ?? '')}`);
			return new Response('{}', { status: 200 });
		});
		const results = [{ data: { ok: true, revision: 2 }, error: null }, { data: null, error: { message: 'nope' } }];
		const supabase = { rpc: async () => results.shift() } as never;
		const t = createHtmlAssignmentTransports(supabase);
		expect((await t.setHtmlAssignment!('item-1', DOC, MANIFEST as never, 'a.html')).ok).toBe(true);
		expect((await t.setHtmlAssignment!('item-2', DOC, MANIFEST as never, 'a.html')).ok).toBe(false);
		expect(pinged).toEqual(['/api/classroom/export {"item_id":"item-1"}']);
	});
});

describe('the one-time backfill', () => {
	const ITEMS: StubItem[] = [
		{ id: '10000000-0000-0000-0000-000000000001', title: 'Shop Fix Design 1', course: 'IDEA209H', html: { document: DOC, manifest: MANIFEST, filename: 'a.html' }, rubric: RUBRIC },
		{ id: '20000000-0000-0000-0000-000000000002', title: 'Fit Lab', course: 'IDEA100', html: { document: '<p>Fit</p>', manifest: { ...MANIFEST, title: 'Fit Lab' }, filename: 'b.html' } },
		// The same title as the first, in the same course, never exported: it must not take the first one's folder.
		{ id: '30000000-0000-0000-0000-000000000003', title: 'Shop Fix Design 1', course: 'IDEA209H', html: { document: '<p>Copy</p>', manifest: MANIFEST, filename: 'c.html' } },
		// Already exported once under a frozen slug that collides with nothing.
		{ id: '40000000-0000-0000-0000-000000000004', title: 'Build Log (renamed)', course: 'IDEA209H', export_slug: 'build-log', html: { document: '<p>Log</p>', manifest: MANIFEST, filename: 'd.html' } },
		// A spec assignment: not part of the backfill at all.
		{ id: '50000000-0000-0000-0000-000000000005', title: 'Spec only', course: 'IDEA209H', spec: { schemaVersion: 1 } }
	];

	it('exports every HTML assignment into its OWN course folder, in one commit', async () => {
		const gh = mockGitHub();
		const { client, rpcs } = stubSupabase(ITEMS);
		const out = await exportHtmlBackfill(client, gh.deps);
		expect(out.status).toBe('ok');
		expect(out.found).toBe(4);
		expect(out.exported.map((e) => e.path).sort()).toEqual([
			'materials/idea100/fit-lab',
			'materials/idea209h/build-log',
			'materials/idea209h/shop-fix-design-1',
			'materials/idea209h/shop-fix-design-1-30000000'
		]);
		// Read back from the "repo": each document is in its own folder, byte for byte.
		expect(gh.files.get('materials/idea209h/shop-fix-design-1/assignment.html')).toBe(DOC);
		expect(gh.files.get('materials/idea100/fit-lab/assignment.html')).toBe('<p>Fit</p>');
		expect(gh.files.get('materials/idea209h/shop-fix-design-1-30000000/assignment.html')).toBe('<p>Copy</p>');
		expect(gh.files.get('materials/idea209h/build-log/assignment.html')).toBe('<p>Log</p>');
		expect([...gh.files.keys()].some((p) => p.startsWith('materials/idea100/') && p.includes('shop-fix'))).toBe(false);
		expect([...gh.files.keys()].some((p) => p.startsWith('materials/idea209h/') && p.includes('fit-lab'))).toBe(false);
		expect([...gh.files.keys()].some((p) => p.includes('spec-only'))).toBe(false);
		expect(gh.commits).toHaveLength(1);
		expect(rpcs.filter((r) => r.name === 'classroom_record_export').map((r) => r.args.p_slug).sort()).toEqual([
			'build-log',
			'fit-lab',
			'shop-fix-design-1',
			'shop-fix-design-1-30000000'
		]);
	});

	it('a second run commits nothing', async () => {
		const gh = mockGitHub();
		const { client } = stubSupabase(ITEMS);
		await exportHtmlBackfill(client, gh.deps);
		const again = await exportHtmlBackfill(client, gh.deps);
		expect(again.status).toBe('ok');
		expect(again.commits.every((c) => c.unchanged)).toBe(true);
		expect(gh.commits).toHaveLength(1);
	});

	it('splits into several commits only when the documents are large', async () => {
		const gh = mockGitHub();
		const big = 'x'.repeat(1_600_000);
		const { client } = stubSupabase([
			{ id: '60000000-0000-0000-0000-000000000006', title: 'Big one', course: 'IDEA209H', html: { document: big, manifest: MANIFEST, filename: 'e.html' } },
			{ id: '70000000-0000-0000-0000-000000000007', title: 'Big two', course: 'IDEA209H', html: { document: big, manifest: MANIFEST, filename: 'f.html' } }
		]);
		const out = await exportHtmlBackfill(client, gh.deps);
		expect(out.exported).toHaveLength(2);
		expect(gh.commits).toHaveLength(2);
	});

	it('with no token it skips and touches nothing', async () => {
		const { client, rpcs } = stubSupabase(ITEMS);
		const out = await exportHtmlBackfill(client, { token: '' });
		expect(out.status).toBe('skipped');
		expect(rpcs).toHaveLength(0);
	});
});
