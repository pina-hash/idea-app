// tests/html-assignment-bridge.test.ts
//
// THE PARENT SIDE OF THE HTML-ASSIGNMENT BOUNDARY, PUT TO A HOSTILE INPUT.
//
// WHY THIS FILE EXISTS, given the repo adds tests sparingly. Every failure it
// pins is SILENT -- it renders correctly, it type-checks, and the only symptom
// is a student's uploaded document doing something nobody meant:
//
// 1. THE PROVENANCE CHECKS. A parent that stopped validating `event.origin` or
//    `event.source` would accept a forged message from any window that can
//    reach this one, and the surface would look exactly the same. There is no
//    rendering difference between "the frame said this" and "something else
//    said this".
//
// 2. THE FIELD-TO-BLOCK MAPPING. A frame naming a `block_id` directly is
//    writing to an arbitrary row of `classroom_responses`. The failure is a
//    value landing in somebody else's block, which nothing on screen reports.
//
// 3. THE `event.origin` VALUE ITSELF, which is `"null"` and not the document
//    origin. That is the single most surprising fact in this lane and the one
//    a future reader is most likely to "fix" back into a literal comparison
//    against `https://sandbox.ideabosco.com` -- which drops every real message
//    and makes the whole feature inert, silently.
//
// 4. THE SERVED HEADERS. The CSP is the whole of what stops an uploaded
//    document exfiltrating answers, and a document served without it renders
//    identically.
//
// WHAT THIS FILE CANNOT DO, AND WHERE THAT IS DONE INSTEAD. It cannot prove
// containment. There is no browser here, so no sandbox, no opaque origin and no
// `SecurityError` -- a test asserting "the frame cannot read the parent" in this
// project would be asserting something no code here enforces. That proof is
// `tools/browser-verify/routes/html-assignment.mjs` driving `/dev/html-assignment`
// in a real Chromium, where a hostile document attempts each escape and the
// refusals are read off the page. See this lane's history entry for the measured
// numbers and the mutation proof.
//
// EVERY REFUSAL HERE IS PAIRED WITH A POSITIVE CONTROL. A gate that has stopped
// listening refuses everything, which is indistinguishable from a gate that
// works unless something is also expected to get through.

import { describe, expect, it } from 'vitest';

import {
	HX_MAX_HEIGHT_PX,
	HX_SANDBOX_FLAGS,
	HX_SCHEMA_VERSION,
	hxExpectedOrigin,
	hxPostTarget,
	hxReceive,
	hxSavedMessage,
	hxStateMessage,
	type HxGate
} from '../src/lib/classroom/html-assignment/bridge.ts';
import {
	HX_PORTAL_ORIGIN,
	hxDocumentCsp,
	hxDocumentHeaders,
	hxOnServingHost,
	hxPortalOrigin,
	hxPortalOriginIsRequestHost
} from '../src/routes/hx/_headers.ts';
import {
	GET as HX_GET,
	HEAD as HX_HEAD,
	fallback as HX_FALLBACK
} from '../src/routes/hx/[docId]/+server.ts';
import { HX_DOCUMENT_IDS, hxDocument, hxFieldMap } from '../src/routes/hx/_documents.ts';
import { setDev } from './stubs/app-environment.ts';

const SANDBOX = 'https://sandbox.ideabosco.com';

/** A stand-in for the frame's own `contentWindow`. Identity is the whole test:
    the gate compares by reference, so any object works and only THIS one
    passes. */
const FRAME = { name: 'the frame contentWindow' };
const OTHER_WINDOW = { name: 'some other window' };

const FIELDS = Object.freeze({
	teamName: 'mod-1.a.team',
	reflection: 'mod-1.b.reflection',
	checkedOff: 'mod-1.c.done'
});

function gate(over: Partial<HxGate> = {}): HxGate {
	return {
		documentOrigin: SANDBOX,
		frameWindow: FRAME,
		sandboxFlags: HX_SANDBOX_FLAGS,
		fieldToBlockId: FIELDS,
		...over
	};
}

