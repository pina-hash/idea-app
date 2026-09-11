/**
 * THE PARENT SIDE OF THE HTML-ASSIGNMENT BRIDGE, AS PURE FUNCTIONS.
 *
 * A ported HTML assignment runs inside an `<iframe sandbox="allow-scripts">`,
 * which puts it in a unique OPAQUE ORIGIN: no parent DOM, no cookies, no
 * credentialed fetch, none of `ideabosco.com`'s `localStorage`. The document
 * therefore cannot write to the database and cannot learn anything about the
 * session. Everything it wants to record it says in a `postMessage`, and the
 * PARENT decides what -- if anything -- that means.
 *
 * THIS MODULE IS THAT DECISION, WITH NO DOM IN IT. `HtmlAssignmentFrame.svelte`
 * owns the element, the listener and the callbacks; every rule about whether a
 * message counts lives here, where it can be put to a hostile input without a
 * browser. A rule written inside the listener instead is a rule that can only
 * be exercised by driving a real frame, which is exactly the shape of check
 * that quietly stops being run.
 *
 * WHAT IT REFUSES, IN ORDER, AND WHY EACH ONE IS A SEPARATE REFUSAL:
 *
 *   1. THE ORIGIN. Read `hxExpectedOrigin` below before touching this -- the
 *      answer is not the one the contract's wording first suggests, and it was
 *      MEASURED rather than reasoned about.
 *   2. THE SOURCE. `event.source` must be the frame's own `contentWindow`.
 *      This is the check that actually pins a message to OUR frame, and it is
 *      the only one that bites in development, where the document and the
 *      portal are the same server. See `hxReceive`.
 *   3. THE SHAPE. A plain object with a known `type`, and every field that type
 *      requires, at the type it requires.
 *   4. THE FIELD. A `field` is resolved to a `block_id` THROUGH A MAP THE
 *      PARENT BUILT FROM THE MANIFEST IT STORED AT IMPORT. A frame that names a
 *      `block_id` directly gets nowhere: there is no branch that reads one, and
 *      an unrecognised `field` is dropped rather than passed along. This is the
 *      difference between a document recording its own answers and a document
 *      writing to an arbitrary row of `classroom_responses`.
 *
 * A DROP IS REPORTED, NEVER SILENT. Every refusal comes back as
 * `{ ok: false, reason, detail }` so the frame component can hand it to a
 * caller that wants to count or show them. Silence here would make a renamed
 * field indistinguishable from a working one.
 */

/**
 * The one schema version this parent speaks. A frame announcing anything else
 * in `idea:ready` is a document built against a different contract, and the
 * mismatch is reported rather than tolerated -- a document whose fields have
 * moved would otherwise write its answers into the wrong blocks.
 */
export const HX_SCHEMA_VERSION = 3;

/**
 * THE FLAGS THE FRAME IS GIVEN, WRITTEN DOWN ONCE.
 *
 * `allow-scripts` ALONE. `allow-same-origin` must never join it: the pair
 * cancels the sandbox outright, because a document that is same-origin with its
 * parent can reach `parent.document`, strip the `sandbox` attribute off its own
 * `<iframe>` element and reload with full rights. Measured in this container's
 * Chromium against the real serving route (see the negative controls in
 * `tests/html-assignment-bridge-sandbox.test.ts` and the browser-verify route):
 * under `allow-scripts` alone, `parent.document`, `document.cookie` and
 * `localStorage` each throw `SecurityError`; add `allow-same-origin` and all
 * three succeed, with `localStorage` handing back a value the PARENT wrote.
 *
 * It is a constant rather than a prop for the same reason the Foundry frame's
 * flags are a function rather than a literal in the component: one string, read
 * by everything that needs to agree about it, so a second spelling cannot drift.
 */
export const HX_SANDBOX_FLAGS = 'allow-scripts';

/**
 * THE HANDSHAKE'S OWN NAME, WRITTEN DOWN ONCE.
 *
 * A document that never sends this is not a worksheet: the parent posts no
 * `idea:state`, so nothing is seeded, and every `idea:change` the document
 * might send arrives before the parent has agreed to listen. It is a CONSTANT
 * rather than a literal because the manifest validator refuses a document that
 * does not contain it, and a refusal keyed on one spelling of a token defined
 * somewhere else under another spelling is a refusal that quietly stops
 * biting. `HxFrameMessage` names it through `typeof`, so the union and the
 * scan cannot drift.
 */
