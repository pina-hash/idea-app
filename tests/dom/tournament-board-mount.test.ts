// tests/dom/tournament-board-mount.test.ts
//
// THE ARENA BOARD, MOUNTED (prompt 0110, item 3).
//
// What the board promises is STRUCTURAL: lanes in a fixed order with the
// empty ones absent, exactly one live chip on the marquee, a word on every
// chip, a way to watch for a viewer with no session, and controls that exist
// only when their transport does. Every one of those is a count over a real
// DOM, and the invite response is a real click through a real callback --
// none of it reachable from `svelte/server`'s `render()`, which produces one
// string and runs no handler.
//
// WHAT IS ASSERTED: element counts, document order, text, hrefs and which
// callback fired with what. NOT geometry, NOT contrast, NOT a tap target --
// happy-dom has no layout engine, so a box read here is zero and passes
// vacuously (tests/dom/README.md). Those are `npm run verify:browser`'s
// (tools/browser-verify/routes/tournaments-view-list*.mjs).
//
// THE FIXTURE is five tournaments: one live with one match in progress, one
// open for registration, one seeding, two complete with champions -- the
// same shape the dev harness builds at `/dev/tournaments?view=list`.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';

import TournamentBoard from '$lib/tournaments/TournamentBoard.svelte';
import type {
	BracketMatch,
	Tournament,
	TournamentEntry,
	TournamentInvite
} from '$lib/tournaments/tournaments';
import { mountInto, typeAt, type Mounted } from './mount';

const Board = TournamentBoard as unknown as Component<Record<string, unknown>>;

const mounted: Mounted[] = [];
afterEach(async () => {
	while (mounted.length) await mounted.pop()!.stop();
});

function t(over: Partial<Tournament> & Pick<Tournament, 'id' | 'status'>): Tournament {
	return {
		name: `Tournament ${over.id}`,
		description: '',
		config: {},
		champion_entry_id: null,
		created_by: null,
		created_at: '2026-09-01T00:00:00Z',
		updated_at: '2026-09-01T00:00:00Z',
		...over
	};
}
function e(id: string, tournament_id: string, display_name: string): TournamentEntry {
	return {
		id,
		tournament_id,
		user_id: null,
		display_name,
		description: '',
		thumbnail_url: null,
		seed: null,
		created_at: '2026-09-01T00:00:00Z'
	};
}
function m(over: Partial<BracketMatch> & Pick<BracketMatch, 'id' | 'tournament_id'>): BracketMatch {
	return {
		bracket: 'winners',
		round: 1,
		slot: 1,
		entry_a_id: null,
		entry_b_id: null,
		best_of: 1,
		status: 'pending',
		winner_id: null,
		started_at: null,
		completed_at: null,
		winner_to_match_id: null,
		winner_to_pos: null,
		loser_to_match_id: null,
		loser_to_pos: null,
		...over
	};
}

const TOURNAMENTS: Tournament[] = [
	// Deliberately NOT in lane order, so the order in the DOM is the board's.
	t({ id: 'done-a', status: 'complete', champion_entry_id: 'da1', updated_at: '2026-08-01T00:00:00Z' }),
	t({ id: 'open', status: 'registration_open', config: { team_size: 3 } }),
	t({ id: 'live', status: 'live', name: 'IDEA100 Hook Design Competition' }),
	t({ id: 'seed', status: 'seeding' }),
	t({ id: 'done-b', status: 'complete', champion_entry_id: 'db1', updated_at: '2026-08-15T00:00:00Z' })
];
const ENTRIES: TournamentEntry[] = [
	e('l1', 'live', 'Vortex'),
	e('l2', 'live', 'Ratchet'),
	e('l3', 'live', 'Cam'),
	e('o1', 'open', 'Early Bird'),
	e('s1', 'seed', 'Seed One'),
	e('s2', 'seed', 'Seed Two'),
	e('da1', 'done-a', 'Alpha Champion'),
	e('da2', 'done-a', 'Alpha Runner'),
	e('db1', 'done-b', 'Beta Champion')
];
const MATCHES: BracketMatch[] = [
	m({ id: 'lm1', tournament_id: 'live', entry_a_id: 'l1', entry_b_id: 'l2', status: 'in_progress', started_at: '2026-09-01T10:00:00Z' }),
	m({ id: 'lm2', tournament_id: 'live', entry_a_id: 'l3', entry_b_id: null, slot: 2 })
];

