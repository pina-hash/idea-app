// tests/ideacad-solid-launch-wording.test.ts
//
// THE SENTENCES. Archive and trash must DIFFER and say what each one keeps;
// a confirm must NAME the document; the purge date is the row's own purgeAt
// rendered on the America/Los_Angeles calendar day (the instant chosen is 8pm
// Pacific, where the LA and UTC days disagree -- CLAUDE.md's instrument);
// and no user-facing string carries an em dash.
import { describe, expect, it } from 'vitest';
import * as W from '../src/lib/ideacad/solid/launch/wording';

describe('archive and delete are two decisions with two sentences', () => {
	it('the archive sentence says it keeps and lists; the trash sentence names the window and the way back; they differ', () => {
		expect(W.ARCHIVE_SENTENCE).toBe('Keeps the model readable and listed under Archived; restore any time.');
		expect(W.TRASH_SENTENCE).toBe('Goes to the trash for 30 days, then it is removed for good. Restore it from the trash before then.');
		expect(W.TRASH_WINDOW_DAYS).toBe(30);
		expect(W.ARCHIVE_SENTENCE).not.toBe(W.TRASH_SENTENCE);
		expect(W.LINKED_KEPT_SENTENCE).toBe('Assignment work is kept, never deleted; archive it instead.');
	});
	it('every confirm names the document', () => {
		expect(W.trashConfirm('Spur gear 24T')).toBe('Move "Spur gear 24T" to the trash?');
		expect(W.purgeConfirm('Spur gear 24T')).toBe('Remove "Spur gear 24T" for good?');
		expect(W.archiveConfirm('Spur gear 24T')).toBe('Archive "Spur gear 24T"?');
		expect(W.unarchiveConfirm('Spur gear 24T')).toBe('Restore "Spur gear 24T" from the archive?');
		expect(W.folderDeleteConfirm('Gears', 1)).toBe('Delete the folder "Gears"? 1 model is unfiled, not deleted.');
		expect(W.folderDeleteConfirm('Gears', 3)).toBe('Delete the folder "Gears"? 3 models are unfiled, not deleted.');
		expect(W.FOLDER_DELETE_SENTENCE).toContain('nothing is deleted');
	});
	it('the storage sentence names the missing update and says models still open', () => {
		expect(W.STORAGE_UNAVAILABLE).toContain('not available until the storage update is applied');
	});
});

describe('the purge date comes from purgeAt, on the Los Angeles calendar day', () => {
	it('8pm Pacific is still the same LA day while UTC has moved on', () => {
		expect(W.formatDay('2026-10-22T03:00:00.000Z')).toBe('Oct 21, 2026');
		expect(W.purgeSentence('2026-10-22T03:00:00.000Z')).toBe('Removed for good on Oct 21, 2026');
		expect(W.purgeSentence('not a date')).toBe('Removed for good on an unknown day');
	});
	it('days left rounds up and never goes negative; the window is read off the receipt, not the mirror', () => {
		const now = new Date('2026-09-21T17:30:00.000Z');
		expect(W.daysUntil('2026-10-19T17:30:00.000Z', now)).toBe(28);
		expect(W.daysUntil('2026-09-22T01:00:00.000Z', now)).toBe(1);
		expect(W.daysUntil('2026-09-01T00:00:00.000Z', now)).toBe(0);
		expect(W.trashWindowDays('2026-09-21T17:30:00.000Z', '2026-10-21T17:30:00.000Z')).toBe(30);
		expect(W.trashWindowDays('2026-09-21T17:30:00.000Z', '2026-10-05T17:30:00.000Z')).toBe(14);
		expect(W.trashedSentence('Spur gear 24T', '2026-10-22T03:00:00.000Z')).toBe('"Spur gear 24T" is in the trash. Removed for good on Oct 21, 2026.');
	});
});

describe('the small sentences', () => {
	it('copyTitle mirrors left(\'Copy of \' || title, 120)', () => {
		expect(W.copyTitle('Spur gear')).toBe('Copy of Spur gear');
		expect(W.copyTitle('x'.repeat(200))).toHaveLength(120);
	});
	it('editedSentence steps from just now to a day', () => {
		const now = new Date('2026-09-21T17:30:00.000Z');
		expect(W.editedSentence('2026-09-21T17:29:30.000Z', now)).toBe('Edited just now');
		expect(W.editedSentence('2026-09-21T17:25:00.000Z', now)).toBe('Edited 5 minutes ago');
		expect(W.editedSentence('2026-09-21T17:29:00.000Z', now)).toBe('Edited 1 minute ago');
		expect(W.editedSentence('2026-09-21T15:30:00.000Z', now)).toBe('Edited 2 hours ago');
		expect(W.editedSentence('2026-09-20T15:30:00.000Z', now)).toBe('Edited yesterday at 8:30 AM');
		expect(W.editedSentence('2026-09-18T17:30:00.000Z', now)).toBe('Edited 3 days ago');
		expect(W.editedSentence('2026-09-03T17:30:00.000Z', now)).toBe('Edited Sep 3, 2026');
		expect(W.editedSentence('garbage', now)).toBe('Edited on an unknown day');
	});
	it('countsSentence pluralises both halves', () => {
		expect(W.countsSentence(1, 1)).toBe('1 feature, 1 body');
		expect(W.countsSentence(0, 2)).toBe('0 features, 2 bodies');
	});
	it('no exported sentence carries an em dash, checked against a planted control', () => {
		const strings = Object.values(W as Record<string, unknown>).filter((v): v is string => typeof v === 'string');
		expect(strings.length).toBeGreaterThan(10);
		expect(strings.filter((s) => s.includes('—'))).toEqual([]);
		expect('a — b'.includes('—')).toBe(true);
	});
});
