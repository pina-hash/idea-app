import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	applyStagedExtras,
	composerHasWork,
	composerDraftSignature,
	saveTarget,
	stagedDeckIssue,
	stagedRubricAfterSpec,
	stagedSpecKind,
	type ComposerDraft,
	type StagedExtrasTransports
} from '../src/lib/classroom/composer-staging';
import {
	DECK_ACCEPT,
	DECK_UPLOAD_MAX_ZIP_BYTES,
	deckUploadIssue,
	deckUploadTypeIssue
} from '../src/lib/classroom/deck';
import { matchesAccept } from '../src/lib/file-drop';
import { validateSpec } from '../src/lib/classroom/assignment-spec';

/**
 * THE COMPOSER'S SECOND PHASE, where every failure is a silent one.
 *
 * Everything that hangs off an item is written after the item exists, so a
 * save is two phases and the second one is where the guarantees live: a retry
 * must update the item it already made rather than posting a second copy of
 * content that is already on a class page; a staged thing that failed must
 * still be staged; a staged thing that landed must not be re-sent; and a
 * document has to go through the setter its item's KIND calls for, not the
 * other one.
 *
 * NONE OF THAT IS VISIBLE. A duplicate post looks exactly like a successful
 * retry until somebody scrolls their class page. A deck cleared after a failed
 * upload looks exactly like one that was never picked. A reference document
 * written through the assignment setter is a server refusal a teacher reads as
 * "the JSON must be wrong". So they are asserted here, against the functions
 * the component actually calls -- pure, no Svelte, no database.
 */

function file(name: string, bytes = 1024): File {
	return new File([new Uint8Array(bytes)], name, { type: 'application/zip' });
}

const SPEC = { meta: { title: 'Bridge stackup' } };
const RUBRIC = [{ id: 'c1', criterion: 'Craftsmanship', points: 10, levels: [{ points: 10, label: 'Complete', descriptor: '' }] }];

function transports(over: Partial<StagedExtrasTransports> = {}): StagedExtrasTransports {
	return {
		deck: { uploadDeck: async () => ({ ok: true, message: '' }), deleteDeck: async () => ({ ok: true, message: '' }) },
		setSpec: async () => ({ ok: true }),
		setReferenceSpec: async () => ({ ok: true }),
		createCheckIn: async () => ({ ok: true, sessionId: 'sess-1' }),
		setGuidance: async () => ({ ok: true }),
		setRubric: async () => ({ ok: true }),
		...over
	};
}

describe('where a save goes', () => {
	it('a first create creates', () => {
		expect(
			saveTarget({ mode: 'create', itemId: null, createdItemId: null, targetIds: ['s-1'] })
		).toEqual({ action: 'create' });
	});

	/**
	 * THE ONE THAT MATTERS. A create that succeeded and then had an attachment
	 * fail leaves a real item on real class pages; the message invites a second
	 * save, and that save must land on THAT item.
	 */
	it('a retry after a partial create UPDATES the item it already made', () => {
		expect(
			saveTarget({ mode: 'create', itemId: null, createdItemId: 'i-7', targetIds: ['s-1'] })
		).toEqual({ action: 'update', itemId: 'i-7' });
	});

	it('the retry wins over the target list, so a re-tick cannot fork a second item', () => {
		expect(
			saveTarget({ mode: 'create', itemId: null, createdItemId: 'i-7', targetIds: ['s-1', 's-2'] })
		).toEqual({ action: 'update', itemId: 'i-7' });
	});

	it('an edit updates its own item', () => {
		expect(
			saveTarget({ mode: 'edit', itemId: 'i-3', createdItemId: null, targetIds: [] })
		).toEqual({ action: 'update', itemId: 'i-3' });
	});

	it('a create with nowhere to post refuses rather than writing', () => {
		const t = saveTarget({ mode: 'create', itemId: null, createdItemId: null, targetIds: [] });
		expect(t.action).toBe('refuse');
	});
});