/** A message as it arrives from a correctly sandboxed frame. `origin` is
    `"null"` because the sandbox makes the document's origin opaque. */
function fromFrame(data: unknown, over: { origin?: string; source?: unknown } = {}) {
	return { origin: over.origin ?? 'null', source: 'source' in over ? over.source : FRAME, data };
}

describe('the sandbox flags are one string and allow-same-origin is not in it', () => {
	it('is allow-scripts and nothing else', () => {
		expect(HX_SANDBOX_FLAGS).toBe('allow-scripts');
	});

	// The pair is what cancels the sandbox outright. This is the assertion that
	// reddens if a later change "just needs" the flag.
	it('never grants allow-same-origin', () => {
		expect(HX_SANDBOX_FLAGS).not.toContain('allow-same-origin');
	});
});

describe('the expected event.origin is "null", because the sandbox makes it opaque', () => {
	// MEASURED IN A REAL CHROMIUM, not reasoned about: with
	// sandbox="allow-scripts" every message from the frame arrives carrying
	// event.origin === "null". A literal comparison against the document origin
	// would drop all of them.
	it('is "null" under the flags this feature actually ships', () => {
		expect(hxExpectedOrigin(SANDBOX, HX_SANDBOX_FLAGS)).toBe('null');
	});

	// The positive control for the rule: it is derived from the sandbox, so it
	// is not merely hardcoded to "null" and cannot silently stop being a check.
	it('is the document origin when the sandbox does grant allow-same-origin', () => {
		expect(hxExpectedOrigin(SANDBOX, 'allow-scripts allow-same-origin')).toBe(SANDBOX);
	});

	it('does not match allow-same-origin inside a longer flag name', () => {
		expect(hxExpectedOrigin(SANDBOX, 'allow-same-origin-ish')).toBe('null');
		expect(hxExpectedOrigin(SANDBOX, 'xallow-same-origin')).toBe('null');
	});
});

describe('provenance: only this frame, from an opaque origin, is heard', () => {
	const change = { type: 'idea:change', field: 'teamName', value: 'Team Kestrel' };

	// THE POSITIVE CONTROL. Without it every refusal below passes on a gate that
	// has stopped accepting anything at all.
	it('accepts a well-formed message from the frame', () => {
		const verdict = hxReceive(fromFrame(change), gate());
		expect(verdict).toEqual({
			ok: true,
			message: { kind: 'change', blockId: 'mod-1.a.team', field: 'teamName', value: 'Team Kestrel' }
		});
	});

	it('drops a message from any other origin', () => {
		for (const origin of ['https://evil.example', SANDBOX, HX_PORTAL_ORIGIN, '', 'NULL']) {
			const verdict = hxReceive(fromFrame(change, { origin }), gate());
			expect(verdict.ok, `origin ${JSON.stringify(origin)} must be refused`).toBe(false);
			if (!verdict.ok) expect(verdict.reason).toBe('origin');
		}
	});

	// `SANDBOX` in that list is the one worth naming: the document origin itself
	// is REFUSED, because a message actually carrying it is a message from a
	// frame whose sandbox is not what this parent thinks it is.

	it('drops a message whose source is not this frame', () => {
		for (const source of [OTHER_WINDOW, null, undefined, {}]) {
			const verdict = hxReceive(fromFrame(change, { source }), gate());
			expect(verdict.ok).toBe(false);
			if (!verdict.ok) expect(verdict.reason).toBe('source');
		}
	});

	// FAIL-CLOSED BEFORE THE FRAME EXISTS. "We do not know yet" must not read as
	// a pass -- there is no frame, so nothing can legitimately speak for one.
	it('drops everything while there is no frame window yet', () => {
		const verdict = hxReceive(fromFrame(change), gate({ frameWindow: null }));
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.reason).toBe('source');
	});

	// THE CASE THE EXPLICIT NULL GUARD IS ACTUALLY FOR, AND IT SURVIVED A
	// MUTATION UNTIL THIS EXISTED. With the guard removed, every other refusal
	// still held -- `source !== frameWindow` catches a real window against a null
	// frame -- so the mutant passed 46 of 46 and the guard looked redundant. It
	// is not: a message with NO source, arriving before the frame is mounted,
	// makes the comparison `null !== null`, which is FALSE, and the message is
	// accepted. That is precisely the window in which a page can be handed a
	// forged event and nothing real is speaking yet.
	it('drops a sourceless message against a frame that does not exist yet', () => {
		for (const pair of [
			{ source: null, frameWindow: null },
			{ source: undefined, frameWindow: undefined },
			{ source: null, frameWindow: undefined },
			{ source: undefined, frameWindow: null }
		]) {
			const verdict = hxReceive(
				fromFrame(change, { source: pair.source }),
				gate({ frameWindow: pair.frameWindow })
			);
			expect(verdict.ok, JSON.stringify(pair)).toBe(false);
			if (!verdict.ok) expect(verdict.reason).toBe('source');
		}
	});

	// ORDER MATTERS: provenance is settled before a byte of the payload is read.
	it('refuses a wrong origin before it looks at the payload at all', () => {
		const verdict = hxReceive(
			fromFrame({ type: 'idea:change', field: 'teamName', value: 'x' }, { origin: 'https://evil.example' }),
			gate({ frameWindow: null })
		);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.reason).toBe('origin');
	});
});

