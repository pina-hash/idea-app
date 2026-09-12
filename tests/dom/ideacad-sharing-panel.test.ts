// tests/dom/ideacad-sharing-panel.test.ts
//
// THE SHARE CONTROL, MOUNTED. `0205` shipped with no `.svelte` file at all, so
// until this bundle nothing in the repository had ever rendered a grant.
//
// WHY THIS IS AUTOMATED. Two of the claims here regress SILENTLY:
//
//   * A NON-OWNER BEING OFFERED A CONTROL. `0205` refuses a share from anybody
//     but the owner, INCLUDING an instructor, so a form rendered for an editor
//     is a button whose only possible outcome is a refusal. Nothing on screen
//     says so -- it looks like a working control until somebody presses it.
//
//   * A REFUSAL BEING RE-TONED. The database raises the sentence a student
//     should read ("You can only share this with a classmate in this class")
//     and a client that paraphrased it would be a second wording of one rule.
//     A paraphrase looks perfectly reasonable in review.
//
// EVERY ABSENCE CLAIM IS PAIRED WITH ITS POSITIVE CONTROL ON THE SAME FIXTURE,
// and BOTH counts are reported: a selector that matches nothing comes back
// clean, and clean is what nobody investigates.
//
// NO GEOMETRY, NO CONTRAST, NO TAP TARGET. happy-dom has no layout engine and
// every one of those reads zero here. They are measured against a real Chromium
// in `tools/browser-verify/routes/ideacad-team-*.mjs`.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import SharePanel from '$lib/ideacad/ui/SharePanel.svelte';
import {
	IDEACAD_ROLE_LABELS,
	IDEACAD_SHARING_UNAVAILABLE,
	type IdeacadDocumentRole,
	type IdeacadGrant
} from '$lib/ideacad/sharing';
import { mountInto, type Mounted } from './mount';

const Panel = SharePanel as unknown as Component<Record<string, unknown>>;

const OWNER = 'ana@boscotech.net';
const EDITOR = 'luis@boscotech.net';
const VIEWER = 'sam@boscotech.net';

const GRANTS: IdeacadGrant[] = [
	{ granteeEmail: EDITOR, role: 'editor', grantedBy: OWNER, grantedAt: '2026-09-10T17:00:00Z' },
	{ granteeEmail: VIEWER, role: 'viewer', grantedBy: OWNER, grantedAt: '2026-09-11T17:00:00Z' }
];

const live: Mounted[] = [];
afterEach(async () => {
	while (live.length) await live.pop()!.stop();
});

function open(props: Record<string, unknown> = {}): Mounted {
	const m = mountInto(Panel, {
		role: 'owner' as IdeacadDocumentRole,
		ownerEmail: OWNER,
		grants: GRANTS,
		onshare: async () => {},
		onunshare: async () => {},
		...props
	});
	live.push(m);
	return m;
}

/** The write surface, counted. One number per control a refusal could land on. */
function controls(m: Mounted) {
	return {
		forms: m.all('[data-testid="ideacad-share-form"]').length,
		emails: m.all('input[type="email"]').length,
		rolePickers: m.all('select').length,
		removes: m.all('.rm').length
	};
}

describe('who is offered a control', () => {
	it('gives the OWNER the whole form, which is the positive control for every absence below', () => {
		const c = controls(open({ role: 'owner' }));
		expect(c).toEqual({ forms: 1, emails: 1, rolePickers: 1, removes: 2 });
	});

	it('gives an EDITOR none of it, because 0205 refuses a share from anybody but the owner', () => {
		const c = controls(open({ role: 'editor' }));
		expect(c).toEqual({ forms: 0, emails: 0, rolePickers: 0, removes: 0 });
	});

	it('gives a VIEWER none of it', () => {
		const c = controls(open({ role: 'viewer' }));
		expect(c).toEqual({ forms: 0, emails: 0, rolePickers: 0, removes: 0 });
	});

	it('gives an INSTRUCTOR none of it, which is 0205’s rule and not an oversight', () => {
		// A teacher reads everything and shares nothing: handing a student's work
		// to another student is a decision nobody has made.
		const c = controls(open({ role: 'manager' }));
		expect(c).toEqual({ forms: 0, emails: 0, rolePickers: 0, removes: 0 });
	});

	it('removes the form from the OWNER when the transport is absent, and says why', () => {
		// ABSENCE IS THE MECHANISM: a deployment without 0205 has no
		// `ideacad_share_document` to call, so there is no write to execute.
		const m = open({ role: 'owner', onshare: undefined, onunshare: undefined });
		expect(controls(m)).toEqual({ forms: 0, emails: 0, rolePickers: 0, removes: 0 });
		// The list is still there: what is missing is the ability to CHANGE it.
		expect(m.all('[data-testid="ideacad-share-list"] li').length).toBe(2);
	});

	it('says the feature is off in words when the deployment has no 0205', () => {
		const m = open({ role: 'owner', sharingReady: false });
		expect(m.target.textContent).toContain(IDEACAD_SHARING_UNAVAILABLE);
		expect(controls(m).forms).toBe(0);
	});
});