describe('which setter a staged document goes through', () => {
	it('an assignment carries an interactive spec', () => {
		expect(stagedSpecKind('assignment')).toBe('assignment');
	});
	it('a material carries a reference document', () => {
		expect(stagedSpecKind('material')).toBe('reference');
	});
	it('an announcement carries neither', () => {
		expect(stagedSpecKind('post')).toBeNull();
	});

	it('the kind picks the setter, and the other one is never called', async () => {
		const setSpec = vi.fn(async () => ({ ok: true }));
		const setReferenceSpec = vi.fn(async () => ({ ok: true }));
		const tx = transports({ setSpec, setReferenceSpec });

		await applyStagedExtras('i-1', { deck: null, spec: SPEC, specKind: 'assignment', checkIn: null }, tx);
		expect(setSpec).toHaveBeenCalledTimes(1);
		expect(setReferenceSpec).not.toHaveBeenCalled();

		await applyStagedExtras('i-2', { deck: null, spec: SPEC, specKind: 'reference', checkIn: null }, tx);
		expect(setReferenceSpec).toHaveBeenCalledTimes(1);
		expect(setReferenceSpec).toHaveBeenCalledWith('i-2', SPEC);
		expect(setSpec).toHaveBeenCalledTimes(1);
	});

	it('a document with no kind is not written at all -- an announcement takes none', async () => {
		const setSpec = vi.fn(async () => ({ ok: true }));
		const setReferenceSpec = vi.fn(async () => ({ ok: true }));
		const res = await applyStagedExtras(
			'i-1',
			{ deck: null, spec: SPEC, specKind: null, checkIn: null },
			transports({ setSpec, setReferenceSpec })
		);
		expect(setSpec).not.toHaveBeenCalled();
		expect(setReferenceSpec).not.toHaveBeenCalled();
		expect(res.failures).toEqual([]);
	});
});

describe('what survives a partial save', () => {
	it('everything landing clears everything and reports nothing', async () => {
		const res = await applyStagedExtras(
			'i-1',
			{ deck: file('deck.zip'), spec: SPEC, specKind: 'assignment', checkIn: null },
			transports()
		);
		expect(res.failures).toEqual([]);
		expect(res.deck).toBeNull();
		expect(res.spec).toBeNull();
	});

	/**
	 * THE PARTIAL CASE, both ways round: the failed one stays and the
	 * successful one does not, so saving again retries only what is left.
	 */
	it('a failed deck stays staged while the spec that landed does not', async () => {
		const zip = file('truss.zip');
		const res = await applyStagedExtras(
			'i-1',
			{ deck: zip, spec: SPEC, specKind: 'assignment', checkIn: null },
			transports({
				deck: {
					uploadDeck: async () => ({ ok: false, message: 'Drive refused a file in this deck.' }),
					deleteDeck: async () => ({ ok: true, message: '' })
				}
			})
		);
		expect(res.deck).toBe(zip);
		expect(res.spec).toBeNull();
		expect(res.failures).toHaveLength(1);
		// NAMED, not generic: the report has to say which of the two it was.
		expect(res.failures[0]).toContain('truss.zip');
		expect(res.failures[0]).toContain('Drive refused');
	});

	it('a failed spec stays staged while the deck that landed does not', async () => {
		const zip = file('truss.zip');
		const res = await applyStagedExtras(
			'i-1',
			{ deck: zip, spec: SPEC, specKind: 'reference', checkIn: null },
			transports({ setReferenceSpec: async () => ({ ok: false, message: 'The server refused that document.' }) })
		);
		expect(res.deck).toBeNull();
		expect(res.spec).toBe(SPEC);
		expect(res.failures).toHaveLength(1);
		expect(res.failures[0]).toContain('reference document');
		expect(res.failures[0]).toContain('The server refused');
	});

	it('both failing keeps both and names both', async () => {
		const zip = file('truss.zip');
		const res = await applyStagedExtras(
			'i-1',
			{ deck: zip, spec: SPEC, specKind: 'assignment', checkIn: null },
			transports({
				deck: {
					uploadDeck: async () => ({ ok: false, message: 'Drive refused it.' }),
					deleteDeck: async () => ({ ok: true, message: '' })
				},
				setSpec: async () => ({ ok: false, message: 'Refused.' })
			})
		);
		expect(res.deck).toBe(zip);
		expect(res.spec).toBe(SPEC);
		expect(res.failures).toHaveLength(2);
	});

	/**
	 * A DECK REFUSAL MUST NOT SKIP THE SPEC. They are independent writes against
	 * an item that already exists; stopping at the first would make a teacher
	 * who staged both save three times to learn about the second.
	 */
	it('a deck that fails does not stop the spec from being attempted', async () => {
		const setSpec = vi.fn(async () => ({ ok: true }));
		await applyStagedExtras(
			'i-1',
			{ deck: file('d.zip'), spec: SPEC, specKind: 'assignment', checkIn: null },
			transports({
				deck: {
					uploadDeck: async () => ({ ok: false, message: 'no' }),
					deleteDeck: async () => ({ ok: true, message: '' })
				},
				setSpec
			})
		);
		expect(setSpec).toHaveBeenCalledTimes(1);
	});

	it('an upload that THROWS is a failure, not a rejected save', async () => {
		const zip = file('boom.zip');
		const res = await applyStagedExtras(
			'i-1',
			{ deck: zip, spec: null, specKind: null, checkIn: null },
			transports({
				deck: {
					uploadDeck: async () => {
						throw new Error('Connection lost.');
					},
					deleteDeck: async () => ({ ok: true, message: '' })
				}
			})
		);
		expect(res.deck).toBe(zip);
		expect(res.failures[0]).toContain('Connection lost.');
	});

	it('a cancelled upload reads as cancelled, not as a server refusal', async () => {
		const res = await applyStagedExtras(
			'i-1',
			{ deck: file('d.zip'), spec: null, specKind: null, checkIn: null },
			transports({
				deck: {
					uploadDeck: async () => ({ ok: false, cancelled: true, message: '' }),
					deleteDeck: async () => ({ ok: true, message: '' })
				}
			})
		);
		expect(res.failures[0]).toContain('cancelled');
	});

	it('a missing transport is reported rather than silently dropping the work', async () => {
		const zip = file('d.zip');
		const res = await applyStagedExtras(
			'i-1',
			{ deck: zip, spec: SPEC, specKind: 'assignment', checkIn: null },
			transports({ deck: null, setSpec: null })
		);
		expect(res.deck).toBe(zip);
		expect(res.spec).toBe(SPEC);
		expect(res.failures).toHaveLength(2);
	});
});

