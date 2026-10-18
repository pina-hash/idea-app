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
import { liveFunction, type FunctionEntry, type UndoAlternative } from './registry';
import type { DbError, Level, UndoCall } from './types';

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
}

export interface RowWritten {
	table: string;
	id: string | null;
	row: Record<string, unknown>;
}

export type WriteOutcome =
	| { status: 'preview'; level: Level; result: unknown; rows: RowWritten[]; confirm_token?: string; expires_at?: string; message: string }
	| { status: 'done' | 'repeated'; level: Level; result: unknown; rows: RowWritten[]; audit_id: string; undo_available: boolean; message: string }
	| { status: 'refused'; level: Level; message: string; code?: string }
	| { status: 'needs_confirmation'; level: Level; message: string };

export class NotRegistered extends Error {}

export function argsHash(tool: string, fn: string, args: Record<string, unknown>): string {
	return sha256Hex(canonical({ tool, fn, args }));
}

/** The repeat key (see 0270's header): Claude's request id when sent, otherwise the server's own hash. */
export function requestKey(ctx: ToolContext, plan: WritePlan, opts: WriteOptions): string {
	const callHash = sha256Hex(canonical({ fn: plan.fn, args: plan.args, undoOf: plan.undoOf ?? null }));
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
}

function walk(value: unknown, path: string[]): unknown {
	let cur: unknown = value;
	for (const p of path) {
		if (cur === null || typeof cur !== 'object') return undefined;
		cur = (cur as Record<string, unknown>)[p];
	}
	return cur;
}

/** `$args.x`, `$result.a.b`, `$before.x`, `$written.<table>.<column>`, with a leading `!` negating. */
export function resolveTemplate(value: unknown, scope: UndoScope): unknown {
	if (typeof value !== 'string' || !/^!?\$/.test(value)) return value;
	const negate = value.startsWith('!');
	const [root, ...path] = value.replace(/^!?\$/, '').split('.');
	let out: unknown;
	if (root === 'args') out = walk(scope.args, path);
	else if (root === 'result') out = walk(scope.result, path);
	else if (root === 'before') out = scope.before ? walk(scope.before, path) : undefined;
	else if (root === 'written') {
		const [table, column] = path;
		const hit = scope.rows.find((r) => r.table === table);
		out = hit ? (column === 'id' ? (hit.id ?? hit.row?.id) : hit.row?.[column]) : undefined;
	}
	if (negate) return out === undefined || out === null ? undefined : !out;
	return out;
}

export function computeUndo(alternatives: UndoAlternative[] | undefined, scope: UndoScope): UndoCall | null {
	for (const alt of alternatives ?? []) {
		if (alt.when !== undefined) {
			const cond = resolveTemplate(alt.when, scope);
			if (!cond) continue;
		}
		const args: Record<string, unknown> = {};
		let complete = true;
		for (const [k, v] of Object.entries(alt.args ?? {})) {
			const resolved = resolveTemplate(v, scope);
			if (resolved === undefined) {
				complete = false;
				break;
			}
			args[k] = resolved;
		}
		if (complete) return { function: alt.function, args };
	}
	return null;
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

export async function write(ctx: ToolContext, plan: WritePlan, opts: WriteOptions = {}): Promise<WriteOutcome> {
	const entry = entryFor(plan.fn);
	const level: Level = plan.asUndo ? 'undo' : (entry.level as Level);

	if (level === 'read') {
		const r = await ctx.backend.rpc(ctx.session, plan.fn, plan.args);
		if (r.error) return refusal(level, r.error);
		return { status: 'done', level, result: r.data, rows: [], audit_id: '', undo_available: false, message: 'Read.' };
	}

	const key = requestKey(ctx, plan, opts);
	const confirmFirst = level === 'confirm' && !opts.confirmToken;
	if (opts.dryRun || confirmFirst) {
		const r = await connectorCall(ctx, plan, key, 'preview');
		const payload = previewPayload(r.error);
		if (!payload) {
			if (r.error) return refusal(level, r.error);
			return { status: 'refused', level, message: 'The preview did not come back.' };
		}
		if (confirmFirst && !opts.dryRun) {
			const token = opaqueToken(ctx.random);
			const expiresAt = ctx.now() + CONFIRM_WINDOW_MS;
			await ctx.backend.storeConfirmation({
				tokenHash: sha256Hex(token),
				userId: ctx.session.user.id,
				tool: plan.tool,
				argsHash: argsHash(plan.tool, plan.fn, plan.args),
				preview: payload,
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
			confirmation.argsHash !== argsHash(plan.tool, plan.fn, plan.args)
		) {
			return {
				status: 'needs_confirmation',
				level,
				message:
					'That confirmation is missing, already used, more than ten minutes old, or was for different arguments. Nothing was written. Preview it again and ask him.'
			};
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
	let undoAvailable = false;
	if (!data.repeated) {
		const undo = computeUndo(entry.undo, { args: plan.args, result: data.result, rows: data.rows ?? [], before: plan.before });
		undoAvailable = undo !== null && !plan.undoOf;
		if (undo && !plan.undoOf) await ctx.backend.setAuditUndo(data.audit_id, undo).catch(() => (undoAvailable = false));
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
		const undo = row.undo as UndoCall;
		const outcome = await write(
			ctx,
			{ tool: 'undo_last', fn: undo.function, args: undo.args, undoOf: row.id, groupKey: `undo:${row.groupKey ?? row.id}`, asUndo: true },
			{ ...opts, requestId: opts.requestId ? `${opts.requestId}:${row.id}` : undefined }
		);
		outcomes.push({ undid: row.tool, made: new Date(row.startedAt).toISOString(), args: row.args, outcome });
	}
	const failed = outcomes.filter((o) => o.outcome.status === 'refused' || o.outcome.status === 'needs_confirmation');
	return {
		status: opts.dryRun ? 'preview' : failed.length ? (failed.length === outcomes.length ? 'refused' : 'partial') : 'done',
		undone: outcomes
	};
}
