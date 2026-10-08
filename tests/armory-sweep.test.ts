// tests/armory-sweep.test.ts
//
// DELETE FOREVER AND THE STORAGE SWEEP (Armory v0.3 item 3), through the REAL
// route handlers in src/routes/api/armory/{purge,sweep}/+server.ts with the
// caller's Supabase client and the R2 fetch faked.
//
// What must hold, and would be silent if it broke:
//   - a refused purge makes ZERO storage requests and says why in words;
//   - a committed purge answers ok:true even when storage misbehaves (a
//     failed sweep is not a failed delete), with a sentence for what is left;
//   - the sweep DELETEs exactly the hashes the database handed over, by their
//     content-addressed key, and marks swept ONLY those a HEAD then answers 404
//     for (R2's DELETE says 204 for a key that never existed, so its answer
//     proves nothing);
//   - no storage configuration: a sentence, and no request at all;
//   - a non-admin's sweep is the bodyless 404, never a 403.

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ArmorySweepDeps } from '../src/lib/server/armory/sweep';

let deps: ArmorySweepDeps;
vi.mock('$lib/server/armory/deps', async (original) => ({
	...(await original<typeof import('../src/lib/server/armory/deps')>()),
	armorySweepDeps: () => deps
}));

const { POST: purgeRoute } = await import('../src/routes/api/armory/purge/+server');
const { POST: sweepRoute } = await import('../src/routes/api/armory/sweep/+server');

const PROJECT = '6b1f6c1e-0000-4000-8000-000000000004';
const OPERATION = '6b1f6c1e-0000-4000-8000-0000000000aa';
const ENDPOINT = 'https://acct.r2.cloudflarestorage.com';
const keyOf = (h: string) => `blobs/sha256/${h.slice(0, 2)}/${h.slice(2, 4)}/${h}`;
const H = (c: string) => c.repeat(64);

interface World {
	admin: boolean;
	purgeError: { code: string; message: string; details?: string | null } | null;
	pending: string[];
	/** Object keys present in the fake bucket. */
	stored: Set<string>;
	/** Keys whose DELETE is accepted but does nothing (an object that will not go). */
	stuck: Set<string>;
	/** Keys whose HEAD answers 500. */
	headFails: Set<string>;
	swept: string[][];
	requests: Array<{ method: string; key: string }>;
	storageOn: boolean;
	logs: string[];
	calls: string[];
}
let w: World;

function fakeSupabase() {
	return {
		async rpc(name: string, args: Record<string, unknown>) {
			w.calls.push(name);
			if (name === 'armory_purge_project') {
				if (w.purgeError) return { data: null, error: w.purgeError };
				return { data: { name: 'Robot 2025', files: 3, versions: 9, side_versions: 1, checkouts_released: 0, blobs_queued: w.pending.length, bytes_queued: 100 }, error: null };
			}
			if (!w.admin) return { data: null, error: { code: '42501', message: 'only a site admin may clean up Armory storage' } };
			if (name === 'armory_orphans_pending') return { data: w.pending.slice(0, Number(args.p_limit)), error: null };
			if (name === 'armory_orphans_swept') {
				const hashes = args.p_hashes as string[];
				w.swept.push(hashes);
				w.pending = w.pending.filter((h) => !hashes.includes(h));
				return { data: hashes.length, error: null };
			}
			if (name === 'armory_orphans_count') return { data: w.pending.length, error: null };
			return { data: null, error: { code: 'PGRST202', message: 'no such function' } };
		}
	};
}

const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	const url = new URL(String(input));
	const key = url.pathname.replace(/^\/armory\//, '');
	const method = init?.method ?? 'GET';
	w.requests.push({ method, key });
	if (method === 'DELETE') {
		if (!w.stuck.has(key)) w.stored.delete(key);
		return new Response(null, { status: 204 });
	}
	if (method === 'HEAD') {
		if (w.headFails.has(key)) return new Response(null, { status: 500 });
		return new Response(null, { status: w.stored.has(key) ? 200 : 404 });
	}
	return new Response(null, { status: 400 });
}) as typeof fetch;

beforeEach(() => {
	w = {
		admin: true,
		purgeError: null,
		pending: [H('a'), H('b'), H('c')],
		stored: new Set([keyOf(H('a')), keyOf(H('b')), keyOf(H('c'))]),
		stuck: new Set(),
		headFails: new Set(),
		swept: [],
		requests: [],
		storageOn: true,
		logs: [],
		calls: []
	};
	deps = {
		storage: () =>
			w.storageOn ? { accountId: 'acct', accessKeyId: 'key', secretAccessKey: 'secret', bucket: 'armory', endpoint: ENDPOINT } : null,
		fetch: fakeFetch,
		now: () => Date.UTC(2026, 9, 7, 18, 0, 0),
		log: (m) => w.logs.push(m)
	};
});