describe('the deck size cap', () => {
	it('refuses a zip over the cap, naming both figures', () => {
		const issue = stagedDeckIssue(file('huge.zip', DECK_UPLOAD_MAX_ZIP_BYTES + 1));
		expect(issue).toBeTruthy();
		expect(issue).toContain('4.0 MB');
	});
	it('accepts one exactly at the cap', () => {
		expect(stagedDeckIssue(file('edge.zip', DECK_UPLOAD_MAX_ZIP_BYTES))).toBeNull();
	});
});

/**
 * THE DECK BOX USED TO TAKE ANYTHING, AND THAT IS WHAT MR. PINA REPORTED ON
 * 2026-09-11 ("zip files should not be automatically assumed as presentation
 * decks"). The premise is inverted -- nothing sniffs a file and routes it to
 * the deck -- and the real defect is worse than the one described:
 * `stagedDeckIssue` was `deckUploadSizeIssue(file.size)` and nothing else, so
 * a PNG dropped on the deck box staged happily, reported "Deck ready", and
 * failed server-side after Post.
 *
 * WHY THIS EARNS A TEST rather than a harness drive. The two paths into the
 * box are a PICKER and a DROP, and their disagreement is the whole defect: the
 * `<input>` carried `accept` and the `use:dropTarget` beside it did not, so
 * the picker filtered and the drop did not, and NEITHER of them is visible
 * from the other. A drop path that silently re-widened would look exactly like
 * one that works, because the picker would still behave. So the two are
 * asserted against the SAME predicate here, from the same constant.
 *
 * THE POSITIVE CONTROL IS IN EVERY HALF. A gate that refuses everything,
 * including the zip it exists to admit, passes every refusal assertion it
 * makes.
 */
