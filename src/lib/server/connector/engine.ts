/**
 * THE WRITE MACHINERY: safety levels, preview, the "asks first" gate, repeat
 * protection, the audit row and undo. Every connector write goes through
 * `write`, and `write` goes through the database's `connector_call` (0270),
 * as the minted user. Levels are enforced HERE, from the registry, never by
 * a prompt (docs/connector/DESIGN.md section 3):
 *
 *   read     a direct call as him; no audit row, no preview
 *   undo     runs and is logged; `dry_run` previews; the entry names its reverse
 *   confirm  the first call ALWAYS previews and hands back a confirm token;
 *            only a second call carrying that token, within ten minutes, with
 *            the same arguments, writes
 *
 * THE CONFIRM TOKEN IS STORED, NOT DERIVED. The design sketched a hash over
 * the preview payload and the minute; a preview carries freshly minted ids and
 * timestamps, so a hash over it could never be recomputed at commit time. A
 * random token whose sha256 is stored beside the user, the tool and a hash of
 * the exact arguments (connector_confirmations) is the same gate, single use,
 * and cannot be computed by anybody who did not get the preview.
 */
import { canonical, opaqueToken, sha256Hex } from './crypto';
import type { ToolContext } from './context';
import { levelFor, liveFunction, type BeforeSpec, type FunctionEntry, type UndoAlternative } from './registry';
import type { DbError, Level, Scalar, UndoCall } from './types';

export const CONFIRM_WINDOW_MS = 10 * 60_000;
export const PREVIEW_PREFIX = 'CONNECTOR_PREVIEW:';

export interface WriteOptions {
	dryRun?: boolean;
	requestId?: string;
	confirmToken?: string;
	again?: boolean;
}

export interface WritePlan {
	/** The tool he called, recorded on the audit row. */
	tool: string;
	/** The registry function the write goes through. */
	fn: string;
	/** Its arguments, by their database names. */
	args: Record<string, unknown>;
	groupKey?: string;
	/** State read before the write, for an undo that puts it back. */
	before?: Record<string, unknown>;
	undoOf?: string;
	/** An undo runs the reverse directly, whatever the reverse's own level. */
	asUndo?: boolean;
	/** Arguments the server filled itself (a fresh uuid): never part of what he confirms or repeats. */
	filled?: string[];
}

/** The arguments he gave: the plan's, without the ones the server filled. */
export function givenArgs(plan: Pick<WritePlan, 'args' | 'filled'>): Record<string, unknown> {
	if (!plan.filled?.length) return plan.args;
	return Object.fromEntries(Object.entries(plan.args).filter(([k]) => !plan.filled!.includes(k)));
}

/** PRACTICE: the /mcp/practice endpoint, fixed by the URL. Every write previews and nothing commits. */
export const PRACTICE_NOTE =
	'This is the practice connector: nothing was written, and nothing ever is here. The real connector would do what this preview shows.';

export interface RowWritten {
	table: string;
	id: string | null;
	row: Record<string, unknown>;
}

export type WriteOutcome =
	| { status: 'preview'; level: Level; result: unknown; rows: RowWritten[]; confirm_token?: string; expires_at?: string; message: string; practice?: true }
	| { status: 'done' | 'repeated'; level: Level; result: unknown; rows: RowWritten[]; audit_id: string; undo_available: boolean; message: string }
	| { status: 'refused'; level: Level; message: string; code?: string }
	| { status: 'needs_confirmation'; level: Level; message: string };

export class NotRegistered extends Error {}

export function argsHash(tool: string, fn: string, args: Record<string, unknown>): string {
	return sha256Hex(canonical({ tool, fn, args }));
}

/** The repeat key (see 0270's header): Claude's request id when sent, otherwise the server's own hash. */
export function requestKey(ctx: ToolContext, plan: WritePlan, opts: WriteOptions): string {
	const callHash = sha256Hex(canonical({ fn: plan.fn, args: givenArgs(plan), undoOf: plan.undoOf ?? null }));
	const salt = opts.again ? `:again:${opaqueToken(ctx.random)}` : '';
	if (opts.requestId && opts.requestId.trim()) {
		return `id:${ctx.session.user.id}:${opts.requestId.trim().slice(0, 120)}:${callHash.slice(0, 24)}${salt}`;
	}
	return `derived:${sha256Hex(`${ctx.session.user.id}|${plan.tool}|${callHash}`)}${salt}`;
}

