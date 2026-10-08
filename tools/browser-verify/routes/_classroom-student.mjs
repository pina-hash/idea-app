/**
 * ONE STUDENT'S PAGE (the 2026-10-07 round): what every state of
 * /dev/classroom-student shares. The harness mounts the REAL ClassroomShell and
 * the REAL StudentOverview over a page the real `buildStudentPage` built from
 * fixture reads that carry classmates (in the notebook grid and the team board),
 * so a projection that leaked one would show it here.
 */
import { FORCE_THEME } from './_hover-ink.mjs';

export const STUDENT = '/dev/classroom-student';
export const STUDENT_READY = {
	waitFor: `() => !!(document.querySelector('.cr-root[data-ready="true"]') && document.querySelector('[data-testid="student-overview"]'))`,
	timeoutMs: 30_000
};
/** Every classmate the fixture's whole-class reads carry. None may be on the page. */
export const CLASSMATE_TEXT = `() => {
	const text = document.body.innerText;
	return ['Ben Cho', 'Cara Diaz', 'Dev Patel', 'ben.cho@', 'cara.diaz@', 'dev.patel@'].filter((n) => text.includes(n));
}`;
export const SECTIONS = ['so-identity', 'so-glance', 'so-assignments', 'so-notebook', 'so-activity', 'so-hall-passes', 'so-teams', 'so-coins'];

/**
 * The full page under one site theme, forced the way every classroom harness
 * forces it (the harness holds no session, so the stored theme never applies
 * on its own). Contrast on every kind of text the page draws, and the chips.
 */
export const studentThemeSpec = (theme) => {
	return {
		path: `${STUDENT}?theme=${theme}`,
		aliasOf: STUDENT,
		label: `One student's page under the ${theme} theme`,
		prepare: [STUDENT_READY, { ...FORCE_THEME(theme), waitMs: 300 }],
		orderResult: [
			{
				label: `the page is on ${theme}`,
				evaluate: `() => [document.documentElement.getAttribute('data-theme') ?? 'idea']`,
				expected: [theme]
			},
			{ label: 'no classmate is named anywhere on the page', evaluate: CLASSMATE_TEXT, expected: [] }
		],
		contrast: [
			{ selector: '.so-name', label: 'student name', min: 4.5 },
			{ selector: '[data-testid="so-status"]', label: 'status chips', min: 4.5 },
			{ selector: '[data-testid="so-status"][data-missing="true"]', label: 'missing chips', min: 4.5 },
			{ selector: '.so-table td', label: 'table cells', min: 4.5 },
			{ selector: '.so-table thead th', label: 'table headings', min: 4.5 },
			{ selector: '[data-testid="so-coverage"]', label: 'coverage sentence', min: 4.5 },
			{ selector: '.so-tile-label', label: 'tile labels', min: 4.5 },
			{ selector: '.so-tile-sub', label: 'tile lines', min: 4.5 },
			{ selector: '.so-meta', label: 'meta lines', min: 4.5 },
			{ selector: '.so-link', label: 'links', min: 4.5 },
			{ selector: '.so-late', label: 'late word', min: 4.5 },
			{ selector: '[data-testid="so-roster-chip"]', label: 'roster chip', min: 4.5 },
			{ selector: '.so-print-toggle', label: 'include-when-printing words', min: 4.5 },
			{ selector: '[data-testid="coin-row"] .reason', label: 'coin row reasons', min: 4.5 }
		]
	};
};
