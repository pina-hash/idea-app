<script lang="ts">
	import { page } from '$app/state';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import type { ClassroomComposerTransports, TxResult } from '$lib/classroom/classroom';
	import type { DeckTransports } from '$lib/classroom/deck';
	import type { ReferenceTransports } from '$lib/classroom/reference-spec';
	import type { RevisionTransports } from '$lib/classroom/revisions';
	import type { AssignmentTeacherTransports } from '$lib/classroom/assignment-spec';
	import { checkInsForItem, type ClassCheckInTransports } from '$lib/classroom/class-check-ins';
	import { harnessManage } from '../../+layout.svelte';
	import { ALT_REFERENCE_ID, CHECK_INS, DECK, REFERENCE, REFERENCE_ALT } from '../../../fixture';
	import type { PageData } from './$types';

	/**
	 * The REAL ItemDetail in the detail pane, reading `section` from the layout's
	 * data exactly as the shipping page does now that the item load no longer
	 * returns its own copy.
	 *
	 * `?manage=1` MOUNTS IT AS A TEACHER, which is what makes the instructor
	 * inspector measurable at all: the real item page needs a session and a live
	 * project this repo's placeholder .env cannot provide. Read from the URL in
	 * the COMPONENT rather than in the load, so neither load gains a `url`
	 * dependency -- the layout's not re-running is the whole point of the split.
	 *
	 * The transports are stubs that resolve without doing anything. This harness
	 * is for GEOMETRY and ARRANGEMENT; /dev/classroom is where the write paths
	 * are driven against an in-memory store.
	 */
	let { data }: { data: PageData } = $props();

	const manage = $derived(harnessManage(page.url));

	const ok = <T,>(value: T): Promise<TxResult<T>> => Promise.resolve({ ok: true, data: value });

	const transports: ClassroomComposerTransports = {
		createItem: () => ok({ itemId: 'i-new', sectionIds: [], formattingDropped: false }),
		updateItem: () => ok({ itemId: data.item.id, sectionIds: [], formattingDropped: false }),
		deleteItem: () => ok(undefined),
		duplicateItem: () => ok({ itemId: 'i-copy' }),
		addPostings: () => ok({ added: 0 }),
		removePosting: () => ok({ ok: true }),
		setPublished: () => ok(undefined),
		setPinned: () => ok(undefined),
		setOrder: () => ok(undefined),
		uploadAttachment: () => ok(undefined),
		deleteAttachment: () => ok(undefined),
		uploadInstructorAttachment: () => ok(undefined),
		deleteInstructorAttachment: () => ok(undefined),
		setInstructorResources: () => ok(undefined),
		markViewed: () => ok(undefined)
	};

	const deckTransports: DeckTransports = {
		uploadDeck: () => Promise.resolve({ ok: true, message: '', fileCount: 0, replaced: false }),
		deleteDeck: () => Promise.resolve({ ok: true, message: '' })
	};

	const referenceTransports: ReferenceTransports = {
		setReferenceSpec: () => Promise.resolve({ ok: true }),
		setPublic: () => Promise.resolve({ ok: true })
	};

	const teacherTransports: AssignmentTeacherTransports = {
		setSpec: () => ok(undefined),
		setRubric: () => ok(undefined),
		gradeSubmission: () => ok(undefined as never),
		approveModule: () => ok(undefined),
		loadGrading: () => ok(undefined as never)
	};

	const revisionTransports: RevisionTransports = {
		load: () =>
			Promise.resolve({
				ok: true as const,
				data: { entries: [], headRevisions: {} } as never
			}),
		restore: () => Promise.resolve({ ok: false as const, message: 'Stub.' })
	};

	/**
	 * ANSWERED IN MEMORY, exactly the shape /dev/classroom's own harness
	 * transport uses. This route is for GEOMETRY (see the file's own doc
	 * comment above), so the point is not driving the write path -- it is
	 * making `checkInTransports` non-null, which is what turns the second
	 * attach door on for an item that already carries a check-in.
	 */
	let harnessSessionSeq = 0;
	const checkInTransports: ClassCheckInTransports = {
		createForItem: () => Promise.resolve({ ok: true, sessionId: `ses-harness-${++harnessSessionSeq}` }),
		unlink: () => Promise.resolve({ ok: true }),
		setGuidance: () => Promise.resolve({ ok: true })
	};

	const isMaterial = $derived(data.item.kind === 'material');
</script>

<ItemDetail
	section={data.section}
	item={data.item}
	canManage={manage}
	transports={manage ? transports : null}
	deck={data.item.id === DECK.item_id ? DECK : null}
	deckTransports={manage ? deckTransports : null}
	referenceSpec={isMaterial ? (data.item.id === ALT_REFERENCE_ID ? REFERENCE_ALT : REFERENCE) : null}
	referenceTransports={manage && isMaterial ? referenceTransports : null}
	teacherTransports={manage && !isMaterial ? teacherTransports : null}
	revisionTransports={manage ? revisionTransports : null}
	checkIns={manage ? checkInsForItem(CHECK_INS['s-1'] ?? [], data.item.id) : []}
	checkInTransports={manage ? checkInTransports : null}
	gradeHref={manage ? `/dev/classroom-split/s-1/item/${data.item.id}/grade` : null}
/>