export const HX_READY_TYPE = 'idea:ready';

/** Messages the document may send. */
export type HxFrameMessage =
	| { type: typeof HX_READY_TYPE; schemaVersion: number }
	| { type: 'idea:change'; field: string; value: string | boolean }
	| { type: 'idea:image'; field: string; name: string; bytes: string }
	| { type: 'idea:image-remove'; field: string }
	| { type: 'idea:image-caption'; field: string; caption: string }
	| { type: 'idea:height'; px: number };

/**
 * WHAT AN IMAGE LOOKS LIKE ON THE WAY BACK DOWN, AND IT IS NOT WHAT CAME UP.
 *
 * BYTES GO FRAME-TO-PARENT ONLY, NEVER BACK. An `idea:image` carries a
 * base64 payload up; what returns is a URL the parent minted by putting those
 * bytes through the ORDINARY submission-file path. Three reasons, and the
 * third is the one that would not be obvious:
 *
 *   1. A reload would otherwise have to re-send every photograph a student
 *      ever attached, through `postMessage`, on a phone -- the state message
 *      for a six-module worksheet with three pictures in it is megabytes.
 *   2. The stored artefact is a `classroom_submission_files` row like every
 *      other hand-in, so it is one thing to grade, one thing to export and one
 *      thing to delete. A base64 blob echoed back down is none of those.
 *   3. `img-src data: blob:` in the served CSP admits a data URI, so a
 *      round-tripped byte string WOULD render -- which is exactly why the
 *      restriction has to be written down rather than left to fail loudly. It
 *      would work, and it would quietly make the document the system of record
 *      for a student's photograph.
 *
 * `caption` IS THE STUDENT'S OWN WORDS and is stored beside the file, never in
 * the filename. `name` is what the document called it, for display only.
 */
export interface HxImageState {
	/** Where the parent put it. Same-origin proxy URL, never a data URI. */
	url: string;
	/** What the document called the file. Display only. */
	name: string;
	/** The student's caption, or '' when they have not written one. */
	caption: string;
}

/** Messages the parent may send. */
export type HxParentMessage =
	| {
			type: 'idea:state';
			values: Record<string, string | boolean>;
			/**
			 * KEYED BY FIELD, like `values`, because the document knows its own
			 * field names and has never been told a block id. A field with no
			 * image simply has no key here.
			 */
			images: Record<string, HxImageState>;
			readOnly: boolean;
	  }
	| {
			type: 'idea:saved';
			at: string;
			ok: boolean;
			/**
			 * THE SCHEMA VERSION RIDES THE ACKNOWLEDGEMENT, NOT ONLY THE
			 * HANDSHAKE. `idea:ready` is the document telling the parent what it
			 * speaks; this is the parent answering, on every save, so a document
			 * that was served from a stale cache learns it is talking to a parent
			 * on a different contract at the first write rather than never.
			 */
			schemaVersion: typeof HX_SCHEMA_VERSION;
			/**
			 * WHY IT DID NOT SAVE, PRESENT ONLY WHEN `ok` IS FALSE. A document
			 * shows the student something; "not saved" with no reason is the
			 * failure this repository already refuses to ship on its own
			 * surfaces (`Upload failed` is never the whole message), and a
			 * document cannot ask a follow-up question.
			 */
			reason?: string;
	  };

/**
 * What an ACCEPTED message becomes. Note that `change` and `image` carry a
 * `blockId` the frame never sent and could not have sent: it is the parent's
 * own resolution of the frame's `field`, which is the whole point of the step.
 */
export type HxAccepted =
	| { kind: 'ready'; schemaVersion: number }
	| { kind: 'change'; blockId: string; field: string; value: string | boolean }
	| { kind: 'image'; blockId: string; field: string; name: string; bytes: string }
	| { kind: 'image-remove'; blockId: string; field: string }
	| { kind: 'image-caption'; blockId: string; field: string; caption: string }
	| { kind: 'height'; px: number };

