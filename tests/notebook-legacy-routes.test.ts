// tests/notebook-legacy-routes.test.ts
//
// EVERY OLD NOTEBOOK ADDRESS STILL WORKS (ledger 0297, package F4a).
//
// The notebook moved inside the classroom: a class's own Notebook tab at
// /classroom/<id>/notebook, the whole notebook at /classroom/notebook, and the
// review console at /classroom/notebook/review. The old addresses are on
// printed check-in cards, in posts, in bookmarks and in the history of every
// student who used the notebook, and a link that stops resolving FAILS
// SILENTLY -- nothing on our side ever sees the 404 a student gets from a card
// on the wall. So each shape is driven through the REAL load of its legacy
// route, the answer is read off the thrown redirect, and the target is
// resolved against src/routes the way SvelteKit resolves it (a static segment
// before a parameter), so a target with no page behind it reddens here.
//
// THE GATE RUNS BEFORE THE REDIRECT, and that half is a privacy boundary: the
// review console's old addresses 404 for anybody who is not a reviewer, and a
// redirect answered to them would confirm the review surface exists. That is
// asserted in both directions on one stub -- a non-reviewer gets 404 and no
// Location, a reviewer on the same URL gets the redirect.
//
// The supabase client is a stub rather than a database because what is under
// test is the ROUTING, not the tiers: the stub answers the same reads the
// real `notebookAccess` makes (profiles, `is_admin`, the 0169 reviewer RPC,
// classroom_sections), so the real access helper and the real console loader
// run end to end over them. Who is a reviewer is the database's question and
// is asserted against the real chain elsewhere.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { load as notebookLoad } from '../src/routes/notebook/+page.server';
import { load as reviewLoad } from '../src/routes/notebook/review/+page.server';
import { load as studentLoad } from '../src/routes/notebook/review/student/[studentEmail]/+page.server';
import {
	legacyNotebookTarget,
	legacyReviewTarget,
	legacyStudentTarget
} from '../src/lib/notebook/legacy-routes';

const ROOT = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), 'utf8');
const exists = (p: string) => existsSync(new URL(p, ROOT));

const MANAGED = '11111111-1111-4111-8111-111111111111';
const REVIEWED = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';

type Who = 'student' | 'instructor' | 'reviewer' | 'chair';

/**
 * The reads `notebookAccess` and `loadReviewConsole` make, answered for one
 * caller. Every builder method returns the builder and the builder is
 * awaited, which is how the real client is used; an unexpected table throws,
 * so a load that starts reading something new cannot pass by accident.
 */
function stubSupabase(who: Who) {
	const email = who === 'student' ? 'ana@boscotech.net' : 'teach@boscotech.edu';
	const sections = [
		{
			id: MANAGED,
			label: 'Period 2',
			block: 'B',
			teacher_email: 'teach@boscotech.edu',
			classroom_courses: { code: 'ENG1H', title: 'Engineering I Honors' }
		}
	];
	const reviewed = [
		{
			section_id: REVIEWED,
			label: 'Period 4',
			block: 'D',
			teacher_email: 'other@boscotech.edu',
			course_code: 'IDEA209H',
			course_title: 'IDEA 209 Honors'
		}
	];
	function builder(table: string) {
		const state: { select: string; eq: Record<string, unknown>; single: boolean; head: boolean } = {
			select: '',
			eq: {},
			single: false,
			head: false
		};
		const answer = () => {
			if (table === 'profiles') return { data: state.single ? { email } : [{ email }], error: null };
			if (table === 'notebook_unit_items') return { data: null, count: 0, error: null };
			if (table === 'classroom_sections') {
				const teaches = who === 'instructor' ? sections : [];
				const rows = who === 'chair' ? sections : teaches;
				const filtered =
					'teacher_email' in state.eq
						? rows.filter((r) => r.teacher_email === state.eq.teacher_email)
						: rows;
				return { data: state.select.includes('label') ? filtered : filtered.map((r) => ({ id: r.id })), error: null };
			}
			throw new Error(`unexpected table read: ${table}`);
		};
		const b = {
			select(cols: string, opts?: { head?: boolean }) {
				state.select = cols;
				state.head = Boolean(opts?.head);
				return b;
			},
			eq(col: string, val: unknown) {
				state.eq[col] = val;
				return b;
			},
			order() {
				return b;
			},
			limit() {
				return b;
			},
			maybeSingle() {
				state.single = true;
				return b;
			},
			then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
				try {
					return Promise.resolve(answer()).then(res, rej);
				} catch (e) {
					return Promise.reject(e).then(res, rej);
				}
			}
		};
		return b;
	}
	return {
		from: builder,
		rpc(fn: string) {
			if (fn === 'is_admin') return Promise.resolve({ data: who === 'chair', error: null });
			if (fn === 'notebook_reviewed_sections') {
				return Promise.resolve({ data: who === 'reviewer' ? reviewed : [], error: null });
			}
			return Promise.reject(new Error(`unexpected rpc: ${fn}`));
		}
	};
}

