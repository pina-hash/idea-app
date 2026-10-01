// tests/foundry-requests.test.ts
//
// THE GAME REQUEST BOARD, CLIENT HALF (report b2ba6d74, ledger 0360).
//
// Mr. Pina decided a board ONLY: "this will be done between students for now.
// transactions off the site." So the things that fail silently and are
// asserted here are: an offer rendered without the sentence that says the
// site moves no coins; a Hide control on a student's board; a request's text
// reaching the page as markup; the client's limits drifting from 0230's; and
// any of the board's own code naming a coin function.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import FoundryRequestBoard from '$lib/foundry/FoundryRequestBoard.svelte';
import {
	FOUNDRY_REQUEST_NAME_NOTE,
	FOUNDRY_REQUEST_OFFER_NOTE,
	REQUEST_BODY_MAX,
	REQUEST_GAP_SECONDS,
	REQUEST_OFFER_MAX,
	REQUEST_OPEN_MAX,
	REQUEST_TITLE_MAX,
	requestCanPost,
	requestRefusalSentence,
	requestSlugFrom,
	splitRequests,
	type FoundryGameRequest
} from '$lib/foundry/requests';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function req(over: Partial<FoundryGameRequest> & { id: string }): FoundryGameRequest {
	return {
		title: 'A tower defense game',
		body: 'With robots.',
		offer: null,
		status: 'open',
		created_at: '2026-09-30T15:00:00Z',
		closed_at: null,
		owner: 'cccccccc-0000-4000-8000-000000000001',
		owner_display_name: null,
		owner_full_name: 'Ana Reyes',
		mine: false,
		fulfilled: null,
		...over
	};
}

const BOARD: FoundryGameRequest[] = [
	req({ id: 'r1', offer: '20 coins if you finish by Friday' }),
	req({ id: 'r2', title: '<b>bold</b> game', body: '<img src=x onerror=alert(1)>', mine: true, hidden: false }),
	req({
		id: 'r3',
		status: 'closed',
		closed_at: '2026-09-30T18:00:00Z',
		fulfilled: { slug: 'tower-bots', title: 'Tower Bots' },
		offer: 'Lunch'
	})
];

function boardHtml(transports: Record<string, unknown>) {
	return render(FoundryRequestBoard, { props: { requests: BOARD, transports } }).body;
}

const STUDENT = {
	post: async () => ({ ok: true as const, id: 'n' }),
	close: async () => ({ ok: true as const })
};
const ADMIN = { ...STUDENT, setHidden: async () => ({ ok: true as const }) };

describe('the post predicate, in 0230 order', () => {
	it('refuses a blank title, then a blank message, then each length', () => {
		expect(requestCanPost({ title: ' ', body: '', offer: '' })).toMatchObject({ field: 'title', reason: 'blank' });
		expect(requestCanPost({ title: 'x', body: '\n', offer: '' })).toMatchObject({ field: 'body', reason: 'blank' });
		expect(
			requestCanPost({ title: 'x'.repeat(REQUEST_TITLE_MAX + 1), body: 'y', offer: '' })
		).toMatchObject({ field: 'title', reason: 'too_long', limit: REQUEST_TITLE_MAX });
		expect(
			requestCanPost({ title: 'x', body: 'y'.repeat(REQUEST_BODY_MAX + 1), offer: '' })
		).toMatchObject({ field: 'body', reason: 'too_long' });
		expect(
			requestCanPost({ title: 'x', body: 'y', offer: 'z'.repeat(REQUEST_OFFER_MAX + 1) })
		).toMatchObject({ field: 'offer', reason: 'too_long' });
	});

	it('POSITIVE CONTROL: a request at every limit, with no offer, may be posted', () => {
		expect(
			requestCanPost({ title: 'x'.repeat(REQUEST_TITLE_MAX), body: 'y'.repeat(REQUEST_BODY_MAX), offer: '' })
		).toEqual({ ok: true });
	});

	it('reads a pasted gallery link or a bare address as the slug', () => {
		expect(requestSlugFrom('https://ideabosco.com/foundry?app=Tower-Bots')).toBe('tower-bots');
		expect(requestSlugFrom('tower-bots')).toBe('tower-bots');
		expect(requestSlugFrom('   ')).toBeNull();
	});

	it('gives every refusal a sentence with no em dash', () => {
		for (const r of ['blank', 'too_long', 'too_many_open', 'too_soon', 'not_eligible', 'foundry_off', 'not_found', 'no_such_app', 'unavailable', 'new']) {
			const s = requestRefusalSentence(r, { field: 'title', limit: 80, retryAfterSeconds: 75 });
			expect(s.length, r).toBeGreaterThan(10);
			expect(s, r).not.toMatch(/—/);
		}
		expect(requestRefusalSentence('too_soon', { retryAfterSeconds: 75 })).toContain('2 minutes');
	});

	it('splits the board into open and closed, keeping the database order', () => {
		const s = splitRequests(BOARD);
		expect(s.open.map((r) => r.id)).toEqual(['r1', 'r2']);
		expect(s.closed.map((r) => r.id)).toEqual(['r3']);
	});
});

