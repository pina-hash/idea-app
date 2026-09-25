// tests/tournament-settings.test.ts
//
// THE TOURNAMENT SETTINGS FORM'S PAYLOAD (ledger 0298, R02).
//
// WHY THIS IS AUTOMATED: every failure it guards is SILENT.
//   - `tournament_update` REPLACES the config wholesale (0062, 0192), so a
//     payload built from the form's fields alone would drop every per-round
//     `best_of` override the form has no control for. The save succeeds, the
//     page looks identical, and a round is quietly played at a different
//     length.
//   - Qualifying on/off is a UI-ONLY lock once pools exist: the RPC accepts
//     `quals_enabled: false` in seeding, and the pools are then orphaned
//     with nothing refusing. So the lock has to hold in the PAYLOAD, not just
//     on the checkbox.
//   - `/tournaments/new` now builds its call through the shared helper. If
//     that drifted from what the page used to send, a new tournament would be
//     created with a different config and nothing would say so.
//
// THE CREATE ORACLE IS THE OLD PAGE'S OWN LITERAL, copied from
// `src/routes/tournaments/new/+page.svelte` as it stood before the form was
// extracted (md5 90fdcd91c6f5c333563bda4f6988b859), so the expected value
// does not come from the code under test.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	buildConfig,
	draftFromStored,
	draftSignature,
	effectiveDraft,
	hiddenRoundOverrides,
	NEW_TOURNAMENT_DRAFT,
	OPEN_LOCKS,
	rebaseDraft,
	settingsChanges,
	settingsLocks,
	tournamentCreateArgs,
	tournamentUpdateArgs,
	validateSettings,
	type SettingsDraft
} from '../src/lib/tournaments/settings';
import type { TournamentStatus } from '../src/lib/tournaments/tournaments';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

/** The pre-extraction create page's payload, verbatim in shape. */
function oldCreatePayload(v: {
	name: string;
	description: string;
	qualsEnabled: boolean;
	scoreEntry: boolean;
	bestOfDefault: number;
	bestOfGrandFinal: number;
	teamSize: number;
}) {
	const best_of: Record<string, number> = {};
	if (v.bestOfGrandFinal > 0) best_of.grand_final = v.bestOfGrandFinal;
	return {
		p_name: v.name.trim(),
		p_description: v.description.trim(),
		p_config: {
			quals_enabled: v.qualsEnabled,
			score_entry: v.scoreEntry,
			best_of_default: v.bestOfDefault,
			best_of,
			team_size: v.teamSize
		}
	};
}

/** A stored config the way `_tournament_normalize_config` writes it, with
 * two per-round overrides the form has no control for. */
const STORED = {
	name: 'Spring Cup',
	description: 'Two on two.',
	config: {
		quals_enabled: true,
		score_entry: true,
		best_of_default: 3,
		best_of: { 'winners:1': 1, 'losers:2': 3, grand_final: 5 },
		team_size: 2
	}
};

describe('create sends exactly what the new-tournament page always sent', () => {
	const drafts: SettingsDraft[] = [
		{ ...NEW_TOURNAMENT_DRAFT, name: 'A' },
		{ ...NEW_TOURNAMENT_DRAFT, name: '  Padded  ', description: '  why  ' },
		{
			name: 'Full',
			description: 'x',
			qualsEnabled: true,
			scoreEntry: true,
			bestOfDefault: 5,
			bestOfGrandFinal: 7,
			teamSize: 4
		},
		{ ...NEW_TOURNAMENT_DRAFT, name: 'Solo GF', bestOfGrandFinal: 3, teamSize: 1 }
	];

	it('byte-identical to the old literal, key order included, across every draft', () => {
		for (const d of drafts) {
			expect(JSON.stringify(tournamentCreateArgs(d))).toBe(JSON.stringify(oldCreatePayload(d)));
		}
		expect(drafts.length).toBe(4);
	});

	it('the defaults are the old page defaults', () => {
		expect(NEW_TOURNAMENT_DRAFT).toEqual({
			name: '',
			description: '',
			qualsEnabled: false,
			scoreEntry: false,
			bestOfDefault: 1,
			bestOfGrandFinal: 0,
			teamSize: 1
		});
		expect(validateSettings(NEW_TOURNAMENT_DRAFT)).toBe('Give the tournament a name.');
		expect(validateSettings({ ...NEW_TOURNAMENT_DRAFT, name: '   ' })).toBe(
			'Give the tournament a name.'
		);
		expect(validateSettings({ ...NEW_TOURNAMENT_DRAFT, name: 'ok' })).toBeNull();
	});
});

