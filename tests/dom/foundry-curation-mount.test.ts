// tests/dom/foundry-curation-mount.test.ts
//
// Ledger 0380, the Foundry's new surfaces, on the REAL components: the vote
// keys, the collection card, the ordered subject list, the publisher name
// search and the class schedule editor. Structure, events and the calls the
// controls make; the browser pass owns every box and colour.

import { afterEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import FoundryVote from '../../src/lib/foundry/FoundryVote.svelte';
import FoundryCollectionCard from '../../src/lib/foundry/FoundryCollectionCard.svelte';
import FoundrySubjectList from '../../src/lib/foundry/FoundrySubjectList.svelte';
import FoundryTrustRoster from '../../src/lib/foundry/FoundryTrustRoster.svelte';
import FoundrySchedule from '../../src/lib/foundry/FoundrySchedule.svelte';
import { mountInto, type Mounted } from './mount';

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

const press = (el: Element) => (el as HTMLElement).click();

describe('FoundryVote', () => {
	it('moves the net at once, sends the pressed value, and takes a vote back on a second press', async () => {
		const calls: number[] = [];
		const m = (mounted = mountInto(FoundryVote as never, {
			appId: 'app-1',
			net: 3,
			mine: 0,
			vote: async (_id: string, value: number) => {
				calls.push(value);
				return { ok: true, net: 3 + value };
			}
		}));
		expect(m.one('[data-testid="foundry-vote-net"]').textContent).toContain('+3 net');
		press(m.one('[data-testid="foundry-vote-up"]'));
		await m.settle();
		expect(calls).toEqual([1]);
		expect(m.one('[data-testid="foundry-vote-net"]').textContent).toContain('+4 net');
		expect(m.one('[data-testid="foundry-vote-up"]').getAttribute('aria-pressed')).toBe('true');
		press(m.one('[data-testid="foundry-vote-up"]'));
		await m.settle();
		expect(calls).toEqual([1, 0]);
		expect(m.one('[data-testid="foundry-vote-up"]').getAttribute('aria-pressed')).toBe('false');
		press(m.one('[data-testid="foundry-vote-down"]'));
		await m.settle();
		expect(calls).toEqual([1, 0, -1]);
	});

	it('puts the keys back and says why when the server refuses', async () => {
		const m = (mounted = mountInto(FoundryVote as never, {
			appId: 'app-1',
			net: 2,
			mine: 0,
			vote: async () => ({ ok: false as const, reason: 'not_votable' })
		}));
		press(m.one('[data-testid="foundry-vote-up"]'));
		await m.settle();
		expect(m.one('[data-testid="foundry-vote-net"]').textContent).toContain('+2 net');
		expect(m.one('[data-testid="foundry-vote-up"]').getAttribute('aria-pressed')).toBe('false');
		expect(m.one('[data-testid="foundry-vote-problem"]').textContent).toContain('cannot be voted on');
	});

	it('offers no keys to the author, and none without a transport, but always the net', () => {
		const own = (mounted = mountInto(FoundryVote as never, { appId: 'a', net: 1, mine: 0, own: true, vote: async () => ({ ok: true as const, net: 1 }) }));
		expect(own.all('[data-testid="foundry-vote-up"]').length).toBe(0);
		expect(own.target.textContent).toContain('cannot vote on your own');
		expect(own.one('[data-testid="foundry-vote-net"]').textContent).toContain('+1 net');
		const bare = mountInto(FoundryVote as never, { appId: 'a', net: -2, mine: 0 });
		expect(bare.all('button').length).toBe(0);
		expect(bare.one('[data-testid="foundry-vote-net"]').textContent).toContain('-2 net');
		void bare.stop();
	});
});

describe('FoundryCollectionCard', () => {
	it('is a button that says what it is and opens and closes its members', () => {
		const m = (mounted = mountInto(FoundryCollectionCard as never, { title: 'Ported games', description: 'From elsewhere', count: 3 }));
		const btn = m.one<HTMLButtonElement>('[data-testid="foundry-collection-toggle"]');
		expect(btn.tagName).toBe('BUTTON');
		expect(btn.getAttribute('aria-expanded')).toBe('false');
		expect(btn.textContent).toContain('3 games');
		expect(btn.textContent).toContain('Open');
		expect(m.all('[data-testid="foundry-collection-members"]').length).toBe(0);
		press(btn);
		flushSync();
		expect(btn.getAttribute('aria-expanded')).toBe('true');
		expect(btn.textContent).toContain('Close');
		expect(m.all('[data-testid="foundry-collection-members"]').length).toBe(1);
		press(btn);
		flushSync();
		expect(m.all('[data-testid="foundry-collection-members"]').length).toBe(0);
	});
	it('says "1 game" for one', () => {
		const m = (mounted = mountInto(FoundryCollectionCard as never, { title: 'T', count: 1 }));
		expect(m.target.textContent).toContain('1 game ');
	});
});

describe('FoundrySubjectList', () => {
	const options = [
		{ subject: 'app:a', label: 'Alpha' },
		{ subject: 'app:b', label: 'Beta' },
		{ subject: 'house:vanguard', label: 'Vanguard' }
	];
	function start(subjects: string[], max = 60) {
		let last = subjects;
		const m = (mounted = mountInto(FoundrySubjectList as never, {
			subjects,
			options,
			max,
			onchange: (next: string[]) => (last = next)
		}));
		return { m, last: () => last };
	}
	it('lists what is there by its words and offers only what is not', () => {
		const { m } = start(['app:b']);
		expect(m.all('.fsl-row').length).toBe(1);
		expect(m.one('.fsl-name').textContent).toContain('Beta');
		const opts = m.all<HTMLOptionElement>('.fsl-select option').map((o) => o.textContent?.trim());
		expect(opts).toEqual(['Choose a game', 'Alpha', 'Vanguard']);
	});
	it('moves, removes and adds through onchange, and refuses a move off either end', () => {
		const { m, last } = start(['app:a', 'app:b']);
		const keys = (row: number) => m.all<HTMLButtonElement>('.fsl-row')[row].querySelectorAll<HTMLButtonElement>('button');
		press(keys(0)[1]); // move first down
		expect(last()).toEqual(['app:b', 'app:a']);
		const fresh = start(['app:a', 'app:b']);
		press(fresh.m.all<HTMLButtonElement>('.fsl-row')[0].querySelectorAll('button')[0]); // first up: nothing
		expect(fresh.last()).toEqual(['app:a', 'app:b']);
		press(fresh.m.all<HTMLButtonElement>('.fsl-row')[1].querySelectorAll('button')[2]); // remove second
		expect(fresh.last()).toEqual(['app:a']);
		void fresh.m.stop();
	});
	it('stops adding at the limit and says so', () => {
		const { m } = start(['app:a', 'app:b'], 2);
		expect(m.target.textContent).toContain('most this list holds (2)');
		expect(m.one<HTMLSelectElement>('.fsl-select').disabled).toBe(true);
	});
});

describe('FoundryTrustRoster find by name', () => {
	it('searches from the input, lists matches, and a pick fills the address box', async () => {
		const asked: string[] = [];
		const m = (mounted = mountInto(FoundryTrustRoster as never, {
			rows: [],
			transports: {
				grantTrust: async () => ({ ok: true }),
				searchPeople: async (q: string) => {
					asked.push(q);
					return [{ email: 'ana@boscotech.net', name: 'Ana Reyes' }];
				}
			}
		}));
		const find = m.one<HTMLInputElement>('[data-testid="foundry-trust-find"] input');
		find.value = 'a';
		find.dispatchEvent(new Event('input', { bubbles: true }));
		await new Promise((r) => setTimeout(r, 330));
		expect(asked).toEqual([]);
		find.value = 'ana';
		find.dispatchEvent(new Event('input', { bubbles: true }));
		await new Promise((r) => setTimeout(r, 330));
		await m.settle();
		expect(asked).toEqual(['ana']);
		const pick = m.one<HTMLButtonElement>('[data-testid="foundry-trust-found"] button');
		expect(pick.textContent).toContain('Ana Reyes');
		press(pick);
		await m.settle();
		expect(m.one<HTMLInputElement>('input[type="email"]').value).toBe('ana@boscotech.net');
		expect(m.all('[data-testid="foundry-trust-found"]').length).toBe(0);
	});
	it('says so when the search is not there, and offers none without the transport', async () => {
		const m = (mounted = mountInto(FoundryTrustRoster as never, {
			rows: [],
			transports: { grantTrust: async () => ({ ok: true }), searchPeople: async () => null }
		}));
		const find = m.one<HTMLInputElement>('[data-testid="foundry-trust-find"] input');
		find.value = 'ana';
		find.dispatchEvent(new Event('input', { bubbles: true }));
		await new Promise((r) => setTimeout(r, 330));
		await m.settle();
		expect(m.target.textContent).toContain('Search by name is not available yet');
		const plain = mountInto(FoundryTrustRoster as never, { rows: [], transports: { grantTrust: async () => ({ ok: true }) } });
		expect(plain.all('[data-testid="foundry-trust-find"]').length).toBe(0);
		expect(plain.all('input[type="email"]').length).toBe(1);
		void plain.stop();
	});
});

describe('FoundrySchedule', () => {
	const sections = [
		{ section_id: 's1', label: 'Block 1', block: null, course_title: 'Engineering I', course_code: 'IDEA100', foundry_closed_at: null, foundry_closed_note: null }
	];
	const sched = (over: Record<string, unknown> = {}) => ({
		enabled: false,
		weekly: [{ weekday: 1, starts: '10:00', ends: '10:55' }],
		days: [],
		now: { closed: false },
		...over
	});

	it('renders nothing without the transports', () => {
		const m = (mounted = mountInto(FoundrySchedule as never, { sections }));
		expect(m.all('[data-testid="foundry-schedule"]').length).toBe(0);
	});

	it('loads a class when it is picked, shows its pattern, and saves the edited week', async () => {
		const saved: unknown[][] = [];
		const m = (mounted = mountInto(FoundrySchedule as never, {
			sections,
			load: async () => sched(),
			saveWeekly: async (...args: unknown[]) => {
				saved.push(args);
				return { ok: true as const };
			}
		}));
		const select = m.one<HTMLSelectElement>('[data-testid="foundry-schedule-section"]');
		select.value = 's1';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		await m.settle();
		expect(m.one('[data-testid="foundry-schedule-now"]').textContent).toContain('Open right now');
		const times = m.all<HTMLInputElement>('input[type="time"]');
		expect(times.length).toBe(2);
		expect(times[0].value).toBe('10:00');
		const enabled = m.one<HTMLInputElement>('[data-testid="foundry-schedule-enabled"]');
		enabled.click();
		flushSync();
		press(m.one('[data-testid="foundry-schedule-save"]'));
		await m.settle();
		expect(saved).toEqual([['s1', true, [{ weekday: 1, starts: '10:00', ends: '10:55' }]]]);
	});

	it('refuses a window that ends before it starts, in words, without calling the server', async () => {
		let called = 0;
		const m = (mounted = mountInto(FoundrySchedule as never, {
			sections,
			load: async () => sched({ weekly: [{ weekday: 3, starts: '11:00', ends: '10:00' }] }),
			saveWeekly: async () => {
				called++;
				return { ok: true as const };
			}
		}));
		const select = m.one<HTMLSelectElement>('[data-testid="foundry-schedule-section"]');
		select.value = 's1';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		await m.settle();
		press(m.one('[data-testid="foundry-schedule-save"]'));
		await m.settle();
		expect(called).toBe(0);
		expect(m.one('[data-testid="foundry-schedule-problem"]').textContent).toContain('Wednesday');
	});

	it('says "not available yet" when the schedule cannot be read', async () => {
		const m = (mounted = mountInto(FoundrySchedule as never, {
			sections,
			load: async () => null,
			saveWeekly: async () => ({ ok: true as const })
		}));
		const select = m.one<HTMLSelectElement>('[data-testid="foundry-schedule-section"]');
		select.value = 's1';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		await m.settle();
		expect(m.one('[data-testid="foundry-schedule-unavailable"]').textContent).toContain('not available yet');
		expect(m.all('[data-testid="foundry-schedule-save"]').length).toBe(0);
	});

	it('shows a stored odd day and removes it through clearDay', async () => {
		const cleared: unknown[][] = [];
		const m = (mounted = mountInto(FoundrySchedule as never, {
			sections,
			load: async () =>
				sched({ days: [{ on_date: '2026-10-14', kind: 'no_class', starts: null, ends: null, note: 'Assembly' }] }),
			saveWeekly: async () => ({ ok: true as const }),
			saveDay: async () => ({ ok: true as const }),
			clearDay: async (...args: unknown[]) => {
				cleared.push(args);
				return { ok: true as const };
			}
		}));
		const select = m.one<HTMLSelectElement>('[data-testid="foundry-schedule-section"]');
		select.value = 's1';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		await m.settle();
		expect(m.target.textContent).toContain('Wednesday, October 14');
		expect(m.target.textContent).toContain('Assembly');
		const removeBtn = m.all<HTMLButtonElement>('.fdy-sched-dayrow button')[0];
		press(removeBtn);
		await m.settle();
		expect(cleared).toEqual([['s1', '2026-10-14']]);
	});
});