type Outcome = { kind: 'redirect'; status: number; location: string } | { kind: 'error'; status: number } | { kind: 'returned' };

async function drive(
	load: unknown,
	path: string,
	who: Who | null,
	params: Record<string, string> = {}
): Promise<Outcome> {
	const url = new URL(`http://localhost${path}`);
	const event = {
		url,
		params,
		locals: {
			supabase: stubSupabase(who ?? 'student'),
			claims: who
				? { sub: `uuid-${who}`, email: who === 'student' ? 'ana@boscotech.net' : 'teach@boscotech.edu' }
				: null
		}
	};
	try {
		await (load as (e: unknown) => Promise<unknown>)(event);
		return { kind: 'returned' };
	} catch (e) {
		if (isRedirect(e)) return { kind: 'redirect', status: e.status, location: e.location };
		if (isHttpError(e)) return { kind: 'error', status: e.status };
		throw e;
	}
}

/**
 * Resolve a same-site path to the route directory SvelteKit would serve it
 * from: at each segment a STATIC directory wins over a `[param]` one, which is
 * SvelteKit's own precedence and what makes /classroom/notebook reach the
 * static `notebook` route rather than `[sectionId]`. Null when nothing matches.
 */
function routeDirFor(path: string): string | null {
	const segments = new URL(`http://localhost${path}`).pathname.split('/').filter(Boolean);
	let dir = 'src/routes';
	for (const seg of segments) {
		const entries = readdirSync(new URL(`${dir}/`, ROOT), { withFileTypes: true }).filter((d) => d.isDirectory());
		const exact = entries.find((d) => d.name === decodeURIComponent(seg));
		const param = entries.find((d) => /^\[[^.\]]+\]$/.test(d.name));
		const next = exact ?? param;
		if (!next) return null;
		dir = `${dir}/${next.name}`;
	}
	return dir;
}

/** A target is served by a real PAGE: a component, and the load that feeds it. */
function expectServedPage(location: string) {
	expect(location.startsWith('/'), `${location} is not same-site`).toBe(true);
	expect(location.startsWith('//'), `${location} is protocol-relative`).toBe(false);
	const dir = routeDirFor(location);
	expect(dir, `${location} resolves to no route`).not.toBeNull();
	expect(exists(`${dir}/+page.svelte`), `${location} -> ${dir} has no page`).toBe(true);
	expect(exists(`${dir}/+page.server.ts`), `${location} -> ${dir} has no load`).toBe(true);
	return dir!;
}

