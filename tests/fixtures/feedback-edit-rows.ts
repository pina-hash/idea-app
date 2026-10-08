// tests/fixtures/feedback-edit-rows.ts
//
// The rows the feedback-edit export golden was recorded over. Shared by the
// test and by nothing else; the golden beside it
// (`feedback-export-unedited-golden.json`) was generated mechanically from
// src/lib/feedback/console.ts AS IT STOOD BEFORE the edit readers existed
// (commit 5d9e2fae), so "an unedited report exports exactly as it did" is a
// comparison against the old code's own output rather than a belief about it.
// Seven rows, so the markdown groups by route; every field the export prints.

import type { FeedbackRow } from '../../src/lib/feedback/feedback';

export const EDIT_GOLDEN_STAMP = '2026-10-07T18:00:00.000Z';

export const EDIT_GOLDEN_ROWS: FeedbackRow[] = [
	{
		id: 'g1',
		app: 'classroom',
		context: '/classroom/[sectionId]',
		kind: 'bug',
		message: 'The Save button does nothing.\n### not a heading\n---',
		meta: {
			route: '/classroom/[sectionId]',
			path: '/classroom/abc',
			role: 'student',
			viewport: '375x812',
			userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
			build: { value: 'abc1234', source: 'commit', means: 'the git commit the deployment was built from' },
			surface: 'shell'
		},
		status: 'new',
		created_at: '2026-10-07T16:00:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'Stu Dent',
		submitter_email: 'stu@boscotech.net',
		anonymous: false,
		contact: null,
		tried: 'Reloaded twice.',
		screenshot_path: 'u1/shot.png',
		horizon: 'now'
	},
	{
		id: 'g2',
		app: 'portal',
		context: '/',
		kind: 'idea',
		message: 'A presentation engine.',
		meta: { route: '/', path: '/', horizon: 'long_term' },
		status: 'seen',
		created_at: '2026-10-06T16:00:00.000Z',
		reviewed_at: '2026-10-06T17:00:00.000Z',
		reviewed_by: 'apina@boscotech.edu',
		submitter_name: null,
		submitter_email: null,
		anonymous: true,
		contact: 'ask me in 4th',
		horizon: 'long_term'
	},
	{
		id: 'g3',
		app: 'portal',
		context: '/',
		kind: 'praise',
		message: 'Nice page.',
		meta: { route: '/', tried: 'Nothing, it worked.' },
		status: 'resolved',
		created_at: '2026-10-05T16:00:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'Oth Er',
		submitter_email: 'other@boscotech.net',
		anonymous: false
	},
	{
		id: 'g4',
		app: 'classroom',
		context: '/classroom/[sectionId]',
		kind: 'other',
		message: 'Hmm.',
		meta: { route: '/classroom/[sectionId]', section: 'eng1h-junior', status: 500, errorId: 'err-1' },
		status: 'new',
		created_at: '2026-10-04T16:00:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: null,
		submitter_email: null,
		anonymous: true,
		contact: null
	},
	{
		id: 'g5',
		app: 'classroom',
		context: '/classroom/[sectionId]',
		kind: 'bug',
		message: 'Second report from the class page.',
		meta: { route: '/classroom/[sectionId]' },
		status: 'spam',
		created_at: '2026-10-03T16:00:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'Stu Dent',
		submitter_email: 'stu@boscotech.net',
		anonymous: false
	},
	{
		id: 'g6',
		app: 'vanguard',
		context: 'vanguard',
		kind: 'bug',
		message: 'Wave 3 froze.',
		meta: { route: '/vanguard', initials: 'AB' },
		status: 'new',
		created_at: '2026-10-02T16:00:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'Stu Dent',
		submitter_email: 'stu@boscotech.net',
		anonymous: false
	},
	{
		id: 'g7',
		app: 'classroom',
		context: '/classroom/[sectionId]',
		kind: 'idea',
		message: 'Third one.',
		meta: { route: '/classroom/[sectionId]' },
		status: 'new',
		created_at: '2026-10-01T16:00:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: null,
		submitter_email: null,
		anonymous: true,
		contact: 'text me'
	}
];