function event(body: unknown, signedIn = true) {
	return {
		request: new Request('https://ideabosco.com/api/armory/purge', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: { supabase: fakeSupabase(), claims: signedIn ? { sub: 'u-admin', email: 'apina@boscotech.edu' } : null }
	} as never;
}
const purge = (body: unknown, signedIn = true) => purgeRoute(event(body, signedIn));
const sweep = (signedIn = true) =>
	sweepRoute({ locals: { supabase: fakeSupabase(), claims: signedIn ? { sub: 'u', email: 'x@boscotech.edu' } : null } } as never);
const good = { projectId: PROJECT, confirmName: '  Robot 2025 ', operation: OPERATION };

describe('POST /api/armory/purge', () => {
	test('signed out is a 401 and nothing is asked of the database', async () => {
		const r = await purge(good, false);
		expect(r.status).toBe(401);
		expect(w.calls).toEqual([]);
	});

	test('a malformed body is a 400 before any RPC', async () => {
		expect((await purge({ ...good, projectId: 'nope' })).status).toBe(400);
		expect((await purge({ ...good, operation: 'nope' })).status).toBe(400);
		expect((await purge({ ...good, confirmName: '   ' })).status).toBe(400);
		expect(w.calls).toEqual([]);
	});

	// 0233's refusal order after the 42501 and P0002 gates: 55000 not_archived,
	// 22023 name_mismatch, 55006 referenced_elsewhere. Read from the SQLSTATE AND
	// DETAIL.reason, never the HTTP status (PostgREST answers 55000 and 55006 as 500).
	test.each([
		['55000', '{"reason": "not_archived"}', 'Archive the project first', 'history'],
		['22023', '{"reason": "name_mismatch"}', 'does not match the project name exactly', 'Archive'],
		[
			'55006',
			'{"reason": "referenced_elsewhere", "names": ["Drive/Gearbox.SLDASM", "Arm/Wrist.SLDPRT"], "total": 2}',
			'2 files in another project names a version of a file in this one: Drive/Gearbox.SLDASM, Arm/Wrist.SLDPRT',
			'Archive'
		],
		// The history trigger's own 55000 carries no reason, and is NOT "archive it first".
		['55000', null, 'nothing was deleted', 'Archive'],
		['XX000', null, 'nothing was deleted', 'Archive']
	])('a refusal (%s %s) is said in words with ZERO storage requests', async (code, details, words, never) => {
		w.purgeError = { code, message: 'raw database text that must not reach a person', details };
		const r = await purge(good);
		expect(r.status).toBe(400);
		const body = await r.json();
		expect(body.ok).toBe(false);
		expect(body.message).toContain(words);
		expect(body.message).not.toContain(never);
		expect(body.message).not.toContain('raw database text');
		expect(w.requests).toEqual([]);
		expect(w.calls).toEqual(['armory_purge_project']);
	});

	test('a non-admin answers the bodyless 404; a gone project, which only an admin reaches, is said', async () => {
		w.purgeError = { code: '42501', message: 'only a site admin may delete an Armory project forever' };
		let r = await purge(good);
		expect(r.status).toBe(404);
		expect(await r.text()).toBe('');
		w.purgeError = { code: 'P0002', message: 'project not found' };
		r = await purge(good);
		expect(r.status).toBe(404);
		expect((await r.json()).message).toContain('not there any more');
		expect(w.requests).toEqual([]);
	});

	test('the confirm name is sent trimmed and NFC, as the RPC compares it', async () => {
		let sent: unknown = null;
		const client = fakeSupabase();
		const rpc = client.rpc;
		client.rpc = async (name: string, args: Record<string, unknown>) => {
			if (name === 'armory_purge_project') sent = args.p_confirm_name;
			return rpc(name, args);
		};
		const decomposed = 'Café Robot';
		await purgeRoute({
			request: new Request('https://x/api', { method: 'POST', body: JSON.stringify({ ...good, confirmName: ` ${decomposed} ` }) }),
			locals: { supabase: client, claims: { sub: 'u' } }
		} as never);
		expect(sent).toBe('Café Robot');
	});

	test('a committed purge sweeps exactly the queued hashes, by content key, and marks only the confirmed', async () => {
		const r = await purge(good);
		expect(r.status).toBe(200);
		const body = await r.json();
		expect(body).toMatchObject({ ok: true, swept: 3, left: 0, storageProblem: null });
		// Positive control: requests were made at all.
		expect(w.requests.length).toBe(6);
		const deletes = w.requests.filter((q) => q.method === 'DELETE').map((q) => q.key).sort();
		expect(deletes).toEqual([H('a'), H('b'), H('c')].map(keyOf).sort());
		expect(w.requests.filter((q) => q.method === 'HEAD').length).toBe(3);
		expect(w.swept.flat().sort()).toEqual([H('a'), H('b'), H('c')].sort());
	});

	test('an object that will not go, and one whose HEAD answers 500, stay queued: ok is still true', async () => {
		w.stuck.add(keyOf(H('b')));
		w.headFails.add(keyOf(H('c')));
		const r = await purge(good);
		const body = await r.json();
		expect(r.status).toBe(200);
		expect(body.ok).toBe(true);
		expect(w.swept.flat()).toEqual([H('a')]);
		expect(body.left).toBe(2);
		expect(body.storageProblem).toContain('2 stored files could not be confirmed removed');
		// The survivors are named in a server log line, the only record of them.
		expect(w.logs.join('\n')).toContain(H('b'));
		expect(w.logs.join('\n')).toContain(H('c'));
	});

	test('no storage configuration: a sentence and not one request', async () => {
		w.storageOn = false;
		const body = await (await purge(good)).json();
		expect(body.ok).toBe(true);
		expect(body.storageProblem).toBe('File storage is not switched on, so 3 stored files wait to be removed.');
		expect(w.requests).toEqual([]);
		expect(w.swept).toEqual([]);
	});
});

describe('POST /api/armory/sweep', () => {
	test('a site admin sweeps; a DELETE is a presigned DELETE of the content key', async () => {
		const r = await sweep();
		expect(r.status).toBe(200);
		expect(await r.json()).toMatchObject({ ok: true, swept: 3, left: 0, problem: null });
		expect(w.requests.filter((q) => q.method === 'DELETE').length).toBe(3);
	});

	test('anyone else gets the bodyless 404 and no storage request', async () => {
		w.admin = false;
		const r = await sweep();
		expect(r.status).toBe(404);
		expect(await r.text()).toBe('');
		expect(w.requests).toEqual([]);
	});

	test('signed out is a 401', async () => {
		expect((await sweep(false)).status).toBe(401);
	});

	test('an empty queue makes no request', async () => {
		w.pending = [];
		const body = await (await sweep()).json();
		expect(body).toMatchObject({ ok: true, swept: 0, problem: null });
		expect(w.requests).toEqual([]);
	});

	// A REMOVAL STARTED LATE ENDS BY THE DEADLINE. The budget stops STARTING
	// removals at 8s; without a deadline each one then ran its DELETE and its
	// HEAD to five seconds apiece, so a purge could answer about eighteen
	// seconds after its rows were gone. Every request's timeout is read off
	// AbortSignal.timeout itself.
	test('every storage request is capped so the sweep ends by its deadline', async () => {
		const { sweepArmoryOrphans, ARMORY_SWEEP_BUDGET } = await import('../src/lib/server/armory/sweep');
		const asked: number[] = [];
		const real = AbortSignal.timeout.bind(AbortSignal);
		const spy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
			asked.push(ms);
			return real(ms);
		});
		try {
			const start = Date.UTC(2026, 9, 7, 18, 0, 0);
			// The clock reads 7.9s in on every read after the first, so each removal
			// is started just inside the 8s budget with 2.1s left to the deadline.
			let reads = 0;
			const late = { ...deps, now: () => (reads++ === 0 ? start : start + 7900) };
			const out = await sweepArmoryOrphans(fakeSupabase() as never, late, ARMORY_SWEEP_BUDGET);
			expect(out.swept).toBe(3);
			expect(asked.length).toBe(6);
			const deadline = ARMORY_SWEEP_BUDGET.deadlineMs ?? 0;
			expect(deadline).toBeGreaterThan(ARMORY_SWEEP_BUDGET.ms);
			// Every request fits in what is left before the deadline, never the full five seconds.
			for (const ms of asked) expect(ms).toBeLessThanOrEqual(deadline - 7900);
			// Positive control: with time to spare, a request gets its own full ceiling.
			asked.length = 0;
			w.pending = [H('d')];
			w.stored.add(keyOf(H('d')));
			await sweepArmoryOrphans(fakeSupabase() as never, { ...deps, now: () => start }, ARMORY_SWEEP_BUDGET);
			expect(asked).toEqual([5000, 5000]);
		} finally {
			spy.mockRestore();
		}
	});
});

describe('the presigned DELETE', () => {
	test('signs the DELETE method, so a GET or HEAD signature cannot be reused for it', async () => {
		const { presignUrl } = await import('../src/lib/server/armory/sigv4');
		const base = {
			accessKey: 'key',
			secretKey: 'secret',
			region: 'auto',
			url: `${ENDPOINT}/armory/${keyOf(H('a'))}`,
			now: new Date(Date.UTC(2026, 9, 7)),
			lifetimeSeconds: 60
		};
		const del = presignUrl({ ...base, method: 'DELETE' }).split('X-Amz-Signature=')[1];
		const head = presignUrl({ ...base, method: 'HEAD' }).split('X-Amz-Signature=')[1];
		expect(del).toMatch(/^[0-9a-f]{64}$/);
		expect(del).not.toBe(head);
	});
});
