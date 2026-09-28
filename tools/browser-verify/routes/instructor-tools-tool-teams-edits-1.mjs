/**
 * CHANGING A SAVED DRAW BY HAND (0225, decision 44, report R18), measured in a
 * real browser at 375 and 1440.
 *
 * Mr. Pina: a draw was posted, one student was absent, and the only way to fix
 * one team was to throw every team away and draw again. A saved or posted
 * draw now takes a move in place, reached two ways that call one handler:
 * dragging a member onto another team card, and a Move to control on every
 * member. A student on the roster and on no team of the draw is listed in a
 * "Not on a team yet" card and joins a team the same two ways.
 *
 * WHAT ONLY A BROWSER CAN SAY HERE:
 *   - that the drag actually lands: `sort-drag` asks `elementFromPoint` what
 *     is under the pointer, which has no answer without layout, and the card
 *     under a finger at 375 (one column) is not the card beside it at 1440
 *     (four columns). The drag below is PointerEvents dispatched at the grip's
 *     own centre and walked to the target card's heading, the same shape every
 *     drag spec in this directory uses (`classroom-split-s-1-manage-1-state-
 *     selected.mjs`): a spec's `prepare` can click, wait and evaluate, and has
 *     no hardware mouse. The history entry says so rather than calling it one.
 *   - that Move to and the grip clear 44px, and that the new words clear
 *     their contrast floor on the card they sit on.
 *
 * THE NEGATIVE CONTROL is the default `/dev/instructor-tools?tool=teams`
 * spec, which hands in no `move` and no `style` and asserts the controls
 * absent. Here both are handed in and asserted present.
 *
 * The fixture (`?edits=1`): the posted draw has three teams of 3, 3 and 2
 * from the first eight students; the ninth is on no team; the unposted draw is
 * already marked edited.
 */
const DRAG_MEMBER = `async () => {
	const set = document.querySelectorAll('[data-testid="team-set"]')[0];
	const cards = set ? [...set.querySelectorAll('[data-testid="team-card"]')] : [];
	const from = cards[0];
	const to = cards[1];
	const grip = from && from.querySelector('[data-testid="team-grip"]');
	const row = grip && grip.closest('[data-team-member]');
	const head = to && to.querySelector('h4');
	if (!grip || !row || !head) throw new Error('team drag fixture not found');
	const who = row.querySelector('.team-member-name').textContent.trim();
	/* The target has to be in the viewport: elementFromPoint answers null
	   outside it. At 375 the cards stack, so the second card's heading is put
	   in the middle of the screen with the first card's rows above it. */
	head.scrollIntoView({ block: 'center', behavior: 'instant' });
	await new Promise((r) => setTimeout(r, 60));
	const g = grip.getBoundingClientRect();
	const h = head.getBoundingClientRect();
	const x0 = g.left + g.width / 2;
	const y0 = g.top + g.height / 2;
	const x1 = h.left + h.width / 2;
	const y1 = h.top + h.height / 2;
	const ev = (type, x, y, extra) => new PointerEvent(type, Object.assign({
		bubbles: true, cancelable: true, composed: true,
		pointerId: 7, pointerType: 'mouse', isPrimary: true,
		button: 0, buttons: 1, clientX: x, clientY: y
	}, extra || {}));
	grip.dispatchEvent(ev('pointerdown', x0, y0));
	const steps = 12;
	for (let i = 1; i <= steps; i++) {
		grip.dispatchEvent(ev('pointermove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps));
		await new Promise((r) => setTimeout(r, 16));
	}
	const midActive = to.getAttribute('data-sort-zone-active');
	grip.dispatchEvent(ev('pointerup', x1, y1, { buttons: 0 }));
	/* The move is a transport call and a board re-read; wait for the name to
	   arrive on the target card rather than for a fixed time. */
	for (let i = 0; i < 40; i++) {
		const names = [...document.querySelectorAll('[data-testid="team-set"]')[0].querySelectorAll('[data-testid="team-card"]')[1].querySelectorAll('.team-member-name')].map((n) => n.textContent.trim());
		if (names.includes(who)) break;
		await new Promise((r) => setTimeout(r, 50));
	}
	const set2 = document.querySelectorAll('[data-testid="team-set"]')[0];
	const cards2 = [...set2.querySelectorAll('[data-testid="team-card"]')];
	const names = (c) => [...c.querySelectorAll('.team-member-name')].map((n) => n.textContent.trim());
	window.__teamDrag = {
		who,
		midActive,
		onTarget: names(cards2[1]).includes(who),
		offSource: !names(cards2[0]).includes(who),
		note: (set2.querySelector('[data-testid="team-edit-note"]').textContent || '').trim(),
		edited: !!set2.querySelector('[data-testid="team-edited"]'),
		activeAfter: document.querySelectorAll('[data-sort-zone-active="true"]').length
	};
	window.scrollTo({ top: 0, behavior: 'instant' });
	return 'dragged ' + who + ' (' + Math.round(x0) + ',' + Math.round(y0) + ')->(' + Math.round(x1) + ',' + Math.round(y1) + '); mid-drag target zone=' + midActive;
}`;

