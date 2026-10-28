// tests/tournament-people-and-lengths.test.ts
//
// Ledger 0455, the client half of 0317: the host console's directory answer is
// read the way the database writes it, and a drawn bracket with nothing played
// sends only the match lengths. Pure modules; the database half is
// tests/db/tournament-bracket-seeded-0317.test.ts.

import { describe, expect, it } from 'vitest';
import { looksLikeEmail, parsePeople, peopleAnswerFrom, personDetail, searchable } from '../src/lib/tournaments/people';
import {
	bracketHasResult,
	draftFromStored,
	LENGTHS_ONLY_LOCK,
	settingsLocks,
	tournamentUpdateArgs
} from '../src/lib/tournaments/settings';

describe('the directory answer', () => {
	it('reads the 0317 shape and drops anything malformed', () => {
		const rows = parsePeople([
			{ email: 'LYIP.2030@boscotech.net', name: 'Lance Yip', role: 'student', in_tournament: true },
			{ email: 'reyes@boscotech.edu', name: '', role: 'teacher', in_tournament: false },
			{ name: 'No address' },
			'junk'
		]);
		expect(rows).toEqual([
			{ email: 'lyip.2030@boscotech.net', name: 'Lance Yip', role: 'student', inTournament: true },
			{ email: 'reyes@boscotech.edu', name: 'reyes', role: 'teacher', inTournament: false }
		]);
		expect(personDetail(rows[0])).toBe('Student · lyip.2030@boscotech.net · already entered');
	});

	it('a missing directory and a refusal are told apart by the code alone', () => {
		expect(peopleAnswerFrom(null, { code: 'PGRST202', message: 'x' })).toEqual({ ok: false, reason: 'unavailable' });
		expect(peopleAnswerFrom(null, { code: 'P0001', message: 'Only a tournament host or a site admin can search people.' })).toEqual({ ok: false, reason: 'refused' });
		expect(peopleAnswerFrom(null, { code: '57014', message: 'timeout' })).toEqual({ ok: false, reason: 'failed' });
	});

	it('two letters ask; a typed address goes through as typed', () => {
		expect(searchable('a')).toBe(false);
		expect(searchable('la')).toBe(true);
		expect(looksLikeEmail('lyip.2030@boscotech.net')).toBe(true);
		expect(looksLikeEmail('lance')).toBe(false);
	});
});

describe('a drawn bracket with nothing played', () => {
	const STORED = {
		name: 'Blade Rotation',
		description: '',
		config: { quals_enabled: true, score_entry: false, best_of_default: 3, best_of: { grand_final: 5 }, team_size: 4 }
	};
	const open = draftFromStored(STORED.name, STORED.description, STORED.config);

	it('a bye is not a result; a started match, a played one and a game are', () => {
		const bye = { status: 'complete', entry_a_id: 'a', entry_b_id: null };
		const pending = { status: 'pending', entry_a_id: 'a', entry_b_id: 'b' };
		expect(bracketHasResult([bye, pending], 0)).toBe(false);
		expect(bracketHasResult([bye, { ...pending, status: 'in_progress' }], 0)).toBe(true);
		expect(bracketHasResult([bye, { ...pending, status: 'complete' }], 0)).toBe(true);
		expect(bracketHasResult([bye, pending], 1)).toBe(true);
	});

	it('the lengths are sent; qualifying, scoring and team size hold whatever the draft says', () => {
		const locks = settingsLocks({ status: 'live', pools: 2, qualResults: 12, hasResult: false });
		expect(locks).toEqual({ format: null, quals: LENGTHS_ONLY_LOCK, score: LENGTHS_ONLY_LOCK, team: LENGTHS_ONLY_LOCK });
		const args = tournamentUpdateArgs(
			't1',
			STORED,
			{ ...open, bestOfDefault: 5, bestOfGrandFinal: 7, qualsEnabled: false, scoreEntry: true, teamSize: 6 },
			locks
		);
		expect(args.p_config).toMatchObject({ best_of_default: 5, best_of: { grand_final: 7 }, quals_enabled: true, score_entry: false, team_size: 4 });
	});

	it('after the first result the format is the old lock again (control)', () => {
		const locks = settingsLocks({ status: 'live', pools: 2, qualResults: 12, hasResult: true });
		expect(locks.format).toMatch(/format is locked/);
		expect(tournamentUpdateArgs('t1', STORED, { ...open, bestOfDefault: 5 }, locks).p_config).toBeNull();
		// A caller that does not say (every one before 0317) keeps the old lock.
		expect(settingsLocks({ status: 'live', pools: 0, qualResults: 0 }).format).not.toBeNull();
	});
});