function mountBoard(props: Record<string, unknown> = {}) {
	const mt = mountInto(Board, {
		tournaments: TOURNAMENTS,
		entries: ENTRIES,
		matches: MATCHES,
		now: Date.parse('2026-09-01T10:05:00Z'),
		...props
	});
	mounted.push(mt);
	return mt;
}

/** A chip's word: its text with the glyph span removed. */
function chipWord(chip: Element): string {
	const clone = chip.cloneNode(true) as Element;
	for (const g of Array.from(clone.querySelectorAll('.g'))) g.remove();
	return (clone.textContent ?? '').trim();
}

describe('the lanes', () => {
	it('render in the order live, open, upcoming, finished, and an empty lane is absent', () => {
		const b = mountBoard();
		const lanes = b.all('[data-testid^="board-lane-"]').map((el) => el.getAttribute('data-lane'));
		expect(lanes).toEqual(['live', 'open', 'upcoming', 'finished']);
		// Cards per lane: 1 live (the marquee, not a card), 1 open, 1 seeding, 2 finished.
		expect(b.all('[data-testid="board-lane-live"] [data-testid="board-card"]')).toHaveLength(0);
		expect(b.all('[data-testid="board-lane-live"] [data-testid="board-marquee"]')).toHaveLength(1);
		expect(b.all('[data-testid="board-lane-open"] [data-testid="board-card"]')).toHaveLength(1);
		expect(b.all('[data-testid="board-lane-upcoming"] [data-testid="board-card"]')).toHaveLength(1);
		expect(b.all('[data-testid="board-lane-finished"] [data-testid="board-card"]')).toHaveLength(2);
		// A lane with nothing in it is not on the page at all.
		const noOpen = mountBoard({ tournaments: TOURNAMENTS.filter((x) => x.status !== 'registration_open') });
		expect(noOpen.all('[data-testid="board-lane-open"]')).toHaveLength(0);
		expect(noOpen.all('[data-testid^="board-lane-"]')).toHaveLength(3);
	});

	it('renders the empty state, with New tournament only when signed in', () => {
		const out = mountBoard({ tournaments: [], entries: [], matches: [] });
		expect(out.all('[data-testid="board-empty"]')).toHaveLength(1);
		expect(out.one('[data-testid="board-empty"]').textContent).toContain('No tournaments yet.');
		expect(out.all('[data-testid="board-empty"] a[href="/tournaments/new"]')).toHaveLength(0);
		expect(out.all('[data-testid^="board-lane-"]')).toHaveLength(0);
		const inn = mountBoard({ tournaments: [], entries: [], matches: [], signedIn: true });
		expect(inn.all('[data-testid="board-empty"] a[href="/tournaments/new"]')).toHaveLength(1);
	});
});

describe('the marquee and its one emerald element', () => {
	it('carries exactly one live chip, and it is the only one on the page with one live event', () => {
		const b = mountBoard();
		expect(b.all('[data-testid="board-marquee"] .tnm-status.live')).toHaveLength(1);
		expect(b.all('.tnm-status.live')).toHaveLength(1);
		const mq = b.one('[data-testid="board-marquee"]');
		expect(mq.textContent).toContain('IDEA100 Hook Design Competition');
		// The pair on the floor is the match in progress, named.
		expect(mq.textContent).toContain('Now playing');
		expect(mq.textContent).toContain('Vortex');
		expect(mq.textContent).toContain('Ratchet');
		expect(mq.querySelectorAll('.entry-banner')).toHaveLength(2);
		// Its two actions, as sibling links and never inside the title anchor.
		expect(mq.querySelectorAll('a[data-watch]')).toHaveLength(1);
		expect(mq.querySelector('a[data-watch]')?.getAttribute('href')).toBe('/tournaments/live');
		expect(mq.querySelector('a[href="/tournaments/live/tv"]')?.textContent?.trim()).toBe('TV mode');
		expect(mq.querySelectorAll('.title a, .title .btn')).toHaveLength(0);
	});

	it('a second live event is a card under the marquee with its own chip (the tolerated exception)', () => {
		const two = [...TOURNAMENTS, t({ id: 'live-2', status: 'live', updated_at: '2026-08-31T00:00:00Z' })];
		const b = mountBoard({ tournaments: two });
		expect(b.all('[data-testid="board-marquee"]')).toHaveLength(1);
		expect(b.all('[data-testid="board-lane-live"] [data-testid="board-card"]')).toHaveLength(1);
		expect(b.all('[data-testid="board-marquee"] .tnm-status.live')).toHaveLength(1);
		expect(b.all('.tnm-status.live')).toHaveLength(2);
		// The MOST RECENTLY MOVED live event is the marquee.
		expect(b.one('[data-testid="board-marquee"]').textContent).toContain('IDEA100');
	});

	it('shows the next pair as Up next when nothing is in progress, and the count when nothing is callable', () => {
		const ready = MATCHES.map((x) => (x.id === 'lm1' ? { ...x, status: 'pending' as const, started_at: null } : x));
		const next = mountBoard({ matches: ready });
		expect(next.one('[data-testid="board-marquee"]').textContent).toContain('Up next');
		const none = mountBoard({ matches: [] });
		expect(none.one('[data-testid="board-marquee"]').textContent).toContain('0 of 0 matches played');
		expect(none.all('[data-testid="board-marquee"] .entry-banner')).toHaveLength(0);
	});
});

