import { IGNORE_FIXTURE_PHOTO } from './_quick-note.mjs';

/**
 * THE NOTEBOOK INBOX (ledger 0298, R33): the viewer's drafts that answer no
 * check-in, newest first, each with a one-press way to file it -- and the
 * press itself, driven.
 *
 * THE FIXTURE, in the harness's one in-memory notebook:
 *   e-free   a note-only draft in no class          -> listed, fileable
 *   e-photo  a draft with a photo, in ENG1H         -> listed, NOT fileable (says why)
 *   e-done   a turned-in entry                      -> never listed
 * ENG1H has a check-in dated today; IDEA209H has none, so the no-class draft is
 * offered "the check-in" for one class and "the class" for the other.
 *
 * THE PRESS writes the note again as a draft ON the check-in, then deletes the
 * Inbox copy -- in that order, read off the transport log -- and the Inbox is
 * left holding one row, with the acknowledgement above it (the filed row is
 * gone, so the note cannot live on it).
 */
export default {
	path: '/dev/quick-note?view=inbox',
	label: 'Notebook Inbox: unfiled drafts listed newest first, one press files a draft to its check-in',
	ignoreConsole: IGNORE_FIXTURE_PHOTO,
	prepare: [
		{
			waitFor: '() => document.querySelectorAll("[data-testid=\\"nb-inbox-row\\"]").length === 2',
			timeoutMs: 20000
		},
		{
			evaluate: `() => [...document.querySelectorAll('[data-testid="nb-inbox-row"]')].map((r) => r.dataset.entryId + ':' + [...r.querySelectorAll('[data-testid="nb-inbox-file"]')].map((b) => b.textContent.trim()).join(' | ')).join(' || ')`
		},
		{
			click: '[data-testid="nb-inbox-row"][data-entry-id="e-free"] [data-testid="nb-inbox-file"]',
			until: '() => !!document.querySelector("[data-testid=\\"nb-inbox-filed\\"]")',
			attempts: 12,
			waitMs: 250
		}
	],
	presence: [
		{ selector: '[data-testid="nb-inbox"]', label: 'the Inbox, open from the URL', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="nb-inbox-row"]', label: 'one draft left after filing (the photo draft)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="nb-inbox-row"][data-entry-id="e-done"]', label: 'a turned-in entry is never in the Inbox', expectPresent: 0 },
		{ selector: '[data-testid="nb-inbox-row"][data-entry-id="e-free"]', label: 'the filed draft has left the Inbox', expectPresent: 0 },
		{ selector: '[data-testid="nb-inbox-blocked"]', label: 'the photo draft says why it cannot be moved', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="nb-inbox-filed"]', label: 'the acknowledgement, above the list', expectPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="nb-inbox-filed"]', label: 'says what was filed, where, and that it is still a draft', must: ['Gusset plate', 'Bridge sketch check-in', 'still a draft'] },
		{ selector: '[data-testid="nb-inbox-toggle"]', label: 'the pane head names the way back to the feed', must: ['All entries'] }
	],
	contrast: [
		{ selector: '[data-testid="nb-inbox-filed"]', label: 'the filed acknowledgement', min: 4.5 },
		{ selector: '[data-testid="nb-inbox-blocked"]', label: 'the blocked reason', min: 4.5 },
		{ selector: '.ib-meta', label: 'a row\'s class and date', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="nb-inbox-toggle"]', label: 'the Inbox toggle', min: 44 },
		{ selector: '.ib-title', label: 'a row title (opens the draft)', min: 44 },
		{ selector: '[data-testid="nb-inbox-filed"] .ib-link', label: 'Open it', min: 44 }
	],
	orderResult: [
		{
			label: 'filing wrote the note again as a draft on the check-in, THEN deleted the Inbox copy',
			evaluate: `() => [...document.querySelectorAll('[data-testid="qn-log"] li')].map((li) => li.textContent.trim())`,
			expected: [
				'POST /api/notebook/note section_id="s-1" session_id="ses-1" custom_label=null submitted=false autosave=false',
				'RPC notebook_delete_entry p_entry_id="e-free"'
			]
		}
	]
};
