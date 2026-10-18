// tests/connector-engine.test.ts
//
// The connector's pure pieces: spoken dates in school time (at an instant where
// the Los Angeles day and the UTC day differ), the undo templates, the preview
// payload, the repeat key, the redirect rules and PKCE.

import { describe, expect, it } from 'vitest';
import { resolveDue, resolveNoticeEnd } from '../src/lib/server/connector/dates';
import { computeUndo, previewPayload, requestKey, resolveTemplate } from '../src/lib/server/connector/engine';
import { redirectAllowed, redirectMatches } from '../src/lib/server/connector/oauth';
import { pkceMatches, s256 } from '../src/lib/server/connector/crypto';
import type { ToolContext } from '../src/lib/server/connector/context';

// 8pm Wednesday 2026-10-14 in Los Angeles, already Thursday in UTC.
const EVENING = new Date('2026-10-15T03:00:00Z');

describe('spoken dates', () => {
	const due = (s: string) => {
		const r = resolveDue(s, EVENING);
		if (!r.ok) throw new Error(r.refusal);
		return r.iso;
	};
	it('reads a weekday, a time, a date and none in school time', () => {
		expect(due('Friday')).toBe('2026-10-17T06:59:00.000Z'); // Fri 11:59 PM PDT
		expect(due('Friday at 11:59')).toBe('2026-10-17T06:59:00.000Z');
		expect(due('tomorrow 3pm')).toBe('2026-10-15T22:00:00.000Z'); // Thursday, not Friday
		expect(due('today')).toBe('2026-10-15T06:59:00.000Z'); // still Wednesday
		expect(due('next Wednesday')).toBe('2026-10-22T06:59:00.000Z');
		expect(due('Oct 24 11:59pm')).toBe('2026-10-25T06:59:00.000Z');
		expect(due('11/3 3:30 pm')).toBe('2026-11-03T23:30:00.000Z'); // PST by then
		expect(due('none')).toBeNull();
	});
	it('refuses what it cannot read rather than guessing', () => {
		expect(resolveDue('sometime soon', EVENING).ok).toBe(false);
	});
	it('a notice ends at the school day\'s end by default, and never in the past', () => {
		const morning = new Date('2026-10-14T16:00:00Z');
		const r = resolveNoticeEnd(undefined, morning);
		expect(r).toMatchObject({ ok: true, iso: '2026-10-14T22:00:00.000Z' });
		expect(resolveNoticeEnd('until I take it down', morning)).toMatchObject({ ok: true, iso: null });
	});
});

describe('undo templates', () => {
	const scope = {
		args: { p_item_id: 'i1', p_published: false, p_email: 'a@b' },
		result: { transaction_id: 't1', thread: { id: 'th1' } },
		rows: [{ table: 'classroom_content_revisions', id: 'r1', row: { id: 'r1' } }],
		before: { graded: false, fresh: true, score: null }
	};
	it('reads args, nested results, written rows, and negates', () => {
		expect(resolveTemplate('$args.p_item_id', scope)).toBe('i1');
		expect(resolveTemplate('!$args.p_published', scope)).toBe(true);
		expect(resolveTemplate('$result.thread.id', scope)).toBe('th1');
		expect(resolveTemplate('$written.classroom_content_revisions.id', scope)).toBe('r1');
		expect(resolveTemplate('$written.coin_transactions.id', scope)).toBeUndefined();
		expect(resolveTemplate('$before.score', scope)).toBeNull();
		expect(resolveTemplate('plain', scope)).toBe('plain');
	});
	it('takes the first alternative whose condition holds and whose arguments all resolve', () => {
		const alts = [
			{ when: '$before.graded', function: 'a', args: { x: '$before.score' } },
			{ function: 'b', args: { x: '$written.coin_transactions.id' } },
			{ function: 'c', args: { x: '$args.p_item_id', y: null } }
		];
		expect(computeUndo(alts, scope)).toEqual({ function: 'c', args: { x: 'i1', y: null } });
		expect(computeUndo([], scope)).toBeNull();
	});
});

describe('preview, repeat keys, redirects and PKCE', () => {
	it('parses a preview raise and nothing else', () => {
		expect(previewPayload({ message: 'CONNECTOR_PREVIEW:{"result":{"ok":true},"rows":[]}' })).toEqual({ result: { ok: true }, rows: [] });
		expect(previewPayload({ message: 'Only coin staff can log IDEA Coin transactions.' })).toBeNull();
		expect(previewPayload(null)).toBeNull();
	});
	it('derives the same key for the same request, a different one for different arguments, and salts again', () => {
		const ctx = { session: { user: { id: 'u1', email: 'x' } }, random: () => Buffer.alloc(32, 7) } as unknown as ToolContext;
		const plan = { tool: 't', fn: 'f', args: { a: 1, b: [1, 2] } };
		expect(requestKey(ctx, plan, {})).toBe(requestKey(ctx, { ...plan, args: { b: [1, 2], a: 1 } }, {}));
		expect(requestKey(ctx, plan, {})).not.toBe(requestKey(ctx, { ...plan, args: { a: 2, b: [1, 2] } }, {}));
		expect(requestKey(ctx, plan, {})).toMatch(/^derived:[0-9a-f]{64}$/);
		expect(requestKey(ctx, plan, { again: true })).toContain(':again:');
		expect(requestKey(ctx, plan, { requestId: 'r1' })).toMatch(/^id:u1:r1:/);
	});
	it('sends codes only to Claude or a loopback address', () => {
		expect(redirectAllowed('https://claude.ai/api/mcp/auth_callback')).toBe(true);
		expect(redirectAllowed('https://claude.com/api/mcp/auth_callback')).toBe(true);
		expect(redirectAllowed('http://localhost:6274/oauth/callback')).toBe(true);
		expect(redirectAllowed('http://127.0.0.1:33418/callback')).toBe(true);
		for (const bad of ['https://claude.ai/elsewhere', 'https://claude.ai.evil.example/api/mcp/auth_callback', 'http://claude.ai/api/mcp/auth_callback', 'https://evil.example/cb', 'javascript:alert(1)']) {
			expect(redirectAllowed(bad), bad).toBe(false);
		}
		expect(redirectMatches('http://localhost/cb', 'http://localhost:5555/cb')).toBe(true);
		expect(redirectMatches('https://claude.ai/api/mcp/auth_callback', 'https://claude.ai/api/mcp/auth_callback?x=1')).toBe(false);
	});
	it('checks PKCE S256 exactly', () => {
		const v = 'a'.repeat(43);
		expect(pkceMatches(v, s256(v))).toBe(true);
		expect(pkceMatches('b'.repeat(43), s256(v))).toBe(false);
		expect(pkceMatches('short', s256('short'))).toBe(false);
	});
});
