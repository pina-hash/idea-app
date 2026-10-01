/**
 * THE NEGATIVE CONTROL FOR THE WASH PROBE (ledger 0360, report R17). The same
 * three hard backgrounds as classroom-teams-styled-extremes.mjs, with the wash
 * forced to FULL strength (`opacity: 1`) by an injected rule -- the shape the
 * team card had before this bundle, painted under the room's own ink. The probe
 * must FAIL here, and name the card it fails on (measured 2026-10-01: 1.21:1,
 * the room's light ink on the white card, against 7.74:1 washed): a probe that passed this
 * would be a probe that cannot see the defect it exists for.
 */
import { IGNORE, READY } from './_classroom-teams.mjs';
import { OPEN_BOARD, WASH_PROBE } from './classroom-teams-styled-extremes.mjs';

export default {
	path: '/dev/classroom-teams?styled=extremes&control=full',
	label: 'NEGATIVE CONTROL: the team colours at full strength under the text fail the same probe',
	prepare: [
		{ waitFor: READY, timeoutMs: 20000 },
		OPEN_BOARD,
		{
			evaluate: `() => { const s = document.createElement('style'); s.textContent = '.ct-card.has-bg::before { opacity: 1 !important; }'; document.head.appendChild(s); return getComputedStyle(document.querySelector('.ct-card.has-bg'), '::before').opacity; }`,
			until: `() => getComputedStyle(document.querySelector('.ct-card.has-bg'), '::before').opacity === '1'`
		}
	],
	orderResult: [{ label: 'the probe reports the full-strength colours as a failure', evaluate: WASH_PROBE, expected: ['examined 35 ink/stop pairs across 4 washed cards', 'FAILS 4.5: worst 1.21:1 at .ct-name-text on rgb(255,255,255)', 'worst 1.21:1'] }],
	ignoreConsole: IGNORE
};