describe('what the deck box will take', () => {
	/** A file as a browser really hands one over, type included. */
	function named(name: string, type: string, bytes = 1024): File {
		return new File([new Uint8Array(bytes)], name, { type });
	}

	it('takes a zip -- the POSITIVE CONTROL for every refusal below', () => {
		expect(deckUploadTypeIssue(named('deck.zip', 'application/zip'))).toBeNull();
		expect(stagedDeckIssue(named('deck.zip', 'application/zip'))).toBeNull();
	});

	it('takes a zip whose type the platform could not determine', () => {
		// `File.type` is legitimately EMPTY, which is the norm for a file
		// dragged off some desktops. Keying on the type alone would refuse an
		// ordinary deck.
		expect(stagedDeckIssue(named('deck.zip', ''))).toBeNull();
	});

	it("takes Windows Explorer's spelling of a zip", () => {
		// `application/x-zip-compressed`, which is what Explorer writes and
		// which an allowlist of `application/zip` alone would refuse.
		expect(stagedDeckIssue(named('deck.zip', 'application/x-zip-compressed'))).toBeNull();
	});

	it('takes a zip whose EXTENSION is the only clue, even with a wrong type', () => {
		expect(stagedDeckIssue(named('deck.zip', 'application/octet-stream'))).toBeNull();
	});

	it('REFUSES a PNG, naming the file and saying what to do instead', () => {
		const issue = stagedDeckIssue(named('diagram.png', 'image/png'));
		expect(issue).toBeTruthy();
		expect(issue).toContain('diagram.png');
		expect(issue).toContain('not a zip');
		// The sentence is actionable, not just a refusal: a picture belongs on
		// the item as a file.
		expect(issue).toContain('attach it as a file');
	});

	it('refuses a PDF and a bare folder-ish name too', () => {
		expect(stagedDeckIssue(named('handout.pdf', 'application/pdf'))).toBeTruthy();
		expect(stagedDeckIssue(named('Deck', ''))).toBeTruthy();
	});

	it('answers the TYPE first when a file is both wrong and oversize', () => {
		// "Remove large media from the deck and upload it again" is useless
		// advice about a photograph -- it describes work on a deck the person
		// does not have. The more fundamental refusal is the actionable one.
		const huge = named('photo.png', 'image/png', DECK_UPLOAD_MAX_ZIP_BYTES + 1);
		expect(stagedDeckIssue(huge)).toContain('not a zip');
		expect(stagedDeckIssue(huge)).not.toContain('MB limit');
	});

	it('still refuses an oversize ZIP on size, so the type gate did not swallow the cap', () => {
		const issue = stagedDeckIssue(named('big.zip', 'application/zip', DECK_UPLOAD_MAX_ZIP_BYTES + 1));
		expect(issue).toContain('MB limit');
	});

	/**
	 * THE PARITY CLAIM, WHICH IS THE ONE THAT MATTERS.
	 *
	 * The drop path filters with `matchesAccept(f, DECK_ACCEPT)` and the picker
	 * path answers with `stagedDeckIssue`. If those two ever disagree about a
	 * file, one of the two doors takes something the other refuses -- which is
	 * precisely the state this bundle found the box in. Asserted over a corpus
	 * rather than a spot check, with the case count pinned so a corpus that
	 * generated nothing cannot pass.
	 */
	describe('the drop and the picker agree, file for file', () => {
		const CORPUS: { label: string; file: File }[] = [
			{ label: 'a zip', file: named('deck.zip', 'application/zip') },
			{ label: 'a typeless zip', file: named('deck.zip', '') },
			{ label: "Explorer's zip", file: named('d.zip', 'application/x-zip-compressed') },
			{ label: 'an uppercase extension', file: named('DECK.ZIP', '') },
			{ label: 'a PNG', file: named('diagram.png', 'image/png') },
			{ label: 'a JPEG', file: named('photo.jpg', 'image/jpeg') },
			{ label: 'a PDF', file: named('handout.pdf', 'application/pdf') },
			{ label: 'an HTML file', file: named('index.html', 'text/html') },
			{ label: 'a JSON spec', file: named('spec.json', 'application/json') },
			{ label: 'no extension at all', file: named('Deck', '') }
		];

		it('every case in the corpus gets the same answer from both doors', () => {
			let accepted = 0;
			let refused = 0;
			for (const { label, file: f } of CORPUS) {
				const dropTakesIt = matchesAccept(f, DECK_ACCEPT);
				const pickerTakesIt = deckUploadTypeIssue(f) === null;
				expect(dropTakesIt, `${label}: drop and picker disagree`).toBe(pickerTakesIt);
				if (dropTakesIt) accepted += 1;
				else refused += 1;
			}
			// BOTH counts, so neither an all-accept nor an all-refuse gate can
			// satisfy the agreement assertion above vacuously.
			expect(accepted).toBe(4);
			expect(refused).toBe(6);
			expect(accepted + refused).toBe(CORPUS.length);
		});
	});

	it('deckUploadIssue is what stagedDeckIssue answers, so there is one rule and not two', () => {
		for (const f of [
			named('deck.zip', 'application/zip'),
			named('diagram.png', 'image/png'),
			named('big.zip', 'application/zip', DECK_UPLOAD_MAX_ZIP_BYTES + 1)
		]) {
			expect(stagedDeckIssue(f)).toBe(deckUploadIssue(f));
		}
	});
});

/**
 * AND THE COMPOSER ACTUALLY WIRES BOTH DOORS TO IT.
 *
 * The three assertions above are about `deck.ts`. This one is about the
 * component, and it is a SOURCE sweep rather than a mount because what is
 * being asserted is the presence of an argument in a Svelte action's options
 * object -- `tests/dom/` can mount the component but cannot see which options
 * `use:dropTarget` was constructed with, and a drop synthesized against it
 * would be asserting `file-drop`'s own filtering, which
 * `tests/classroom-file-drop.test.ts` already owns.
 */
describe('the composer hands the picker rule to the drop', () => {
	const src = readFileSync('src/lib/classroom/ContentComposer.svelte', 'utf8');
	/** The deck box's own `use:dropTarget` options object. */
	const deckDrop = (() => {
		const at = src.indexOf('onfiles: onDeckDropFiles');
		expect(at, 'the deck box drop target moved or was renamed').toBeGreaterThan(-1);
		return src.slice(at, at + 400);
	})();

	it('passes `accept`, built from DECK_ACCEPT', () => {
		expect(deckDrop).toContain('accept: (f) => matchesAccept(f, DECK_ACCEPT)');
	});

	it('passes `onrejected`, so a refused drop is not a silence', () => {
		expect(deckDrop).toContain('onrejected: onDeckDropRejected');
	});

	it("the refusal handler reads stagedDeckIssue rather than writing a second sentence", () => {
		const at = src.indexOf('function onDeckDropRejected');
		expect(at).toBeGreaterThan(-1);
		expect(src.slice(at, at + 260)).toContain('stagedDeckIssue(file)');
	});

	it('the input `accept` is the same constant and not a second literal', () => {
		expect(src).toContain('accept={DECK_ACCEPT}');
		// The literal it replaced must be gone from the component, or there are
		// two statements of what a deck is again.
		expect(src).not.toContain("accept=\".zip,application/zip");
	});
});