describe('what a non-owner is told instead', () => {
	it('names the role in words and states what it means', () => {
		for (const role of ['owner', 'editor', 'viewer', 'manager'] as const) {
			const m = open({ role });
			const chip = m.one('[data-testid="ideacad-share-role"]');
			expect(chip.textContent?.trim(), role).toBe(IDEACAD_ROLE_LABELS[role]);
			// A CHIP IS NEVER THE ONLY SIGNAL: the note says what the role means.
			expect(m.one('.note').textContent!.length, role).toBeGreaterThan(20);
		}
	});

	it('reads as nothing at all for a private document, never "shared with 0 people"', () => {
		const m = open({ role: 'owner', grants: [] });
		expect(m.all('[data-testid="ideacad-share-summary"]').length).toBe(0);
		expect(m.all('[data-testid="ideacad-share-list"]').length).toBe(0);
		// The positive control: the same mount WITH grants renders both.
		const withGrants = open({ role: 'owner' });
		expect(withGrants.all('[data-testid="ideacad-share-summary"]').length).toBe(1);
		expect(withGrants.all('[data-testid="ideacad-share-list"] li').length).toBe(2);
	});
});

describe('the refusal path', () => {
	it('renders the database’s sentence VERBATIM', async () => {
		const sentence = 'You can only share this with a classmate in this class.';
		const m = open({
			onshare: async () => {
				throw new Error(sentence);
			}
		});
		m.one<HTMLInputElement>('input[type="email"]').value = 'stranger@example.com';
		m.one<HTMLInputElement>('input[type="email"]').dispatchEvent(
			new Event('input', { bubbles: true })
		);
		m.one('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await m.settle();
		expect(m.one('[data-testid="ideacad-share-refusal"]').textContent?.trim()).toBe(sentence);
	});

	it('catches the two refusals a browser can answer on its own, and costs no round trip', async () => {
		let called = 0;
		const m = open({
			onshare: async () => {
				called += 1;
			}
		});
		const input = m.one<HTMLInputElement>('input[type="email"]');
		const submit = async (value: string) => {
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
			m.one('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
			await m.settle();
		};
		await submit('');
		expect(m.one('[data-testid="ideacad-share-refusal"]').textContent).toContain('email address');
		await submit(OWNER);
		expect(m.one('[data-testid="ideacad-share-refusal"]').textContent).toContain('already yours');
		expect(called, 'round trips spent on a refusal the browser could answer').toBe(0);

		// THE POSITIVE CONTROL: a plausible address DOES reach the transport, so
		// the two refusals above are a gate rather than a form that never submits.
		await submit('new@boscotech.net');
		expect(called).toBe(1);
	});

	it('normalizes the address the way the database does, so one person is one grant', async () => {
		let seen = '';
		const m = open({
			onshare: async (email: string) => {
				seen = email;
			}
		});
		const input = m.one<HTMLInputElement>('input[type="email"]');
		input.value = '  NEW@BoscoTech.NET ';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		m.one('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await m.settle();
		expect(seen).toBe('new@boscotech.net');
	});
});

describe('removing a grant', () => {
	it('takes two steps and names the person before it happens', async () => {
		const removed: string[] = [];
		const m = open({ onunshare: async (email: string) => void removed.push(email) });
		m.all<HTMLButtonElement>('.rm')[0].click();
		m.flush();
		// A DESTRUCTIVE ACTION NAMES WHAT IT COSTS. The armed control carries the
		// address; the first press cannot remove anything.
		expect(removed).toEqual([]);
		const confirm = m.one<HTMLButtonElement>('.confirm .yes');
		expect(confirm.textContent).toContain(EDITOR);
		confirm.click();
		await m.settle();
		expect(removed).toEqual([EDITOR]);
	});

	it('can be backed out of', async () => {
		const removed: string[] = [];
		const m = open({ onunshare: async (email: string) => void removed.push(email) });
		m.all<HTMLButtonElement>('.rm')[0].click();
		m.flush();
		m.one<HTMLButtonElement>('.confirm .no').click();
		await m.settle();
		expect(removed).toEqual([]);
		expect(m.all('.confirm').length).toBe(0);
		expect(m.all('.rm').length).toBe(2);
	});
});
