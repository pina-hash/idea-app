import { describe, expect, it, vi } from 'vitest';
import {
	applyStagedExtras,
	composerHasWork,
	saveTarget,
	stagedDeckIssue,
	stagedSpecKind,
	type ComposerDraft,
	type StagedExtrasTransports
} from '../src/lib/classroom/composer-staging';
import { DECK_UPLOAD_MAX_ZIP_BYTES } from '../src/lib/classroom/deck';

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