/**
 * THE THIRD STAGED ATTACHABLE (0120). Its failure mode is the one this whole
 * file exists for: a check-in that did not attach, cleared anyway, looks
 * exactly like one that was never staged -- the teacher's post is up, the
 * notebook requirement they typed is gone, and nobody finds out until the day
 * the work was due.
 */
describe('a staged notebook check-in', () => {
	const DRAFT = { unit_number: 3, session_date: '2026-09-04', session_label: 'Bearing teardown' };

	it('is created against the item that now exists, and cleared', async () => {
		const calls: { itemId: string; label: string }[] = [];
		const res = await applyStagedExtras(
			'i-1',
			{ deck: null, spec: null, specKind: null, checkIn: DRAFT },
			transports({
				createCheckIn: async (itemId, draft) => {
					calls.push({ itemId, label: draft.session_label });
					return { ok: true };
				}
			})
		);
		expect(calls).toEqual([{ itemId: 'i-1', label: 'Bearing teardown' }]);
		expect(res.failures).toEqual([]);
		expect(res.checkIn).toBeNull();
	});

	it('STAYS STAGED when the server refuses it, and is named by its own label', async () => {
		const res = await applyStagedExtras(
			'i-1',
			{ deck: null, spec: null, specKind: null, checkIn: DRAFT },
			transports({ createCheckIn: async () => ({ ok: false, message: 'That class does not exist.' }) })
		);
		expect(res.checkIn).toEqual(DRAFT);
		expect(res.failures).toHaveLength(1);
		expect(res.failures[0]).toContain('Bearing teardown');
		expect(res.failures[0]).toContain('That class does not exist.');
	});

	it('a throw is a refusal, not an unhandled rejection', async () => {
		const res = await applyStagedExtras(
			'i-1',
			{ deck: null, spec: null, specKind: null, checkIn: DRAFT },
			transports({
				createCheckIn: async () => {
					throw new Error('Network died');
				}
			})
		);
		expect(res.checkIn).toEqual(DRAFT);
		expect(res.failures[0]).toContain('Network died');
	});

	/**
	 * A surface with no way to attach one says so instead of silently dropping
	 * it -- the same answer the deck and the spec give when their transport is
	 * absent, which is what makes "absence removes the control" safe to rely on.
	 */
	it('names it when attaching one is not available at all', async () => {
		const res = await applyStagedExtras(
			'i-1',
			{ deck: null, spec: null, specKind: null, checkIn: DRAFT },
			transports({ createCheckIn: null })
		);
		expect(res.checkIn).toEqual(DRAFT);
		expect(res.failures[0]).toContain('not available here');
	});

	/**
	 * INDEPENDENT WRITES. A deck that fails must not stop the check-in from
	 * being attempted, or a teacher who staged both would have to save three
	 * times to find out about the second one.
	 */
	it('is attempted even when the deck before it failed, and only the failure stays', async () => {
		const res = await applyStagedExtras(
			'i-1',
			{ deck: file('d.zip'), spec: null, specKind: null, checkIn: DRAFT },
			transports({
				deck: {
					uploadDeck: async () => ({ ok: false, message: 'Drive refused it.' }),
					deleteDeck: async () => ({ ok: true, message: '' })
				}
			})
		);
		expect(res.deck).not.toBeNull();
		expect(res.checkIn).toBeNull();
		expect(res.failures).toHaveLength(1);
	});
});

/**
 * THE FOURTH STAGED ATTACHABLE (0139). `classroom_set_rubric` needs a real
 * item, exactly like the two specs, so a rubric built while creating an
 * assignment has nowhere to land until the create call returns an id --
 * same shape as the spec, on purpose, since RubricBuilder's own staging mode
 * mirrors SpecImporter's.
 */
