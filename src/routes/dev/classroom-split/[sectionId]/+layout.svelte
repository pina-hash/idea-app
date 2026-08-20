<script module lang="ts">
	// Module scope, so it survives client-side navigation between child routes.
	let mounts = 0;

	/**
	 * `?manage=1` LATCHES for the session. The row links are ordinary hrefs with
	 * no query on them, so without this a client-side navigation would drop back
	 * to the student view -- and every teacher-side claim measured after a click
	 * would be measuring the wrong page. In production `canManage` comes from the
	 * load, so there is nothing here to mirror.
	 */
	let manageLatch = false;
	export function harnessManage(url: URL): boolean {
		if (url.searchParams.get('manage') === '1') manageLatch = true;
		if (url.searchParams.get('manage') === '0') manageLatch = false;
		return manageLatch;
	}

	/**
	 * THE COMPOSER'S OWN LEDGER, at module scope so it survives navigation
	 * between items -- which is exactly the span the composer is meant to
	 * survive, so a counter that reset with the page would prove nothing.
	 *
	 * `created` is the list that makes the retry guarantee measurable: a save
	 * that fails halfway and is then saved AGAIN must update the item it already
	 * made, never post a second one, so this array must not grow on the retry.
	 */
	export const composeLog = {
		calls: [] as { fn: string; detail: Record<string, unknown> }[],
		created: [] as string[],
		updated: [] as string[],
		decks: [] as { itemId: string; file: string }[],
		specs: [] as { itemId: string; kind: string }[],
		/** Check-ins created against an item (0120), in call order. */
		checkIns: [] as { itemId: string; label: string; unit: number | string; date: string }[],
		/** Injected failures, flipped from the console for the partial-failure case. */
		fail: { deck: false, spec: false, checkIn: false }
	};
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { beforeNavigate } from '$app/navigation';
	import '$lib/classroom/classroom.css';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import { COMPOSER_DISCARD_WARNING } from '$lib/classroom/composer-staging';
	import type { AssignmentTeacherTransports } from '$lib/classroom/assignment-spec';
	import type { ClassCheckInTransports } from '$lib/classroom/class-check-ins';
	import type { DeckTransports } from '$lib/classroom/deck';
	import type { ReferenceTransports } from '$lib/classroom/reference-spec';
	import { itemTitle, sectionTitle } from '$lib/classroom/classroom';
	import {
		activeTab,
		classroomCrumbs,
		classroomMeasure,
		locateClassroom,
		navKeepsComposer,
		sectionTabs
	} from '$lib/classroom/nav';
	import { itemById, loads } from '../fixture';
	import type {
		ClassroomComposerTransports,
		ClassroomUnitTransports,
		TxResult
	} from '$lib/classroom/classroom';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	/**
	 * `?manage=1` mounts the list AS A TEACHER, which is what makes the toolbar,
	 * the row menu and the unit picker inside it measurable -- with no transports
	 * every management control is correctly absent, so "the select is not in the
	 * row any more" would be vacuously true. Read in the COMPONENT, never in a
	 * load: the layout load taking a `url` dependency is exactly what the split
	 * exists to avoid.
	 */
	const manage = $derived(harnessManage(page.url));

	const ok = <T,>(value: T): Promise<TxResult<T>> => Promise.resolve({ ok: true, data: value });

	function logCall(fn: string, detail: Record<string, unknown> = {}) {
		composeLog.calls = [...composeLog.calls, { fn, detail }];
	}

	/**
	 * Enough of a store to make the CREATE PATH measurable, which is the one
	 * thing this harness now needs beyond geometry: which item a save went to,
	 * whether the deck and the spec landed, and what survives a failure.
	 * /dev/classroom still drives the rest of the write surface.
	 */
	let createSeq = 0;
	const transports: ClassroomComposerTransports = {
		createItem: (kind, sectionIds) => {
			const itemId = `i-created-${++createSeq}`;
			composeLog.created = [...composeLog.created, itemId];
			logCall('createItem', { itemId, kind, sectionIds });
			return ok({ itemId, sectionIds, formattingDropped: false });
		},
		updateItem: (id) => {
			composeLog.updated = [...composeLog.updated, id];
			logCall('updateItem', { itemId: id });
			return ok({ itemId: id, sectionIds: [], formattingDropped: false });
		},
		deleteItem: () => ok(undefined),
		duplicateItem: () => ok({ itemId: 'i-copy' }),
		addPostings: () => ok({ added: 0 }),
		removePosting: () => ok({ ok: true }),
		setPublished: () => ok(undefined),
		setPinned: () => ok(undefined),
		setOrder: () => ok(undefined),
		uploadAttachment: (itemId, file) => {
			logCall('uploadAttachment', { itemId, file: file.name });
			return ok(undefined);
		},
		deleteAttachment: () => ok(undefined),
		uploadInstructorAttachment: (itemId, file) => {
			logCall('uploadInstructorAttachment', { itemId, file: file.name });
			return ok(undefined);
		},
		deleteInstructorAttachment: () => ok(undefined),
		setInstructorResources: () => ok(undefined),
		markViewed: () => ok(undefined)
	};

	/**
	 * The two staged extras, each able to fail on demand -- the partial-failure
	 * case is the one worth driving, because "the failed one stays staged and
	 * the successful one does not" is invisible from the outside otherwise.
	 */
	const harnessDeckTransports: DeckTransports = {
		async uploadDeck(itemId, file, options) {
			options?.onProgress?.({ phase: 'uploading', loaded: file.size, total: file.size });
			options?.onProgress?.({ phase: 'unpacking', loaded: 4, total: 9 });
			if (composeLog.fail.deck) {
				logCall('uploadDeck:failed', { itemId, file: file.name });
				return { ok: false, code: 'drive_upload', message: 'Drive refused a file in this deck.' };
			}
			composeLog.decks = [...composeLog.decks, { itemId, file: file.name }];
			logCall('uploadDeck', { itemId, file: file.name });
			return { ok: true, message: 'Deck uploaded.', fileCount: 9, replaced: false };
		},
		async deleteDeck() {
			return { ok: true, message: 'Deck removed.' };
		}
	};

	const harnessTeacherTransports: AssignmentTeacherTransports = {
		setSpec: (itemId) => {
			if (composeLog.fail.spec) {
				logCall('setSpec:failed', { itemId });
				return Promise.resolve({ ok: false as const, message: 'The server refused that spec.' });
			}
			composeLog.specs = [...composeLog.specs, { itemId, kind: 'assignment' }];
			logCall('setSpec', { itemId });
			return ok(undefined);
		},
		setRubric: () => ok(undefined),
		gradeSubmission: () => ok(undefined as never),
		approveModule: () => ok(undefined),
		loadGrading: () => ok(undefined as never)
	};

	const harnessReferenceTransports: ReferenceTransports = {
		async setReferenceSpec(itemId) {
			if (composeLog.fail.spec) {
				logCall('setReferenceSpec:failed', { itemId });
				return { ok: false, message: 'The server refused that document.' };
			}
			composeLog.specs = [...composeLog.specs, { itemId, kind: 'reference' }];
			logCall('setReferenceSpec', { itemId });
			return { ok: true };
		},
		async setPublic() {
			return { ok: true };
		}
	};

	/**
	 * THE THIRD STAGED ATTACHABLE (0120), answered in memory. It follows the
	 * SPEC's pattern rather than the deck's: one call, no bytes, no progress --
	 * so the only thing worth driving here is the pair of outcomes, and
	 * `composeLog.fail.checkIn` is what makes the refusal reachable.
	 */
	const harnessCheckInTransports: ClassCheckInTransports = {
		async createForItem(itemId, draft) {
			if (composeLog.fail.checkIn) {
				logCall('createItemCheckIn:failed', { itemId, label: draft.session_label });
				return { ok: false, message: 'The server refused that check-in.' };
			}
			composeLog.checkIns = [
				...composeLog.checkIns,
				{
					itemId,
					label: draft.session_label,
					unit: draft.unit_number,
					date: draft.session_date
				}
			];
			logCall('createItemCheckIn', { itemId, label: draft.session_label });
			return { ok: true };
		},
		async unlink(sessionId, sectionId) {
			logCall('unlinkCheckIn', { sessionId, sectionId });
			return { ok: true };
		}
	};

	const unitTransports: ClassroomUnitTransports = {
		upsertUnit: () => ok({ unitId: 'u-new', created: true, duplicate: false }),
		deleteUnit: () => ok({ unfiled: 0 }),
		setUnitOrder: () => ok(undefined),
		reloadUnits: () => ok(data.units),
		setItemUnit: () => ok({ ok: true })
	};

	/**
	 * The harness's own path rewritten to the real one, so `locateClassroom`,
	 * `classroomMeasure`, `classroomCrumbs` and `sectionTabs` are the SHIPPING
	 * functions running on a shipping-shaped path. Nothing about where-am-I is
	 * re-implemented here.
	 */
	const loc = $derived(
		locateClassroom(page.url.pathname.replace('/dev/classroom-split', '/classroom'))
	);
	const measure = $derived(classroomMeasure(loc));
	const split = $derived(loc.place === 'section' || loc.place === 'item');
	const selectedItemId = $derived(loc.place === 'item' ? loc.itemId : null);

	const crumbs = $derived(
		classroomCrumbs(
			loc,
			{
				section: sectionTitle(data.section),
				item: selectedItemId ? itemTitle(itemById(selectedItemId) ?? ({} as never)) : null
			},
			'/dev/classroom-split'
		)
	);
	const tabs = $derived(loc.sectionId ? sectionTabs(loc.sectionId) : []);

	/**
	 * MOUNTS OF THIS COMPONENT, counted in the instance body -- which runs once
	 * per instantiation and never again -- rather than in an effect, which would
	 * re-run on its own write. If opening an item remounted the layout, which is
	 * what would throw the list's state away, this would climb. It does not.
	 */
	mounts += 1;
	const myMount = mounts;

	/**
	 * The folded-groups state the real layout holds, mirrored here so "the list's
	 * own state survives opening an item" is something to drive rather than
	 * something to argue. It lives in the LAYOUT component, which is the whole
	 * mechanism.
	 */
	let collapsed = $state<string[]>([]);
	function toggleGroup(groupId: string) {
		collapsed = collapsed.includes(groupId)
			? collapsed.filter((id) => id !== groupId)
			: [...collapsed, groupId];
	}

	/**
	 * THE COMPOSER, owned exactly where the real layout owns it -- so what this
	 * harness measures about staged files surviving an item click is the
	 * shipping arrangement and not a mock of it.
	 */
	let composing = $state(false);
	let composerDirty = $state(false);
	let composeNotice = $state<string | null>(null);

	function confirmDiscard(): boolean {
		if (!composing || !composerDirty) return true;
		return window.confirm(`${COMPOSER_DISCARD_WARNING}\n\nDiscard it?`);
	}

	function closeComposer() {
		if (!confirmDiscard()) return;
		composerDirty = false;
		composing = false;
	}

	function toggleComposer() {
		if (composing) {
			closeComposer();
			return;
		}
		composeNotice = null;
		composing = true;
	}

	function composerSaved(info: { text: string }) {
		if (!info.text) return;
		composeNotice = info.text;
		composerDirty = false;
		composing = false;
	}

	/**
	 * The real layout's navigation guard, mirrored -- including the rewrite of
	 * this harness's own path prefix, so `navKeepsComposer` is asked about a
	 * shipping-shaped path. Without this here the guarantee would be
	 * undrivable: an in-class hop that correctly says nothing is
	 * indistinguishable from a guard that never runs.
	 */
	beforeNavigate((nav) => {
		if (!composing || !composerDirty) return;
		if (nav.type === 'leave') {
			nav.cancel();
			return;
		}
		const to = nav.to?.url.pathname;
		if (to && navKeepsComposer(data.section.id, to.replace('/dev/classroom-split', '/classroom'))) {
			return;
		}
		if (window.confirm(`${COMPOSER_DISCARD_WARNING}\n\nLeave anyway?`)) {
			composerDirty = false;
			composing = false;
			return;
		}
		nav.cancel();
	});

	// Read from the console: `window.__splitProbe()`.
	$effect(() => {
		(window as unknown as Record<string, unknown>).__splitProbe = () => ({
			layoutLoads: loads.layout,
			itemLoads: loads.item,
			layoutMounts: mounts,
			thisInstance: myMount,
			collapsed: [...collapsed],
			place: loc.place,
			measure,
			selectedItemId,
			composing,
			composerDirty,
			composeNotice
		});
		/** The create path's ledger, plus the failure switches for a partial save. */
		(window as unknown as Record<string, unknown>).__composeProbe = () => ({
			created: [...composeLog.created],
			updated: [...composeLog.updated],
			decks: [...composeLog.decks],
			specs: [...composeLog.specs],
			checkIns: [...composeLog.checkIns],
			calls: composeLog.calls.map((c) => c.fn),
			fail: { ...composeLog.fail }
		});
		(window as unknown as Record<string, unknown>).__composeFail = (
			next: Partial<{ deck: boolean; spec: boolean; checkIn: boolean }>
		) => {
			Object.assign(composeLog.fail, next);
			return { ...composeLog.fail };
		};
		(window as unknown as Record<string, unknown>).__composeReset = () => {
			composeLog.calls = [];
			composeLog.created = [];
			composeLog.updated = [];
			composeLog.decks = [];
			composeLog.specs = [];
			composeLog.checkIns = [];
			composeLog.fail.deck = false;
			composeLog.fail.spec = false;
			composeLog.fail.checkIn = false;
		};
		/** Whether a given path would keep the composer, through the real rule. */
		(window as unknown as Record<string, unknown>).__navKeepsComposer = (path: string) =>
			navKeepsComposer(data.section.id, path.replace('/dev/classroom-split', '/classroom'));
	});