describe('a frame naming a block_id gets nowhere', () => {
	it('drops a change that carries block_id instead of field', () => {
		const verdict = hxReceive(
			fromFrame({ type: 'idea:change', block_id: 'mod-1.b.reflection', value: 'forged' }),
			gate()
		);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.reason).toBe('shape');
	});

	it('drops every other spelling of the same attack', () => {
		for (const key of ['blockId', 'block', 'block-id', 'id']) {
			const verdict = hxReceive(
				fromFrame({ type: 'idea:change', [key]: 'mod-1.b.reflection', value: 'forged' }),
				gate()
			);
			expect(verdict.ok, `${key} must not resolve`).toBe(false);
		}
	});

	// THE SHARPEST ONE. A BLOCK ID in the FIELD slot is the attack that would
	// work if the map were ever bypassed -- and it is why the fixture's field
	// names and block ids are deliberately different strings.
	it('drops a change whose field is a block id', () => {
		for (const blockId of Object.values(FIELDS)) {
			const verdict = hxReceive(
				fromFrame({ type: 'idea:change', field: blockId, value: 'forged' }),
				gate()
			);
			expect(verdict.ok, `${blockId} must not be accepted as a field`).toBe(false);
			if (!verdict.ok) expect(verdict.reason).toBe('field');
		}
	});

	it('drops a field no block declares', () => {
		const verdict = hxReceive(
			fromFrame({ type: 'idea:change', field: 'somethingElse', value: 'x' }),
			gate()
		);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.reason).toBe('field');
	});

	// A PLAIN OBJECT USED AS A LOOKUP TABLE OVER AN OUTSIDER'S STRING resolves
	// `constructor` and `toString` through the prototype chain to a FUNCTION,
	// which is truthy -- so the caller would hold a "block id" that is a chunk of
	// JavaScript source.
	it('does not resolve a prototype key as a block id', () => {
		for (const field of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
			const verdict = hxReceive(fromFrame({ type: 'idea:change', field, value: 'x' }), gate());
			expect(verdict.ok, `${field} must not resolve`).toBe(false);
			if (!verdict.ok) expect(verdict.reason).toBe('field');
		}
	});

	// TWO LAYERS REFUSE A PROTOTYPE KEY AND ONLY ONE OF THEM IS OBVIOUS. The
	// `Object.hasOwn` guard is the first; `typeof blockId === 'string'` behind it
	// is the second, and for the ordinary keys above the second alone is enough
	// (they all resolve to FUNCTIONS or objects). So removing the guard survived
	// a mutation -- 46 of 46 -- and it looked like a redundant line to delete.
	//
	// IT IS NOT REDUNDANT, and this is the case that shows it: a map built with
	// `Object.create(defaults)` carries STRING-VALUED inherited keys, which sail
	// straight past the type check. `Object.create` is an ordinary way to build a
	// lookup with defaults, so this is a shape a future caller can genuinely hand
	// in -- not a contrivance. CLAUDE.md's rule is exactly this: do not remove a
	// redundant check because a test did not notice; open both and confirm only
	// the pair reddens.
	it('resolves through OWN keys only, so an inherited string field is refused', () => {
		const inherited = Object.create({ inheritedField: 'mod-1.b.reflection' }) as Record<string, string>;
		inherited.teamName = 'mod-1.a.team';
		const verdict = hxReceive(
			fromFrame({ type: 'idea:change', field: 'inheritedField', value: 'forged' }),
			gate({ fieldToBlockId: inherited })
		);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.reason).toBe('field');
		// The positive control on the same map: its OWN key still resolves, so
		// this is not passing because the map is broken.
		expect(hxReceive(fromFrame({ type: 'idea:change', field: 'teamName', value: 'x' }), gate({ fieldToBlockId: inherited })).ok).toBe(true);
	});

	it('maps through the parent map rather than passing the field along', () => {
		const verdict = hxReceive(
			fromFrame({ type: 'idea:change', field: 'reflection', value: 'two sentences.' }),
			gate()
		);
		expect(verdict.ok).toBe(true);
		if (verdict.ok && verdict.message.kind === 'change') {
			// The block id is NOT the field name. If these were ever the same
			// string the mapping could stop running and nothing would notice.
			expect(verdict.message.blockId).toBe('mod-1.b.reflection');
			expect(verdict.message.blockId).not.toBe(verdict.message.field);
		}
	});
});

