import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { isScheduled } from '$lib/classroom/classroom';
import { UUID_RE } from '$lib/server/notebook-upload';

/**
 * THE STORED BYTES OF ONE PORTED HTML ASSIGNMENT, READ FOR A HOST THAT HOLDS NO
 * SESSION.
 *
 * `/hx/<document id>` answers on the SANDBOX ORIGIN. That origin has no session
 * cookie on it -- the absence IS the security model, not a browser declining to
 * send one -- so no request arriving there can satisfy an RLS policy, and
 * `classroom_html_assignments`' own policy ("the document follows its item")
 * cannot be the thing that decides. The read is therefore made with the SERVICE
 * ROLE and every rule RLS would have enforced is re-checked HERE, on every
 * request, explicitly. This is the same shape as `serveBundleFile` in
 * `$lib/server/foundry-bundle.ts`, for the same reason, and that module's header
 * is worth reading beside this one.
 *
 * ONE MODULE KNOWS THE CREDENTIAL. This is the only reader of
 * `SUPABASE_SERVICE_ROLE_KEY` for anything HTML-assignment shaped: the serving
 * route imports this and never builds a client of its own. **CLAUDE.md's
 * "read by exactly FOUR places" sentence is now out of date -- this is a
 * FIFTH** (GREENLINE community-track publish, the tournament push sender, the
 * anonymous feedback route, Foundry's `foundry-bundle.ts`, and this). That
 * sentence is in a file this lane does not own; it is reported rather than
 * edited.
 *
 * WHAT IT RE-CHECKS, AND WHY EACH ONE IS SEPARATE:
 *
 *   1. THE HANDLE IS A UUID. `document_id` is a uuid column, so anything else
 *      cannot name a row -- refusing it here means the database is never asked
 *      about a string somebody typed, and it is what keeps the dev fixture ids
 *      (`worksheet`, `probe`, which are deliberately NOT uuids) in a namespace
 *      that provably cannot collide with a real document.
 *   2. THE ROW EXISTS. One row, by handle, and nothing else is looked up by.
 *   3. THE ITEM IS AN ASSIGNMENT AND IS LIVE. `published`, and either no
 *      `publish_at` or one that has passed -- which is `_classroom_item_live`
 *      (0109), the condition every classroom read already uses. Expressed as
 *      `published && !isScheduled(...)` rather than re-typed, because a second
 *      spelling of "is this visible yet" is the pair that stops agreeing.
 *
 * THE PUBLICATION GATE IS NOT A SESSION CHECK, AND THAT IS FORCED RATHER THAN
 * CHOSEN, exactly as it is for a Foundry bundle. Requiring a signed-in caller
 * here means either `Domain`-scoping the portal's cookies onto the sandbox host
 * -- which hands every uploaded document the credentials the second origin
 * exists to withhold -- or putting a signed token on every request, which is the
 * machinery Foundry spent five lanes removing. So the licence comes from the
 * ITEM'S OWN PUBLICATION STATE.
 *
 * WHAT THAT COSTS, STATED RATHER THAN DISCOVERED: **a teacher cannot preview an
 * UNPUBLISHED item's document.** The frame renders empty and reads as a broken
 * upload. The answer when that has to close is the one Foundry already worked
 * out and is NOT a looser gate here: a second read on the PORTAL origin that
 * gates on WHO IS ASKING (`previewBundleFile`'s shape), because that is the only
 * origin where the question can be asked at all. A flag on this function would
 * put one boolean between every unpublished document and the open internet.
 *
 * EVERY REFUSAL IS THE SAME ANSWER. An unparseable handle, an unknown one, an
 * item that is not an assignment, an unpublished item, a scheduled one and a
 * deployment with no service key are indistinguishable to the caller, which is
 * what stops a document id being probed for.
 */

/** The bytes, or the one refusal. No reason: the route answers a bodyless 404. */
export type HxStoredDocument = { ok: true; html: string } | { ok: false };

const REFUSED = { ok: false } as const;

/**
 * The service-role client. Built per call rather than held at module scope, the
 * way `foundry-bundle.ts` builds its own: the key is read through
 * `$env/dynamic/private`, so a module-scope client would capture whatever the
 * environment held at import time and an unset key would be permanent.
 */