</script>

{#snippet classList()}
	<ClassView
		section={data.section}
		items={data.items}
		units={data.units}
		{selectedItemId}
		{collapsed}
		canManage={manage}
		transports={manage ? transports : null}
		unitTransports={manage ? unitTransports : null}
		{composing}
		onCompose={manage ? toggleComposer : null}
		notice={composeNotice}
		onToggleGroup={toggleGroup}
		asPane={!!selectedItemId || composing}
		basePath="/dev/classroom-split"
		notebookHref="/dev/notebook"
	/>
{/snippet}

{#snippet composer()}
	{#key composing}
		<section class="card compose-card">
			<h2 class="compose-title">New post</h2>
			<ContentComposer
				mode="create"
				sections={[data.section]}
				initialTargets={[data.section.id]}
				{transports}
				deckTransports={harnessDeckTransports}
				teacherTransports={harnessTeacherTransports}
				referenceTransports={harnessReferenceTransports}
				checkInTransports={harnessCheckInTransports}
				onsaved={composerSaved}
				ondirtychange={(d) => (composerDirty = d)}
				oncancel={closeComposer}
			/>
		</section>
	{/key}
{/snippet}

<div class="cr-root" style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}>
	<ClassroomShell
		sections={[data.section]}
		currentSectionId="s-1"
		{crumbs}
		{tabs}
		tab={activeTab(loc)}
		canManage={true}
	>
		{#if split}
			<ClassSplit
				hasDetail={!!selectedItemId || composing}
				nav={classList}
				overlay={composing ? composer : null}
			>
				{@render children()}
			</ClassSplit>
		{:else}
			{@render children()}
		{/if}
	</ClassroomShell>
</div>

<style>
	.compose-card {
		padding: var(--space-5);
	}
	.compose-title {
		margin: 0 0 var(--space-4);
		font-size: 1.05rem;
	}
</style>
