// tests/commit-subject.test.ts
//
// LEDGER 0458, REPORT fb08d358: a commit's first line is a title. The rule
// refuses a long or joined line, and a joined line already landed shows on the
// update list as its first clause with the rest as its details.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { SUBJECT_MAX, splitJoinedSubject, subjectProblems } from '$lib/commit-subject';
import { FIELD, REC, parseGitLog, withDetails } from '$lib/site-versions';

const JOINED =
	'Rotation 2 Survey and Blade pages saved with the site - The Rotation 2 Survey and IDEA-Blade 02 sources are in the repository - Covers the plan days';

describe('the first-line rule', () => {
	it('passes an ordinary title, a short one with a dash in it, and refuses a long or joined one', () => {
		expect(subjectProblems('One title and one progress bar on page-by-page assignments')).toEqual([]);
		expect(subjectProblems('x'.repeat(SUBJECT_MAX))).toEqual([]);
		expect(subjectProblems('x'.repeat(SUBJECT_MAX + 1))).toHaveLength(1);
		expect(subjectProblems('Drive Team Playbook - re-tuned')).toHaveLength(1);
		expect(subjectProblems(JOINED)).toHaveLength(2);
	});

	it('splits only a joined line over the limit', () => {
		expect(splitJoinedSubject('Drive Team Playbook - re-tuned')).toEqual({ title: 'Drive Team Playbook - re-tuned', details: [] });
		expect(splitJoinedSubject(JOINED)).toEqual({
			title: 'Rotation 2 Survey and Blade pages saved with the site',
			details: ['The Rotation 2 Survey and IDEA-Blade 02 sources are in the repository', 'Covers the plan days']
		});
	});

	it('the update list shows a landed joined line as its title and bullets, and body bullets follow them', () => {
		const raw = REC + ['abc1234', 'Oct 28, 2026', '2026-10-28T10:00:00-07:00', JOINED].join(FIELD) + '\nsrc/lib/x.ts\n';
		const [entry] = parseGitLog(raw, { complete: true });
		expect(entry.note).toBe('Rotation 2 Survey and Blade pages saved with the site');
		expect(entry.details).toEqual(['The Rotation 2 Survey and IDEA-Blade 02 sources are in the repository', 'Covers the plan days']);
		const [withBody] = withDetails([entry], new Map([['abc1234', ['A body bullet']]]));
		expect(withBody.details).toEqual([...entry.details!, 'A body bullet']);
	});

	it('the CI check names a bad line and passes a good one', () => {
		const run = (s: string) => {
			try {
				execFileSync(process.execPath, ['tools/commit-subjects.mjs', '--subject', s], { encoding: 'utf8' });
				return 0;
			} catch (e) {
				return (e as { status: number }).status;
			}
		};
		expect(run('A plain title')).toBe(0);
		expect(run(JOINED)).toBe(1);
	});
});