/**
 * Why a message was dropped. These are DISTINCT on purpose: "a message from
 * somewhere else" and "a field this document does not declare" are different
 * events, and a surface counting them wants to tell them apart.
 */
export type HxDropReason =
	| 'origin'
	| 'source'
	| 'shape'
	| 'type'
	| 'schema'
	| 'field'
	| 'value'
	| 'caption'
	| 'height';

export type HxVerdict =
	| { ok: true; message: HxAccepted }
	| { ok: false; reason: HxDropReason; detail: string };

/** The parent's side of the conversation, as the listener sees it. */
export interface HxIncoming {
	origin: string;
	source: unknown;
	data: unknown;
}

/**
 * Everything the parent knows that the frame does not get to influence.
 *
 * `fieldToBlockId` IS BUILT FROM THE STORED MANIFEST AND NOWHERE ELSE. It is a
 * parameter rather than something this module reads, because the manifest is
 * another lane's file and because a pure function that reaches for state is not
 * a pure function. What matters is that it is the parent's copy: the frame
 * cannot add a key to it, so a `field` outside it has nowhere to land.
 */
export interface HxGate {
	/** The origin the serving route answers on, as configured. */
	documentOrigin: string;
	/** The frame's own `contentWindow`, or null before it exists. */
	frameWindow: unknown;
	/** The sandbox flags actually on the element, so the origin rule is derived from them. */
	sandboxFlags: string;
	fieldToBlockId: Readonly<Record<string, string>>;
	/** Refuse a height above this. See `HX_MAX_HEIGHT_PX`. */
	maxHeightPx?: number;
}

/**
 * A CEILING ON THE HEIGHT A DOCUMENT MAY ASK FOR.
 *
 * `idea:height` exists so a document that is 4000px of worksheet is not shown
 * through a 600px window, and the honest answer to "how tall are you" is
 * whatever the document says. But it is the one number the frame controls that
 * the PARENT then applies to its own layout, so it is the one place a hostile
 * or merely buggy document can reach out of its box: an `<iframe>` at
 * 100,000,000px is a page nobody can scroll, on a surface with a Submit control
 * on it. 40,000px is far past any real worksheet (the longest ported document
 * measured under 9,000px) and far short of breaking the page.
 *
 * A REFUSAL, NOT A CLAMP. Clamping would silently show a document a size it did
 * not ask for and give nobody a reason to look; the drop is reported.
 */
export const HX_MAX_HEIGHT_PX = 40_000;

/**
 * A CAPTION IS A LABEL UNDER A PICTURE. 500 characters is several sentences and
 * far past anything a student writes under a photograph of a bench; a document
 * sending more is broken or hostile either way, and the refusal is reported
 * rather than truncated -- silently storing half of what somebody typed is the
 * worse outcome of the two.
 */
export const HX_MAX_CAPTION_CHARS = 500;

/**
 * WHAT `event.origin` MUST BE, AND THE ANSWER IS `"null"` -- MEASURED, NOT
 * ASSUMED, AND NOT WHAT THE WORDING FIRST SUGGESTS.
 *
 * The rule is "validate `event.origin` against the document origin on every
 * message and drop anything else". Implemented as a literal comparison against
 * `https://sandbox.ideabosco.com`, that rule DROPS EVERY REAL MESSAGE and the
 * feature is inert: the sandbox the contract mandates is exactly what makes the
 * document's origin OPAQUE, and `postMessage` serializes an opaque origin to
 * the string `"null"`. Measured in this container's Chromium against the real
 * route: with `sandbox="allow-scripts"` every message arrives with
 * `event.origin === "null"` and `window.origin` inside the frame reads `null`;
 * add `allow-same-origin` and the same message arrives carrying the real
 * origin.
 *
 * SO THE EXPECTED ORIGIN IS DERIVED FROM THE SANDBOX RATHER THAN WRITTEN DOWN.
 * That keeps the rule honest in both directions: it is still a real check
 * against a real expectation, and it cannot be read as "we ignore the origin".
 * It also means that if anybody ever weakens the sandbox, this function starts
 * demanding the concrete origin in the same breath -- the two cannot drift.
 *
 * `"null"` IS NOT BY ITSELF AN IDENTITY, WHICH IS WHY THE SOURCE CHECK IS
 * LOAD-BEARING AND NOT DECORATION. Every opaque-origin document in the world
 * serializes to the same string, so this check alone narrows a message to "came
 * from something sandboxed" and no further. `hxReceive` also requires
 * `event.source` to be the frame's own `contentWindow`, which no other window
 * can forge, and that is what pins a message to OUR document. Both are
 * required; neither is sufficient.
 */