describe('an edit sends the WHOLE config, built from the stored one', () => {
	const open = draftFromStored(STORED.name, STORED.description, STORED.config);

	it('the stored draft reads every shown field back', () => {
		expect(open).toEqual({
			name: 'Spring Cup',
			description: 'Two on two.',
			qualsEnabled: true,
			scoreEntry: true,
			bestOfDefault: 3,
			bestOfGrandFinal: 5,
			teamSize: 2
		});
		expect(hiddenRoundOverrides(STORED.config)).toEqual(['losers:2', 'winners:1']);
	});

	it('a format change keeps every per-round override the form does not show', () => {
		const args = tournamentUpdateArgs('t1', STORED, { ...open, bestOfDefault: 7 }, OPEN_LOCKS);
		expect(args.p_config).toEqual({
			quals_enabled: true,
			score_entry: true,
			best_of_default: 7,
			best_of: { 'winners:1': 1, 'losers:2': 3, grand_final: 5 },
			team_size: 2
		});
	});

	it('clearing the grand final removes that key and only that key', () => {
		const cfg = buildConfig(STORED.config, { ...open, bestOfGrandFinal: 0 });
		expect(cfg.best_of).toEqual({ 'winners:1': 1, 'losers:2': 3 });
		// Positive control: the stored object was not mutated on the way.
		expect(STORED.config.best_of.grand_final).toBe(5);
	});

	it('a key the normalizer may add later rides through untouched', () => {
		const cfg = buildConfig({ ...STORED.config, future_key: 'kept' }, open);
		expect(cfg.future_key).toBe('kept');
	});

	it('a name-only edit sends no config and no description', () => {
		const args = tournamentUpdateArgs('t1', STORED, { ...open, name: 'Autumn Cup ' }, OPEN_LOCKS);
		expect(args).toEqual({
			p_tournament_id: 't1',
			p_name: 'Autumn Cup',
			p_description: null,
			p_config: null
		});
	});

	it('an unchanged draft is not a change, and whitespace the server strips is not one either', () => {
		expect(settingsChanges(open, open, OPEN_LOCKS)).toEqual({
			name: false,
			description: false,
			format: false
		});
		expect(settingsChanges(open, { ...open, name: ' Spring Cup ' }, OPEN_LOCKS).name).toBe(false);
		// Clearing a description IS a change, sent as '' (the RPC's coalesce keeps null).
		const cleared = tournamentUpdateArgs('t1', STORED, { ...open, description: '' }, OPEN_LOCKS);
		expect(cleared.p_description).toBe('');
	});
});

describe('the locks hold in the payload, not only on the control', () => {
	const open = draftFromStored(STORED.name, STORED.description, STORED.config);

	it('a locked format is never sent, whatever the draft says; the name still is', () => {
		const locks = settingsLocks({ status: 'live', pools: 0, qualResults: 0 });
		const args = tournamentUpdateArgs(
			't1',
			STORED,
			{ ...open, name: 'Renamed', bestOfDefault: 9, teamSize: 6 },
			locks
		);
		expect(args.p_config).toBeNull();
		expect(args.p_name).toBe('Renamed');
		// Positive control: the same draft with no lock does send a config.
		expect(
			tournamentUpdateArgs('t1', STORED, { ...open, bestOfDefault: 9 }, OPEN_LOCKS).p_config
		).not.toBeNull();
	});

	it('qualifying cannot be turned off through the payload once pools exist', () => {
		const locks = settingsLocks({ status: 'seeding', pools: 2, qualResults: 0 });
		expect(locks.quals).not.toBeNull();
		const offOnly = tournamentUpdateArgs('t1', STORED, { ...open, qualsEnabled: false }, locks);
		expect(offOnly.p_config).toBeNull();
		const withOther = tournamentUpdateArgs(
			't1',
			STORED,
			{ ...open, qualsEnabled: false, bestOfDefault: 5 },
			locks
		);
		expect(withOther.p_config?.quals_enabled).toBe(true);
		expect(withOther.p_config?.best_of_default).toBe(5);
		// Positive control: before any pool is drawn, turning it off is sent.
		const free = settingsLocks({ status: 'seeding', pools: 0, qualResults: 0 });
		expect(
			tournamentUpdateArgs('t1', STORED, { ...open, qualsEnabled: false }, free).p_config
				?.quals_enabled
		).toBe(false);
	});

	it('score entry holds once a qualifying result is recorded', () => {
		const locks = settingsLocks({ status: 'seeding', pools: 2, qualResults: 1 });
		expect(locks.score).not.toBeNull();
		expect(effectiveDraft(open, { ...open, scoreEntry: false }, locks).scoreEntry).toBe(true);
		const beforeResults = settingsLocks({ status: 'seeding', pools: 2, qualResults: 0 });
		expect(beforeResults.score).toBeNull();
	});

	it('every status gets the lock the database has, and only that one on format', () => {
		const expectFormat: Record<TournamentStatus, boolean> = {
			draft: false,
			registration_open: false,
			seeding: false,
			live: true,
			complete: true
		};
		for (const [status, locked] of Object.entries(expectFormat) as [TournamentStatus, boolean][]) {
			const l = settingsLocks({ status, pools: 0, qualResults: 0 });
			expect(l.format !== null, status).toBe(locked);
			if (locked) expect(l.format, status).toMatch(/name and the description can still change/);
		}
	});
});