describe('the payload shapes', () => {
	it('accepts a boolean change and a string change, and nothing else', () => {
		expect(hxReceive(fromFrame({ type: 'idea:change', field: 'checkedOff', value: true }), gate()).ok).toBe(true);
		expect(hxReceive(fromFrame({ type: 'idea:change', field: 'teamName', value: '' }), gate()).ok).toBe(true);
		for (const value of [1, null, undefined, {}, [], () => {}]) {
			const verdict = hxReceive(fromFrame({ type: 'idea:change', field: 'teamName', value }), gate());
			expect(verdict.ok, `${typeof value} must be refused`).toBe(false);
		}
	});

	it('accepts idea:ready only at this parent schema version', () => {
		const ok = hxReceive(fromFrame({ type: 'idea:ready', schemaVersion: HX_SCHEMA_VERSION }), gate());
		expect(ok).toEqual({ ok: true, message: { kind: 'ready', schemaVersion: HX_SCHEMA_VERSION } });
		for (const schemaVersion of [2, 4, '3', null]) {
			const verdict = hxReceive(fromFrame({ type: 'idea:ready', schemaVersion }), gate());
			expect(verdict.ok, `schema ${schemaVersion} must be refused`).toBe(false);
		}
	});

	it('accepts an image and resolves its field too', () => {
		const verdict = hxReceive(
			fromFrame({ type: 'idea:image', field: 'teamName', name: 'bench.jpg', bytes: 'AAAA' }),
			gate()
		);
		expect(verdict).toEqual({
			ok: true,
			message: { kind: 'image', blockId: 'mod-1.a.team', field: 'teamName', name: 'bench.jpg', bytes: 'AAAA' }
		});
	});

	it('drops an image whose field is a block id', () => {
		const verdict = hxReceive(
			fromFrame({ type: 'idea:image', field: 'mod-1.a.team', name: 'x.jpg', bytes: 'AAAA' }),
			gate()
		);
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.reason).toBe('field');
	});

	it('accepts a sane height and refuses one that would break the page', () => {
		expect(hxReceive(fromFrame({ type: 'idea:height', px: 900 }), gate()).ok).toBe(true);
		expect(hxReceive(fromFrame({ type: 'idea:height', px: HX_MAX_HEIGHT_PX }), gate()).ok).toBe(true);
		for (const px of [HX_MAX_HEIGHT_PX + 1, 99_999_999, 0, -10, Infinity, NaN, '900', null]) {
			const verdict = hxReceive(fromFrame({ type: 'idea:height', px }), gate());
			expect(verdict.ok, `height ${px} must be refused`).toBe(false);
			if (!verdict.ok) expect(verdict.reason).toBe('height');
		}
	});

	it('drops an unknown type and a payload that is not an object', () => {
		expect(hxReceive(fromFrame({ type: 'idea:evaluate', code: '1' }), gate()).ok).toBe(false);
		for (const data of ['idea:change', 42, null, undefined, ['idea:change'], { noType: 1 }]) {
			expect(hxReceive(fromFrame(data), gate()).ok, `${JSON.stringify(data)} must be refused`).toBe(false);
		}
	});
});

