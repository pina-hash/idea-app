<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import {
		createClassroomTransports,
		createEngineTransports,
		createHtmlAnswerTransports,
		createInstructorCopyTransports,
		createReferenceTransports,
		createRevisionTransports,
		createCheckInTransports,
		createLayoutTransports,
		createTeacherEngineTransports,
		deckTransports,
		fetchLinkPreviewClient,
		htmlManifestShaped
	} from '$lib/classroom/transports';
	import { checkInsForItem } from '$lib/classroom/class-check-ins';
	import {
		hxFileIdsByField,
		hxImagesFromFiles,
		hxValuesFromResponses
	} from '$lib/classroom/html-assignment/answers';
	import { HxAnswersStore } from '$lib/classroom/html-assignment/answers-store.svelte';
	import { itemLayoutKnown } from '$lib/classroom/attachments';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The Supabase client is ONE stable instance for the session, so capturing
	// it once is the intent here, not a missed reactive read.
	// svelte-ignore state_referenced_locally
	const transports = createClassroomTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	// svelte-ignore state_referenced_locally
	const engineTransports = createEngineTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const teacherTransports = createTeacherEngineTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const referenceTransports = createReferenceTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const revisionTransports = createRevisionTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const checkInTransports = createCheckInTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const layoutTransports = createLayoutTransports(data.supabase);

	/**
	 * THE 0193 WRITES, handed down ONLY when this item's own read answered the
	 * layout rung. `itemLayoutKnown` is false on a project without the
	 * migration, where every RPC behind these would answer `PGRST202`, and
	 * absence is what removes the controls -- no flag for ItemDetail to read.
	 * A manager's only, because the composer these feed is a manager's.
	 */
	const liveLayoutTransports = $derived(
		data.canManage && itemLayoutKnown(data.item) ? layoutTransports : null
	);

	/**
	 * The instructor working copy's writes (0128). Built only when the LOAD
	 * answered with a copy -- its absence is what removes the whole surface, so
	 * a deployment without the migration falls back to the read-only spec render
	 * rather than offering controls whose RPCs do not exist yet.
	 */
	const instructorCopyTransports = $derived(
		data.instructorCopy
			? createInstructorCopyTransports(data.supabase, data.instructorCopy.myEmail)
			: null
	);

	/**
	 * THE PORTED WORKSHEET'S ANSWER PATH, AND EVERY WAY IT CAN BE ABSENT IS THE
	 * SAME WAY: THIS DERIVES NULL AND NO CALLBACK IS HANDED DOWN.
	 *
	 * `ItemDetail` reads `readOnly={!htmlWrites}` off exactly this prop, so a
	 * null here is a document that will not accept typing -- rather than one
	 * that accepts it and discards it, which is the one failure worth avoiding
	 * on this surface. It is null for a MANAGER (there is no instructor working
	 * copy for a ported document: 0128's machinery is spec-shaped, and the
	 * student slice is deliberately never loaded for them), for an item with no
	 * stored document, and on a deployment whose engine read could not answer.
	 *
	 * THE CONTROLLER IS MEMOIZED ON A KEY RATHER THAN REBUILT PER READ. It owns
	 * one `SaveState` per block -- live debounce timers, backoff, and the
	 * visibilitychange/pagehide net -- so rebuilding it because `data` changed
	 * identity would silently drop whatever those machines still owed. The key
	 * is the item and the document, which is precisely what has to change for
	 * the controller to be the wrong one: `invalidateAll()` after a manager's
	 * write re-runs this and gets the SAME object back.
	 *
	 * AND `data.engine` IS THE SEED, NOT THE TRUTH. Once mounted the controller
	 * owns the answers -- a reload of the page data must not overwrite what a
	 * student has typed since -- so the stored rows are read only on the run
	 * that constructs, which is what the key already governs.
	 *
	 * THE TRANSPORTS ARE `createHtmlAnswerTransports`, WHICH IS A PROJECTION OF
	 * THE ENGINE'S OWN four writes and not a second implementation of any of
	 * them. `idea:change` therefore reaches `classroom_save_response` and
	 * `idea:image` reaches `classroom_add_submission_file` through exactly the
	 * browser-to-bucket path (0133) every other hand-in takes.
	 */
	// svelte-ignore state_referenced_locally
	const htmlAnswerTransports = createHtmlAnswerTransports(data.supabase);

	/** The memo cell. A plain local, never `$state`: it is read and written only
	    inside the derived below, and making it reactive would make that derived
	    depend on its own output. */
	let heldHtmlAnswers: { key: string; store: HxAnswersStore } | null = null;

	const htmlAnswers = $derived.by(() => {
		const doc = data.htmlAssignment;
		const engine = data.engine;
		// `manifest` ARRIVES AS `unknown` and is narrowed by the same structural
		// check the transport read uses. A blob this cannot map is one no field
		// map can be built from, so there is nothing an answer could be attached
		// to; null here is the read-only document, which is the honest answer.
		const manifest = doc && htmlManifestShaped(doc.manifest) ? doc.manifest : null;
		const key =
			!doc || !manifest || data.canManage || !engine ? '' : `${data.item.id}:${doc.documentId}`;
		if (heldHtmlAnswers && heldHtmlAnswers.key === key) return heldHtmlAnswers.store;
		heldHtmlAnswers?.store.destroy();
		heldHtmlAnswers = null;
		if (!key || !manifest || !engine) return null;
		heldHtmlAnswers = {
			key,
			store: new HxAnswersStore({
				itemId: data.item.id,
				manifest,
				transports: htmlAnswerTransports,
				// KEYED BY FIELD, FROM THE STORED MANIFEST, and the three of them
				// are one decision made three ways rather than three decisions: a
				// row whose block the manifest no longer declares is dropped by
				// each, because a re-uploaded document that removed a module leaves
				// exactly those rows behind and there is no field to put them in.
				values: hxValuesFromResponses(manifest, engine.responses),
				images: hxImagesFromFiles(manifest, engine.files),
				fileIds: hxFileIdsByField(manifest, engine.files)
			})
		};
		return heldHtmlAnswers.store;
	});

	// The last teardown. The derived above disposes a superseded controller when
	// the key moves; this is the one case it cannot see -- the page going away.
	onDestroy(() => {
		heldHtmlAnswers?.store.destroy();
		heldHtmlAnswers = null;
	});

	/**
	 * THE CHECK-IN TRANSPORTS THIS DEPLOYMENT CAN ACTUALLY EXECUTE.
	 *
	 * `createCheckInTransports` always builds all three writes -- it is a factory
	 * over a Supabase client, not a capability report -- so the DEPLOYMENT's
	 * answer has to be applied here. Two migrations are involved and they can be
	 * applied separately: without 0120 there is nothing to attach a check-in to,
	 * and without 0123 there is no column to write a prompt into. So the object
	 * handed down carries exactly the writes the schema supports, and ItemDetail
	 * removes the control for each one it does not get -- absence is the
	 * mechanism, rather than a flag the component has to remember to read.
	 */
	const liveCheckInTransports = $derived(
		data.canManage && data.checkInLinksReady
			? data.checkInGuidanceReady
				? checkInTransports
				: { createForItem: checkInTransports.createForItem, unlink: checkInTransports.unlink }
			: null
	);

	/**
	 * THE CHECK-INS THAT HANG OFF THIS ITEM (0120), out of the class's own list.
	 *
	 * `data.checkIns` is the LAYOUT's -- page data merges over layout data, and
	 * this route is a child of the class layout -- so the item page adds no
	 * second query for something the class already loaded, and the two surfaces
	 * cannot disagree about a student's status.
	 */
	const itemCheckIns = $derived(checkInsForItem(data.checkIns ?? [], data.item.id));
</script>

<ItemDetail
	section={data.section}
	item={data.item}
	sections={data.sections}
	canManage={data.canManage}
	attachmentsEnabled={data.attachmentsEnabled}
	{transports}
	fetchPreview={fetchLinkPreviewClient}
	engine={data.engine}
	{engineTransports}
	instructorCopy={data.canManage ? data.instructorCopy : null}
	{instructorCopyTransports}
	spec={data.spec}
	rubric={data.rubric}
	teacherTransports={data.canManage ? teacherTransports : null}
	referenceSpec={data.referenceSpec}
	referenceTransports={data.canManage ? referenceTransports : null}
	deck={data.deck}
	deckTransports={data.canManage ? deckTransports : null}
	revisionTransports={data.canManage ? revisionTransports : null}
	checkIns={itemCheckIns}
	checkInTransports={liveCheckInTransports}
	layoutTransports={liveLayoutTransports}
	htmlAssignment={data.htmlAssignment}
	{htmlAnswers}
	gradeHref={data.canManage ? `/classroom/${data.section.id}/item/${data.item.id}/grade` : null}
	onchanged={() => invalidateAll()}
	ondeleted={() => goto(`/classroom/${data.section.id}`)}
/>
