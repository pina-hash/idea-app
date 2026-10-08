// tests/dom/armory-people-picker-mount.test.ts
//
// THE ARMORY PEOPLE PICKER NEVER TURNS AN ADD INTO A ROLE CHANGE, ON THE REAL
// COMPONENT.
//
// `armory_add_member` (0231) UPDATES the role of somebody already in the
// project and answers true. The picker's search lists existing members too
// ("Already a Mentor"), so a teacher who typed a colleague's name and pressed
// Enter, then added the batch "As Student", demoted that colleague and read
// "Added 1 as Student." Nothing on screen said a role had moved. So:
//
//   - a member row is never put in the tray, by Enter or by a click, and the
//     reason is said in words; Enter on a fresh list highlights the first row
//     that CAN be picked, never a member above it;
//   - the add sends exactly the people in the tray, and the member's address
//     is never sent (the paste box's half is `addPeople`, pinned in
//     tests/armory-team-presence.test.ts against a fake of the real RPC);
//   - a pick cancels the search still waiting on the debounce, so the list
//     does not reopen under an empty box with the answer to the old words.
//
// Structure, events and call counts only (happy-dom has no layout engine);
// the list's geometry is tools/browser-verify/routes/armory-state-team.mjs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import ArmoryPeoplePicker from '../../src/lib/armory/ArmoryPeoplePicker.svelte';
import { PEOPLE_SEARCH_DEBOUNCE_MS, type ArmoryPersonResult, type PeopleSearchAnswer } from '../../src/lib/armory/team';
import type { ArmoryMember, ArmoryRole } from '../../src/lib/armory/view';
import { mountInto, type Mounted } from './mount';

const person = (email: string, name: string, member_role: ArmoryRole | null = null): ArmoryPersonResult => ({
	email,
	name,
	avatar: null,
	avatar_url: null,
	pathway: null,
	member_role
});

const MIA = person('mia.chen@boscotech.edu', 'Mia Chen', 'mentor');
const ANA = person('ana.reyes@boscotech.net', 'Ana Reyes');
const DANA = person('dana.kim@boscotech.net', 'Dana Kim');
/** The member is FIRST, which is the order that made one Enter pick her. */
const ANSWER: ArmoryPersonResult[] = [MIA, ANA, DANA];
const MEMBERS = [{ email: MIA.email, role: 'mentor' }] as ArmoryMember[];

let mounted: Mounted | null = null;
let searched: string[] = [];
let sent: Array<{ email: string; role: ArmoryRole }> = [];

function start() {
	searched = [];
	sent = [];
	mounted = mountInto(ArmoryPeoplePicker as never, {
		search: async (q: string): Promise<PeopleSearchAnswer> => {
			searched.push(q);
			return { ok: true, rows: ANSWER };
		},
		roles: ['student', 'instructor', 'cad_lead', 'mentor'],
		members: MEMBERS,
		addMember: async (email: string, role: ArmoryRole) => {
			sent.push({ email, role });
			return { ok: true };
		},
		refresh: async () => {}
	});
	return mounted;
}

function type(m: Mounted, value: string) {
	const input = m.one<HTMLInputElement>('[data-testid="armory-people-search"]');
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}

function key(m: Mounted, k: string) {
	m.one<HTMLInputElement>('[data-testid="armory-people-search"]').dispatchEvent(
		new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
	);
	flushSync();
}

async function wait(ms: number) {
	await vi.advanceTimersByTimeAsync(ms);
	flushSync();
}

const trayNames = (m: Mounted) => m.all('[data-testid="armory-people-tray"] .person-name').map((n) => n.textContent?.trim());
const listOpen = (m: Mounted) => m.all('[data-testid="armory-people-results"]').length === 1;
const pickerMessage = (m: Mounted) => m.all('[data-testid="armory-picker-message"]')[0]?.textContent?.trim() ?? '';

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(async () => {
	await mounted?.stop();
	mounted = null;
	vi.useRealTimers();
});