describe('every chip carries a word', () => {
	it('has a non-empty word on all five chips once the glyph is stripped, and the glyph is aria-hidden', () => {
		const b = mountBoard();
		const chips = b.all('.tnm-status');
		expect(chips).toHaveLength(5);
		const words = chips.map(chipWord);
		expect(words.every((w) => w.length > 0)).toBe(true);
		expect(words.sort()).toEqual(['Final', 'Final', 'Live', 'Open', 'Seeding']);
		for (const g of b.all('.tnm-status .g')) expect(g.getAttribute('aria-hidden')).toBe('true');
		expect(b.all('.tnm-status.open .g')).toHaveLength(1);
		expect(b.all('.tnm-status.done .g')).toHaveLength(2);
	});
});

describe('what a viewer can do', () => {
	it('offers Register (to #register) when signed in and Sign in to enter (to /) when not', () => {
		const inn = mountBoard({ signedIn: true });
		const reg = inn.one<HTMLAnchorElement>('[data-testid="board-lane-open"] a[data-register]');
		expect(reg.textContent?.trim()).toBe('Register');
		expect(reg.getAttribute('href')).toBe('/tournaments/open#register');
		expect(inn.target.textContent).not.toContain('Sign in to enter');

		const out = mountBoard({ signedIn: false });
		const signin = out.one<HTMLAnchorElement>('[data-testid="board-lane-open"] a[data-register]');
		expect(signin.textContent?.trim()).toBe('Sign in to enter');
		expect(signin.getAttribute('href')).toBe('/');
		expect(out.all('a[data-register]').map((a) => a.textContent?.trim())).not.toContain('Register');
	});

	it('names the team size on an open card', () => {
		const b = mountBoard();
		expect(b.one('[data-testid="board-lane-open"] [data-testid="board-card"]').textContent).toContain(
			'teams of up to 3'
		);
		expect(b.one('[data-testid="board-lane-upcoming"] [data-testid="board-card"]').textContent).not.toContain(
			'teams of up to'
		);
	});

	it('gives a signed-out spectator a link to every tournament (the spectator guarantee)', () => {
		const b = mountBoard({ signedIn: false });
		const watch = b.all<HTMLAnchorElement>('a[data-watch]');
		expect(watch).toHaveLength(TOURNAMENTS.length);
		expect(watch.map((a) => a.getAttribute('href')).sort()).toEqual(
			TOURNAMENTS.map((x) => `/tournaments/${x.id}`).sort()
		);
		// The word is Watch on a running or pending event and Results on a finished one.
		expect(watch.map((a) => a.textContent?.trim()).sort()).toEqual(
			['Results', 'Results', 'Watch', 'Watch', 'Watch'].sort()
		);
		// And nothing on the signed-out board asks for a session to see it.
		expect(b.all('[data-manage]')).toHaveLength(0);
		expect(b.all('.del')).toHaveLength(0);
	});

	it('shows the champion in the finished lane, and only there', () => {
		const b = mountBoard();
		const fin = b.one('[data-testid="board-lane-finished"]');
		expect(fin.textContent).toContain('Champion: Alpha Champion');
		expect(fin.textContent).toContain('Champion: Beta Champion');
		expect(fin.querySelectorAll('.champ')).toHaveLength(2);
		expect(b.all('.champ')).toHaveLength(2);
		// Most recently finished first.
		const names = Array.from(fin.querySelectorAll('[data-testid="board-card"] h3')).map((h) => h.textContent);
		expect(names).toEqual(['Tournament done-b', 'Tournament done-a']);
	});
});

