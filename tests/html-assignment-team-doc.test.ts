// tests/html-assignment-team-doc.test.ts
//
// LEDGER 0436: what a student's page draws for a team document, from the read
// the database answers (0302). Silent-if-wrong rules only: a teammate's box
// drawn as typeable, a moved student's old team answers shown, the waiting
// sentence changing its words, a refusal answered with the fallback sentence,
// and the two new bridge messages admitting a field the parent did not map.

import { describe, expect, it } from 'vitest';
import {
	hxTeamBlocks,
	parseTeamDocument,
	teamFieldStates,
	teamFieldWritable,
	teamNextLockChange,
	teamRefusalWords,
	teamValuesFor,
	teamWaitingWords,
	TEAM_DOC_WORDS
} from '../src/lib/classroom/html-assignment/team-doc';
import { TEAM_FIXTURE_FIELDS, TEAM_FIXTURE_MANIFEST, teamFixtureHtml } from '../src/lib/classroom/html-assignment/team-fixture';
import { validateHtmlManifest, type HtmlAssignmentManifest } from '../src/lib/classroom/html-assignment/manifest';
import { HX_SANDBOX_FLAGS, hxReceive, hxTeamStateMessage } from '../src/lib/classroom/html-assignment/bridge';
import { hxSaveOutcome, HxAnswers } from '../src/lib/classroom/html-assignment/answers';

const manifest = TEAM_FIXTURE_MANIFEST as unknown as HtmlAssignmentManifest;
const NOW = Date.parse('2026-10-27T15:00:00Z');

function doc(over: Record<string, unknown> = {}) {
	return parseTeamDocument({
		ok: true,
		team: { id: 't1', name: 'Team 1', number: 1, section_id: 's' },
		members: [
			{ name: 'Ana', me: true, active: true },
			{ name: 'Ben', me: false, active: true }
		],
		roles: [
			{ id: 'frame', title: 'Frame and mount', owner: 'Ben', mine: false },
			{ id: 'energy', title: 'Energy store', owner: null, mine: false },
			{ id: 'drive', title: 'Drive', owner: 'Ana', mine: true },
			{ id: 'ballpath', title: 'Ball path', owner: null, mine: false }
		],
		values: { 'goal-text': { value: { text: 'Hit the far bin' }, by: 'Ben', at: null } },
		locks: { 'goal-method': { by: 'Ben', mine: false, until: new Date(NOW + 60_000).toISOString() } },
		past_due: false,
		now: new Date(NOW).toISOString(),
		...over
	})!;
}

describe('the team fixture is a document the importer accepts', () => {
	it('validates with no error', () => {
		const result = validateHtmlManifest(teamFixtureHtml());
		expect(result.errors).toEqual([]);
	});
	it('names no power unit, CIM, coupler or 1/4-20 mount (addendum, 2026-10-26)', () => {
		expect(teamFixtureHtml()).not.toMatch(/power unit|\bCIM\b|coupler|1\/4-20/i);
	});
});

describe('who may type where', () => {
	it('shared blocks are the team and role modules only', () => {
		const blocks = hxTeamBlocks(manifest);
		expect([...blocks.keys()].sort()).toEqual(
			['ballpath-req', 'drive-req', 'energy-req', 'frame-req', 'goal-method', 'goal-text'].sort()
		);
		expect(blocks.has('reflect-text')).toBe(false);
		expect(hxTeamBlocks({ ...manifest, team: undefined } as HtmlAssignmentManifest).size).toBe(0);
	});

	it('held, owned, unowned, mine and free, from one read; individual fields absent', () => {
		const states = teamFieldStates(manifest, doc(), NOW);
		expect(states).toEqual({
			goalText: { state: 'free' },
			methodText: { state: 'held', by: 'Ben' },
			frameReq: { state: 'owned', by: 'Ben' },
			energyReq: { state: 'unowned' },
			driveReq: { state: 'free' },
			ballpathReq: { state: 'unowned' }
		});
		const writable = Object.entries(states).filter(([, s]) => teamFieldWritable(s)).map(([f]) => f);
		expect(writable.sort()).toEqual(['driveReq', 'goalText']);
		expect(teamFieldWritable(undefined)).toBe(true);
	});

	it('a held box frees on the server clock two minutes on, with no read', () => {
		expect(teamNextLockChange(doc(), NOW)).toBe(NOW + 60_000);
		expect(teamFieldStates(manifest, doc(), NOW + 61_000).methodText).toEqual({ state: 'free' });
		// A client clock five minutes slow still judges on the server's.
		expect(teamFieldStates(manifest, doc(), NOW - 300_000, 300_000).methodText.state).toBe('held');
	});

	it('past due closes every shared box', () => {
		const states = teamFieldStates(manifest, doc({ past_due: true }), NOW);
		expect(new Set(Object.values(states).map((s) => s.state))).toEqual(new Set(['closed']));
	});
});

