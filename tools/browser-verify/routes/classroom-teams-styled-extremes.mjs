/**
 * A STUDENT-CHOSEN TEAM BACKGROUND IS A WASH, AND THE WORDS ON IT CLEAR 4.5:1
 * WHATEVER WAS PICKED (ledger 0360, report R17). The class page's team card
 * used to paint the students' colour at FULL strength under the name with
 * `bannerInk`'s light-or-dark ink, which bottoms out at 1.90:1 on a mid olive
 * (#a5b478). It is a 0.22 wash over the card's own ground now, with the room's
 * `--text-1` on top. This route seeds the three backgrounds the wash has to
 * survive -- that olive, black to white, and white -- with badges.
 *
 * THE CONTRAST CHECK CANNOT SEE A `::before` WASH (CLAUDE.md), so the probe
 * composites it: the wash layer's computed colour (every gradient stop, never
 * a mean) at its computed opacity over the card's own computed ground, scored
 * against each ink on it -- the name, the motto, the members and the badge --
 * and it reports how many pairs it examined, so a probe that found nothing
 * cannot report a perfect score. Without the wash this same fixture reads
 * 1.90:1 on the olive card, which is the negative control.
 */
import { CLASS_LIST, IGNORE, READY } from './_classroom-teams.mjs';

/** The washed-ground probe, shared by the customize specs. */
export const WASH_PROBE =
	'() => { const par = (c) => { const m = String(c).match(/[\\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; }; const lum = (p) => { const f = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]); }; const ratio = (a, b) => { const x = lum(a), y = lum(b); const hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); }; const over = (fg, bg, a) => fg.map((v, i) => v * a + bg[i] * (1 - a)); const groundOf = (el) => { let n = el; while (n && n !== document.documentElement) { const bg = getComputedStyle(n).backgroundColor; const c = par(bg); const al = String(bg).match(/[\\d.]+/g); if (c && (!al || al.length < 4 || Number(al[3]) > 0.9)) return c; n = n.parentElement; } return [0, 0, 0]; }; const cards = [...document.querySelectorAll(".ct-card.has-bg")]; if (!cards.length) return ["NO WASHED TEAM CARDS FOUND: the probe examined nothing"]; let worst = 99, worstWhat = "", n = 0; for (const card of cards) { const pre = getComputedStyle(card, "::before"); const a = Number(pre.opacity); const img = pre.backgroundImage; const stops = []; if (img && img !== "none") { for (const m of img.matchAll(/rgba?\\([^)]+\\)/g)) stops.push(par(m[0])); } const solid = par(pre.backgroundColor); if (!stops.length && solid && !/rgba\\(0, 0, 0, 0\\)/.test(pre.backgroundColor)) stops.push(solid); if (!stops.length) continue; const under = groundOf(card); for (const sel of [".ct-name-text", ".ct-tagline", ".ct-members li", ".ct-badge"]) { for (const t of card.querySelectorAll(sel)) { const ink = par(getComputedStyle(t).color); if (!ink) continue; for (const st of stops) { n++; const ground = over(st, under, a); const r = ratio(ink, ground); if (r < worst) { worst = r; worstWhat = sel + " on rgb(" + ground.map(Math.round).join(",") + ")"; } } } } } return ["examined " + n + " ink/stop pairs across " + cards.length + " washed cards", worst >= 4.5 ? "PASSES 4.5" : "FAILS 4.5: worst " + worst.toFixed(2) + ":1 at " + worstWhat, "worst " + worst.toFixed(2) + ":1"]; }';

export const OPEN_BOARD = {
	click: '[data-testid="class-teams-board"]',
	until: '() => document.querySelector(\'[data-testid="class-teams-board"]\')?.getAttribute("aria-expanded") === "true"'
};

export default {
	path: '/dev/classroom-teams?styled=extremes',
	label: 'Team cards on the class page with the three hardest backgrounds a student can pick: the colour is a wash and every word on it clears 4.5:1',
	prepare: [{ waitFor: READY, timeoutMs: 20000 }, OPEN_BOARD],
	orderResult: [
		{
			label: 'every ink on every washed card, every gradient stop, composited over the real ground',
			evaluate: WASH_PROBE,
			// The own card (black to white) and its board card, the olive card and
			// the white card: four washed cards, each with a name, a badge and
			// three members, three carrying a motto; the gradient's two stops are
			// each scored. The worst figure is written down so a regression MOVES
			// it rather than merely staying above the floor (measured 2026-10-01).
			expected: ['examined 35 ink/stop pairs across 4 washed cards', 'PASSES 4.5', 'worst 6.69:1']
		}
	],
	presence: [
		{ selector: '.ct-card.has-bg', label: 'washed team cards (the own card, and three on the board)', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="class-team-badge"]', label: 'badges drawn beside team names', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="class-team-customize"]', label: 'no customize control with no style transport', expectPresent: 0 },
		CLASS_LIST
	],
	ignoreConsole: IGNORE
};
