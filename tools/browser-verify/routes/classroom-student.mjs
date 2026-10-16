/**
 * ONE STUDENT'S PAGE, EVERY SECTION FULL (the 2026-10-07 round, reports
 * 792eb6b1 and 63fb1c49): the identity block, the tiles, the assignments table
 * with the presence coverage sentence under it, then the notebook, activity,
 * hall passes, teams, coins and models in columns. Asserted: every section is
 * there, every status says its own word (Missing, Complete late, Not opened),
 * no classmate's name or address is anywhere on the page (the fixture's grid
 * and team board carry three), the table never pushes the page sideways, and
 * the controls clear 44px.
 */
import { CLASSMATE_TEXT, SECTIONS, STUDENT, STUDENT_READY } from './_classroom-student.mjs';

export default {
	path: STUDENT,
	label: "One student's page in one class, every section full (manager view)",
	prepare: [STUDENT_READY],
	presence: [
		...SECTIONS.map((id) => ({ selector: `[data-testid="${id}"]`, label: id, expectPresent: 1, maxPresent: 1, expectVisible: 1 })),
		{ selector: '[data-testid="so-models"]', label: 'models and apps', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="section-tab-people"][aria-current="page"]', label: 'People tab, current', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="so-assignment-row"]', label: 'assignment rows', expectPresent: 7, maxPresent: 7, expectVisible: 7 },
		{ selector: '[data-testid="so-hall-pass"]', label: 'hall pass rows', expectPresent: 6, maxPresent: 6 },
		{ selector: '[data-testid="coin-row"]', label: 'coin rows (the payout pair collapsed to one)', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="so-team"]', label: 'teams', expectPresent: 2, maxPresent: 2 },
		{ selector: '[data-testid="so-check-in"]', label: 'check-ins', expectPresent: 5, maxPresent: 5 },
		{ selector: '[data-testid="so-notebook-link"]', label: 'full notebook link (active student)', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="so-notebook-closed"]', label: 'no closed-notebook sentence for an active student', expectPresent: 0 },
		{ selector: '[data-testid="so-print-toggle"]', label: 'an include-when-printing box per section (work pictures, needs attention and scores joined in ledger 0392)', expectPresent: 10, maxPresent: 10 },
		{ selector: '[data-testid="so-slideshow"]', label: 'the slideshow of their work beside their name', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="so-grade"]', label: 'the grade, in the hero', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="so-upcoming-row"]', label: 'coming up: the one live assignment still to do with a date ahead', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="so-attention-row"]', label: 'missing and late work, named', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="so-score-bar"]', label: 'one bar per returned, scored assignment', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="so-coverage"]', label: 'the coverage sentence, once', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [
		{
			// NEWEST DUE FIRST BY DEFAULT (ledger 0392, Mr. Pina: "due date descending should be default").
			label: 'each status in the order the table lists them',
			evaluate: `() => [...document.querySelectorAll('[data-testid="so-status"]')].map((c) => c.textContent.replace(/\\s+/g, ' ').trim())`,
			expected: ['Not started', 'Submitted', 'Missing, draft saved', 'Complete, late', 'Returned · 18/20', 'Missing', 'Returned · 9/20']
		},
		{
			label: 'Not opened is printed only where presence answered and nothing of theirs is here',
			evaluate: `() => [...document.querySelectorAll('[data-testid="so-not-opened"]')].map((n) => n.closest('tr').dataset.item)`,
			expected: ['a-safety']
		},
		{ label: 'no classmate is named anywhere on the page', evaluate: CLASSMATE_TEXT, expected: [] },
		{
			label: 'the team rows give a name and a size, never a member',
			evaluate: `() => [...document.querySelectorAll('[data-testid="so-team"] .so-list-main')].map((n) => n.textContent.replace(/\\s+/g, ' ').trim())`,
			expected: ['Gearbox build teams: The Gearheads, a team of 3', 'Lab partners: Team 1, a team of 2']
		},
		{ label: 'no horizontal page scroll', evaluate: `() => [document.documentElement.scrollWidth - document.documentElement.clientWidth <= 0]`, expected: [true] },
		{
			/* PANELS OF UNEQUAL HEIGHT GO IN COLUMNS (CLAUDE.md): two on a desktop,
			   one on a phone, read off where each card actually sits. The answer
			   names the count it found when it is wrong. */
			label: 'the panels under the table: two columns from 1024px, one below',
			evaluate: `() => {
				const lefts = new Set([...document.querySelectorAll('.so-panels > .so-card')].map((c) => Math.round(c.getBoundingClientRect().left)));
				const want = window.innerWidth >= 1024 ? 2 : 1;
				return [lefts.size === want ? 'as expected' : lefts.size + ' column(s) at ' + window.innerWidth + 'px'];
			}`,
			expected: ['as expected']
		},
		{
			/* The table is a table where its card has room and labelled blocks where
			   it does not (a container query at 46rem of the card). */
			label: 'the assignments are a table on a desktop and stacked blocks on a phone',
			evaluate: `() => {
				const d = getComputedStyle(document.querySelector('.so-table')).display;
				const want = window.innerWidth >= 1024 ? 'table' : 'block';
				return [d === want ? 'as expected' : 'display ' + d + ' at ' + window.innerWidth + 'px'];
			}`,
			expected: ['as expected']
		}
	],
	textContains: [
		{ selector: '[data-testid="so-coverage"]', label: 'the coverage sentence names the retention window', must: ['only the last 90 days', 'never evidence a student did nothing'] },
		{ selector: '[data-testid="so-glance"]', label: 'tiles say words', must: ['4 of 7', 'Missing', 'Past due with nothing turned in'] },
		{ selector: '[data-testid="so-upcoming"]', label: 'coming up names it and its due date', must: ['Coming up', 'CAD sketch of the bracket', 'Due Oct 14'] },
		{ selector: '[data-testid="so-grade"]', label: 'the grade is points on returned work, said so in words', must: ['67.5%', '27 of 40 points on 2 returned assignments', 'FACTS weighs categories'] }
	],
	contrast: [
		{ selector: '.so-grade-figure, .so-grade-sub, .so-grade-note, .so-grade-label', label: 'the grade and its words', min: 4.5 },
		{ selector: '.so-upcoming-title, .so-upcoming .so-meta', label: 'coming up, its title and date', min: 4.5 },
		{ selector: '.so-bar-title, .so-bar-figure', label: 'score bar words', min: 4.5 },
		{ selector: '.sws-count, .sws-key', label: 'slideshow count and keys', min: 4.5 },
		{ selector: '.sws-caption .sws-title, .sws-caption .sws-when, .sws-caption .sws-source', label: 'slideshow caption on its own band', min: 4.5 },
		{ selector: '[data-testid="so-status"]', label: 'status chips', min: 4.5 },
		{ selector: '.so-table td', label: 'table cells', min: 4.5 },
		{ selector: '.so-table thead th', label: 'table headings', min: 4.5 },
		{ selector: '[data-testid="so-coverage"]', label: 'coverage sentence', min: 4.5 },
		{ selector: '.so-tile-label', label: 'tile labels', min: 4.5 },
		{ selector: '.so-tile-figure', label: 'tile figures', min: 4.5 },
		{ selector: '.so-meta', label: 'meta lines', min: 4.5 },
		{ selector: '.so-word', label: 'check-in words', min: 4.5 },
		{ selector: '.so-name', label: 'student name', min: 4.5 },
		{ selector: '[data-testid="so-status"][data-missing="true"]', label: 'missing chips', min: 4.5 },
		{ selector: '.so-link', label: 'links', min: 4.5 },
		{ selector: '.so-late', label: 'late word', min: 4.5 },
		{ selector: '[data-testid="so-roster-chip"]', label: 'roster chip', min: 4.5 },
		{ selector: '.so-print-toggle', label: 'include-when-printing words', min: 4.5 },
		{ selector: '[data-testid="coin-row"] .reason', label: 'coin row reasons', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="so-print"]', label: 'Print', min: 44 },
		{ selector: '.so-upcoming-title', label: 'a coming-up link', min: 44 },
		{ selector: '[data-testid="so-slide-prev"], [data-testid="so-slide-next"], [data-testid="so-slide-play"]', label: 'slideshow Previous, Next and Pause', min: 44 },
		{ selector: '.so-identity .so-actions a', label: 'Back to People and Open full notebook', min: 44 },
		{ selector: '.so-print-toggle', label: 'Include when printing', min: 44 },
		{ selector: '.so-col-title .so-link', label: 'assignment links', min: 44 },
		{ selector: '[data-testid="so-material"] .so-link', label: 'handout links', min: 44 },
		{ selector: '[data-testid="so-models"] .so-link', label: 'Foundry links', min: 44 }
	]
};