describe('a staged rubric', () => {
	it('is written against the item that now exists, and cleared', async () => {
		const setRubric = vi.fn(async () => ({ ok: true }));
		const res = await applyStagedExtras(
			'i-1',
			{ deck: null, spec: null, specKind: null, checkIn: null, rubric: RUBRIC },
			transports({ setRubric })
		);
		expect(setRubric).toHaveBeenCalledWith('i-1', RUBRIC);
		expect(res.failures).toEqual([]);
		expect(res.rubric).toBeNull();
	});

	it('STAYS STAGED when the server refuses it', async () => {
		const res = await applyStagedExtras(
			'i-1',
			{ deck: null, spec: null, specKind: null, checkIn: null, rubric: RUBRIC },
			transports({ setRubric: async () => ({ ok: false, message: 'That criterion needs text.' }) })
		);
		expect(res.rubric).toBe(RUBRIC);
		expect(res.failures).toHaveLength(1);
		expect(res.failures[0]).toContain('rubric');
		expect(res.failures[0]).toContain('That criterion needs text.');
	});

	it('a throw is a refusal, not an unhandled rejection', async () => {
		const res = await applyStagedExtras(
			'i-1',
			{ deck: null, spec: null, specKind: null, checkIn: null, rubric: RUBRIC },
			transports({
				setRubric: async () => {
					throw new Error('Network died');
				}
			})
		);
		expect(res.rubric).toBe(RUBRIC);
		expect(res.failures[0]).toContain('Network died');
	});

	it('names it when attaching one is not available at all', async () => {
		const res = await applyStagedExtras(
			'i-1',
			{ deck: null, spec: null, specKind: null, checkIn: null, rubric: RUBRIC },
			transports({ setRubric: undefined })
		);
		expect(res.rubric).toBe(RUBRIC);
		expect(res.failures[0]).toContain('not available here');
	});

	it('a save with no rubric staged never calls the setter', async () => {
		const setRubric = vi.fn(async () => ({ ok: true }));
		await applyStagedExtras(
			'i-1',
			{ deck: null, spec: null, specKind: null, checkIn: null, rubric: null },
			transports({ setRubric })
		);
		expect(setRubric).not.toHaveBeenCalled();
	});

	/**
	 * INDEPENDENT OF THE SPEC AND THE CHECK-IN. A refusal on one must not stop
	 * the others from being attempted -- the same guarantee the deck and the
	 * spec already give each other.
	 */
	it('is attempted even when the spec before it failed, and only the failure stays', async () => {
		const res = await applyStagedExtras(
			'i-1',
			{ deck: null, spec: SPEC, specKind: 'assignment', checkIn: null, rubric: RUBRIC },
			transports({ setSpec: async () => ({ ok: false, message: 'Refused.' }) })
		);
		expect(res.spec).toBe(SPEC);
		expect(res.rubric).toBeNull();
		expect(res.failures).toHaveLength(1);
	});
});

describe('is there work in here to lose', () => {
	const empty: ComposerDraft = {
		title: '',
		bodyText: '',
		files: 0,
		instructorFiles: 0,
		links: [],
		instructorLinks: [],
		deck: null,
		spec: null,
		checkIn: null,
		rubric: null
	};

	it('a composer nobody has touched is not dirty', () => {
		expect(composerHasWork(empty)).toBe(false);
	});

	it('whitespace alone is not work', () => {
		expect(composerHasWork({ ...empty, title: '   ', bodyText: '\n \t' })).toBe(false);
	});

	/**
	 * A LINK ROW WITH NO URL IS NOT WORK. "+ Add link" appends an empty pair, so
	 * pressing it once and changing your mind must not make every close ask a
	 * question -- which is how people learn to click through the question.
	 */
	it('an empty link row is not work; one with a url is', () => {
		expect(composerHasWork({ ...empty, links: [{ url: '  ' }] })).toBe(false);
		expect(composerHasWork({ ...empty, links: [{ url: 'https://x' }] })).toBe(true);
		expect(composerHasWork({ ...empty, instructorLinks: [{ url: 'https://x' }] })).toBe(true);
	});

	it('each thing that cannot be recovered counts on its own', () => {
		expect(composerHasWork({ ...empty, title: 'Draft' })).toBe(true);
		expect(composerHasWork({ ...empty, bodyText: 'Some words' })).toBe(true);
		expect(composerHasWork({ ...empty, files: 1 })).toBe(true);
		expect(composerHasWork({ ...empty, instructorFiles: 1 })).toBe(true);
		expect(composerHasWork({ ...empty, deck: file('d.zip') })).toBe(true);
		expect(composerHasWork({ ...empty, spec: SPEC })).toBe(true);
		expect(
			composerHasWork({
				...empty,
				checkIn: { unit_number: 3, session_date: '2026-09-04', session_label: 'Teardown' }
			})
		).toBe(true);
		expect(composerHasWork({ ...empty, rubric: RUBRIC })).toBe(true);
	});
});

