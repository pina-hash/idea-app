/**
 * AN ID BY THE NAME HE SAYS IT (ledger 0422). Every site action that takes a
 * record's id can be handed its name instead: site_call looks it up as him
 * through `connector_lookup` (0290), one match goes through, several come back
 * as a question, none says so. Which argument names which kind of record is
 * data, in `lookup-kinds.json`, read here and by the generator that words
 * every generated argument, so the two never disagree.
 */
import kindsJson from './lookup-kinds.json';
import type { ToolContext } from './context';

export type LookupKind = keyof typeof kindsJson.words;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The kind of record a function's argument names, or null. */
export function lookupKindFor(fn: string, param: string): LookupKind | null {
	for (const p of kindsJson.byPrefix) if (fn.startsWith(p.prefix) && p.param === param) return p.kind as LookupKind;
	const k = (kindsJson.byParam as Record<string, string>)[param];
	return (k as LookupKind | undefined) ?? null;
}

/** The kind's words, for a sentence: "class", "IDEA Market card". */
export function lookupWords(kind: LookupKind): string {
	return kindsJson.words[kind];
}

/** Whether a value already IS the id (so nothing is looked up). */
export function looksLikeId(kind: LookupKind, value: string): boolean {
	if (kind === 'student') return value.includes('@');
	// A stock's id is a short word, not a uuid; the lookup matches it exactly.
	if (kind === 'stock') return false;
	return UUID.test(value.trim());
}

export type LookupResult =
	| { status: 'found'; id: string; name: string }
	| { status: 'ambiguous'; said: string; candidates: Array<{ id: string; name: string; detail: string | null }> }
	| { status: 'none'; said: string; message: string };

export async function lookupId(ctx: ToolContext, kind: LookupKind, said: string): Promise<LookupResult> {
	const r = await ctx.backend.rpc<{ matches: Array<{ id: string; name: string; detail: string | null }> }>(ctx.session, 'connector_lookup', {
		p_kind: kind,
		p_said: said
	});
	if (r.error) return { status: 'none', said, message: `No ${lookupWords(kind)} could be looked up: ${r.error.message}` };
	const matches = r.data?.matches ?? [];
	if (matches.length === 0) return { status: 'none', said, message: `No ${lookupWords(kind)} is called "${said}".` };
	const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9@.]+/g, ' ').trim();
	const exact = matches.filter((m) => norm(m.name) === norm(said) || m.id.toLowerCase() === said.trim().toLowerCase());
	if (exact.length === 1) return { status: 'found', id: exact[0].id, name: exact[0].name };
	if (matches.length === 1) return { status: 'found', id: matches[0].id, name: matches[0].name };
	return { status: 'ambiguous', said, candidates: (exact.length > 1 ? exact : matches).slice(0, 8) };
}
