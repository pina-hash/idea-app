/**
 * A HOLD RUNNING DOWN, ON A CLIENT WHOSE BEATS ARE NOT LANDING.
 *
 * This is the other half of "a student whose hold lapsed must SEE that, not
 * discover it on a refused write". The terminal route
 * (`ideacad-team-role-editor-state-lost`) proves what happens AFTER; this one
 * proves the student is warned BEFORE, which is the half that gives them time
 * to do something about it.
 *
 * THE FIXTURE IS A DEAD NETWORK, AND THAT IS FORCED RATHER THAN CHOSEN. A live
 * client keeps its own hold alive -- the heartbeat lands, the window resets,
 * and the chip correctly never warns. The first version of this harness state
 * seeded an old beat and nothing else, and the chip read "Your part for 10 min
 * 00 s": the shipping controller had simply renewed it. So the beats THROW
 * here, which is the real case the warning exists for and the one where no
 * server answer is ever coming.
 *
 * WHAT THE COUNTDOWN PROVES THAT NOTHING ELSE CAN. `tests/dom/` asserts the
 * chip carries the `expiring` class at 60s and not at 300s, with the clock
 * handed in as a prop. What it cannot assert is that the number on screen is
 * the CONTROLLER'S OWN, ticking against the window the payload carried, with
 * every server answer failing -- which is the whole mechanism. That needs the
 * real controller, real timers and a real clock, and this is the only place
 * those three are together.
 *
 * AND THE STUDENT IS NOT LEFT WITHOUT A MOVE: Release and the other rows' Take
 * are still on screen, so a warning is something to act on rather than an
 * announcement.
 */
import { WIDTHS } from './_shared.mjs';

export default {
	path: '/dev/ideacad-team?role=editor&state=expiring',
	label: 'IdeaCAD team: a hold running down on a client whose heartbeats are not landing',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => typeof window.__ideacadTeamVerdicts === "function"' },
		{ waitFor: '() => document.querySelectorAll("[data-testid=\\"ideacad-part-row\\"]").length === 3' },
		{ waitFor: '() => !!document.querySelector("[data-testid=\\"ideacad-hold-clock\\"]")' }
	],
	orderResult: [
		{
			label: 'the countdown is the controller’s own, inside the warning fraction, with the hold still held',
			evaluate: `() => {
				const s = window.__ideacadTeamState();
				const chip = document.querySelector('[data-testid="ideacad-hold-clock"]');
				return [
					s && s.phase === 'idle' ? 'still held' : 'phase ' + (s && s.phase),
					/* THE NUMBER IS THE CONTROLLER'S AND IS RUNNING DOWN, not the
					   600 the window would read if a heartbeat had renewed it. */
					s && s.secondsLeft !== null && s.secondsLeft > 0 && s.secondsLeft < 150
						? 'inside the warning fraction'
						: 'secondsLeft ' + (s && s.secondsLeft),
					chip && chip.className.includes('expiring') ? 'marked expiring' : 'NOT marked expiring',
					/* AND A DEAD BEAT IS NOT A LOST HOLD: nothing was decided, so
					   no terminal notice has been raised. */
					document.querySelector('.notice.terminal') ? 'WRONGLY terminal' : 'not terminal'
				];
			}`,
			expected: ['still held', 'inside the warning fraction', 'marked expiring', 'not terminal']
		},
		{
			label: 'nothing runs off the window and every control is inside its panel',
			evaluate: '() => window.__ideacadTeamVerdicts()',
			expected: [
				'the parts list is on screen ok',
				'every part has a row ok',
				'nothing is wider than the window ok',
				'every control sits inside the panel that owns it ok',
				'every sharing control sits inside the sharing panel ok'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="ideacad-hold-clock"]', label: 'the hold countdown', expectPresent: 1, expectVisible: 1 },
		/* THE STUDENT STILL HAS A MOVE. A warning with nothing to press is an
		   announcement; Release on the held row and Take on the two free ones are
		   what make it actionable. */
		{ selector: '.act.release', label: 'Release, on the part running down', expectPresent: 1, expectVisible: 1 },
		{ selector: '.act.claim', label: 'Take this part, on the free rows', expectPresent: 2, expectVisible: 2 },
		{ selector: '.notice.terminal', label: 'a terminal notice, which a dead beat must NOT produce', expectPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="ideacad-hold-clock"]',
			label: 'the chip says what the time is FOR, in words beside the number',
			must: ['Your part for'],
			mustNot: ['undefined', 'NaN', 'null', '-']
		}
	],
	contrast: [
		/* THE EXPIRING CHIP IS THE ONE MARK ON THIS PANEL THAT IS A WARNING
		   rather than a label, so it is `--copper` rather than the ordinary ink
		   and has to clear 4.5:1 on the panel ground like any other text. */
		{ selector: '[data-testid="ideacad-hold-clock"]', label: 'the expiring countdown chip', min: 4.5 },
		{ selector: '.act.release', label: 'Release', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.act.release', label: 'Release, the move a warned student has' },
		{ selector: '.act.claim', label: 'Take this part' }
	]
};