/**
 * THE RUBRIC INSIDE A STAGED SPEC, which used never to arrive at all.
 *
 * A spec's rubric and an item's rubric are two different records: the criteria
 * live inside the spec JSON, and grading reads a separate row written only by
 * `classroom_set_rubric`. Creating an assignment from a spec carrying a full
 * leveled rubric therefore produced an item whose spec described exactly how
 * the work would be scored and whose grading console had nothing to score
 * with. NOTHING SAYS SO AT THE TIME -- the post succeeds, the class page looks
 * right, and the gap surfaces days later in front of a pile of submissions --
 * which is what puts this here rather than in a harness.
 *
 * THE FIXTURE IS PUT THROUGH THE REAL VALIDATOR FIRST, so these assertions
 * cannot be about a spec no author could ever have pasted: `validateSpec` is
 * the same gate SpecImporter runs before anything is staged, and a fixture it
 * rejects is a fixture the composer would never have seen.
 */
const LEVELED_SPEC = {
	schemaVersion: 1,
	meta: { assignmentId: 'a-bridge', title: 'Bridge stackup', totalPoints: 20 },
	modules: [
		{
			id: 'm1',
			title: 'Measure',
			points: 12,
			blocks: [{ type: 'textField', id: 'b1', prompt: 'What did the caliper read?' }],
			rubric: [
				{
					id: 'craft',
					criterion: 'Craftsmanship',
					levels: [
						{ points: 12, label: 'Complete', descriptor: 'Every face measured twice.', short: 'Twice' },
						{ points: 7, label: 'Developing', descriptor: 'Some faces measured once.' },
						{ points: 0, label: 'Absent', descriptor: 'Nothing measured.' }
					]
				}
			]
		},
		{
			id: 'm2',
			title: 'Report',
			points: 8,
			blocks: [{ type: 'textField', id: 'b2', prompt: 'Where would this break?' }],
			rubric: [
				{
					criterion: 'Reasoning',
					levels: [
						{ points: 8, label: 'Complete', descriptor: 'Names the failure mode.' },
						{ points: 4, label: 'Developing', descriptor: 'Names a failure.' },
						{ points: 0, label: 'Absent', descriptor: 'No reasoning.' }
					]
				}
			]
		}
	]
};

describe('the rubric inside a staged spec', () => {
	it('the fixture is a spec the real validator accepts', () => {
		const res = validateSpec(LEVELED_SPEC);
		expect(res.errors).toEqual([]);
		expect(res.spec).not.toBeNull();
	});

	it('LANDS, with every level intact -- a flattened import is still a failure', () => {
		const next = stagedRubricAfterSpec(LEVELED_SPEC, true, { rubric: null, derived: false });
		expect(next.derived).toBe(true);
		expect(next.rubric).toHaveLength(2);
		// Levels, not just criteria: rubrics here are leveled, never flat.
		expect(next.rubric?.map((c) => c.levels?.length)).toEqual([3, 3]);
		expect(next.rubric?.map((c) => c.points)).toEqual([12, 8]);
		// The module title is carried into the criterion, and the authored short
		// form survives -- both are what `rubricFromSpec` alone produces, which
		// is the point of calling it rather than mirroring it.
		expect(next.rubric?.[0].criterion).toBe('Measure: Craftsmanship');
		expect(next.rubric?.[0].levels?.[0].short).toBe('Twice');
		expect(next.rubric?.[0].id).toBe('m1-craft');
		expect(next.rubric?.[1].id).toBe('m2-r1');
	});

	/**
	 * THE POSITIVE CONTROL'S OPPOSITE NUMBER. Staging is offered only where a
	 * rubric could be attached at all, so an announcement or a material must
	 * come back untouched -- and the flag with it, or the next spec paste would
	 * treat a hand-built rubric as replaceable.
	 */
	it('is left alone where a rubric cannot be staged', () => {
		const current = { rubric: RUBRIC, derived: false };
		expect(stagedRubricAfterSpec(LEVELED_SPEC, false, current)).toBe(current);
	});

	it('never overwrites a rubric that went through the builder', () => {
		const current = { rubric: RUBRIC, derived: false };
		expect(stagedRubricAfterSpec(LEVELED_SPEC, true, current)).toBe(current);
	});

	/**
	 * A CORRECTED SPEC REPLACES THE RUBRIC IT PRODUCED. Leaving the first one
	 * standing puts a rubric on screen that silently disagrees with the spec
	 * directly above it, which is the failure mode this whole item is about,
	 * one paste later.
	 */
	it('replaces a rubric it derived itself when the spec is re-staged', () => {
		const first = stagedRubricAfterSpec(LEVELED_SPEC, true, { rubric: null, derived: false });
		const trimmed = { ...LEVELED_SPEC, modules: [LEVELED_SPEC.modules[0]] };
		const second = stagedRubricAfterSpec(trimmed, true, first);
		expect(second.rubric).toHaveLength(1);
		expect(second.derived).toBe(true);
		// The id already in play for that slot is kept, so scores keyed under it
		// are not orphaned by the re-paste.
		expect(second.rubric?.[0].id).toBe('m1-craft');
	});

	/**
	 * A SPEC WITH NO RUBRIC ROWS STAGES NOTHING, not an empty list.
	 * `classroom_set_rubric` refuses a rubric with no criteria, so staging `[]`
	 * would turn a perfectly good post into a named failure over something the
	 * author never asked for.
	 */
	it('stages nothing for a spec that carries no rubric', () => {
		const bare = {
			schemaVersion: 1,
			meta: { assignmentId: 'a-none', title: 'Read this', totalPoints: 0 },
			modules: [
				{ id: 'm1', title: 'Read', points: 0, blocks: [{ type: 'instructions', content: 'Read it.' }] }
			]
		};
		expect(validateSpec(bare).errors).toEqual([]);
		expect(stagedRubricAfterSpec(bare, true, { rubric: null, derived: false })).toEqual({
			rubric: null,
			derived: false
		});
	});

	it('a cleared spec clears the rubric it derived', () => {
		const first = stagedRubricAfterSpec(LEVELED_SPEC, true, { rubric: null, derived: false });
		expect(stagedRubricAfterSpec(null, true, first)).toEqual({ rubric: null, derived: false });
	});
});