export function previewPayload(error: DbError | null): { result: unknown; rows: RowWritten[] } | null {
	if (!error) return null;
	const msg = error.message ?? '';
	const at = msg.indexOf(PREVIEW_PREFIX);
	if (at < 0) return null;
	try {
		const parsed = JSON.parse(msg.slice(at + PREVIEW_PREFIX.length)) as { result: unknown; rows: RowWritten[] };
		return { result: parsed.result ?? null, rows: parsed.rows ?? [] };
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Undo templates
// ---------------------------------------------------------------------------

export interface UndoScope {
	args: Record<string, unknown>;
	result: unknown;
	rows: RowWritten[];
	before?: Record<string, unknown>;
	user?: { id: string; email: string };
	each?: unknown;
}

/** A path walk; `*` maps over a list, so `$before.rows.*.id` is every row's id. */
function walk(value: unknown, path: string[]): unknown {
	let cur: unknown = value;
	for (let i = 0; i < path.length; i += 1) {
		const p = path[i];
		if (p === '*') {
			if (!Array.isArray(cur)) return undefined;
			const rest = path.slice(i + 1);
			return cur.map((x) => walk(x, rest));
		}
		if (cur === null || typeof cur !== 'object') return undefined;
		cur = (cur as Record<string, unknown>)[p];
	}
	return cur;
}

function lookup(ref: string, scope: UndoScope): unknown {
	const [root, ...path] = ref.split('.');
	if (root === 'args') return walk(scope.args, path);
	if (root === 'result') return path.length ? walk(scope.result, path) : scope.result;
	if (root === 'before') return scope.before ? walk(scope.before, path) : undefined;
	if (root === 'user') return scope.user ? walk(scope.user, path) : undefined;
	if (root === 'each') return path.length ? walk(scope.each, path) : scope.each;
	if (root === 'written') {
		const [table, column] = path;
		const hit = scope.rows.find((r) => r.table === table);
		return hit ? (column === 'id' ? (hit.id ?? hit.row?.id) : hit.row?.[column]) : undefined;
	}
	return undefined;
}

/**
 * The undo template language, resolved against what a write was given, what
 * it answered, what it wrote and what was read before it:
 *
 *   $args.x  $result.a.b  $before.x  $written.<table>.<column>  $user.email  $each
 *   !$x      negates;  !!$x  is a plain true or false
 *   {map: $x, values: {a: b}}   a value looked up in a table
 *
 * A reference that resolves to nothing leaves the alternative incomplete, so
 * no reverse is offered rather than a wrong one.
 */
export function resolveTemplate(value: unknown, scope: UndoScope): unknown {
	if (value && typeof value === 'object' && !Array.isArray(value) && 'map' in (value as Record<string, unknown>)) {
		const spec = value as { map: unknown; values?: Record<string, unknown> };
		const key = resolveTemplate(spec.map, scope);
		if (key === undefined || key === null) return undefined;
		const hit = spec.values?.[String(key)];
		return hit === undefined ? undefined : hit;
	}
	if (typeof value !== 'string' || !/^!{0,2}\$/.test(value)) return value;
	const bang = /^!+/.exec(value)?.[0].length ?? 0;
	const out = lookup(value.slice(bang + 1), scope);
	if (bang === 2) return out === undefined ? undefined : !!out && !(Array.isArray(out) && out.length === 0);
	if (bang === 1) return out === undefined || out === null ? undefined : !out;
	return out;
}

/** A `when`: a template that must be truthy, or `<template> = <literal>`. */
export function whenHolds(when: string, scope: UndoScope): boolean {
	const eq = /^\s*(!{0,2}\$[A-Za-z0-9_.*]+)\s*(=|!=)\s*(.+?)\s*$/.exec(when);
	if (eq) {
		const left = resolveTemplate(eq[1], scope);
		const same = String(left ?? 'null') === eq[3].replace(/^['"]|['"]$/g, '');
		return eq[2] === '=' ? same : !same;
	}
	// A single `!` in a condition holds when the value is falsy OR absent: "no
	// prior row" and "no id given" are what such a condition asks. (As an
	// argument, an absent value stays unresolved, so the alternative is skipped.)
	if (/^![^!]/.test(when.trim())) {
		const v = lookup(when.trim().slice(2), scope);
		return !v || (Array.isArray(v) && v.length === 0);
	}
	const v = resolveTemplate(when, scope);
	return !!v && !(Array.isArray(v) && v.length === 0);
}

function resolveArgs(args: Record<string, unknown> | undefined, scope: UndoScope): Record<string, unknown> | null {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(args ?? {})) {
		const resolved = resolveTemplate(v, scope);
		if (resolved === undefined) return null;
		out[k] = resolved;
	}
	return out;
}

/** The reverse of a write: the first alternative whose `when` holds and whose arguments all resolve; `each` gives one call per value. */
export function computeUndos(alternatives: UndoAlternative[] | undefined, scope: UndoScope): UndoCall[] | null {
	for (const alt of alternatives ?? []) {
		if (alt.when !== undefined && !whenHolds(alt.when, scope)) continue;
		if (alt.each !== undefined) {
			const list = resolveTemplate(alt.each, scope);
			if (!Array.isArray(list) || list.length === 0) continue;
			const calls: UndoCall[] = [];
			for (const item of list) {
				const args = resolveArgs(alt.args, { ...scope, each: item });
				if (!args) {
					calls.length = 0;
					break;
				}
				calls.push({ function: alt.function, args });
			}
			if (calls.length) return calls;
			continue;
		}
		const args = resolveArgs(alt.args, scope);
		if (args) return [{ function: alt.function, args }];
	}
	return null;
}

/** The first reverse alone (the shape 0400's audit rows store). */
export function computeUndo(alternatives: UndoAlternative[] | undefined, scope: UndoScope): UndoCall | null {
	return computeUndos(alternatives, scope)?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Before a write: what its undo needs to set back
// ---------------------------------------------------------------------------

function scalarOf(v: unknown): Scalar | undefined {
	if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
	return undefined;
}

/**
 * Reads what `before` names, AS HIM, before the write runs. A read that fails
 * or is refused leaves `before` empty, so an undo that needs it is simply not
 * offered; it never stops the write.
 */
export async function readBefore(ctx: ToolContext, spec: BeforeSpec | undefined, args: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
	if (!spec) return undefined;
	const scope: UndoScope = { args, result: null, rows: [], user: ctx.session.user };
	try {
		if (spec.rpc) {
			const callArgs = resolveArgs(spec.args, scope) ?? {};
			const r = await ctx.backend.rpc<unknown>(ctx.session, spec.rpc, callArgs);
			if (r.error) return undefined;
			let value: unknown = r.data;
			if (spec.find) {
				const want = resolveArgs(spec.find, scope);
				if (!want || !Array.isArray(value)) return { found: false };
				value = value.find((x) => x && typeof x === 'object' && Object.entries(want).every(([k, v]) => String((x as Record<string, unknown>)[k]) === String(v)));
			}
			if (value && typeof value === 'object' && !Array.isArray(value)) return { ...(value as Record<string, unknown>), found: true };
			return { value, found: value !== undefined && value !== null };
		}
		if (!spec.table || !spec.columns?.length) return undefined;
		const eq: Record<string, Scalar> = {};
		for (const [k, v] of Object.entries(spec.eq ?? {})) {
			const resolved = scalarOf(resolveTemplate(v, scope));
			if (resolved === undefined || resolved === null) return { found: false, rows: [] };
			eq[k] = resolved;
		}
		const inn: Record<string, Scalar[]> = {};
		for (const [k, v] of Object.entries(spec.in ?? {})) {
			const resolved = resolveTemplate(v, scope);
			if (!Array.isArray(resolved) || resolved.length === 0) return { found: false, rows: [] };
			inn[k] = resolved.map((x) => scalarOf(x) ?? String(x));
		}
		const r = await ctx.backend.select<Record<string, unknown>>(ctx.session, {
			table: spec.table,
			columns: spec.columns,
			eq,
			...(Object.keys(inn).length ? { in: inn } : {}),
			...(spec.order ? { order: spec.order } : {}),
			limit: 1000
		});
		if (r.error) return undefined;
		const rows = r.data;
		return { ...(rows[0] ?? {}), rows, found: rows.length > 0 };
	} catch {
		return undefined;
	}
}

// ---------------------------------------------------------------------------
// The write
// ---------------------------------------------------------------------------

function entryFor(fn: string): FunctionEntry {
	const e = liveFunction(fn);
	if (!e) throw new NotRegistered(`The connector does not know "${fn}".`);
	return e;
}

async function connectorCall(
	ctx: ToolContext,
	plan: WritePlan,
	key: string,
	mode: 'preview' | 'commit'
) {
	return ctx.backend.rpc<{ repeated: boolean; audit_id: string; result: unknown; rows: RowWritten[]; level: Level }>(
		ctx.session,
		'connector_call',
		{
			p_tool: plan.tool,
			p_function: plan.fn,
			p_args: plan.args,
			p_request_key: key,
			p_mode: mode,
			p_meta: {
				group_key: plan.groupKey ?? null,
				token_id: ctx.token?.id ?? null,
				undo_of: plan.undoOf ?? null
			}
		}
	);
}

/** A refusal the way he should hear it: the database's own sentence. */
function refusal(level: Level, error: DbError): WriteOutcome {
	return { status: 'refused', level, message: error.message, code: error.code };
}

/** A function's own `{ok: false, reason}` answer: nothing it was asked for happened. */
function softRefusal(result: unknown): { reason: string; message: string } | null {
	if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
	const r = result as Record<string, unknown>;
	if (r.ok !== false) return null;
	const reason = typeof r.reason === 'string' ? r.reason : 'refused';
	const message = typeof r.message === 'string' ? r.message : `The site said no (${reason.replace(/_/g, ' ')}).`;
	return { reason, message };
}

export async function write(ctx: ToolContext, plan: WritePlan, opts: WriteOptions = {}): Promise<WriteOutcome> {
	// `plan` is reassigned once, when a confirmation hands back the values filled for its preview.
	const entry = entryFor(plan.fn);
	const level: Level = plan.asUndo ? 'undo' : levelFor(entry, plan.args, plan.before);

	if (level === 'read') {
		const r = await ctx.backend.rpc(ctx.session, plan.fn, plan.args);
		if (r.error) return refusal(level, r.error);
		return { status: 'done', level, result: r.data, rows: [], audit_id: '', undo_available: false, message: 'Read.' };
	}

	const key = requestKey(ctx, plan, opts);
	const confirmFirst = level === 'confirm' && !opts.confirmToken;
	// PRACTICE: the URL decides, never an argument. Every write previews.
	if (opts.dryRun || confirmFirst || ctx.practice) {
		const r = await connectorCall(ctx, plan, key, 'preview');
		const payload = previewPayload(r.error);
		if (!payload) {
			if (r.error) return refusal(level, r.error);
			return { status: 'refused', level, message: 'The preview did not come back.' };
		}
		if (ctx.practice) {
			return {
				status: 'preview',
				level,
				...payload,
				...(level === 'confirm' ? { confirm_token: 'practice' } : {}),
				practice: true,
				message: level === 'confirm' && !opts.confirmToken ? `${PRACTICE_NOTE} The real connector would ask him first.` : PRACTICE_NOTE
			};
		}
		if (confirmFirst && !opts.dryRun) {
			const token = opaqueToken(ctx.random);
			const expiresAt = ctx.now() + CONFIRM_WINDOW_MS;
			const filled = Object.fromEntries((plan.filled ?? []).map((k) => [k, plan.args[k]]));
			await ctx.backend.storeConfirmation({
				tokenHash: sha256Hex(token),
				userId: ctx.session.user.id,
				tool: plan.tool,
				argsHash: argsHash(plan.tool, plan.fn, givenArgs(plan)),
				preview: Object.keys(filled).length ? { ...payload, filled } : payload,
				expiresAt
			});
			return {
				status: 'preview',
				level,
				...payload,
				confirm_token: token,
				expires_at: new Date(expiresAt).toISOString(),
				message:
					'Nothing has changed yet. Read this preview to him and ask; if he says yes, call again with the same arguments and this confirm_token within ten minutes.'
			};
		}
		return { status: 'preview', level, ...payload, message: 'Preview only: nothing was written.' };
	}

	if (level === 'confirm') {
		const confirmation = await ctx.backend.takeConfirmation(sha256Hex(opts.confirmToken ?? ''), ctx.now());
		if (
			!confirmation ||
			confirmation.userId !== ctx.session.user.id ||
			confirmation.tool !== plan.tool ||
			confirmation.argsHash !== argsHash(plan.tool, plan.fn, givenArgs(plan))
		) {
			return {
				status: 'needs_confirmation',
				level,
				message:
					'That confirmation is missing, already used, more than ten minutes old, or was for different arguments. Nothing was written. Preview it again and ask him.'
			};
		}
		// The values the server filled for the preview he said yes to.
		const shown = (confirmation.preview as { filled?: Record<string, unknown> } | null)?.filled;
		if (shown && plan.filled?.length) {
			plan = { ...plan, args: { ...plan.args, ...Object.fromEntries(plan.filled.filter((k) => k in shown).map((k) => [k, shown[k]])) } };
		}
	}

	const r = await connectorCall(ctx, plan, key, 'commit');
	if (r.error || !r.data) {
		const error = r.error ?? { message: 'The write did not answer.' };
		await ctx.backend
			.rpc(ctx.session, 'connector_audit_failure', {
				p_tool: plan.tool,
				p_function: plan.fn,
				p_args: plan.args,
				p_request_key: key,
				p_error: error.message,
				p_meta: { group_key: plan.groupKey ?? null, token_id: ctx.token?.id ?? null }
			})
			.catch(() => undefined);
		return refusal(level, error);
	}
	const data = r.data;
	const soft = softRefusal(data.result);
	let undoAvailable = false;
	if (!data.repeated && !soft) {
		const undo = computeUndos(entry.undo, {
			args: plan.args,
			result: data.result,
			rows: data.rows ?? [],
			before: plan.before,
			user: ctx.session.user
		});
		undoAvailable = undo !== null && !plan.undoOf && !plan.asUndo;
		if (undo && undoAvailable) {
			await ctx.backend.setAuditUndo(data.audit_id, undo.length === 1 ? undo[0] : undo).catch(() => (undoAvailable = false));
		}
		if (entry.cleanup && ctx.cleanup && !plan.asUndo) {
			await ctx.cleanup(entry.cleanup, data.result).catch(() => undefined);
		}
	}
	if (soft) {
		return { status: 'refused', level, code: soft.reason, message: `${soft.message} Nothing it was asked for happened.` };
	}
	return {
		status: data.repeated ? 'repeated' : 'done',
		level,
		result: data.result,
		rows: data.rows ?? [],
		audit_id: data.audit_id,
		undo_available: undoAvailable,
		message: data.repeated
			? 'This exact request was already done, so nothing was written again. Pass again: true only if he wants it done a second time.'
			: 'Done.'
	};
}

/** Undo the newest connector write (or the newest group of them) that names a reverse. */
export async function undoLast(ctx: ToolContext, opts: WriteOptions = {}): Promise<Record<string, unknown>> {
	const candidates = await ctx.backend.undoCandidates(ctx.session.user.id, 50);
	const newest = candidates.find((c) => c.undo);
	if (!newest) return { status: 'none', message: 'There is nothing made through Claude left to undo.' };
	const group = newest.groupKey ? candidates.filter((c) => c.undo && c.groupKey === newest.groupKey) : [newest];
	const outcomes = [];
	for (const row of group) {
		const calls = Array.isArray(row.undo) ? row.undo : [row.undo as UndoCall];
		// One audit row can be undone only once: the first reverse carries undo_of, the rest ride its group.
		for (const [i, undo] of calls.entries()) {
			const outcome = await write(
				ctx,
				{
					tool: 'undo_last',
					fn: undo.function,
					args: undo.args,
					undoOf: i === 0 ? row.id : undefined,
					groupKey: `undo:${row.groupKey ?? row.id}`,
					asUndo: true
				},
				{ ...opts, requestId: opts.requestId ? `${opts.requestId}:${row.id}:${i}` : undefined }
			);
			outcomes.push({ undid: row.tool, made: new Date(row.startedAt).toISOString(), args: row.args, outcome });
		}
	}
	const failed = outcomes.filter((o) => o.outcome.status === 'refused' || o.outcome.status === 'needs_confirmation');
	return {
		status: opts.dryRun ? 'preview' : failed.length ? (failed.length === outcomes.length ? 'refused' : 'partial') : 'done',
		undone: outcomes
	};
}
