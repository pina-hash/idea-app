import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { CONSOLE_PANELS } from '../../dashboard/console';
import type { AdminRow } from '$lib/admin';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the ADMIN CONSOLE (`src/routes/dashboard/+page.svelte`;
 * 404s in production; no auth, no Supabase, no network). It mounts the REAL
 * page with the shape its server load returns, plus the root-layout keys the
 * page reads off `data` (`userProfile`, `supabase`), the /dev/home-order way.
 *
 * WHAT THE PARAMETERS DRIVE, each one a state the page has:
 *   `?used=roster,admins`  seeds `preferences.dashboard.usage` so the FIRST id
 *                          listed has the highest count and the panels come
 *                          out in that order (the "most used" claim).
 *   `?sort=default`        the stored sort preference.
 *   `?owner=1`             the caller is the pinned owner, so the admin
 *                          roster renders its grant/revoke controls.
 *   `?queues=0`            every queue empty (the empty states).
 *   `?students=N`          roster size, default 6.
 *
 * THE STUB SUPABASE RECORDS ITS WRITES on `window.__consoleWrites`, so a spec
 * can prove a use was persisted (and which namespace it landed in) by reading
 * what the write path recorded rather than by inferring it from the DOM.
 */
export const prerender = false;
export const ssr = false;

const NOW = new Date('2026-10-15T12:00:00Z');
const iso = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString();

const FIRST = ['Ana', 'Ben', 'Carla', 'Diego', 'Eli', 'Fatima', 'Gus', 'Hana', 'Ivan', 'Jules'];
const LAST = ['Reyes', 'Okafor', 'Nguyen', 'Alvarez', 'Park', 'Haddad', 'Silva', 'Ito', 'Petrov', 'Moreau'];
const PATHWAYS = ['IDEA', 'ACE', 'BMET', null, 'CSEE', 'MSET', 'MAT'];

export const load: PageLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');

	const usedIds = (url.searchParams.get('used') ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter((id) => CONSOLE_PANELS.some((p) => p.id === id));
	const usage: Record<string, { count: number; last: string }> = {};
	usedIds.forEach((id, i) => {
		usage[id] = { count: usedIds.length - i + 1, last: iso(i + 1) };
	});
	const sortParam = url.searchParams.get('sort');
	const dashboard: Record<string, unknown> = {};
	if (Object.keys(usage).length) dashboard.usage = usage;
	if (sortParam) dashboard.sort = sortParam;

	const owner = url.searchParams.get('owner') === '1';
	const queues = url.searchParams.get('queues') !== '0';
	const studentCount = Math.max(0, Math.min(40, Number(url.searchParams.get('students') ?? '6') || 0));

	const students = Array.from({ length: studentCount }, (_, i) => ({
		id: `stu-${i + 1}`,
		email: `${FIRST[i % 10].toLowerCase()}.${LAST[i % 10].toLowerCase()}${i}@boscotech.net`,
		full_name: `${FIRST[i % 10]} ${LAST[i % 10]}`,
		display_name: i % 4 === 0 ? FIRST[i % 10] : null,
		avatar: null,
		avatar_url: null,
		pathway: PATHWAYS[i % PATHWAYS.length]
	}));

	const frcProgress: Record<string, string[]> = {};
	students.forEach((s, i) => {
		frcProgress[s.id] = i % 2 === 0 ? ['mdm-1', 'mdm-2'] : ['mdm-1'];
	});

	const myEmail = owner ? 'apina@boscotech.edu' : 'tvargas@boscotech.edu';
	const admins: AdminRow[] = [
		{ email: 'apina@boscotech.edu', is_owner: true, granted_by: null, granted_at: iso(9000), note: null },
		{ email: 'tvargas@boscotech.edu', is_owner: false, granted_by: 'apina@boscotech.edu', granted_at: iso(800), note: 'Engineering I' },
		{ email: 'mcosso@boscotech.edu', is_owner: false, granted_by: 'apina@boscotech.edu', granted_at: iso(400), note: null }
	];

	const writes: unknown[] = [];
	if (typeof window !== 'undefined') (window as unknown as { __consoleWrites: unknown[] }).__consoleWrites = writes;
	const ok = { data: [{ id: 'harness-admin' }], error: null };
	const supabase = {
		from(table: string) {
			return {
				update(patch: Record<string, unknown>) {
					writes.push({ table, patch });
					return {
						eq() {
							return { select: async () => ok, then: (r: (v: typeof ok) => unknown) => Promise.resolve(ok).then(r) };
						}
					};
				}
			};
		},
		async rpc(name: string, args: unknown) {
			writes.push({ rpc: name, args });
			return { data: null, error: null };
		}
	};

	return {
		profile: { full_name: owner ? 'Alejandro Pina' : 'Teresa Vargas', email: myEmail, avatar_url: null, role: 'teacher' },
		email: myEmail,
		students,
		rosterReady: true,
		frcProgress,
		frcProgressReady: true,
		frcReviewQueue: queues && students.length
			? [
					{ userId: students[0].id, unitId: 'mdm-4', link: 'https://example.invalid/model-1', notes: 'Second attempt, fillets added.', submittedAt: iso(5) },
					{ userId: students[Math.min(1, students.length - 1)].id, unitId: 'mdm-5', link: 'https://example.invalid/model-2', notes: null, submittedAt: iso(30) }
				]
			: [],
		frcReviewReady: true,
		greenlineDecalQueue: queues && students.length
			? [{ userId: students[Math.min(2, students.length - 1)].id, path: 'x/decal.png', imageUrl: null, submittedAt: iso(12) }]
			: [],
		greenlineDecalReady: true,
		greenlinePending: queues ? { ready: true, tracks: 2, decals: 1, total: 3 } : { ready: true, tracks: 0, decals: 0, total: 0 },
		feedbackNewCount: queues ? 4 : 0,
		admins,
		isOwner: owner,
		myEmail,
		notebookDrive: { connectReady: true, configured: !owner },
		// What the root layout normally supplies.
		claims: { sub: 'harness-admin', email: myEmail },
		userProfile: {
			id: 'harness-admin',
			role: 'teacher',
			display_name: null,
			full_name: owner ? 'Alejandro Pina' : 'Teresa Vargas',
			avatar: null,
			avatar_url: null,
			pathway: null,
			section_id: null,
			preferences: Object.keys(dashboard).length ? { dashboard, homepage: { compact: true } } : { homepage: { compact: true } }
		},
		isAdmin: true,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		supabase: supabase as any,
		harness: { used: usedIds, owner, queues, students: studentCount, sort: sortParam }
	};
};