describe('what the parent sends down', () => {
	it('builds the two contract messages and nothing else', () => {
		expect(hxStateMessage({ teamName: 'Kestrel' }, {}, true)).toEqual({
			type: 'idea:state',
			values: { teamName: 'Kestrel' },
			images: {},
			readOnly: true
		});
		expect(hxSavedMessage('2026-09-10T03:00:00Z', true)).toEqual({
			type: 'idea:saved',
			at: '2026-09-10T03:00:00Z',
			ok: true,
			schemaVersion: 3
		});
	});

	// A DOCUMENT SHOWS THE STUDENT SOMETHING, AND "not saved" WITH NO REASON IS
	// the message this repository already refuses to ship on its own surfaces.
	// A document cannot ask a follow-up question, so a failure that names
	// nothing is a dead end for whoever is looking at it.
	it('carries a reason on a failure and none at all on a success', () => {
		const bad = hxSavedMessage('2026-09-10T03:00:00Z', false, 'The class is closed for grading.');
		expect(bad).toEqual({
			type: 'idea:saved',
			at: '2026-09-10T03:00:00Z',
			ok: false,
			schemaVersion: 3,
			reason: 'The class is closed for grading.'
		});
		// A success has no `reason` KEY at all, not a null one: absence is the
		// mechanism, so a document cannot render an explanation for something
		// that worked.
		expect('reason' in hxSavedMessage('2026-09-10T03:00:00Z', true)).toBe(false);
	});

	// A failure the caller could not explain still says something, because
	// falling back to nothing is falling back to the case above.
	it('falls back to one sentence rather than to silence', () => {
		for (const empty of [undefined, null, '', '   ']) {
			const msg = hxSavedMessage('2026-09-10T03:00:00Z', false, empty as string | null | undefined);
			expect(msg).toHaveProperty('reason');
			expect((msg as { reason: string }).reason.length).toBeGreaterThan(10);
		}
	});

	// `'*'` LOOKS WRONG AND IS FORCED. `postMessage`'s targetOrigin is a refusal
	// the browser applies against the RECEIVING document's origin, and an opaque
	// origin matches no origin string that can be written down -- so any concrete
	// target silently drops every message the parent sends.
	it('posts to "*" because an opaque origin matches no concrete target', () => {
		expect(hxPostTarget).toBe('*');
	});
});

