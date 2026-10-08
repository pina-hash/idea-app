/**
 * EVERY CLASSROOM SETTING SAYS WHAT IT DOES (report R04, 2026-09-28), as a
 * teacher: open Settings from the header and read each setting's title, which
 * is now an InfoTip trigger carrying the setting's own help sentence.
 *
 * What only a real browser can say, and so what this measures:
 *   - each title's trigger is a 44px box (the settings dialog is for everyone,
 *     students included), and its centre hit-tests to itself;
 *   - no trigger's box overlaps a choice below it, so a tap meant for a choice
 *     is never taken by the tip (the reason `tap="box"` exists rather than the
 *     inline reach);
 *   - a tap opens the tip on screen, readable, and a tap elsewhere closes it.
 *
 * tests/dom/classroom-settings-help-mount.test.ts pins the structure (one tip
 * per setting, none inside a choice) and the open/close events without layout.
 */
import { MANAGER, READY } from './_classroom-palette.mjs';
import { OPEN_SHELL_MENU } from './_shell-menu.mjs';

const SETTINGS_OPEN = '() => !!document.querySelector(\'dialog[data-testid="classroom-settings"][open]\')';

export default {
	path: `${MANAGER}&state=settings-help`,
	aliasOf: MANAGER,
	label: 'Classroom settings (teacher): every setting title opens a practical help tip (R04)',
	prepare: [OPEN_SHELL_MENU, READY, { click: '[data-testid="settings-trigger"]', until: SETTINGS_OPEN }],
	presence: [
		{
			selector: '[data-testid="classroom-settings"] [data-testid="settings-help"] button.info-tip-trigger',
			/* NINE since ledger 0360's Page layout group (R23): Class page and
			   Assignment and material pages each carry a help sentence. TEN since
			   the projector's clock face (idea 26033e4b), a teacher's setting. */
			label: "a tip on each of a teacher's ten setting titles",
			expectPresent: 10,
			maxPresent: 10,
			expectVisible: 10
		},
		{
			selector: '[data-testid="classroom-settings"] .cs-option .info-tip',
			label: 'no tip inside a choice label',
			expectPresent: 0
		}
	],
	tapTargets: [
		{ selector: '[data-testid="classroom-settings"] [data-testid="settings-help"] button.info-tip-trigger', label: 'setting help tips', min: 44 }
	],
	contrast: [{ selector: '[data-testid="classroom-settings"] .cs-setting-title', label: 'setting titles (the tip triggers)', min: 4.5 }],
	orderResult: [
		{
			label: 'no tip box overlaps a choice, each tip centre hits its own trigger',
			evaluate: `() => {
				const dlg = document.querySelector('dialog[data-testid="classroom-settings"]');
				const triggers = [...dlg.querySelectorAll('[data-testid="settings-help"] button.info-tip-trigger')];
				const choices = [...dlg.querySelectorAll('.cs-option, .cs-btn, .cs-value')];
				let overlaps = 0;
				let selfHits = 0;
				for (const t of triggers) {
					t.scrollIntoView({ block: 'center', behavior: 'instant' });
					const a = t.getBoundingClientRect();
					for (const c of choices) {
						const b = c.getBoundingClientRect();
						if (b.width && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps++;
					}
					const hit = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);
					if (hit && t.contains(hit)) selfHits++;
				}
				return ['triggers ' + triggers.length, 'overlaps ' + overlaps, 'centre hits self ' + selfHits];
			}`,
			expected: ['triggers 10', 'overlaps 0', 'centre hits self 10']
		},
		{
			label: 'a tap opens the Density tip on screen with its own sentence, and a tap elsewhere closes it',
			evaluate: `async () => {
				const dlg = document.querySelector('dialog[data-testid="classroom-settings"]');
				const head = dlg.querySelector('[data-testid="settings-help"][data-setting="Density"]');
				const t = head.querySelector('button.info-tip-trigger');
				t.scrollIntoView({ block: 'center', behavior: 'instant' });
				t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
				t.click();
				await new Promise((r) => setTimeout(r, 250));
				const panel = head.querySelector('[role="tooltip"]');
				const r = panel.getBoundingClientRect();
				const cs = getComputedStyle(panel);
				const onScreen = r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
				const open = cs.visibility === 'visible' && Number(cs.opacity) > 0.9 && onScreen;
				const text = panel.textContent.startsWith('Compact shrinks') ? 'its own sentence' : 'WRONG TEXT: ' + panel.textContent.slice(0, 40);
				dlg.querySelector('.cs-title').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
				await new Promise((r) => setTimeout(r, 250));
				const closed = getComputedStyle(panel).visibility === 'hidden';
				return [open ? 'open on screen' : 'NOT OPEN (' + cs.visibility + ' ' + cs.opacity + ' ' + Math.round(r.top) + ')', text, closed ? 'closed by a tap elsewhere' : 'STILL OPEN'];
			}`,
			expected: ['open on screen', 'its own sentence', 'closed by a tap elsewhere']
		}
	]
};
