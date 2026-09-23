/**
 * THE ANALYSIS PANEL WITH EVERY DISCLOSURE OPEN. Ledger 0296.
 *
 * The spinner state (`?state=spinner`: the add-on on, the weapon's bore
 * selected) with every Formulas disclosure and the More clearances list
 * pressed open by real clicks. It measures what the closed specs cannot: the
 * formula lines and their two source links (44px each), the eight further
 * clearance rows, and that none of it runs past the 260px column or covers
 * another control. The query's `view=open` is read by nobody; the clicks are
 * what open the panels.
 */
export default {
	path: '/dev/ideacad-analysis?state=spinner&view=open',
	label: 'IdeaCAD analysis: every formula and every clearance open',
	prepare: [
		{ waitFor: '() => document.querySelector("main")?.dataset.ready === "true" && !!document.querySelector(\'[data-testid="ideacad-analysis-more-clearances"]\')', waitMs: 300 },
		{ evaluate: '() => { const closed = [...document.querySelectorAll(\'[data-testid="ideacad-analysis-panel"] .disc-trigger[aria-expanded="false"]\')]; closed.forEach((b) => b.click()); return closed.length; }', waitMs: 300 },
		{ waitFor: '() => document.querySelectorAll(\'[data-testid="ideacad-analysis-panel"] .disc-trigger[aria-expanded="true"]\').length === 6' }
	],
	presence: [
		{ selector: '[data-testid="ideacad-analysis-panel"] .disc-trigger[aria-expanded="true"]', label: 'six disclosures open (five Formulas, one More clearances)', expectPresent: 6, maxPresent: 6 },
		{ selector: '[data-testid="ideacad-analysis-spinner"] .formulas a[href^="https://"]', label: 'the two published sources, linked', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="ideacad-analysis-interference"] ul.pairs button', label: 'all fifteen pairs listed', expectPresent: 15, maxPresent: 15, expectVisible: 15 }
	],
	textContains: [
		{ selector: '[data-testid="ideacad-analysis-spinner"]', label: 'every spinner formula and both sources by name', must: ['E = ½·I·ω²', 'v = ω·r', 'bite = attack × 60 / (RPM × teeth)', 'kV = RPM / V', 'Ask Aaron', "Just 'Cuz Robotics"] },
		{ selector: '[data-testid="ideacad-analysis-balance"]', label: 'the balance formulas with their numbers', must: ['CG = Σ m·c / Σ m', 'θ = atan(d / h)', 'd = '] }
	],
	contrast: [
		{ selector: '[data-testid="ideacad-analysis-panel"] .formulas code', label: 'a formula', min: 4.5 },
		{ selector: '[data-testid="ideacad-analysis-panel"] .formulas span', label: 'a formula note', min: 4.5 },
		{ selector: '[data-testid="ideacad-analysis-panel"] .formulas a', label: 'a source link', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="ideacad-analysis-panel"] button, [data-testid="ideacad-analysis-panel"] select, [data-testid="ideacad-analysis-panel"] input, [data-testid="ideacad-analysis-panel"] a', label: 'every control and link, disclosures open', min: 44 }],
	layoutSanity: [{ root: '.panels', label: 'the panel column with every disclosure open', reserved: null }],
	ignoreConsole: []
};