describe('the board says no coin moves, beside every offer', () => {
	it('names IDEA Coins and says the site does not move them', () => {
		expect(FOUNDRY_REQUEST_OFFER_NOTE).toMatch(/does not move IDEA Coins/);
		expect(FOUNDRY_REQUEST_OFFER_NOTE).not.toMatch(/—/);
	});

	it('renders the note under each offer and once on the form', () => {
		const html = boardHtml(STUDENT);
		const offers = BOARD.filter((r) => r.offer).length;
		const notes = html.split(FOUNDRY_REQUEST_OFFER_NOTE).length - 1;
		// The closed request sits in a closed Disclosure, which is HIDDEN in CSS
		// and still in the DOM, so it counts.
		expect(notes).toBe(offers + 1);
		expect(html).toContain(FOUNDRY_REQUEST_NAME_NOTE);
	});

	it('names no coin function anywhere in the board code', () => {
		for (const f of [
			'src/lib/foundry/requests.ts',
			'src/lib/foundry/FoundryRequestBoard.svelte',
			'src/routes/foundry/requests/+page.svelte',
			'src/routes/foundry/requests/+page.server.ts'
		]) {
			const src = readFileSync(join(ROOT, f), 'utf8');
			expect(src, f).not.toMatch(/\bcoin_[a-z_]+\b/);
			expect(src, f).not.toMatch(/_coin_insert|coin_transactions/);
		}
	});
});

describe('who can do what on the board', () => {
	it('gives a student no Hide control, and an admin one per open request', () => {
		const student = boardHtml(STUDENT);
		expect(student).not.toContain('foundry-request-hide');
		const admin = boardHtml(ADMIN);
		const open = BOARD.filter((r) => r.status === 'open').length;
		expect(admin.split('data-testid="foundry-request-hide"').length - 1).toBe(open);
	});

	it('offers Close only on the requester own open request', () => {
		const html = boardHtml(STUDENT);
		expect(html.split('data-testid="foundry-request-close"').length - 1).toBe(1);
	});

	it('has no form at all without a post transport', () => {
		expect(boardHtml({})).not.toContain('foundry-request-form');
		expect(boardHtml(STUDENT)).toContain('foundry-request-form');
	});

	it('renders a request text as text, never as markup', () => {
		const html = boardHtml(STUDENT);
		expect(html).not.toContain('<b>bold</b>');
		expect(html).toContain('&lt;b>bold&lt;/b>');
		expect(html).not.toContain('<img src=x');
		// POSITIVE CONTROL: the request itself is on the page.
		expect(html).toContain('game');
	});

	it('links the app that answered a closed request', () => {
		expect(boardHtml(STUDENT)).toContain('href="/foundry?app=tower-bots"');
	});

	it('says the board is not on yet on a database without 0230', () => {
		const html = render(FoundryRequestBoard, {
			props: { requests: [], available: false, transports: STUDENT }
		}).body;
		expect(html).toContain('foundry-request-unavailable');
		expect(html).not.toContain('foundry-request-form');
	});
});

describe('the route hands Hide to an administrator and to nobody else', () => {
	it('renders the real route page with no Hide for a student and one per open request for an admin', async () => {
		const { withPageData } = await import('./stubs/app-state.ts');
		const { default: RequestsPage } = await import('../src/routes/foundry/requests/+page.svelte');
		const data = { requests: BOARD, available: true, supabase: {} };
		const asStudent = withPageData({ isAdmin: false }, () => render(RequestsPage as never, { props: { data } as never }).body);
		const asAdmin = withPageData({ isAdmin: true }, () => render(RequestsPage as never, { props: { data } as never }).body);
		expect(asStudent).not.toContain('foundry-request-hide');
		expect(asStudent).toContain('foundry-request-form');
		const open = BOARD.filter((r) => r.status === 'open').length;
		expect(asAdmin.split('data-testid="foundry-request-hide"').length - 1).toBe(open);
	});
});

function migration0230(): string | null {
	const dir = join(ROOT, 'supabase/migrations');
	const name = readdirSync(dir).find((f) => f.startsWith('0230_'));
	return name && existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : null;
}

const SQL = migration0230();

describe.skipIf(SQL === null)('every board limit is 0230 own number', () => {
	it('matches the title, message, offer, open-request and gap limits', () => {
		const sql = SQL!;
		expect(sql).toMatch(new RegExp(`title[^\\n]*between 1 and ${REQUEST_TITLE_MAX}\\)`));
		expect(sql).toMatch(new RegExp(`body[^\\n]*between 1 and ${REQUEST_BODY_MAX}\\)`));
		expect(sql).toMatch(new RegExp(`offer[^\\n]*between 1 and ${REQUEST_OFFER_MAX}\\)`));
		expect(sql).toContain(`v_open >= ${REQUEST_OPEN_MAX}`);
		expect(sql).toContain(`interval '${REQUEST_GAP_SECONDS} seconds'`);
	});
});
