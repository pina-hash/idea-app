<script lang="ts">
	import { createIdeacadTransports } from '$lib/ideacad/transports';
	import { createIdeacadStore, type IdeacadStoreState } from '$lib/ideacad/store';
	import { IDEACAD_UNAVAILABLE, isIdeaCad, type IdeacadEditorWrites } from '$lib/ideacad/mount';
	import { onDestroy, untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import {
		createClassroomTransports,
		createEngineTransports,
		createHtmlAnswerTransports,
		createHtmlAssignmentTransports,
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
	import { hxInstructorAnswerTransports } from '$lib/classroom/html-assignment/instructor';
	import { HX_UNSAVED_WARNING } from '$lib/classroom/html-assignment/answers';
	import { guardSaveNavigation } from '$lib/save-guard.svelte';
	import { SaveState } from '$lib/save-state.svelte';
	import { itemLayoutKnown } from '$lib/classroom/attachments';
	import PresenceHeartbeat from '$lib/classroom/presence/PresenceHeartbeat.svelte';
	import { createPresenceBeatTransport } from '$lib/classroom/presence/transports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The Supabase client is ONE stable instance for the session, so capturing
	// it once is the intent here, not a missed reactive read.
	// svelte-ignore state_referenced_locally
	const transports = createClassroomTransports(data.supabase);
	// svelte-ignore state_referenced_locally
	const ideacadTransports = createIdeacadTransports(data.supabase);
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
	 * one `SaveState` per block -- live debounce timers and backoff -- so
	 * rebuilding it because `data` changed identity would silently drop whatever
	 * those machines still owed. The key is the item and the document, which is
	 * precisely what has to change for the controller to be the wrong one:
	 * `invalidateAll()` after a manager's write re-runs this and gets the SAME
	 * object back.
	 *
	 * THOSE MACHINES NOW HAVE THE DURABILITY NET, AND THEY DID NOT UNTIL LEDGER
	 * 0141. `SaveState.attach()` is what wires visibilitychange and pagehide,
	 * and every other save surface in this codebase calls it from an `$effect`
	 * (`AssignmentEngine`, `ContentComposer`, `GradingConsole`,
	 * `InstructorCopy`, `SpecTextEditor`). `HxAnswers` called it ZERO times,
	 * exposed no `attach` of its own, and builds its machines LAZILY per block
	 * -- so nothing outside it could attach them either, and closing the tab
	 * inside the 800ms debounce lost the last keystroke burst on a ported
	 * worksheet and on no other surface in the app. The two halves of the fix
	 * are `HxAnswers.attach`, which covers machines made after it was called,
	 * and the `$effect` plus `guardSaveNavigation` below.
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

	/**
	 * THE RE-UPLOAD PATH (0154): the writes that let a posted ported assignment
	 * be CHANGED, which until now it could not be.
	 *
	 * `createHtmlAssignmentTransports` is the existing factory and is unchanged.
	 * What is added beside it is the ORPHAN COUNT, and it is built here rather
	 * than folded into that factory because the EDIT path is the only caller
	 * there is: the create-mode composer is mounted by the class layout and has
	 * no stored document to diff against, so a counter there would be dead. The
	 * day a second surface needs one, this moves into `transports.ts` beside the
	 * factory -- there is exactly one implementation either way.
	 *
	 * WHY IT IS A COUNT AND NOT AN ESTIMATE. A `classroom_responses` row names
	 * an item and a `block_id`; a re-upload whose manifest renames an id leaves
	 * those rows in the database and out of the worksheet, silently. The teacher
	 * about to do that is told how many rows it is, read from the table, for
	 * this item, now.
	 *
	 * TWO READS, NEVER ONE INFERRED FROM THE OTHER. A dropped IMAGE block
	 * orphans an uploaded photograph exactly as a dropped text block orphans a
	 * sentence, and counting only responses would understate the loss on the
	 * block type where the work is hardest to redo.
	 *
	 * RLS-SCOPED WITH NO IDENTITY FILTER, as every read here is. The policy is
	 * the boundary; the caller is a manager of this item, which is the same
	 * question the grading console's own reads ask.
	 *
	 * A FAILURE IS REPORTED, NEVER SWALLOWED. `{ ok: false }` reaches
	 * `assessHtmlReupload`, which treats "could not count" as a reason to
	 * require the confirmation rather than as a zero -- "cannot tell" must never
	 * render as "nothing at risk".
	 */
	// svelte-ignore state_referenced_locally
	const htmlAssignmentTransports = {
		...createHtmlAssignmentTransports(data.supabase),
		async countOrphanedAnswers(itemId: string, blockIds: string[]) {
			if (!blockIds.length) return { ok: true as const, responses: 0, files: 0 };
			const [responses, files] = await Promise.all([
				data.supabase
					.from('classroom_responses')
					.select('block_id')
					.eq('item_id', itemId)
					.in('block_id', blockIds),
				data.supabase
					.from('classroom_submission_files')
					.select('block_id, classroom_submissions!inner(item_id)')
					.eq('classroom_submissions.item_id', itemId)
					.in('block_id', blockIds)
			]);
			if (responses.error) {
				return { ok: false as const, message: responses.error.message ?? 'the answers could not be counted' };
			}
			if (files.error) {
				return { ok: false as const, message: files.error.message ?? 'the uploaded files could not be counted' };
			}
			return {
				ok: true as const,
				responses: responses.data?.length ?? 0,
				files: files.data?.length ?? 0
			};
		}
	};

	/**
	 * THE NAVIGATION GUARD'S HANDLE, DECLARED BEFORE THE CONTROLLER THAT ARMS IT.
	 *
	 * `guardSaveNavigation` takes ONE `SaveState` and this surface has one per
	 * block, so this is the `MapsEditor` shape: an `autosave: false` machine
	 * that schedules nothing and writes nothing itself, existing only so the
	 * guard has something to hold, whose `save()` calls the controller's own
	 * `flush()`. It is not a second save path -- `HxAnswers.flush` remains the
	 * one implementation of "write everything owed".
	 *
	 * IT MUST BE MARKED DIRTY OR ITS FLUSH NEVER RUNS, which is the whole reason
	 * `ondirty` exists. `SaveState.saveNow()` returns early on a machine that is
	 * clean with nothing pending, so a handle nothing ever arms would have the
	 * guard cancel the navigation, flush NOTHING, find the work still
	 * outstanding and put a confirm in front of the student -- the loss the
	 * guard exists to prevent, plus a question people learn to click through.
	 * `autosave: false` is what keeps arming it from scheduling a write of its
	 * own; the per-block machines still own the actual debounce.
	 */
	const htmlGuardState = new SaveState({
		autosave: false,
		fallbackMessage: HX_UNSAVED_WARNING,
		async save() {
			await heldHtmlAnswers?.store.flush();
			await heldHtmlInstructor?.store.flush();
			return { ok: true };
		}
	});

	/** The memo cell. A plain local, never `$state`: it is read and written only
	    inside the derived below, and making it reactive would make that derived
	    depend on its own output. */
	let heldHtmlAnswers: { key: string; store: HxAnswersStore } | null = null;

	/**
	 * THE MANAGER'S OWN ANSWER PATH ON A PORTED ASSIGNMENT (0199), built exactly
	 * the way the student's is and kept rigorously apart from it.
	 *
	 * `hxInstructorAnswerTransports` PROJECTS 0128's OWN `saveResponse` and
	 * nothing else, so `idea:change` from an instructor's frame reaches
	 * `classroom_save_instructor_response` and lands in
	 * `classroom_instructor_responses` -- never `classroom_save_response`, which
	 * would put a teacher's answers in the student table where the grading
	 * console, the Grades tab, the FACTS export and every roster read treat a row
	 * as a student's hand-in.
	 *
	 * THE THREE FILE TRANSPORTS ARE ABSENT AND THAT IS NOT AN OMISSION. There is
	 * no instructor counterpart to `classroom_submission_files`; handing the
	 * engine's uploader over would attach a teacher's photograph to a
	 * `classroom_submissions` row opened in their own name. The controller
	 * answers each absence with its own sentence, which travels back into the
	 * document, rather than dropping the message.
	 *
	 * NULL IS THE ORDINARY ANSWER for a student, for a v1 assignment, for a
	 * deployment whose working-copy read came back empty and for a manifest that
	 * could not be narrowed -- and null leaves `ItemDetail` rendering exactly the
	 * read-only frame it rendered before this existed.
	 */
	const htmlInstructorTransports = $derived(
		data.canManage && data.instructorCopy
			? hxInstructorAnswerTransports(
					createInstructorCopyTransports(data.supabase, data.instructorCopy.myEmail)
				)
			: null
	);

	/** The instructor controller's memo cell. A plain local, for the same reason
	    `heldHtmlAnswers` is one: it is read and written only inside the derived
	    below, and making it reactive would make that derived depend on its own
	    output. */
	let heldHtmlInstructor: { key: string; store: HxAnswersStore } | null = null;

	const htmlInstructorAnswers = $derived.by(() => {
		const doc = data.htmlAssignment;
		const copy = data.instructorCopy;
		const transports = htmlInstructorTransports;
		const manifest = doc && htmlManifestShaped(doc.manifest) ? doc.manifest : null;
		// THE KEY CARRIES THE INSTRUCTOR'S OWN EMAIL as well as the item and the
		// document, because the rows this controller is seeded from are theirs
		// alone. On a shared staff machine a sign-out and a sign-in changes who
		// the copy belongs to without changing the item, and a controller
		// memoized on the item would go on writing the previous instructor's
		// answers into the new one's session.
		const key =
			!doc || !manifest || !copy || !transports || !data.canManage
				? ''
				: `${data.item.id}:${doc.documentId}:${copy.myEmail}`;
		if (heldHtmlInstructor && heldHtmlInstructor.key === key) return heldHtmlInstructor.store;
		heldHtmlInstructor?.store.destroy();
		heldHtmlInstructor = null;
		if (!key || !manifest || !copy || !transports) return null;
		heldHtmlInstructor = {
			key,
			store: new HxAnswersStore({
				itemId: data.item.id,
				manifest,
				transports,
				// `mine` IS ALREADY THE CALLER'S OWN ROWS -- `loadInstructorCopy`
				// filters by email in the load, because RLS legitimately returns the
				// key author's rows through the same policy and attribution is not
				// authorization. `hxValuesFromResponses` takes them unchanged: a row
				// is `{ block_id, value }` whichever table it came out of.
				values: hxValuesFromResponses(manifest, copy.mine),
				// NO IMAGES AND NO FILE IDS, because there is no instructor file
				// table for either to come from. Empty rather than omitted, so a
				// document opens on `{}` and shows no photograph rather than opening
				// on nothing and showing whatever it had.
				images: {},
				fileIds: new Map(),
				ondirty: () => htmlGuardState.markDirty()
			})
		};
		return heldHtmlInstructor.store;
	});

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
				fileIds: hxFileIdsByField(manifest, engine.files),
				// ARMS THE GUARD'S HANDLE the moment a block owes a write. See
				// `htmlGuardState` above for why a handle nothing marks dirty makes
				// the guard ask a question instead of flushing.
				ondirty: () => htmlGuardState.markDirty()
			})
		};
		return heldHtmlAnswers.store;
	});

	// The last teardown. The derived above disposes a superseded controller when
	// the key moves; this is the one case it cannot see -- the page going away.
	onDestroy(() => {
		heldHtmlAnswers?.store.destroy();
		heldHtmlAnswers = null;
		heldHtmlInstructor?.store.destroy();
		heldHtmlInstructor = null;
	});

	/**
	 * THE TAB-CLOSING NET, WIRED THE WAY THE OTHER SIX SURFACES WIRE IT.
	 *
	 * `htmlAnswers` IS READ TRACKED AND THE CALL IS `untrack`ed, which is the
	 * repo's rule for an effect that invokes code it did not write. The tracked
	 * read is the dependency this effect exists for -- a NEW controller needs a
	 * new net, and the old one's teardown is what takes the previous listeners
	 * off -- and the memo above returns the SAME object across an
	 * `invalidateAll()`, so a manager's write does not silently re-arm anything.
	 * `attach()` touches only `document`, `window` and its own machines today;
	 * untracking it anyway is the shape rule, not a claim about what it does.
	 *
	 * RETURNING THE TEARDOWN IS DELIBERATE AND IS NOT A SECOND `destroy()`. It
	 * runs only when this effect re-runs or the page goes away, which is exactly
	 * when the controller it attached is finished with; `onDestroy` above stays
	 * because a controller superseded by a KEY CHANGE is disposed there, and the
	 * two cover different moments.
	 */
	$effect(() => {
		const answers = htmlAnswers;
		if (!answers) return;
		return untrack(() => answers.attach());
	});

	/**
	 * AND THE SAME NET OVER THE INSTRUCTOR'S CONTROLLER (0199). Its own effect
	 * rather than a second statement inside the one above: the two controllers
	 * are never both live -- one is built for a manager and the other for a
	 * student -- but an effect reading both would re-run and re-attach one
	 * because the OTHER moved, which is the kind of coupling that is invisible
	 * until the day both are non-null.
	 *
	 * A teacher checking a worksheet closes the tab exactly as a student does,
	 * and the debounce is just as lossy for them.
	 */
	$effect(() => {
		const answers = htmlInstructorAnswers;
		if (!answers) return;
		return untrack(() => answers.attach());
	});

	/**
	 * AND THE NAVIGATION HALF, WHICH THE NET ABOVE DOES NOT COVER.
	 *
	 * `visibilitychange` and `pagehide` do not fire on a CLIENT-SIDE navigation
	 * -- clicking the next item in the class stream is not the tab going away --
	 * so the 800ms debounce is just as lossy there, and it is the case
	 * `save-guard.svelte.ts`'s own header names as the reported defect that
	 * produced it.
	 *
	 * THE GUARD TAKES A `SaveState` AND THIS SURFACE HAS ONE PER BLOCK, so it
	 * gets the `MapsEditor` shape: one `autosave: false` machine that schedules
	 * nothing and exists only as the guard's handle, whose `save()` flushes the
	 * real ones. It is NOT a second save path -- it writes nothing itself, and
	 * `HxAnswers.flush` is the one implementation of "write everything owed".
	 * `alsoUnsaved` is what reports work the handle cannot see, because
	 * `HxAnswers.dirty` is a question asked at a moment rather than a rune the
	 * guard could read off this machine.
	 *
	 * BUILT UNCONDITIONALLY AND GATED BY `enabled`, because `guardSaveNavigation`
	 * registers a `beforeNavigate` and that is a component-init call: a
	 * conditional one would be a guard that exists only on the render where the
	 * condition first held.
	 */
	$effect(() => htmlGuardState.attach());
	guardSaveNavigation(htmlGuardState, {
		// ONE GUARD OVER BOTH CONTROLLERS, never two. `guardSaveNavigation`
		// registers a `beforeNavigate`, and two of them on one page race to
		// cancel the same navigation and ask two questions about one move -- the
		// defect `save-guard.svelte.ts` names in its own header. Only one of the
		// two controllers is ever live, so the handle's `save()` flushing both
		// flushes exactly the one that exists.
		enabled: () => !!heldHtmlAnswers || !!heldHtmlInstructor,
		warning: HX_UNSAVED_WARNING,
		alsoUnsaved: () =>
			heldHtmlAnswers?.store.dirty || heldHtmlInstructor?.store.dirty
				? HX_UNSAVED_WARNING
				: null
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

	/**
	 * THE IDEACAD DOCUMENT'S WIRE (0178), AND IT IS THE SAME OMISSION 0152 LEFT
	 * ONE FEATURE OVER. `createIdeacadTransports` was called on line 43 from the
	 * day it existed and the result was passed NOWHERE: the only route to
	 * `BladeEditor` is `ItemDetail.svelte`, which ledger 0171 did not own, so
	 * everything 0167, 0170 and 0171 built mounted in a real assignment and
	 * wrote nothing. A student could model a blade for an hour and lose all of
	 * it on reload, with a "Saved" indicator on screen the whole time.
	 *
	 * ONE STORE FOR THE PAGE, OPENED PER ITEM. `createIdeacadStore` owns the
	 * 750ms debounce, the serialized writes and the terminal `conflict` state
	 * (`store.ts`, ledger 0170); nothing here re-implements any of it and there
	 * is no second throttle. The `key` below is what re-opens it on a
	 * client-side navigation to another schema-4 assignment.
	 *
	 * A STUDENT ONLY. `ideacad_open_document` resolves its subject through
	 * `_classroom_engine_student`, which RAISES for a manager -- so the gate is
	 * `!data.canManage`, which is the same branch the load itself takes when it
	 * decides whether to call that RPC or read `ideacad_editors` instead. A
	 * teacher opening this page is handed no writes at all, and absence is what
	 * makes their editor read-only.
	 *
	 * IT COSTS ONE DUPLICATE READ AND THAT IS WRITTEN DOWN RATHER THAN HIDDEN.
	 * `+page.server.ts` already calls `ideacad_open_document` for the payload,
	 * and `open()` calls it again from the browser, because the store's only
	 * entry point is that method -- it is what puts the document id, the concept
	 * ids and the revisions in the machine that writes them. A `seed()` on the
	 * store would close it in one call; `store.ts` is ledger 0170's file and not
	 * this bundle's, so the cost is paid and named here instead of by editing
	 * somebody else's module from this lane.
	 */
	const ideacadStore = createIdeacadStore(ideacadTransports);
	let ideacadDoc = $state<IdeacadStoreState | null>(null);
	let ideacadOpenRefusal = $state<string | null>(null);
	/** The item this page should have an IdeaCAD document open for, or null. The
	 *  load's own payload is the gate -- `isIdeaCad` reads the item's schema
	 *  version through the ONE predicate, and `data.ideacad` being null is a
	 *  deployment whose read could not answer. */
	const ideacadItemId = $derived(
		!data.canManage && data.ideacad && isIdeaCad(data.item) ? data.item.id : null
	);
	/**
	 * `ideacadItemId` IS READ TRACKED AND THE CALLS ARE `untrack`ed, which is
	 * this repo's rule for an effect that invokes code it did not write. The
	 * store's `open` reaches a transport, and a transport is written by whoever
	 * mounts the surface -- here that is this file, but the shape is the rule.
	 */
	$effect(() => {
		const itemId = ideacadItemId;
		if (!itemId) return;
		untrack(() => {
			ideacadOpenRefusal = null;
			const stop = ideacadStore.subscribe((state) => (ideacadDoc = state));
			ideacadStore.open(itemId).catch(() => {
				// The slot says so rather than mounting an editor that writes
				// nowhere. IDEACAD_UNAVAILABLE is the existing sentence for
				// exactly this and is not restated here.
				ideacadOpenRefusal = IDEACAD_UNAVAILABLE;
			});
			return stop;
		});
	});
	/** The last flush. `destroy()` writes whatever the debounce still holds
	 *  before it stops the timer, which is the one moment a tab closing mid-edit
	 *  is recoverable at all. */
	onDestroy(() => void ideacadStore.destroy());
	/**
	 * THE WRITE BOUNDARY HANDED TO `ItemDetail`, WHICH IS A PROJECTION OF THE
	 * STORE AND NOT A SECOND COPY OF ANYTHING. Built only for the caller the
	 * store was opened for: null for a manager, so the editor they read has no
	 * write path to forget to disable.
	 */
	const ideacadWrites = $derived<IdeacadEditorWrites | null>(
		ideacadItemId
			? {
					edit: (features) => ideacadStore.edit(features),
					create: async (name, features) => {
						const row = await ideacadStore.create(name, features);
						return { id: row.id, name: row.name };
					},
					rename: (conceptId, name) => ideacadStore.rename(conceptId, name),
					reposition: (conceptId, position) => ideacadStore.reposition(conceptId, position),
					remove: async (conceptId) => {
						await ideacadStore.delete(conceptId);
						return { activeConceptId: ideacadStore.state.activeConceptId ?? conceptId };
					},
					activate: (conceptId) => ideacadStore.setActive(conceptId),
					setPrediction: (conceptId, rationale) => ideacadStore.setPrediction(conceptId, rationale),
					commit: (conceptId) => ideacadStore.commit(conceptId)
				}
			: null
	);

	/**
	 * THE PRESENCE HEARTBEAT'S WIRE (0200), AND IT IS THE ONE 0152 COULD NOT
	 * MAKE. Everything else in that bundle shipped -- the migration, both RPCs,
	 * the retention, the pure modules, the instructor surface -- and this file
	 * was held by five parallel lanes, so until this line nothing anywhere wrote
	 * a `classroom_presence` row and the console read an empty table.
	 *
	 * `data.engine` IS THE GATE, AND IT IS THE DATABASE'S OWN POPULATION SPELLED
	 * IN THE PAYLOAD RATHER THAN A SECOND IDEA OF WHO IS A STUDENT. The load
	 * builds it in exactly one branch -- `item.kind === 'assignment'` AND NOT
	 * `canManage` -- and `classroom_presence_ping` resolves its subject through
	 * `_classroom_engine_student`, which raises for a manager, for a material and
	 * for an unpublished item. So the two agree by construction: every page that
	 * mounts this is a page whose beats the RPC would accept, and asking
	 * `kind === 'assignment' && !canManage` here instead would be that same
	 * condition written a second time, thirty lines from the branch that already
	 * decided it.
	 *
	 * WHICH MEANS A TEACHER IS NEVER BEATEN FOR. Instructors enroll themselves to
	 * see a class the way a student does and roster imports sweep them in
	 * (0138's finding), so a manager reading this page WOULD satisfy 0086's
	 * enrollment gate and would acquire a presence row about themselves. Absence
	 * is what prevents it -- there is no transport to send with -- rather than a
	 * flag inside the component.
	 *
	 * NO CLIENT THROTTLE, DELIBERATELY, AND THE TWO NUMBERS ARE WHY. The
	 * component beats at `heartbeatSeconds` (30) and
	 * `_classroom_presence_min_gap()` refuses a write inside 20, so the client is
	 * ALREADY the wider of the two and a third limit here could only ever be a
	 * fourth place for the rate to be written down. The floor that matters is the
	 * database's, because a limit living in the code that sends the requests is a
	 * promise rather than a limit.
	 *
	 * `limits` IS NOT HANDED DOWN AND THAT IS NOT AN OVERSIGHT. This deployment's
	 * real windows travel in `classroom_presence_state`'s `limits` object, which
	 * is the INSTRUCTOR'S read; a student never calls it and has nothing to learn
	 * them from. The component's own `PRESENCE_LIMITS_FALLBACK` is what it uses,
	 * and `tests/db/classroom-presence-state-mirror.test.ts` pins that constant
	 * equal to the deployed functions -- so "not told" and "told" agree wherever
	 * 0200 is applied, and where they ever diverged the database's 20-second
	 * floor is still the thing that decides what is written.
	 *
	 * NOTHING IS ANNOUNCED, AND THE REASON IS AN ARITHMETIC ONE. `live.ts` says
	 * the notice "only makes a student SITTING DOWN immediate" -- but
	 * `PRESENCE_POLL_MS` is 30 seconds and the heartbeat is 30 seconds, so a
	 * notice on a PERIODIC beat tells an open console exactly what its own next
	 * poll was about to, while costing one broadcast per student per beat. What
	 * would earn its place is a notice on the FIRST beat and on the return from
	 * hidden, which are the two that are news -- and `announce` fires after every
	 * beat `PresenceHeartbeat` emits, so that is a change in `heartbeat.ts`,
	 * which is 0152's surface and not this bundle's. Left unwired rather than
	 * wired wastefully, and named here so the next reader does not take the
	 * absence for a forgotten prop.
	 */
	const presenceBeat = $derived(
		data.engine ? createPresenceBeatTransport(data.supabase, data.item.id) : null
	);
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
	ideacad={data.ideacad}
	{ideacadDoc}
	{ideacadWrites}
	{ideacadOpenRefusal}
	{htmlAnswers}
	{htmlInstructorAnswers}
	htmlAssignmentTransports={data.canManage && data.navIsAdmin === true
		? htmlAssignmentTransports
		: null}
	htmlAssignmentAdmin={data.navIsAdmin === true}
	gradeHref={data.canManage ? `/classroom/${data.section.id}/item/${data.item.id}/grade` : null}
	onchanged={() => invalidateAll()}
	ondeleted={() => goto(`/classroom/${data.section.id}`)}
/>

<!--
	IT RENDERS NOTHING, WHICH IS THE POINT RATHER THAN A CONSEQUENCE. A student is
	not the audience for their own presence and a widget saying "you are being
	timed" changes the thing it measures, so this element adds no box, no chip and
	no text to the page it sits on. That is not the same as hiding it: 0200's RLS
	policy admits the subject of the row deliberately, and whether a class is TOLD
	is Mr. Pina's decision rather than a rendering one.

	KEYED ON THE ITEM. `PresenceHeartbeat` reads its props ONCE, in `onMount`, so
	a transport swapped underneath it would never be picked up; a client-side
	navigation between two items in the same class re-runs this load without
	remounting the page, and without the key the second assignment would be beaten
	for under the first one's id. The key is what makes the remount the cost of a
	changed transport, which is what the component's own header says it expects.
-->
{#if presenceBeat}
	{#key data.item.id}
		<PresenceHeartbeat send={presenceBeat.ping} />
	{/key}
{/if}