function admin() {
	const key = env.SUPABASE_SERVICE_ROLE_KEY;
	if (!key) return null;
	return createClient(PUBLIC_SUPABASE_URL, key, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}

type AdminClient = NonNullable<ReturnType<typeof admin>>;

/** Is a service-role read possible on this deployment at all. Read by the dev
    harness, which otherwise cannot tell "no such document" from "no key". */
export function hxDocumentStoreConfigured(): boolean {
	return Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * THE BYTES ARE CACHED IN THE FUNCTION'S OWN MEMORY; THE ACCESS DECISION IS NOT
 * (ledger 0357).
 *
 * WHY. `/hx/<docId>` used to read the whole `document` column (up to 2 MB) out
 * of Postgres on every request, and on 2026-09-29 and 2026-09-30 twenty-one
 * students opening the same post at 8:00 on a Nano database was one of the
 * loads that stalled it. A document's bytes change only when a teacher
 * re-imports, restores or removes it, and every one of those goes through
 * `classroom_set_html_assignment` (0195), which stamps `updated_at = now()` in
 * the same statement that writes the bytes. `document_id` is stable across a
 * re-import (the upsert keeps it) and a removal deletes the row, so
 * `(document_id, updated_at)` names one exact set of bytes. That pair is the
 * VERSION, it is read from small columns, and it is what the cache and the
 * ETag are keyed on.
 *
 * WHAT IS STILL READ ON EVERY REQUEST, AND THIS IS THE PART NOT TO WEAKEN:
 * the document row's `item_id` and `updated_at`, and the item's `kind`,
 * `published` and `publish_at`. So an item unpublished, scheduled ahead or
 * deleted is refused on the very next request, warm cache or not, 304 or not;
 * there is no window in which the server serves it. The cache only ever
 * answers "what are the bytes of a version the database just said is live".
 *
 * WHAT IT CANNOT SEE, STATED RATHER THAN DISCOVERED. A hand edit of the
 * `document` column in the SQL editor that does not also set `updated_at`
 * changes the bytes without changing the version, so a warm instance (and a
 * browser holding the old ETag) keeps the old bytes. `HX_CACHE_MAX_AGE_MS`
 * bounds the server half; set `updated_at = now()` in the same statement and
 * both halves move at once.
 *
 * WHAT A CACHE ENTRY IS WORTH ON VERCEL. One function instance keeps its
 * module state between requests while it is warm and serves many requests at
 * once, so a class arriving together lands on a handful of instances and each
 * reads the bytes once. A cold instance is today's cost, never more: the first
 * read for a document the instance has not seen selects the bytes in the SAME
 * query as the version, so the cold path is still two queries.
 */
export const HX_CACHE_MAX_BYTES = 32 * 1024 * 1024;
export const HX_CACHE_MAX_ENTRIES = 64;
export const HX_CACHE_MAX_AGE_MS = 10 * 60_000;

interface CachedDocument {
	version: string;
	html: string;
	bytes: number;
	at: number;
}

/** Keyed by `document_id`; one version per document, least recently used first. */
const cache = new Map<string, CachedDocument>();
let cachedBytes = 0;
/** One read of the bytes per (document, version) at a time, however many ask. */
const inflight = new Map<string, Promise<{ html: string; version: string } | null>>();
/** A cold read in flight, by document: the first request's own query, shared. */
const coldReads = new Map<string, Promise<{ html: string; version: string } | null>>();

/** The clock, for the test that ages an entry. */
let clock: () => number = () => Date.now();

function cacheGet(documentId: string, version: string): string | null {
	const hit = cache.get(documentId);
	if (!hit || hit.version !== version) return null;
	if (clock() - hit.at > HX_CACHE_MAX_AGE_MS) return null;
	// Re-insert so the Map's insertion order stays least-recently-used first.
	cache.delete(documentId);
	cache.set(documentId, hit);
	return hit.html;
}

function cachePut(documentId: string, version: string, html: string): void {
	const bytes = html.length * 2;
	if (bytes > HX_CACHE_MAX_BYTES) return;
	const old = cache.get(documentId);
	if (old) {
		cachedBytes -= old.bytes;
		cache.delete(documentId);
	}
	cache.set(documentId, { version, html, bytes, at: clock() });
	cachedBytes += bytes;
	for (const [key, entry] of cache) {
		if (cachedBytes <= HX_CACHE_MAX_BYTES && cache.size <= HX_CACHE_MAX_ENTRIES) break;
		cache.delete(key);
		cachedBytes -= entry.bytes;
	}
}

/** Tests only: forget every cached document and, optionally, move the clock. */
export function _resetHxDocumentCache(now?: () => number): void {
	cache.clear();
	inflight.clear();
	coldReads.clear();
	cachedBytes = 0;
	clock = now ?? (() => Date.now());
}

/** Tests only: how many documents the cache holds right now. */
export function _hxDocumentCacheSize(): number {
	return cache.size;
}

/**
 * A served document's version: the stored `updated_at` as Postgres wrote it.
 * Compared as a string only, never parsed -- two reads of one row return the
 * identical text, and a parse is a place two spellings of one instant could
 * differ.
 */
function versionOf(updatedAt: unknown): string | null {
	return typeof updatedAt === 'string' && updatedAt !== '' ? updatedAt : null;
}

/**
 * Is the item this document belongs to an assignment that is live right now.
 * Read on EVERY request; see the cache header above for why it is never cached.
 */
async function itemIsLive(client: AdminClient, itemId: string): Promise<boolean> {
	let read;
	try {
		read = await client
			.from('classroom_items')
			.select('id, kind, published, publish_at')
			.eq('id', itemId)
			.maybeSingle<{ id: string; kind: string; published: boolean; publish_at: string | null }>();
	} catch {
		return false;
	}
	const { data: item, error: itemErr } = read;
	if (itemErr || !item) return false;
	if (item.kind !== 'assignment') return false;
	// `publish_at` is ALWAYS selected above, so `isScheduled`'s undefined branch
	// (which reads an unselected column as live) is unreachable from here. It
	// matters that it is unreachable rather than merely unlikely: that branch is
	// correct for a display chip and would be a hole in an access decision.
	if (!item.published || isScheduled(item)) return false;
	return true;
}

/** What a request may be answered with: the version, and how to get its bytes. */
export type HxDocumentHead =
	| { ok: false }
	| {
			ok: true;
			version: string;
			/**
			 * The bytes of THIS version, or of a newer one if a re-import landed
			 * between the two reads -- in which case `version` comes back newer
			 * too, and the caller's ETag follows it. Null is the one refusal.
			 */
			bytes: () => Promise<{ html: string; version: string } | null>;
	  };

/**
 * May this document be served, and at which version. Reads small columns
 * only, unless this instance has never seen the document AND the caller is
 * going to want the bytes (`prefetch`) -- then the bytes come back in the same
 * query, so a cold instance serving a first view costs what it always did. A
 * REVALIDATION (a request carrying `If-None-Match`) and a HEAD pass `prefetch:
 * false`: they usually end in no body at all, so a cold instance answering one
 * must not read the big column to say "you have it already".
 *
 * Every refusal is the same answer: an unparseable handle, an unknown one, an
 * item that is not an assignment, an unpublished item, a scheduled one and a
 * deployment with no service key are indistinguishable to the caller.
 */
export async function hxStoredDocumentHead(
	documentId: string,
	options: { prefetch?: boolean } = {}
): Promise<HxDocumentHead> {
	if (!UUID_RE.test(documentId)) return REFUSED;

	const client = admin();
	if (!client) return REFUSED;

	// COLD means this instance holds no copy and no other request is already
	// fetching one. Only a cold request selects the bytes with the version; a
	// request arriving while a cold read is in flight reads small columns and
	// then waits on that read (below), so a class arriving at once on a fresh
	// instance costs ONE full read, not one per student.
	const cold =
		(options.prefetch ?? true) && !cache.has(documentId) && !coldReads.has(documentId);
	// ONE promise over the builder. A PostgREST builder is a thenable that sends
	// its request every time `.then` is called, so awaiting the builder itself
	// twice (once here, once in the cold read) would be two requests.
	const query = Promise.resolve(
		client
			.from('classroom_html_assignments')
			.select(cold ? 'item_id, updated_at, document' : 'item_id, updated_at')
			.eq('document_id', documentId)
			.maybeSingle<{ item_id: string; updated_at: string; document?: string }>()
	);
	let coldRead: Promise<{ html: string; version: string } | null> | null = null;
	if (cold) {
		coldRead = query.then(({ data, error }) => {
			const version = versionOf(data?.updated_at);
			if (error || !data || !version) return null;
			if (typeof data.document !== 'string' || data.document === '') return null;
			// Cached before the access check, deliberately and harmlessly: the cache
			// is keyed on bytes, and every request re-asks the item below before it
			// is handed any.
			cachePut(documentId, version, data.document);
			return { html: data.document, version };
		}, () => null);
		coldReads.set(documentId, coldRead);
		void coldRead.finally(() => {
			if (coldReads.get(documentId) === coldRead) coldReads.delete(documentId);
		});
	}
	let got: Awaited<typeof query>;
	try {
		got = await query;
	} catch {
		return REFUSED;
	}
	const { data: row, error: rowErr } = got;
	if (rowErr || !row || typeof row.item_id !== 'string') return REFUSED;
	const version = versionOf(row.updated_at);
	if (!version) return REFUSED;
	if (cold && (typeof row.document !== 'string' || row.document === '')) return REFUSED;

	if (!(await itemIsLive(client, row.item_id))) return REFUSED;

	return {
		ok: true,
		version,
		bytes: async () => {
			if (coldRead) return coldRead;
			const hit = cacheGet(documentId, version);
			if (hit !== null) return { html: hit, version };
			const othersCold = coldReads.get(documentId);
			if (othersCold) {
				const got = await othersCold;
				if (got && got.version === version) return got;
			}
			const key = `${documentId}\n${version}`;
			let pending = inflight.get(key);
			if (!pending) {
				pending = readBytes(client, documentId)
					.catch(() => null)
					.finally(() => inflight.delete(key));
				inflight.set(key, pending);
			}
			return pending;
		}
	};
}

/**
 * The one read of the `document` column on a warm instance. Takes `updated_at`
 * with it, so the bytes are cached under the version they ARE rather than the
 * one that was asked about: a re-import landing between the head read and this
 * one is served as the newer version, never filed under the older key.
 */
async function readBytes(
	client: AdminClient,
	documentId: string
): Promise<{ html: string; version: string } | null> {
	const { data, error } = await client
		.from('classroom_html_assignments')
		.select('document, updated_at')
		.eq('document_id', documentId)
		.maybeSingle<{ document: string; updated_at: string }>();
	if (error || !data || typeof data.document !== 'string' || data.document === '') return null;
	const version = versionOf(data.updated_at);
	if (!version) return null;
	cachePut(documentId, version, data.document);
	return { html: data.document, version };
}

/**
 * One stored document by its public handle, if and only if it may be served.
 *
 * NOTHING REWRITES A STORED BYTE. What comes back is the `document` column
 * verbatim -- the same bytes the manifest was read out of at import, and the
 * same bytes a reviewer reads. The route adds headers and nothing else.
 *
 * Kept for any caller that wants the bytes outright; the serving route uses
 * `hxStoredDocumentHead` so a revalidation can be answered with no bytes read.
 */
export async function hxStoredDocument(documentId: string): Promise<HxStoredDocument> {
	const head = await hxStoredDocumentHead(documentId);
	if (!head.ok) return REFUSED;
	const got = await head.bytes();
	return got ? { ok: true, html: got.html } : REFUSED;
}

/**
 * THE STRONG ETAG FOR ONE SERVED VERSION (ledger 0357).
 *
 * It covers the document, the version AND the header set it is served with,
 * because a 304 tells the browser to keep the body it already has and to take
 * the headers again: a CSP that changed (another portal origin on a preview,
 * a directive added in a deploy) must not ride a stale tag. Hashed so a header
 * value never appears in a request header the browser sends back.
 */
export function hxDocumentEtag(documentId: string, version: string, csp: string): string {
	const digest = createHash('sha256')
		.update(`${documentId}\n${version}\n${csp}`)
		.digest('base64url')
		.slice(0, 32);
	return `"hx-${digest}"`;
}

/**
 * Does an `If-None-Match` header name this tag. RFC 9110 13.1.2: the
 * comparison is WEAK (a `W/` prefix is ignored), the header may list several
 * tags, and `*` matches any current representation -- which this request has,
 * because the access check already passed.
 */
export function hxIfNoneMatchHits(header: string | null, etag: string): boolean {
	if (!header) return false;
	const want = etag.replace(/^W\//, '');
	return header.split(',').some((raw) => {
		const tag = raw.trim();
		return tag === '*' || tag.replace(/^W\//, '') === want;
	});
}