describe('a co-host write arriving mid-edit is carried field by field', () => {
	// The host console refetches on every co-host write, so the stored row can
	// move under a draft somebody is typing into. Every failure here is
	// silent: the save succeeds and a co-host's change is simply gone.
	const base = draftFromStored(STORED.name, STORED.description, STORED.config);

	it("a co-host's rename survives this host saving a description", () => {
		const mine = { ...base, description: 'Two on two, bring a controller.' };
		const next = { ...base, name: 'Spring Cup Finals' };
		const rebased = rebaseDraft(base, mine, next);
		expect(rebased.name).toBe('Spring Cup Finals');
		expect(rebased.description).toBe('Two on two, bring a controller.');
		// What the save then sends, against the NEW stored row: the description
		// and nothing else. Under the old whole-draft carry-over the name went
		// too, as the old value.
		const nextStored = { ...STORED, name: 'Spring Cup Finals' };
		const args = tournamentUpdateArgs('t1', nextStored, rebased, OPEN_LOCKS);
		expect(args).toEqual({
			p_tournament_id: 't1',
			p_name: null,
			p_description: 'Two on two, bring a controller.',
			p_config: null
		});
		// Positive control: the whole draft carried over unchanged DOES send the
		// old name, which is the defect the rebase exists to stop.
		expect(tournamentUpdateArgs('t1', nextStored, mine, OPEN_LOCKS).p_name).toBe('Spring Cup');
	});

	it("a co-host's format change survives an edit to another format field", () => {
		const mine = { ...base, bestOfDefault: 5 };
		const next = { ...base, teamSize: 4 };
		expect(rebaseDraft(base, mine, next)).toEqual({ ...base, bestOfDefault: 5, teamSize: 4 });
	});

	it('an untouched draft follows the stored row entirely; an edited field keeps its value', () => {
		const next = { ...base, name: 'Renamed', scoreEntry: false, bestOfGrandFinal: 0 };
		expect(rebaseDraft(base, { ...base }, next)).toEqual(next);
		// A save of this host's own coming back: every field agrees with next.
		const mine = { ...base, name: 'Renamed ' };
		expect(draftSignature(rebaseDraft(base, mine, { ...base, name: 'Renamed' }))).toBe(
			draftSignature({ ...base, name: 'Renamed' })
		);
		// Both edited the same field: this host's value is what they see.
		expect(rebaseDraft(base, { ...base, name: 'Mine' }, { ...base, name: 'Theirs' }).name).toBe(
			'Mine'
		);
	});
});

describe('one form, mounted by both routes', () => {
	it('the new page and the host console mount TournamentSettingsForm and build their calls through settings.ts', () => {
		const created = read('src/routes/tournaments/new/+page.svelte');
		const host = read('src/routes/tournaments/[id]/host/+page.svelte');
		for (const src of [created, host]) {
			expect(src).toMatch(
				/import TournamentSettingsForm from '\$lib\/tournaments\/TournamentSettingsForm\.svelte'/
			);
			expect(src).toMatch(/<TournamentSettingsForm/);
		}
		expect(created).toMatch(/tournamentCreateArgs\(draft\)/);
		expect(host).toMatch(/rpc\('tournament_update', args\)/);
		expect(host).toMatch(/tournamentUpdateArgs\(/);
		// No second copy of the format fields on either page: the field hooks
		// live in the component alone.
		const form = read('src/lib/tournaments/TournamentSettingsForm.svelte');
		// The draft follows a co-host's write through the pure rebase above,
		// not a second rule written inline in the component.
		expect(form).toMatch(/draft = rebaseDraft\(base, draft, next\)/);
		for (const field of ['quals_enabled', 'score_entry', 'best_of_default', 'team_size', 'grand_final']) {
			expect(form, field).toContain(`data-field="${field}"`);
			expect(created, field).not.toContain(`data-field="${field}"`);
			expect(host, field).not.toContain(`data-field="${field}"`);
		}
	});
});