describe('the served document: the host gate', () => {
	it('answers on any host when nothing is configured', () => {
		for (const origin of ['http://127.0.0.1:5199', SANDBOX, HX_PORTAL_ORIGIN]) {
			expect(hxOnServingHost(origin, '')).toBe(true);
			expect(hxOnServingHost(origin, undefined)).toBe(true);
		}
	});

	it('answers only on the configured origin once one is named', () => {
		expect(hxOnServingHost(SANDBOX, SANDBOX)).toBe(true);
		// THE ONE THAT MATTERS: the main host is where the session cookies are.
		expect(hxOnServingHost(HX_PORTAL_ORIGIN, SANDBOX)).toBe(false);
		expect(hxOnServingHost('https://evil.example', SANDBOX)).toBe(false);
	});

	it('reads a trailing slash as the same origin, not a different one', () => {
		expect(hxOnServingHost(SANDBOX, `${SANDBOX}/`)).toBe(true);
	});
});

describe('the served document: frame-ancestors', () => {
	// PRODUCTION WITH NOTHING CONFIGURED IS THE CONTRACT'S OWN LITERAL. This is
	// the assertion that keeps the resolved directive honest against the
	// normative document.
	it('is the contract literal on a split-origin deployment with no portal named', () => {
		expect(hxPortalOrigin('', SANDBOX, SANDBOX)).toBe('https://ideabosco.com');
		expect(hxPortalOriginIsRequestHost('', SANDBOX)).toBe(false);
	});

	it('honours an explicitly named portal origin', () => {
		expect(hxPortalOrigin('https://preview.example', SANDBOX, SANDBOX)).toBe('https://preview.example');
	});

	it('names the requesting host only when one host answers both roles', () => {
		expect(hxPortalOrigin('', '', 'http://127.0.0.1:5199')).toBe('http://127.0.0.1:5199');
		expect(hxPortalOriginIsRequestHost('', '')).toBe(true);
	});

	// THE WHOLE POLICY, PINNED BYTE FOR BYTE. A directive dropped or reordered
	// here is a document served under a policy nobody compared, and it renders
	// identically.
	it('produces exactly the contract policy in production', () => {
		expect(hxDocumentCsp(HX_PORTAL_ORIGIN)).toBe(
			"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; " +
				"style-src 'unsafe-inline'; " +
				"img-src data: blob:; connect-src 'none'; form-action 'none'; " +
				'frame-ancestors https://ideabosco.com'
		);
	});

	// THE DIRECTIVE 0134 ADDED, AND WHY IT IS ASSERTED APART FROM THE WHOLE
	// POLICY ABOVE. The byte-for-byte pin reddens for any edit at all, which
	// makes it useless for saying WHICH property was lost. This one names the
	// property: a directly navigated document is placed in an opaque origin.
	// The gap it closes is real -- with `PUBLIC_HX_SANDBOX_ORIGIN` unset the
	// route answers on the cookie-carrying portal host, where the iframe
	// attribute governs nothing because there is no iframe.
	it('sandboxes a directly navigated document, with the frame\'s own flags', () => {
		expect(hxDocumentCsp(HX_PORTAL_ORIGIN)).toContain(`sandbox ${HX_SANDBOX_FLAGS}`);
	});

	// The pair that cancels a sandbox outright. Foundry grants
	// `allow-same-origin` conditionally because its bundles answer on a host
	// that is by construction not the portal; this route has no such guarantee,
	// so the strict set is the only correct answer here.
	it('never grants allow-same-origin beside allow-scripts', () => {
		expect(hxDocumentCsp(HX_PORTAL_ORIGIN)).not.toContain('allow-same-origin');
		expect(hxDocumentCsp('http://127.0.0.1:5199')).not.toContain('allow-same-origin');
	});

	it('keeps every non-negotiable directive whatever the portal origin is', () => {
		const csp = hxDocumentCsp('http://127.0.0.1:5199');
		expect(csp).toContain('sandbox allow-scripts');
		expect(csp).toContain("connect-src 'none'");
		expect(csp).toContain("default-src 'none'");
		expect(csp).toContain("form-action 'none'");
		expect(csp).toContain('img-src data: blob:');
	});

	it('carries the rest of the header set', () => {
		const headers = hxDocumentHeaders(HX_PORTAL_ORIGIN);
		expect(headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(headers.get('x-content-type-options')).toBe('nosniff');
		expect(headers.get('referrer-policy')).toBe('no-referrer');
		expect(headers.get('x-robots-tag')).toBe('noindex, nofollow');
	});
});

describe('the served document: the real route handler', () => {
	function get(docId: string, opts: { origin?: string; method?: string } = {}) {
		const origin = opts.origin ?? SANDBOX;
		const href = `${origin}/hx/${docId}`;
		// GET and HEAD are the two real handlers; everything else is the refusal.
		// Routing HEAD to `fallback` here made this helper report a 404 the route
		// never gave -- a harness defect that reads exactly like a route defect.
		const method = opts.method ?? 'GET';
		const handler = method === 'GET' ? HX_GET : method === 'HEAD' ? HX_HEAD : HX_FALLBACK;
		return handler({
			params: { docId },
			url: new URL(href),
			request: new Request(href, { method })
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any) as Promise<Response>;
	}

	function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
		const previous: Record<string, string | undefined> = {};
		for (const [k, v] of Object.entries(vars)) {
			previous[k] = process.env[k];
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
		try {
			return fn();
		} finally {
			for (const [k, v] of Object.entries(previous)) {
				if (v === undefined) delete process.env[k];
				else process.env[k] = v;
			}
		}
	}

	it('serves a known document with the contract policy', async () => {
		const res = await withEnv(
			{ PUBLIC_HX_SANDBOX_ORIGIN: SANDBOX, PUBLIC_HX_PORTAL_ORIGIN: undefined },
			() => get('worksheet')
		);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-security-policy')).toBe(hxDocumentCsp(HX_PORTAL_ORIGIN));
		const body = await res.text();
		expect(body).toContain('<script type="application/json" id="idea-manifest">');
		expect(body).toContain('data-field="teamName"');
	});

	// THE ONE THAT MATTERS: the same path on the main host is a 404, because the
	// main host is where the session cookies are.
	it('404s a /hx/ path arriving on the portal host', async () => {
		const res = await withEnv({ PUBLIC_HX_SANDBOX_ORIGIN: SANDBOX }, () =>
			get('worksheet', { origin: HX_PORTAL_ORIGIN })
		);
		expect(res.status).toBe(404);
		expect(await res.text()).toBe('');
	});

	it('404s an unknown document, indistinguishably', async () => {
		const res = await withEnv({ PUBLIC_HX_SANDBOX_ORIGIN: SANDBOX }, () => get('no-such-document'));
		expect(res.status).toBe(404);
		expect(await res.text()).toBe('');
	});

	it('404s a write, because a document never writes', async () => {
		for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
			const res = await withEnv({ PUBLIC_HX_SANDBOX_ORIGIN: SANDBOX }, () =>
				get('worksheet', { method })
			);
			expect(res.status, `${method} must be refused`).toBe(404);
		}
	});

	it('answers HEAD with the headers and no body', async () => {
		const res = await withEnv({ PUBLIC_HX_SANDBOX_ORIGIN: SANDBOX }, () =>
			get('worksheet', { method: 'HEAD' })
		);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-security-policy')).toBeTruthy();
		expect(await res.text()).toBe('');
	});
});

describe('the probe document is development only', () => {
	// It is a deliberately hostile document. Everything it tries is refused, so
	// serving it would be safe -- and it is still withheld, because a production
	// surface that serves an attack document has to explain itself every time
	// somebody reads the route.
	it('is not served outside development', () => {
		expect(hxDocument('probe', false)).toBeNull();
		expect(hxFieldMap('probe', false)).toEqual({});
	});

	it('is served in development', () => {
		expect(hxDocument('probe', true)).not.toBeNull();
		expect(Object.keys(hxFieldMap('probe', true)).length).toBeGreaterThan(0);
	});

	it('leaves the ordinary document alone in both', () => {
		expect(hxDocument('worksheet', false)).not.toBeNull();
		expect(hxDocument('worksheet', true)).not.toBeNull();
	});

	it('answers 404 for the probe when dev is off, and 200 when it is on', async () => {
		const href = `${SANDBOX}/hx/probe`;
		const call = () =>
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			HX_GET({ params: { docId: 'probe' }, url: new URL(href), request: new Request(href) } as any) as Promise<Response>;
		process.env.PUBLIC_HX_SANDBOX_ORIGIN = SANDBOX;
		setDev(false);
		expect((await call()).status).toBe(404);
		setDev(true);
		expect((await call()).status).toBe(200);
		setDev(false);
		delete process.env.PUBLIC_HX_SANDBOX_ORIGIN;
	});
});

describe('the fixtures keep the properties the tests above rest on', () => {
	// A FIXTURE WHOSE FIELD NAMES EQUALLED ITS BLOCK IDS WOULD MAKE EVERY
	// MAPPING TEST PASS WHETHER OR NOT THE MAPPING RAN. The identity function is
	// unobservable, so this is the assertion that keeps the others meaningful.
	it('never spells a field the same as its block id', () => {
		for (const docId of HX_DOCUMENT_IDS) {
			for (const [field, blockId] of Object.entries(hxFieldMap(docId, true))) {
				expect(field, `${docId}: ${field} must differ from its block id`).not.toBe(blockId);
			}
		}
	});

	// The documents ARE template literals, so one backtick inside ends the
	// literal and the parse error lands hundreds of lines later in whatever
	// follows. It happened once here, in a comment.
	it('contains no backtick in any served document', () => {
		for (const docId of HX_DOCUMENT_IDS) {
			expect(hxDocument(docId, true)?.html ?? '', docId).not.toContain('`');
		}
	});

	it('declares the manifest where the contract says it lives', () => {
		for (const docId of HX_DOCUMENT_IDS) {
			const html = hxDocument(docId, true)?.html ?? '';
			expect(html, docId).toContain('<script type="application/json" id="idea-manifest">');
			const json = html.split('<script type="application/json" id="idea-manifest">')[1].split('</script>')[0];
			const manifest = JSON.parse(json.replace(/\\u003c/g, '<'));
			expect(manifest.schemaVersion, docId).toBe(HX_SCHEMA_VERSION);
			expect(manifest.kind, docId).toBe('html-assignment');
			// Every declared field maps to the block whose id sits beside it, which
			// is the invariant the parent's map is built from.
			for (const module of manifest.modules) {
				for (const block of module.blocks) {
					expect(hxFieldMap(docId, true)[block.field], `${docId} ${block.field}`).toBe(block.id);
				}
			}
		}
	});

	// THE CONTRACT SAYS THREE OR FOUR LEVELS, NEVER TWO, and `short` is what the
	// grading console renders on the level button -- the field whose absence was
	// the 2026-09-08 defect where edited descriptors appeared to do nothing.
	it('gives every criterion three or four levels, each with a short and a descriptor', () => {
		for (const docId of HX_DOCUMENT_IDS) {
			const html = hxDocument(docId, true)?.html ?? '';
			const json = html.split('<script type="application/json" id="idea-manifest">')[1].split('</script>')[0];
			const manifest = JSON.parse(json.replace(/\\u003c/g, '<'));
			for (const module of manifest.modules) {
				for (const criterion of module.criteria) {
					expect(criterion.levels.length, `${docId} ${criterion.id}`).toBeGreaterThanOrEqual(3);
					expect(criterion.levels.length, `${docId} ${criterion.id}`).toBeLessThanOrEqual(4);
					for (const level of criterion.levels) {
						expect(typeof level.short, `${docId} ${criterion.id} short`).toBe('string');
						expect(level.short.length).toBeGreaterThan(0);
						expect(typeof level.descriptor).toBe('string');
						expect(level.descriptor.length).toBeGreaterThan(0);
					}
				}
			}
		}
	});
});