describe('ArmoryPeoplePicker: an add is never a role change', () => {
	it('Enter on a fresh list picks the first person who can be picked, never the member above them', async () => {
		const m = start();
		type(m, 'an');
		await wait(PEOPLE_SEARCH_DEBOUNCE_MS + 10);
		expect(listOpen(m)).toBe(true);
		const options = m.all<HTMLButtonElement>('[data-testid="armory-people-option"]');
		expect(options.length).toBe(3);
		// The member row says so, and is marked unavailable to assistive tech.
		expect(options[0].getAttribute('aria-disabled')).toBe('true');
		expect(options[1].getAttribute('aria-disabled')).toBeNull();
		expect(options[1].getAttribute('aria-selected')).toBe('true');
		key(m, 'Enter');
		expect(trayNames(m)).toEqual(['Ana Reyes']);
	});

	it('a member row picked by click or by Enter is never trayed, and the reason is said', async () => {
		const m = start();
		type(m, 'mi');
		await wait(PEOPLE_SEARCH_DEBOUNCE_MS + 10);
		const member = m.all<HTMLButtonElement>('[data-testid="armory-people-option"]')[0];
		member.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
		flushSync();
		expect(m.all('[data-testid="armory-people-tray"]').length).toBe(0);
		expect(pickerMessage(m)).toBe("Mia Chen is already in this project as Mentor. A role changes only on that person's row in the team list.");
		// The words stay in the box, so one arrow key brings the list back.
		expect(m.one<HTMLInputElement>('[data-testid="armory-people-search"]').value).toBe('mi');
		key(m, 'ArrowDown');
		expect(listOpen(m)).toBe(true);
		// Arrowing UP onto the member (the list opened on Ana, the first pickable) and pressing Enter is refused the same way.
		expect(m.all('[data-testid="armory-people-option"]')[1].getAttribute('aria-selected')).toBe('true');
		key(m, 'ArrowUp');
		expect(m.all('[data-testid="armory-people-option"]')[0].getAttribute('aria-selected')).toBe('true');
		key(m, 'Enter');
		expect(m.all('[data-testid="armory-people-tray"]').length).toBe(0);
		expect(m.one('[data-testid="armory-people-add"]').getAttribute('aria-disabled')).toBe('true');
	});

	it('the add sends exactly the tray, and the member is never sent', async () => {
		const m = start();
		type(m, 'an');
		await wait(PEOPLE_SEARCH_DEBOUNCE_MS + 10);
		m.all<HTMLButtonElement>('[data-testid="armory-people-option"]')[0].dispatchEvent(
			new MouseEvent('mousedown', { bubbles: true, cancelable: true })
		);
		flushSync();
		type(m, 'an');
		await wait(PEOPLE_SEARCH_DEBOUNCE_MS + 10);
		m.all<HTMLButtonElement>('[data-testid="armory-people-option"]')[2].dispatchEvent(
			new MouseEvent('mousedown', { bubbles: true, cancelable: true })
		);
		flushSync();
		expect(trayNames(m)).toEqual(['Dana Kim']);
		m.one<HTMLButtonElement>('[data-testid="armory-people-add"]').click();
		await wait(0);
		await wait(0);
		expect(sent).toEqual([{ email: DANA.email, role: 'student' }]);
		expect(sent.some((s) => s.email === MIA.email)).toBe(false);
		expect(pickerMessage(m)).toBe('Added 1 as Student.');
	});

	it('a pick cancels the search still waiting, so the list does not reopen under an empty box', async () => {
		const m = start();
		type(m, 'an');
		await wait(PEOPLE_SEARCH_DEBOUNCE_MS + 10);
		expect(searched).toEqual(['an']);
		// New words, and Enter on the list still showing before their search is asked.
		type(m, 'ana');
		key(m, 'Enter');
		expect(trayNames(m)).toEqual(['Ana Reyes']);
		expect(listOpen(m)).toBe(false);
		await wait(PEOPLE_SEARCH_DEBOUNCE_MS * 3);
		expect(searched).toEqual(['an']);
		expect(listOpen(m)).toBe(false);
		expect(m.one<HTMLInputElement>('[data-testid="armory-people-search"]').value).toBe('');
	});
});
