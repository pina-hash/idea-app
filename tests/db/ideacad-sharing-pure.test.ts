/**
 * The pure sharing layer, and the two places it has to agree with 0205.
 *
 * IT LIVES UNDER tests/db/ AND BOOTS NO DATABASE. The directory is this
 * bundle's own naming lane (`tests/db/ideacad-sharing*`), and the vitest `node`
 * project is everything under `tests/` except `tests/dom/`, so the location
 * costs nothing at run time -- but it reads `startTestDb` nowhere and its whole
 * duration is a file read plus arithmetic.
 *
 * THIS IS A NODE-PROJECT TEST WITH NO DOM, ON PURPOSE. Everything asserted here
 * is arithmetic and plain data; there is no geometry, no contrast and no tap
 * target in it, which are the claims `tests/dom/` cannot make and
 * `npm run verify:browser` owns. This bundle mounts no component at all.
 *
 * WHERE THE EXPECTED VALUES COME FROM. The capability table is asserted against
 * the MIGRATION TEXT, not against itself: the refusal sentence is read out of
 * the .sql file, and the role vocabulary is read out of its CHECK constraint. A
 * test whose expectation is derived from the implementation it tests cannot
 * fail, so the two strings that must match across the wire are taken from the
 * other side of it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	IDEACAD_GRANT_ROLES,
	IDEACAD_ROLE_LABELS,
	IDEACAD_ROLE_NOTES,
	IDEACAD_SHARING_UNAVAILABLE,
	IDEACAD_VIEW_ONLY_REFUSAL,
	ideacadApplyGrant,
	ideacadCanRead,
	ideacadCanShare,
	ideacadCanWrite,
	ideacadNormalizeEmail,
	ideacadRemoveGrant,
	ideacadRoleFromPayload,
	ideacadShareTargetProblem,
	ideacadSharingOff,
	ideacadSharingOn,
	ideacadSharingSummary,
	type IdeacadDocumentRole,
	type IdeacadGrant
} from '../../src/lib/ideacad/sharing';

const MIGRATION = readFileSync(
	new URL('../../supabase/migrations/0205_ideacad_document_sharing.sql', import.meta.url),
	'utf8'
);

const ALL_ROLES: IdeacadDocumentRole[] = ['owner', 'editor', 'viewer', 'manager'];

const grant = (email: string, role: 'viewer' | 'editor'): IdeacadGrant => ({
	granteeEmail: email,
	role,
	grantedBy: 'owner@boscotech.net',
	grantedAt: '2026-09-12T00:00:00Z'
});

describe('the two strings that cross the wire agree with 0205', () => {
	it('renders the view-only refusal the database actually raises', () => {
		// A refusal is rendered verbatim; a client that re-tones the sentence is a
		// second wording of one rule.
		expect(MIGRATION).toContain(IDEACAD_VIEW_ONLY_REFUSAL);
	});

	it('offers exactly the roles the CHECK constraint admits', () => {
		const check = MIGRATION.match(/check \(role in \(([^)]*)\)\)/);
		expect(check).not.toBeNull();
		const fromSql = (check as RegExpMatchArray)[1]
			.split(',')
			.map((part) => part.trim().replace(/^'|'$/g, ''))
			.sort();
		expect(fromSql).toEqual([...IDEACAD_GRANT_ROLES].sort());
		// And the grantable roles are a strict subset of the document roles: a
		// student cannot be granted 'owner' or 'manager'.
		for (const role of IDEACAD_GRANT_ROLES) expect(ALL_ROLES).toContain(role);
		expect(IDEACAD_GRANT_ROLES).not.toContain('owner' as never);
		expect(IDEACAD_GRANT_ROLES).not.toContain('manager' as never);
	});

	it('shares the share-target refusals with the RPC, word for word', () => {
		expect(MIGRATION).toContain(
			ideacadShareTargetProblem('', 'owner@boscotech.net') as string
		);
		expect(MIGRATION).toContain(
			ideacadShareTargetProblem('owner@boscotech.net', 'owner@boscotech.net') as string
		);
	});
});

describe('capabilities', () => {
	it('lets a viewer read and NOT write, which is the whole point', () => {
		expect(ideacadCanRead('viewer')).toBe(true);
		expect(ideacadCanWrite('viewer')).toBe(false);
		// The control: the role that differs from it in exactly one respect.
		expect(ideacadCanRead('editor')).toBe(true);
		expect(ideacadCanWrite('editor')).toBe(true);
	});

	it('lets ONLY the owner share, including not the instructor', () => {
		expect(ALL_ROLES.filter((r) => ideacadCanShare(r))).toEqual(['owner']);
	});

	it('records that an instructor can read and cannot write, which is today’s gap', () => {
		// Decision 24 says instructors edit everything. 0201 gave them read only
		// and 0205 did not change it. This assertion is the record of that, and it
		// is the one to invert deliberately when teacher edit ships.
		expect(ideacadCanRead('manager')).toBe(true);
		expect(ideacadCanWrite('manager')).toBe(false);
		expect(ideacadCanShare('manager')).toBe(false);
	});

	it('answers false for every capability on a null role, never true', () => {
		// "Cannot tell" must never render as the permissive answer.
		expect(ideacadCanRead(null)).toBe(false);
		expect(ideacadCanWrite(null)).toBe(false);
		expect(ideacadCanShare(null)).toBe(false);
	});

	it('is exhaustive: every role has a label, a note and three capabilities', () => {
		expect(Object.keys(IDEACAD_ROLE_LABELS).sort()).toEqual([...ALL_ROLES].sort());
		expect(Object.keys(IDEACAD_ROLE_NOTES).sort()).toEqual([...ALL_ROLES].sort());
		for (const role of ALL_ROLES) {
			expect(IDEACAD_ROLE_LABELS[role].length).toBeGreaterThan(0);
			expect(IDEACAD_ROLE_NOTES[role].length).toBeGreaterThan(0);
			// Every capability answers a boolean rather than undefined, which is
			// what a role added without its row would produce.
			for (const answer of [ideacadCanRead(role), ideacadCanWrite(role), ideacadCanShare(role)]) {
				expect(typeof answer).toBe('boolean');
			}
		}
	});

	it('has labels and notes a student can read: no table, function or migration names', () => {
		const copy = [...Object.values(IDEACAD_ROLE_LABELS), ...Object.values(IDEACAD_ROLE_NOTES),
			IDEACAD_SHARING_UNAVAILABLE, IDEACAD_VIEW_ONLY_REFUSAL];
		for (const sentence of copy) {
			expect(sentence).not.toMatch(/ideacad_|classroom_|RLS|0205|RPC/);
			// No em dashes in user-facing copy.
			expect(sentence).not.toContain('—');
		}
	});
});

describe('the share target courtesy check', () => {
	it('refuses an empty value, a non-address and the owner themselves', () => {
		expect(ideacadShareTargetProblem('', 'a@b.net')).not.toBeNull();
		expect(ideacadShareTargetProblem('   ', 'a@b.net')).not.toBeNull();
		expect(ideacadShareTargetProblem('not-an-address', 'a@b.net')).not.toBeNull();
		expect(ideacadShareTargetProblem('A@B.net', 'a@b.net')).not.toBeNull();
	});

	it('accepts a plausible classmate, because the ROSTER check is the database’s', () => {
		// A browser cannot read the enrollment of a class it is not in, so this
		// must NOT try to decide who is a classmate. Passing here means "send it";
		// 0205 is what refuses a stranger.
		expect(ideacadShareTargetProblem('someone@boscotech.net', 'owner@boscotech.net')).toBeNull();
		expect(ideacadShareTargetProblem('nobody@example.com', 'owner@boscotech.net')).toBeNull();
	});
});

describe('the grant list arithmetic mirrors the RPC upsert', () => {
	it('replaces a role rather than adding a second row for one person', () => {
		const after = ideacadApplyGrant(
			[grant('b@boscotech.net', 'viewer'), grant('a@boscotech.net', 'editor')],
			grant('b@boscotech.net', 'editor')
		);
		expect(after).toHaveLength(2);
		expect(after.map((g) => `${g.granteeEmail}:${g.role}`)).toEqual([
			'a@boscotech.net:editor',
			'b@boscotech.net:editor'
		]);
	});

	it('matches on the normalized address, so one person is one grant', () => {
		const after = ideacadApplyGrant(
			[grant('b@boscotech.net', 'viewer')],
			grant('  B@BoscoTech.net  ', 'editor')
		);
		expect(after).toEqual([expect.objectContaining({ granteeEmail: 'b@boscotech.net', role: 'editor' })]);
	});

	it('sorts, so two renders of one state cannot differ', () => {
		const after = ideacadApplyGrant(
			[grant('z@boscotech.net', 'viewer')],
			grant('a@boscotech.net', 'viewer')
		);
		expect(after.map((g) => g.granteeEmail)).toEqual(['a@boscotech.net', 'z@boscotech.net']);
	});

	it('removes on the normalized address and leaves the rest alone', () => {
		const after = ideacadRemoveGrant(
			[grant('a@boscotech.net', 'viewer'), grant('b@boscotech.net', 'editor')],
			'  A@BOSCOTECH.NET '
		);
		expect(after.map((g) => g.granteeEmail)).toEqual(['b@boscotech.net']);
	});

	it('normalizes exactly as lower(btrim(...)) does for the cases that differ', () => {
		expect(ideacadNormalizeEmail('  A@B.NET ')).toBe('a@b.net');
		expect(ideacadNormalizeEmail('a@b.net')).toBe('a@b.net');
	});
});

describe('the sharing summary', () => {
	it('says NOTHING for a private document, rather than "shared with 0"', () => {
		// Private is the default state, not a deficiency.
		expect(ideacadSharingSummary([])).toBeNull();
	});

	it('counts both roles, and uses the singular for one classmate', () => {
		expect(ideacadSharingSummary([grant('a@b.net', 'editor')])).toBe(
			'Shared with 1 classmate (1 can edit)'
		);
		expect(
			ideacadSharingSummary([grant('a@b.net', 'editor'), grant('b@b.net', 'viewer')])
		).toBe('Shared with 2 classmates (1 can edit, 1 can view)');
		expect(ideacadSharingSummary([grant('a@b.net', 'viewer')])).toBe(
			'Shared with 1 classmate (1 can view)'
		);
	});
});

describe('the capability ladder', () => {
	it('starts OFF and says why, so a surface can explain rather than just hide', () => {
		const off = ideacadSharingOff();
		expect(off.sharingReady).toBe(false);
		expect(off.reason).toBe(IDEACAD_SHARING_UNAVAILABLE);
		const on = ideacadSharingOn();
		expect(on.sharingReady).toBe(true);
		expect(on.reason).toBeNull();
	});
});

describe('reading a role off a payload', () => {
	it('accepts the four real roles', () => {
		for (const role of ALL_ROLES) expect(ideacadRoleFromPayload(role)).toBe(role);
	});

	it('DROPS anything else rather than coercing it, and never answers permissively', () => {
		for (const bad of ['admin', 'OWNER', '', null, undefined, 0, 1, true, {}, ['owner']]) {
			expect(ideacadRoleFromPayload(bad)).toBeNull();
			expect(ideacadCanWrite(ideacadRoleFromPayload(bad))).toBe(false);
		}
	});
});