const MOVE_TO = `async () => {
	const set = document.querySelectorAll('[data-testid="team-set"]')[0];
	const cards = [...set.querySelectorAll('[data-testid="team-card"]')];
	const select = cards[2].querySelector('[data-testid="team-move"]');
	const row = select.closest('[data-team-member]');
	const who = row.querySelector('.team-member-name').textContent.trim();
	const target = [...select.options].find((o) => o.value && o.textContent.trim() === cards[0].querySelector('h4').textContent.trim());
	select.value = target.value;
	select.dispatchEvent(new Event('change', { bubbles: true }));
	for (let i = 0; i < 40; i++) {
		const now = [...document.querySelectorAll('[data-testid="team-set"]')[0].querySelectorAll('[data-testid="team-card"]')[0].querySelectorAll('.team-member-name')].map((n) => n.textContent.trim());
		if (now.includes(who)) break;
		await new Promise((r) => setTimeout(r, 50));
	}
	const set2 = document.querySelectorAll('[data-testid="team-set"]')[0];
	const first = [...set2.querySelectorAll('[data-testid="team-card"]')[0].querySelectorAll('.team-member-name')].map((n) => n.textContent.trim());
	window.__teamMoveTo = {
		who,
		landed: first.includes(who),
		note: (set2.querySelector('[data-testid="team-edit-note"]').textContent || '').trim(),
		label: select.getAttribute('aria-label') || ''
	};
	return 'Move to: ' + who;
}`;

export default {
	/* No `aliasOf`: the runner visits `aliasOf` INSTEAD of `path`, and the
	   fixture this spec needs is chosen by `?edits=1` in the URL itself. */
	path: '/dev/instructor-tools?tool=teams&edits=1',
	label: 'Teams edited by hand: drag a student between teams, Move to, and add a latecomer',
	prepare: [
		{
			click: '[data-testid="tool-teams"]',
			until: '() => !!document.querySelector("[data-testid=\'teams-panel\']")'
		},
		{
			waitFor:
				'() => document.querySelectorAll("[data-testid=\'team-set\']").length >= 2 && !!document.querySelector("[data-testid=\'team-unteamed\']")'
		},
		{
			/* WHAT IS OFFERED BEFORE ANYTHING MOVES, taken before the moves
			   change the counts. */
			evaluate: `() => {
				const set = document.querySelectorAll('[data-testid="team-set"]')[0];
				window.__teamBefore = {
					unteamed: [...set.querySelectorAll('[data-testid="team-unteamed-member"] .team-member-name')].map((n) => n.textContent.trim()),
					editedSets: document.querySelectorAll('[data-testid="team-edited"]').length
				};
				return 'unteamed in the posted draw: ' + window.__teamBefore.unteamed.join(', ') + '; edited draws: ' + window.__teamBefore.editedSets;
			}`
		},
		{ evaluate: DRAG_MEMBER },
		{ evaluate: MOVE_TO }
	],
	presence: [
		/* Both draws, with their move controls. */
		{ selector: '[data-testid="team-set"]', label: 'the two saved draws', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="team-move-hint"]', label: 'the one-line how-to, once per draw', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="team-move-unavailable"]', label: 'the no-database sentence (the database has the move here)', expectPresent: 0 },
		{ selector: '[data-testid="team-rename"]', label: 'a Rename on every team (3 + 2)', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		/* After the drag and the Move to, BOTH draws say they were edited: the
		   unposted one was already, the posted one is now. */
		{ selector: '[data-testid="team-edited"]', label: 'Edited by hand, on both draws after the moves', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="team-unteamed"]', label: 'a Not on a team yet card on each draw', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="team-add"]', label: 'Add to, one per student on no team', expectPresent: 5, expectVisible: 5 }
	],
	tapTargets: [
		{ selector: '[data-testid="team-grip"]', label: 'the Drag grip', min: 44 },
		{ selector: '[data-testid="team-move"]', label: 'Move to', min: 44 },
		{ selector: '[data-testid="team-add"]', label: 'Add to', min: 44 },
		{ selector: '[data-testid="team-rename"]', label: 'Rename', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="team-move-hint"]', label: 'the how-to line', min: 4.5 },
		{ selector: '[data-testid="team-edited"]', label: 'Edited by hand', min: 4.5 },
		{ selector: '[data-testid="team-edit-note"]', label: 'the moved-in-words line', min: 4.5 },
		{ selector: '.team-card:not(.has-style) .team-member-name', label: 'a name on an unstyled card', min: 4.5 },
		{ selector: '.team-card:not(.has-style) .team-grip-word', label: 'the Drag word', min: 4.5 },
		{ selector: '.team-card:not(.has-style) .team-move', label: 'Move to', min: 4.5 }
	],
	orderResult: [
		{
			label: 'the one student on no team is listed, and not the teacher or the deactivated student',
			evaluate: `() => {
				const b = window.__teamBefore || { unteamed: [] };
				return [String(b.unteamed.length), String(b.editedSets)];
			}`,
			expected: ['1', '1']
		},
		{
			label: 'a drag onto another team card moves the student there, lights the card while over it, and says so',
			evaluate: `() => {
				const d = window.__teamDrag || {};
				return [
					'midActive=' + d.midActive,
					'onTarget=' + d.onTarget,
					'offSource=' + d.offSource,
					'noteNamesThem=' + (!!d.who && (d.note || '').startsWith('Moved ' + d.who + ' to ')),
					'editedNow=' + d.edited,
					'zonesClearedAfter=' + (d.activeAfter === 0)
				];
			}`,
			expected: ['midActive=true', 'onTarget=true', 'offSource=true', 'noteNamesThem=true', 'editedNow=true', 'zonesClearedAfter=true']
		},
		{
			label: 'Move to moves a student without a pointer, and its label names the student',
			evaluate: `() => {
				const m = window.__teamMoveTo || {};
				return [
					'landed=' + m.landed,
					'noteNamesThem=' + (!!m.who && (m.note || '').startsWith('Moved ' + m.who + ' to ')),
					'labelNamesThem=' + (!!m.who && (m.label || '').includes(m.who))
				];
			}`,
			expected: ['landed=true', 'noteNamesThem=true', 'labelNamesThem=true']
		}
	]
};
