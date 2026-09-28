// tests/dom/classroom-settings-help-mount.test.ts
//
// EVERY CLASSROOM SETTING SAYS WHAT IT DOES, AND A PHONE CAN OPEN IT (report
// R04, 2026-09-28). Mounts the REAL `ClassroomSettings` over a real preference
// store for each role and reads the panel, then drives the REAL `InfoTip` the
// way a tap, a tap elsewhere, Escape and a blur do.
//
// WHY A TEST. The half that regresses silently is the phone's: a tip that only
// opens on hover still works for every desktop reviewer, and a tip wired into a
// radio's label still reads fine while picking the choice on every tap. So:
//   - each offered setting has exactly one tip, on its TITLE, whose text is the
//     setting's own `help` (read from the module, never retyped here), and NO
//     choice label contains a tip -- both counted, with the choices themselves
//     as the positive control that the labels are being read at all;
//   - a tap opens a tip and it STAYS open until a tap elsewhere, Escape or a
//     blur (CLAUDE.md, the classroom tour rules).
//
// Structure and events only; happy-dom lays nothing out, so the 44px box is the
// browser spec's to measure (tools/browser-verify/routes/classroom-settings-help.mjs).

import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount, type Component } from 'svelte';
import ClassroomSettings from '$lib/classroom/ClassroomSettings.svelte';
import InfoTip from '$lib/classroom/InfoTip.svelte';
import {
	CLASSROOM_PREFERENCE_SCHEMA,
	settingsForRole,
	type SettingRole
} from '$lib/preferences/classroom';
import { MemoryPreferenceStore } from '$lib/preferences/store';
import { mountInto, type Mounted } from './mount';

type Opened = { target: HTMLElement; stop: () => Promise<void> };
const opened: Opened[] = [];
const tips: Mounted[] = [];
afterEach(async () => {
	for (const o of opened.splice(0)) await o.stop();
	for (const m of tips.splice(0)) await m.stop();
});

const settle = async () => {
	flushSync();
	await new Promise((r) => setTimeout(r, 20));
	flushSync();
};

async function openSettings(role: SettingRole): Promise<HTMLElement> {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(ClassroomSettings as unknown as Component<Record<string, unknown>>, {
		target,
		props: { preferences: new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA), role }
	}) as unknown as { open: () => void };
	flushSync();
	app.open();
	await settle();
	opened.push({
		target,
		stop: async () => {
			await unmount(app as never);
			target.remove();
		}
	});
	return target;
}

describe('the settings panel: one tip per setting, on its title (R04)', () => {
	for (const role of ['student', 'manager'] as const) {
		it(`${role}: every offered setting's title carries its own help, and no choice label carries a tip`, async () => {
			const root = await openSettings(role);
			const offered = settingsForRole(role).flatMap((g) => g.settings);
			expect(offered.length).toBeGreaterThan(3);

			const heads = Array.from(root.querySelectorAll<HTMLElement>('[data-testid="settings-help"]'));
			expect(heads.map((h) => h.dataset.setting)).toEqual(offered.map((s) => s.title));
			for (const [i, head] of heads.entries()) {
				const trigger = head.querySelector<HTMLButtonElement>('button.info-tip-trigger');
				expect(trigger, offered[i].title).not.toBeNull();
				// The trigger's name is the title; the tip describes it.
				expect(trigger!.textContent?.replace(/\s+/g, ' ').trim()).toBe(`${offered[i].title} i`);
				const tip = root.querySelector(`#${CSS.escape(trigger!.getAttribute('aria-describedby') ?? '')}`);
				expect(tip?.textContent).toBe(offered[i].help);
				expect(trigger!.classList.contains('info-tip-box')).toBe(true);
			}

			// Both directions: the choices are there (positive control) and none
			// of them holds a tip.
			const choices = root.querySelectorAll('.cs-option');
			expect(choices.length).toBeGreaterThan(0);
			expect(root.querySelectorAll('.cs-option .info-tip')).toHaveLength(0);
			expect(root.querySelectorAll('.info-tip')).toHaveLength(offered.length);
		});
	}
});

describe('InfoTip: a tap opens it and it stays open until a tap elsewhere, Escape or blur', () => {
	function mountTip(): { m: Mounted; trigger: HTMLButtonElement; panel: HTMLElement } {
		const m = mountInto(InfoTip as unknown as Component<Record<string, unknown>>, {
			tip: 'What this does, in a sentence.',
			tap: 'box'
		});
		tips.push(m);
		return {
			m,
			trigger: m.one<HTMLButtonElement>('button.info-tip-trigger'),
			panel: m.one<HTMLElement>('[role="tooltip"]')
		};
	}
	const shown = (panel: HTMLElement) => panel.classList.contains('shown');

	it('opens on a tap and a tap elsewhere closes it', () => {
		const { m, trigger, panel } = mountTip();
		expect(shown(panel)).toBe(false);
		trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		trigger.click();
		m.flush();
		expect(shown(panel)).toBe(true);
		// The pointer leaving (a finger lifting) does not close a pinned tip.
		trigger.dispatchEvent(new PointerEvent('pointerleave'));
		m.flush();
		expect(shown(panel)).toBe(true);
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		m.flush();
		expect(shown(panel)).toBe(false);
	});

	it('Escape closes it, and so does a blur', () => {
		const { m, trigger, panel } = mountTip();
		// A pressed button holds focus (every engine but Safari focuses one on a
		// click), which is where the Escape key press lands.
		trigger.focus();
		trigger.click();
		m.flush();
		expect(shown(panel)).toBe(true);
		trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		m.flush();
		expect(shown(panel)).toBe(false);

		trigger.click();
		m.flush();
		expect(shown(panel)).toBe(true);
		trigger.dispatchEvent(new FocusEvent('blur'));
		m.flush();
		expect(shown(panel)).toBe(false);
	});
});
