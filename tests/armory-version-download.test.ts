// tests/armory-version-download.test.ts
//
// DOWNLOADING A PAST VERSION (ledger 0366) is a signed R2 GET minted by the
// site for a signed-in member. What must hold, and would be silent if it broke:
// a non-member, a file in another project, a version of another file and a
// removal mark all answer the SAME 404 with no URL; the signed URL is for the
// version's own hash and carries a download filename; and a signed-out caller
// is sent to the file page rather than handed anything.
//
// The REAL route handler is driven, with the caller's Supabase client faked:
// the fake answers only what RLS and the history RPC would answer that caller.

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { GET } from '../src/routes/armory/[project]/file/[file]/version/[version]/+server';

const PROJECT = '6b1f6c1e-0000-4000-8000-000000000001';
const OTHER_PROJECT = '6b1f6c1e-0000-4000-8000-000000000009';
const FILE = '6b1f6c1e-0000-4000-8000-0000000000f1';
const VERSION = '6b1f6c1e-0000-4000-8000-0000000000a1';
const SIDE = '6b1f6c1e-0000-4000-8000-0000000000a2';
const HASH = 'ab'.repeat(32);

interface Caller {
	member: boolean;
}

function fakeSupabase(caller: Caller) {
	return {
		from(table: string) {
			const filters: Record<string, string> = {};
			const q = {
				select: () => q,
				eq: (col: string, val: string) => ((filters[col] = val), q),
				maybeSingle: async () => {
					if (table !== 'armory_files' || !caller.member) return { data: null, error: null };
					const ok = filters.id === FILE && filters.project_id === PROJECT;
					return { data: ok ? { name: 'Gearbox Plate.SLDPRT' } : null, error: null };
				}
			};
			return q;
		},
		async rpc(name: string, args: { p_file: string }) {
			if (name !== 'armory_file_history' || !caller.member) return { data: null, error: { code: '42501', message: 'not a project member' } };
			if (args.p_file !== FILE) return { data: [], error: null };
			return {
				data: [
					{ id: VERSION, kind: 'version', author: 'ana@x', created_at: '2026-10-06T17:12:00Z', bytes: 1000, hash: HASH, reason: null },
					{ id: SIDE, kind: 'side_version', author: 'ben@x', created_at: '2026-10-06T17:20:00Z', bytes: 900, hash: 'cd'.repeat(32), reason: 'stale parent' },
					{ id: FILE, kind: 'tombstone', author: 'ana@x', created_at: '2026-10-06T18:00:00Z', bytes: 0, hash: null, reason: null }
				],
				error: null
			};
		}
	};
}

async function call(params: { project: string; file: string; version: string }, caller: Caller | null) {
	const event = {
		params,
		locals: { claims: caller ? { sub: 'u', email: 'ana@boscotech.net' } : null, supabase: fakeSupabase(caller ?? { member: false }) },
		setHeaders: () => {}
	} as unknown as Parameters<typeof GET>[0];
	try {
		const r = await GET(event);
		return { status: r.status, location: r.headers.get('location') };
	} catch (e) {
		const thrown = e as { status: number; location?: string };
		return { status: thrown.status, location: thrown.location ?? null };
	}
}

const R2 = {
	ARMORY_R2_ACCOUNT_ID: 'acct',
	ARMORY_R2_ACCESS_KEY_ID: 'AKIDEXAMPLE',
	ARMORY_R2_SECRET_ACCESS_KEY: 'secret-not-real',
	ARMORY_R2_BUCKET: 'armory'
};

beforeEach(() => Object.assign(process.env, R2));
afterEach(() => {
	for (const k of Object.keys(R2)) delete process.env[k];
});

describe('a member downloads a past version', () => {
	test('a 302 to a signed GET of that version, named after the file', async () => {
		const r = await call({ project: PROJECT, file: FILE, version: VERSION }, { member: true });
		expect(r.status).toBe(302);
		const url = new URL(r.location!);
		expect(url.origin).toBe('https://acct.r2.cloudflarestorage.com');
		expect(url.pathname).toBe(`/armory/blobs/sha256/ab/ab/${HASH}`);
		expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
		expect(url.searchParams.get('response-content-disposition')).toBe('attachment; filename="Gearbox Plate (202610061712).SLDPRT"');
	});
	test('a side version too, marked as one', async () => {
		const r = await call({ project: PROJECT, file: FILE, version: SIDE }, { member: true });
		expect(new URL(r.location!).searchParams.get('response-content-disposition')).toBe(
			'attachment; filename="Gearbox Plate (side 202610061720).SLDPRT"'
		);
	});
});

describe('everything else is the same bodyless 404', () => {
	const cases: Array<[string, { project: string; file: string; version: string }, Caller]> = [
		['a non-member', { project: PROJECT, file: FILE, version: VERSION }, { member: false }],
		['the file under another project id', { project: OTHER_PROJECT, file: FILE, version: VERSION }, { member: true }],
		['a version id that is not this file s', { project: PROJECT, file: FILE, version: OTHER_PROJECT }, { member: true }],
		['the removal mark (no bytes)', { project: PROJECT, file: FILE, version: FILE }, { member: true }],
		['not a uuid', { project: PROJECT, file: FILE, version: '../../etc' }, { member: true }]
	];
	for (const [label, params, caller] of cases) {
		test(label, async () => {
			const r = await call(params, caller);
			expect(r.status).toBe(404);
			expect(r.location).toBeNull();
		});
	}
	test('positive control: the same fake answers the member case with a URL', async () => {
		expect((await call({ project: PROJECT, file: FILE, version: VERSION }, { member: true })).status).toBe(302);
	});
});

describe('the edges', () => {
	test('signed out: sent to the file page, nothing signed', async () => {
		const r = await call({ project: PROJECT, file: FILE, version: VERSION }, null);
		expect(r.status).toBe(303);
		expect(r.location).toBe(`/armory/${PROJECT}/file/${FILE}`);
	});
	test('no storage configured: 503, nothing signed', async () => {
		for (const k of Object.keys(R2)) delete process.env[k];
		const r = await call({ project: PROJECT, file: FILE, version: VERSION }, { member: true });
		expect(r.status).toBe(503);
		expect(r.location).toBeNull();
	});
});