describe('hosts and admins', () => {
	it('renders 0 delete controls with no ondelete, and one per card for an admin with it', () => {
		const none = mountBoard({ isAdmin: true, signedIn: true });
		expect(none.all('.del')).toHaveLength(0);

		const admin = mountBoard({ isAdmin: true, signedIn: true, ondelete: () => {} });
		expect(admin.all('.del')).toHaveLength(TOURNAMENTS.length);
		expect(admin.all('[data-manage]')).toHaveLength(TOURNAMENTS.length);
		// Every manage link goes to the host console, admin or not (item 5).
		for (const a of admin.all('[data-manage]')) expect(a.getAttribute('href')).toMatch(/\/tournaments\/.+\/host$/);
		expect(admin.all('.host-tag')).toHaveLength(0);
	});

	it('gives a host of one tournament exactly one Manage, one delete and one You host this', () => {
		const host = mountBoard({ signedIn: true, hostedIds: ['seed'], ondelete: () => {} });
		expect(host.all('.del')).toHaveLength(1);
		expect(host.all('[data-manage]')).toHaveLength(1);
		expect(host.all('.host-tag')).toHaveLength(1);
		expect(host.one('[data-testid="board-lane-upcoming"]').textContent).toContain('You host this');
		// A non-host non-admin with the transport supplied still gets nothing.
		const nobody = mountBoard({ signedIn: true, ondelete: () => {} });
		expect(nobody.all('.del')).toHaveLength(0);
		expect(nobody.all('[data-manage]')).toHaveLength(0);
	});

	it('fires ondelete with the tournament id when the compact control is driven through', () => {
		const calls: unknown[][] = [];
		// A draft with no entries skips the typed-name step, so two clicks reach the callback.
		const draft = t({ id: 'draft', status: 'draft' });
		const b = mountBoard({
			tournaments: [draft],
			entries: [],
			matches: [],
			isAdmin: true,
			signedIn: true,
			ondelete: (...args: unknown[]) => calls.push(args)
		});
		b.one<HTMLButtonElement>('.del .trigger').click();
		b.flush();
		b.one<HTMLButtonElement>('.del .go').click();
		b.flush();
		expect(calls).toEqual([['draft', '', false]]);
	});
});

describe('invites', () => {
	const INVITES: TournamentInvite[] = [
		{
			id: 'inv-1',
			tournament_id: 'open',
			invited_user_id: 'me',
			invited_by: null,
			status: 'pending',
			created_at: '2026-09-01T00:00:00Z',
			responded_at: null
		}
	];

	it('renders no invites section without onrespond, even with invites', () => {
		const b = mountBoard({ myInvites: INVITES, signedIn: true });
		expect(b.all('[data-testid="board-invites"]')).toHaveLength(0);
	});

	it('fires onrespond with the typed name on Accept, and null on Decline', () => {
		const calls: unknown[][] = [];
		const b = mountBoard({
			myInvites: INVITES,
			signedIn: true,
			onrespond: (...args: unknown[]) => calls.push(args)
		});
		const section = b.one('[data-testid="board-invites"]');
		expect(section.textContent).toContain('Tournament open');
		const buttons = Array.from(section.querySelectorAll('button'));
		const accept = buttons.find((x) => x.textContent?.trim() === 'Accept') as HTMLButtonElement;
		const decline = buttons.find((x) => x.textContent?.trim() === 'Decline') as HTMLButtonElement;
		// Accept is disabled until a display name is typed: the server requires one.
		expect(accept.disabled).toBe(true);
		typeAt(section.querySelector('input') as HTMLInputElement, '  Azad  ');
		b.flush();
		expect(accept.disabled).toBe(false);
		accept.click();
		b.flush();
		expect(calls).toEqual([['inv-1', true, 'Azad']]);
		decline.click();
		b.flush();
		expect(calls[1]).toEqual(['inv-1', false, 'Azad']);
	});
});