/**
 * WHERE THE FILES AND LINKS SIT, AND IN WHAT ORDER (0193, prompt 0118).
 *
 * Both are work the navigation guard has to see -- a placement is a decision
 * somebody made and a rearrangement is one too -- and neither types a word
 * or stages a byte, so nothing the signature already read would notice them.
 * They were added to `ComposerDraft` as OPTIONAL fields, and this block pins
 * the two consequences of that: a draft that never had them serializes
 * exactly as one carrying the default (so no composer that predates the
 * control starts reporting itself dirty), and a value off the default moves
 * the signature (so the control is not decoration).
 */
describe('where the files and links sit, and in what order (0193)', () => {
	const empty: ComposerDraft = {
		title: '',
		bodyText: '',
		files: 0,
		instructorFiles: 0,
		links: [],
		instructorLinks: [],
		deck: null,
		spec: null,
		checkIn: null,
		rubric: null
	};

	it('the default placement is not work, and reads as no placement at all', () => {
		expect(composerHasWork({ ...empty, layout: { files: 'bottom', links: 'bottom' } })).toBe(false);
		expect(composerDraftSignature({ ...empty, layout: { files: 'bottom', links: 'bottom' } })).toBe(
			composerDraftSignature(empty)
		);
		expect(composerDraftSignature({ ...empty, layout: null })).toBe(composerDraftSignature(empty));
	});

	it('a placement off the default is a decision, and counts', () => {
		expect(composerHasWork({ ...empty, layout: { files: 'top', links: 'bottom' } })).toBe(true);
		expect(composerHasWork({ ...empty, layout: { files: 'bottom', links: 'top' } })).toBe(true);
		// The two groups are two answers: moving one is not moving the other.
		expect(composerDraftSignature({ ...empty, layout: { files: 'top', links: 'bottom' } })).not.toBe(
			composerDraftSignature({ ...empty, layout: { files: 'bottom', links: 'top' } })
		);
	});

	it('an absent or empty file order is the same absence', () => {
		expect(composerDraftSignature({ ...empty, existingOrder: [] })).toBe(composerDraftSignature(empty));
		expect(composerDraftSignature({ ...empty, existingOrder: null })).toBe(composerDraftSignature(empty));
	});

	it('the same files in a different order is a different draft', () => {
		const ab = composerDraftSignature({ ...empty, existingOrder: ['a', 'b'] });
		const ba = composerDraftSignature({ ...empty, existingOrder: ['b', 'a'] });
		expect(ab).not.toBe(ba);
		expect(composerDraftSignature({ ...empty, existingOrder: ['a', 'b'] })).toBe(ab);
	});

	/**
	 * THE INSTRUCTOR LIST IS ITS OWN ORDER. It is written by its own RPC on
	 * save, so a rearrangement of it is work in exactly the sense the
	 * student-facing one is -- and it is a different field, so moving one list
	 * cannot read as moving the other.
	 */
	it('the instructor-only files carry their own order, under the same rule', () => {
		expect(composerDraftSignature({ ...empty, instructorExistingOrder: [] })).toBe(
			composerDraftSignature(empty)
		);
		expect(composerDraftSignature({ ...empty, instructorExistingOrder: null })).toBe(
			composerDraftSignature(empty)
		);
		const ab = composerDraftSignature({ ...empty, instructorExistingOrder: ['a', 'b'] });
		expect(ab).not.toBe(composerDraftSignature({ ...empty, instructorExistingOrder: ['b', 'a'] }));
		expect(ab).not.toBe(composerDraftSignature({ ...empty, existingOrder: ['a', 'b'] }));
	});
});