export function hxExpectedOrigin(documentOrigin: string, sandboxFlags: string): string {
	const grantsSameOrigin = /(^|\s)allow-same-origin(\s|$)/.test(sandboxFlags);
	return grantsSameOrigin ? normalizeOrigin(documentOrigin) : 'null';
}

/** Trailing slashes and stray whitespace off, so two spellings cannot read as
    two origins. Mirrors the Foundry header module's own `normalizeOrigin`. */
export function normalizeOrigin(origin: string | null | undefined): string {
	return (origin ?? '').trim().replace(/\/+$/, '');
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * THE ONE ENTRY POINT. Everything the listener does about a message, decided
 * here, with the DOM left at the door.
 *
 * THE ORDER OF THE CHECKS IS THE SECURITY MODEL AND IT IS NOT ARBITRARY.
 * Provenance first (origin, then source), because a message from somewhere else
 * must be dropped before anything reads a byte of its payload; then the shape;
 * then the field resolution, which is the step that decides which row of the
 * database a value could ever reach.
 *
 * THE SOURCE CHECK IS THE ONE THAT BITES IN DEVELOPMENT, and that is worth
 * knowing rather than discovering. Locally and on a preview there is one
 * server: the portal and `/hx/` answer on the same host, so "is this from the
 * document origin" cannot separate the frame from the page around it. The
 * source check separates them everywhere, because a `Window` reference cannot
 * be forged by a document that has no reach into this one. In production the
 * origin check adds the second, independent refusal -- defence in depth, where
 * opening either one alone still leaves the other closed.
 *
 * A FRAME NAMING A `block_id` GETS NOWHERE, AND THE MECHANISM IS ABSENCE. There
 * is no branch in this function that reads a `block_id`, a `blockId`, a
 * `block`, or anything else off the incoming payload; the only route to a block
 * is `fieldToBlockId`, which the parent built from the manifest it stored at
 * import. So a document sending `{ type: 'idea:change', block_id: 'x', value }`
 * is dropped for having no `field` at all, and one sending a `field` whose
 * value happens to BE a block id is dropped unless that same string is also a
 * declared field name. Nothing needs to recognise the attack; there is simply
 * nothing for it to reach.
 */
export function hxReceive(incoming: HxIncoming, gate: HxGate): HxVerdict {
	const expected = hxExpectedOrigin(gate.documentOrigin, gate.sandboxFlags);
	if (incoming.origin !== expected) {
		return {
			ok: false,
			reason: 'origin',
			detail: `origin ${JSON.stringify(incoming.origin)} is not ${JSON.stringify(expected)}`
		};
	}

	// A null `frameWindow` is the pre-mount state, and it refuses everything:
	// there is no frame yet, so nothing can legitimately be speaking for one.
	// Fail-closed, rather than treating "we do not know" as a pass.
	if (gate.frameWindow === null || gate.frameWindow === undefined) {
		return { ok: false, reason: 'source', detail: 'no frame window to compare against yet' };
	}
	if (incoming.source !== gate.frameWindow) {
		return { ok: false, reason: 'source', detail: 'event.source is not this frame' };
	}

	const data = incoming.data;
	if (!isRecord(data) || typeof data.type !== 'string') {
		return { ok: false, reason: 'shape', detail: 'payload is not an object with a string type' };
	}

	switch (data.type) {
		case 'idea:ready': {
			if (typeof data.schemaVersion !== 'number' || !Number.isInteger(data.schemaVersion)) {
				return { ok: false, reason: 'shape', detail: 'idea:ready without an integer schemaVersion' };
			}
			if (data.schemaVersion !== HX_SCHEMA_VERSION) {
				return {
					ok: false,
					reason: 'schema',
					detail: `document speaks schema ${data.schemaVersion}, this parent speaks ${HX_SCHEMA_VERSION}`
				};
			}
			return { ok: true, message: { kind: 'ready', schemaVersion: data.schemaVersion } };
		}

		case 'idea:change': {
			const field = data.field;
			if (typeof field !== 'string' || field === '') {
				return { ok: false, reason: 'shape', detail: 'idea:change without a non-empty field' };
			}
			const value = data.value;
			if (typeof value !== 'string' && typeof value !== 'boolean') {
				return { ok: false, reason: 'value', detail: 'idea:change value is neither string nor boolean' };
			}
			const blockId = resolveField(field, gate);
			if (blockId === null) {
				return { ok: false, reason: 'field', detail: `no block declares the field ${JSON.stringify(field)}` };
			}
			return { ok: true, message: { kind: 'change', blockId, field, value } };
		}

		case 'idea:image': {
			const field = data.field;
			if (typeof field !== 'string' || field === '') {
				return { ok: false, reason: 'shape', detail: 'idea:image without a non-empty field' };
			}
			if (typeof data.name !== 'string' || typeof data.bytes !== 'string') {
				return { ok: false, reason: 'shape', detail: 'idea:image without string name and bytes' };
			}
			const blockId = resolveField(field, gate);
			if (blockId === null) {
				return { ok: false, reason: 'field', detail: `no block declares the field ${JSON.stringify(field)}` };
			}
			return {
				ok: true,
				message: { kind: 'image', blockId, field, name: data.name, bytes: data.bytes }
			};
		}

		/**
		 * REMOVING A PICTURE IS ITS OWN MESSAGE, NOT AN `idea:image` WITH EMPTY
		 * BYTES. An empty byte string is a legitimate-looking payload that would
		 * have to be special-cased in the upload path -- which is where a
		 * zero-byte file would then be created and immediately deleted -- and it
		 * gives a document two spellings for one intent. A distinct type means
		 * the parent's handler for it is a delete and can be nothing else.
		 */
		case 'idea:image-remove': {
			const field = data.field;
			if (typeof field !== 'string' || field === '') {
				return { ok: false, reason: 'shape', detail: 'idea:image-remove without a non-empty field' };
			}
			const blockId = resolveField(field, gate);
			if (blockId === null) {
				return { ok: false, reason: 'field', detail: `no block declares the field ${JSON.stringify(field)}` };
			}
			return { ok: true, message: { kind: 'image-remove', blockId, field } };
		}

		/**
		 * A CAPTION IS A SEPARATE MESSAGE FROM THE BYTES BECAUSE IT IS A
		 * SEPARATE EDIT. A student retypes a caption far more often than they
		 * replace the photograph; folding the two together would mean re-sending
		 * the image on every keystroke of the caption.
		 *
		 * IT IS CAPPED HERE RATHER THAN AT THE DATABASE. A caption is a label
		 * under a picture, so a document sending a novel is either broken or
		 * hostile, and the refusal is reported like every other drop.
		 */
		case 'idea:image-caption': {
			const field = data.field;
			if (typeof field !== 'string' || field === '') {
				return { ok: false, reason: 'shape', detail: 'idea:image-caption without a non-empty field' };
			}
			const caption = data.caption;
			if (typeof caption !== 'string') {
				return { ok: false, reason: 'shape', detail: 'idea:image-caption caption is not a string' };
			}
			if (caption.length > HX_MAX_CAPTION_CHARS) {
				return {
					ok: false,
					reason: 'caption',
					detail: `caption is ${caption.length} characters, above the ${HX_MAX_CAPTION_CHARS} ceiling`
				};
			}
			const blockId = resolveField(field, gate);
			if (blockId === null) {
				return { ok: false, reason: 'field', detail: `no block declares the field ${JSON.stringify(field)}` };
			}
			return { ok: true, message: { kind: 'image-caption', blockId, field, caption } };
		}

		case 'idea:height': {
			const px = data.px;
			if (typeof px !== 'number' || !Number.isFinite(px) || px <= 0) {
				return { ok: false, reason: 'height', detail: 'idea:height px is not a positive finite number' };
			}
			const max = gate.maxHeightPx ?? HX_MAX_HEIGHT_PX;
			if (px > max) {
				return { ok: false, reason: 'height', detail: `idea:height ${px}px is above the ${max}px ceiling` };
			}
			return { ok: true, message: { kind: 'height', px } };
		}

		default:
			return { ok: false, reason: 'type', detail: `unknown message type ${JSON.stringify(data.type)}` };
	}
}

/**
 * A FIELD TO A BLOCK ID, THROUGH THE PARENT'S OWN MAP AND NOTHING ELSE.
 *
 * `Object.hasOwn` rather than a bare lookup: without it, a document sending
 * `field: "constructor"` or `field: "toString"` resolves through the prototype
 * chain to a FUNCTION, which is truthy, and the caller then holds a "block id"
 * that is a chunk of JavaScript source. That is not a hypothetical -- it is the
 * ordinary failure of using a plain object as a lookup table over a string an
 * outsider chose.
 */
function resolveField(field: string, gate: HxGate): string | null {
	if (!Object.hasOwn(gate.fieldToBlockId, field)) return null;
	const blockId = gate.fieldToBlockId[field];
	return typeof blockId === 'string' && blockId !== '' ? blockId : null;
}

/**
 * THE TWO OUTBOUND MESSAGES, BUILT HERE SO THE COMPONENT CANNOT INVENT A THIRD.
 *
 * `hxPostTarget` is the origin to post them TO, and it is `'*'`, which looks
 * wrong and is not. `postMessage`'s `targetOrigin` is a REFUSAL: the browser
 * delivers only if the receiving document's origin matches. The receiving
 * document is in an opaque origin, and an opaque origin matches no origin
 * string that can be written down -- so any concrete target silently drops
 * every message the parent sends, and `'*'` is the only value that reaches a
 * sandboxed frame at all.
 *
 * WHAT `'*'` COSTS HERE IS NOTHING, and the reason is worth stating rather than
 * waving at. The risk `'*'` normally carries is that the frame might have
 * navigated somewhere else, so the message lands in a document the sender did
 * not mean. What we send is a student's own answers back to them and a save
 * acknowledgement -- no token, no session, no identity, nothing the document
 * did not already give us -- and the frame can only navigate within a sandbox
 * that grants no top-level navigation. There is nothing here for a wrong
 * recipient to learn.
 */
export const hxPostTarget = '*';

/**
 * THE WHOLE STATE A DOCUMENT OPENS ON, INCLUDING ITS PICTURES.
 *
 * `images` IS REQUIRED RATHER THAN OPTIONAL, and that is deliberate. An
 * optional field is one a caller forgets, and forgetting it here means a
 * student reloads a worksheet and their photographs are gone from it -- which
 * looks exactly like the upload never worked. An empty object is the honest
 * answer for a document with no images and costs one pair of braces.
 */
export function hxStateMessage(
	values: Record<string, string | boolean>,
	images: Record<string, HxImageState>,
	readOnly: boolean
): HxParentMessage {
	return { type: 'idea:state', values, images, readOnly };
}

/**
 * THE ACKNOWLEDGEMENT, AND `reason` IS ONLY EVER PRESENT ON A FAILURE.
 *
 * A `reason` beside `ok: true` would be a document rendering an explanation for
 * something that worked, so the key is omitted rather than set to null or the
 * empty string: absence is the mechanism, exactly as it is for an omitted
 * transport. A failure with no reason given falls back to one sentence rather
 * than to nothing, because "not saved" alone is the message this repository
 * already refuses to ship.
 */
export function hxSavedMessage(
	at: string,
	ok: boolean,
	reason?: string | null
): HxParentMessage {
	if (ok) return { type: 'idea:saved', at, ok: true, schemaVersion: HX_SCHEMA_VERSION };
	const said = (reason ?? '').trim();
	return {
		type: 'idea:saved',
		at,
		ok: false,
		schemaVersion: HX_SCHEMA_VERSION,
		reason: said === '' ? 'The answer could not be saved. It is still on screen; try again.' : said
	};
}