describe("the team's answers, never another team's", () => {
	it('every shared field gets the team value or empty, read through the stored shape', () => {
		const values = teamValuesFor(manifest, doc());
		expect(values).toEqual({
			goalText: 'Hit the far bin',
			methodText: '',
			frameReq: '',
			energyReq: '',
			driveReq: '',
			ballpathReq: ''
		});
		expect('reflectText' in values).toBe(false);
	});

	it('a remote value never overwrites typing still owed, nor a read older than this page’s write', () => {
		const answers = new HxAnswers({
			itemId: 'i',
			manifest,
			transports: { saveResponse: async () => ({ ok: true, data: { ok: true } }) },
			values: { goalText: 'old' },
			now: () => 1000
		});
		answers.change({ blockId: 'goal-text', field: 'goalText', value: 'typing now' });
		expect(answers.adoptRemote({ goalText: 'teammate' })).toEqual([]);
		expect(answers.values.goalText).toBe('typing now');
		// A read that left at 999 is older than the typing at 1000.
		answers.adoptRemote({ methodText: 'Flywheel' }, 999);
		expect(answers.values.methodText).toBe('Flywheel');
		answers.destroy();
	});
});

describe('the words', () => {
	it("before teams are posted: Mr. Pina's sentence, verbatim", () => {
		expect(teamWaitingWords(parseTeamDocument({ ok: true, team: null, reason: 'not_posted' }))).toBe(
			"Teams are drawn in class. Your team's document opens here the moment teams are posted."
		);
		expect(TEAM_DOC_WORDS.notPosted).not.toMatch(/—/);
		expect(teamWaitingWords(doc())).toBeNull();
	});

	it('a refused team save names the teammate, never the fallback', () => {
		const held = hxSaveOutcome({ ok: true, data: { ok: false, reason: 'held', by: 'Ben' } });
		expect(held).toMatchObject({ ok: false, retryable: false });
		expect((held as { message: string }).message).toBe(teamRefusalWords('held', 'Ben'));
		expect(teamRefusalWords('held', 'Ben')).toContain('Ben');
		for (const r of ['not_owner', 'no_owner', 'not_posted', 'no_team', 'past_due', 'locked']) {
			expect(teamRefusalWords(r, 'Ana')).toBeTruthy();
		}
	});
});

describe('the bridge', () => {
	const frame = {};
	const gate = { documentOrigin: 'https://x', frameWindow: frame, sandboxFlags: HX_SANDBOX_FLAGS, fieldToBlockId: TEAM_FIXTURE_FIELDS };
	it('field focus and blur resolve through the parent map and refuse an unmapped field', () => {
		const ok = hxReceive({ origin: 'null', source: frame, data: { type: 'idea:field-focus', field: 'goalText' } }, gate);
		expect(ok).toEqual({ ok: true, message: { kind: 'field-focus', blockId: 'goal-text', field: 'goalText' } });
		const blur = hxReceive({ origin: 'null', source: frame, data: { type: 'idea:field-blur', field: 'goalText' } }, gate);
		expect(blur.ok && blur.message.kind).toBe('field-blur');
		const bad = hxReceive({ origin: 'null', source: frame, data: { type: 'idea:field-focus', field: 'goal-text' } }, gate);
		expect(bad).toMatchObject({ ok: false, reason: 'field' });
	});
	it('team state goes down sorted, so the same state is the same message', () => {
		const a = hxTeamStateMessage({ team: 'T', me: 'Ana', roles: [], fields: { b: { state: 'free' }, a: { state: 'held', by: 'Ben' } } });
		expect(Object.keys((a as { fields: object }).fields)).toEqual(['a', 'b']);
	});
});