describe('the resolver (positive control on the instrument)', () => {
	it('prefers a static segment to a parameter, and finds nothing for nonsense', () => {
		expect(routeDirFor('/classroom/notebook')).toBe('src/routes/classroom/notebook');
		expect(routeDirFor(`/classroom/${MANAGED}/notebook`)).toBe('src/routes/classroom/[sectionId]/notebook');
		expect(routeDirFor('/classroom/notebook/review/student/a%40b.net')).toBe(
			'src/routes/classroom/notebook/review/student/[studentEmail]'
		);
		expect(routeDirFor('/classroom/notebook/nonsense/deeper/still')).toBeNull();
	});
});

describe('/notebook, and its check-in deep link', () => {
	it('sends a signed-in student to the whole notebook, 307', async () => {
		const o = await drive(notebookLoad, '/notebook', 'student');
		expect(o).toEqual({ kind: 'redirect', status: 307, location: '/classroom/notebook' });
		expect(expectServedPage('/classroom/notebook')).toBe('src/routes/classroom/notebook');
	});

	it('carries ?checkin=&section= through byte for byte, which is what a printed card holds', async () => {
		const q = `?checkin=aaaa-bbbb&section=${MANAGED}`;
		const o = await drive(notebookLoad, `/notebook${q}`, 'student');
		expect(o).toEqual({ kind: 'redirect', status: 307, location: `/classroom/notebook${q}` });
		// And the target really reads both parameters.
		const load = read('src/lib/server/notebook-student.ts');
		expect(load).toMatch(/searchParams\.get\('checkin'\)/);
		expect(load).toMatch(/searchParams\.get\('section'\)/);
	});

	it('is never a permanent redirect, and a signed-out load goes home', async () => {
		const o = await drive(notebookLoad, '/notebook', null);
		expect(o).toEqual({ kind: 'redirect', status: 303, location: '/' });
		for (const f of [
			'src/routes/notebook/+page.server.ts',
			'src/routes/notebook/review/+page.server.ts',
			'src/routes/notebook/review/student/[studentEmail]/+page.server.ts'
		]) {
			expect(read(f), f).not.toMatch(/redirect\(308/);
			expect(read(f), f).toMatch(/redirect\(307, legacy/);
		}
	});

	it('keeps /notebook behind sign-in in the hooks, as it always was', () => {
		expect(read('src/hooks.server.ts')).toMatch(/authedPrefixes = \[[\s\S]*?'\/notebook',[\s\S]*?\]/);
	});
});

describe('/notebook/review: the gate first, then the right console', () => {
	it('a student gets the 404 it always got, and NO Location', async () => {
		for (const q of ['', `?section=${MANAGED}`, `?section=${REVIEWED}`]) {
			const o = await drive(reviewLoad, `/notebook/review${q}`, 'student');
			expect(o, q).toEqual({ kind: 'error', status: 404 });
		}
	});

	it('POSITIVE CONTROL: the same URLs redirect a reviewer, so the 404 above is the gate', async () => {
		const o = await drive(reviewLoad, '/notebook/review', 'instructor');
		expect(o.kind).toBe('redirect');
	});

	it('a manager of ?section= lands on that class\'s own Notebook tab', async () => {
		const o = await drive(reviewLoad, `/notebook/review?section=${MANAGED}`, 'instructor');
		expect(o).toEqual({ kind: 'redirect', status: 307, location: `/classroom/${MANAGED}/notebook` });
		expectServedPage(`/classroom/${MANAGED}/notebook`);
	});

	it('a section they only REVIEW goes to the all-sections console on that section', async () => {
		const o = await drive(reviewLoad, `/notebook/review?section=${REVIEWED}`, 'reviewer');
		expect(o).toEqual({
			kind: 'redirect',
			status: 307,
			location: `/classroom/notebook/review?section=${REVIEWED}`
		});
		expectServedPage('/classroom/notebook/review');
	});

	it('no section, or one that is not theirs, goes to the bare console and names nothing', async () => {
		for (const q of ['', `?section=${FOREIGN}`, '?section=not-a-section']) {
			const o = await drive(reviewLoad, `/notebook/review${q}`, 'instructor');
			expect(o, q).toEqual({ kind: 'redirect', status: 307, location: '/classroom/notebook/review' });
		}
		// A chair manages every section, so the chair's managed one is a class tab too.
		const chair = await drive(reviewLoad, `/notebook/review?section=${MANAGED}`, 'chair');
		expect(chair).toEqual({ kind: 'redirect', status: 307, location: `/classroom/${MANAGED}/notebook` });
	});
});

describe('/notebook/review/student/<email>: the gate first, then the read-only notebook', () => {
	it('a student gets the 404, and no Location', async () => {
		const o = await drive(studentLoad, `/notebook/review/student/ben%40boscotech.net?section=${MANAGED}`, 'student', {
			studentEmail: 'ben%40boscotech.net'
		});
		expect(o).toEqual({ kind: 'error', status: 404 });
	});

	it('a reviewer is sent on with the address encoded and the section kept', async () => {
		const o = await drive(studentLoad, `/notebook/review/student/Ben%40BoscoTech.net?section=${MANAGED}`, 'instructor', {
			studentEmail: 'Ben%40BoscoTech.net'
		});
		const want = `/classroom/notebook/review/student/ben%40boscotech.net?section=${MANAGED}`;
		expect(o).toEqual({ kind: 'redirect', status: 307, location: want });
		expectServedPage(want);
	});

	it('a section that is not a uuid is dropped rather than passed into a Location', () => {
		expect(legacyStudentTarget('ben%40x.net', new URL('http://h/p?section=%2F%2Fevil.example'))).toBe(
			'/classroom/notebook/review/student/ben%40x.net'
		);
		expect(legacyStudentTarget('a%2Fb', new URL('http://h/p'))).toBe('/classroom/notebook/review/student/a%2Fb');
	});
});

describe('the addresses that did not move still render', () => {
	it('view-as, its picker, the drive connect flow and every notebook API route are where they were', () => {
		for (const f of [
			'src/routes/classroom/view-as/+page.svelte',
			'src/routes/classroom/view-as/[studentEmail]/notebook/+page.svelte',
			'src/routes/admin/drive-connect'
		]) {
			expect(exists(f), f).toBe(true);
		}
		const api = readdirSync(new URL('src/routes/api/notebook/', ROOT), { withFileTypes: true }).filter((d) =>
			d.isDirectory()
		);
		expect(api.length).toBeGreaterThanOrEqual(7);
		for (const d of api) {
			const dir = `src/routes/api/notebook/${d.name}`;
			const hasServer =
				exists(`${dir}/+server.ts`) ||
				readdirSync(new URL(`${dir}/`, ROOT), { recursive: true })
					.map(String)
					.some((f) => f.endsWith('+server.ts'));
			expect(hasServer, dir).toBe(true);
		}
	});

	it('every target the helpers can produce is a real page', () => {
		const sections = [
			{ id: MANAGED, label: 'P2', block: null, teacher_email: 't', course_code: '', course_title: '', manages: true },
			{ id: REVIEWED, label: 'P4', block: null, teacher_email: 'o', course_code: '', course_title: '', manages: false }
		];
		const targets = [
			legacyNotebookTarget(new URL('http://h/notebook')),
			legacyNotebookTarget(new URL('http://h/notebook?checkin=x&section=y')),
			legacyReviewTarget(new URL('http://h/notebook/review'), sections),
			legacyReviewTarget(new URL(`http://h/notebook/review?section=${MANAGED}`), sections),
			legacyReviewTarget(new URL(`http://h/notebook/review?section=${REVIEWED}`), sections),
			legacyStudentTarget('a%40b.net', new URL(`http://h/x?section=${MANAGED}`))
		];
		expect(new Set(targets.map((t) => routeDirFor(t))).size).toBe(4);
		for (const t of targets) expectServedPage(t);
	});
});
