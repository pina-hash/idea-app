<script lang="ts">
	/**
	 * ITEM ENTRY AT THE SHELF -- spec section 7's highest-frequency action,
	 * built for the posture it is actually used in: STANDING AT A TOOLBOX,
	 * HOLDING A PHONE, WITH THE DRAWER OPEN. 375px is the primary width here,
	 * not the one checked afterwards.
	 *
	 * ONE FLOW, NOT A FORM TOUR. Cataloguing thirty things in a drawer must not
	 * mean thirty round trips through a tree, so the CONTAINER IS CONTEXT AND
	 * SURVIVES A SAVE: the card empties, the container stays, focus returns to
	 * the name, and the thing just made joins a receipt list underneath. The
	 * container is a heading with a change control, never a field to re-pick --
	 * if you got here from a compartment, that compartment is where things go.
	 *
	 * THE RECEIPT LIST IS NOT DECORATION. An acknowledgement has to survive the
	 * act it reports, and here the act CLEARS the card that would otherwise
	 * have carried it -- so "saved" belongs on the surface that is on screen
	 * afterwards, which is the list (CLAUDE.md, the delete-acknowledgement
	 * rule, in its other costume). Without it a person pressing save on a phone
	 * sees a card empty itself and has no evidence anything happened.
	 *
	 * PUBLISHING IS PUBLISHING TO THE OPEN INTERNET AND THE BUTTON SAYS SO AT
	 * THE MOMENT IT IS PRESSED. Every `maps_*_public_read` policy is `to anon`
	 * where status is published, so a published row is readable by anybody with
	 * the URL and no account at all. That fact belongs on the control, in a
	 * confirm step, not in a help page nobody on a shop floor will open. The
	 * DEFAULT is Save, which makes a DRAFT (4.3) -- one press, no confirm,
	 * because the frequent action must stay frequent and a draft is not
	 * outward-facing.
	 *
	 * NOTHING IS LOST WHEN THE SIGNAL GOES. Three separate mechanisms, because
	 * they fail differently:
	 *   - the typed card is MIRRORED into `localStorage` on a debounce
	 *     (`shelf-mirror.ts`), so a tab the OS discards while the camera app is
	 *     in front -- which dispatches nothing and so has no failed write to
	 *     report -- comes back with the words in the box;
	 *   - a FAILED SAVE keeps the card exactly as it was and says why, so the
	 *     retry is one press and nothing is retyped;
	 *   - a save whose ROW landed and whose PHOTO did not is reported as
	 *     exactly that, with the photo still staged and a Retry that uploads
	 *     only the photo -- a failed file never abandons the thing it was
	 *     attached to.
	 * The one thing the mirror cannot hold is the PHOTO: a picked or captured
	 * `File` is a handle into this tab's memory with nothing to serialise. The
	 * surface says so while the photo is staged rather than after it is gone.
	 */
	import { onMount, tick, untrack } from 'svelte';
	import {
		mapsItemLabel,
		mapsNodePath,
		type MapsEditorData,
		type MapsNode
	} from './maps';
	import {
		mapsExactTypeMatch,
		mapsShelfBlank,
		mapsShelfHasWork,
		mapsShelfPlan,
		mapsShelfProblems,
		mapsTypeSuggestions,
		type MapsShelfDraft,
		type MapsShelfReceipt
	} from './shelf';
	import {
		MAPS_MEDIA_MAX_BYTES,
		describeBytes,
		mapsImageMime,
		mapsPhotoKey,
		mapsPhotoRefusal,
		mapsPhotoUrl
	} from './media';
	import {
		SHELF_MIRROR_DEBOUNCE_MS,
		clearShelfMirror,
		readShelfMirror,
		shelfMirrorKey,
		writeShelfMirror
	} from './shelf-mirror';
	import type { MapsPhotoTransports, MapsTransports } from './transports';
	import { MAPS_ADMIN_SCOPE, mapsCaps, type MapsEditorScope } from './grants';
	import ChipListInput from './ChipListInput.svelte';
	import MapsStatusChip from './MapsStatusChip.svelte';

	let {
		data,
		transports,
		photos = null,
		initialContainerId = null,
		viewerId = null,
		supabaseUrl = '',
		onchanged = null,
		newUuid = () => crypto.randomUUID(),
		scope = MAPS_ADMIN_SCOPE
	}: {
		data: MapsEditorData;
		transports: MapsTransports;
		/** Omitted removes the camera and the picker outright -- absence is the mechanism. */
		photos?: MapsPhotoTransports | null;
		initialContainerId?: string | null;
		/** Keys the local mirror, so a shared device cannot hand over someone else's typing. */
		viewerId?: string | null;
		/** Where `maps-media` objects are served from; empty renders no thumbnail. */
		supabaseUrl?: string;
		onchanged?: (() => Promise<void>) | null;
		/** Injected so a test can name the storage key it will assert. */
		newUuid?: () => string;
		/** Who is looking (0172). Defaults to a site admin, so every existing mount is unchanged. */
		scope?: MapsEditorScope;
	} = $props();

	const caps = $derived(mapsCaps(data.nodes, scope));

	/* THE CONTAINER IS THE ONE PIECE OF STATE A SAVE MUST NOT TOUCH. It is
	   seeded once from the route (deliberate capture, so: untrack) and changed
	   only by the person, never by a save, a reload or a failure. */
	let containerId = $state<string | null>(untrack(() => initialContainerId));
	let changingContainer = $state(false);
	let containerFilter = $state('');

	let draft = $state<MapsShelfDraft>(mapsShelfBlank());
	let photoFile = $state<File | null>(null);
	let photoUrl = $state<string | null>(null);
	let photoProblem = $state<string | null>(null);
	let photoDecodeFailed = $state(false);

	let busy = $state(false);
	let saveProblem = $state<string | null>(null);
	let publishArmed = $state(false);

	/* PUBLISHING IS PRESENT ONLY WHEN THERE IS SOMETHING TO CALL. 0172 keeps
	   `maps_publish` admin-only, so a granted student's transports carry no
	   `publish` at all and the two controls below are not rendered -- absence,
	   not a disabled button that would refuse. The shelf is the surface a
	   grantee will spend the most time on, standing at a toolbox, so a
	   control here whose only outcome is a refusal is the worst place for one. */
	const canPublish = $derived(transports.publish !== undefined);
	let mirrorNotice = $state<string | null>(null);
	let restoredNotice = $state<string | null>(null);
	let receipts = $state<MapsShelfReceipt[]>([]);
	/** A row that saved without its photo: the retry uploads only the photo. */
	let orphanPhoto = $state<{ owner: 'item' | 'item_type'; ownerId: string; label: string } | null>(
		null
	);

	let nameInput = $state<HTMLInputElement | null>(null);

	const container = $derived(
		containerId === null ? null : (data.nodes.find((n) => n.id === containerId) ?? null)
	);
	const containerPath = $derived(container ? mapsNodePath(data.nodes, container.id) : '');
	const pickedType = $derived(
		draft.typeId ? (data.itemTypes.find((t) => t.id === draft.typeId) ?? null) : null
	);
	const suggestions = $derived(
		pickedType ? [] : mapsTypeSuggestions(data.itemTypes, draft.name)
	);
	const exactMatch = $derived(pickedType ? null : mapsExactTypeMatch(data.itemTypes, draft.name));
	const problems = $derived(mapsShelfProblems(draft, container, data.itemTypes));
	const plan = $derived(container ? mapsShelfPlan(draft, container, data.itemTypes) : null);
	const hasWork = $derived(mapsShelfHasWork(draft, photoFile !== null));

	/**
	 * Containers to choose between: every node the viewer may WRITE IN, nearest
	 * kinds first, filtered by name.
	 *
	 * `canEditAt` and not "every node that arrived", because a granted editor
	 * legitimately READS every PUBLISHED node (0161's public read, which has
	 * nothing to do with this tier) and offering one as a place to put an item
	 * is offering a refusal. The published-ness of the CONTAINER is not the
	 * question -- a draft item inside a published drawer is the ordinary case
	 * -- so this asks about the subtree alone.
	 */
	const containerChoices = $derived.by(() => {
		const q = containerFilter.trim().toLowerCase();
		const rank = (n: MapsNode) =>
			n.kind === 'compartment' ? 0 : n.kind === 'unit' ? 1 : n.kind === 'room' ? 2 : 3;
		return data.nodes
			.filter((n) => caps.canEditAt(n.id))
			.filter((n) => q === '' || mapsNodePath(data.nodes, n.id).toLowerCase().includes(q))
			.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
			.slice(0, 40);
	});

	/** What is already in this container, so a duplicate is visible before it is made. */
	const alreadyHere = $derived.by(() => {
		if (!container) return [] as { id: string; label: string; published: boolean }[];
		const items = data.items
			.filter((i) => i.node_id === container.id)
			.map((i) => ({
				id: i.id,
				label: mapsItemLabel(i, data.itemTypes),
				published: i.status === 'published'
			}));
		const stock = data.stock
			.filter((s) => s.node_id === container.id)
			.map((s) => ({
				id: s.id,
				label: `${data.itemTypes.find((t) => t.id === s.item_type_id)?.name ?? 'Stock'} ×${s.qty}`,
				published: s.status === 'published'
			}));
		return [...items, ...stock];
	});

	// --- The local mirror -------------------------------------------------

	const mirrorKey = $derived(shelfMirrorKey(viewerId ?? undefined, containerId));
	let mirrorTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleMirror() {
		if (mirrorTimer) clearTimeout(mirrorTimer);
		const key = mirrorKey;
		const cid = containerId;
		mirrorTimer = setTimeout(() => {
			mirrorTimer = null;
			if (cid === null) return;
			if (!mapsShelfHasWork(draft, photoFile !== null)) {
				clearShelfMirror(key);
				mirrorNotice = null;
				return;
			}
			const result = writeShelfMirror(key, {
				v: 1,
				at: Date.now(),
				containerId: cid,
				draft: $state.snapshot(draft),
				hadPhoto: photoFile !== null
			});
			// A SAFETY NET NOBODY KNOWS IS MISSING IS WORSE THAN NONE.
			mirrorNotice =
				result === 'ok'
					? null
					: result === 'blocked'
						? 'This browser is not storing a backup copy of what you type, so a lost tab would lose it. Save often.'
						: 'There was no room to keep a backup copy of this entry in the browser. Save it before you walk away.';
		}, SHELF_MIRROR_DEBOUNCE_MS);
	}

	function touch() {
		saveProblem = null;
		publishArmed = false;
		scheduleMirror();
	}

	onMount(() => {
		const found = readShelfMirror(mirrorKey, Date.now());
		if (found && found.containerId === containerId) {
			draft = found.draft;
			restoredNotice = found.hadPhoto
				? 'Put back what you had typed here. The photo could not be kept -- a picture only lives in the tab that took it, so take it again.'
				: 'Put back what you had typed here.';
		}
		return () => {
			if (mirrorTimer) clearTimeout(mirrorTimer);
		};
	});

	// --- The photo --------------------------------------------------------

	function stagePhoto(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		// Clear the input so picking the SAME file twice still fires a change.
		input.value = '';
		if (!file) return;
		photoDecodeFailed = false;
		// THE REFUSAL HAPPENS HERE, BEFORE A BYTE MOVES. On school wifi a 25 MB
		// photo refused by the bucket costs a minute of somebody's time
		// standing at a drawer; refused from `File.size` it costs nothing.
		const refusal = mapsPhotoRefusal(file);
		if (refusal) {
			photoProblem = refusal;
			clearPhoto(false);
			return;
		}
		photoProblem = null;
		if (photoUrl) URL.revokeObjectURL(photoUrl);
		photoFile = file;
		photoUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
		scheduleMirror();
	}

	function clearPhoto(mirror = true) {
		if (photoUrl) URL.revokeObjectURL(photoUrl);
		photoUrl = null;
		photoFile = null;
		photoDecodeFailed = false;
		if (mirror) scheduleMirror();
	}

	async function uploadPhotoFor(owner: 'item' | 'item_type', ownerId: string): Promise<string | null> {
		if (!photos || !photoFile) return null;
		const mime = mapsImageMime(photoFile);
		if (!mime.ok) return mime.problem;
		const result = await photos.attachPhoto({
			owner,
			ownerId,
			file: photoFile,
			storageKey: mapsPhotoKey(owner, newUuid(), mime.ext),
			mimeType: mime.mimeType
		});
		return result.ok ? null : result.message;
	}

	// --- The save ---------------------------------------------------------

	function pickType(id: string) {
		draft.typeId = id;
		draft.name = data.itemTypes.find((t) => t.id === id)?.name ?? draft.name;
		touch();
	}
	function clearType() {
		draft.typeId = null;
		touch();
	}

	async function save(wantPublish: boolean) {
		if (problems.length > 0 || !container || !plan || busy) return;
		/* Local, because a publish half that FAILS turns this false while the
		   rows stay saved -- the receipt then says draft, which is what they
		   are, rather than repeating what was asked for. */
		let published = wantPublish;
		busy = true;
		saveProblem = null;
		publishArmed = false;
		const madeIn = container.name;
		try {
			let newTypeId: string | null = null;
			let ownerId: string | null = null;
			let ownerKind: 'item' | 'item_type' = plan.photoOwner;
			for (const step of plan.steps) {
				const content = step.usesNewType
					? { ...step.content, item_type_id: newTypeId }
					: step.content;
				const created = await transports.insertRow(step.table, content);
				if (!created.ok) {
					// THE CARD IS LEFT EXACTLY AS IT WAS. A retry is one press
					// and nothing is retyped, which is the whole point of
					// refusing to clear before the write is acknowledged.
					saveProblem = `${step.label} was not saved: ${created.message}`;
					return;
				}
				if (step.table === 'maps_item_types') newTypeId = created.data.id;
				if (step.table !== 'maps_item_types') ownerId = created.data.id;
				if (published && transports.publish) {
					const promoted = await transports.publish(step.table, created.data.id);
					if (!promoted.ok) {
						saveProblem = `Saved ${step.label}, but it is not public: ${promoted.message}`;
						published = false;
					}
				}
			}
			if (plan.photoOwner === 'item_type') {
				ownerId = newTypeId ?? draft.typeId;
				ownerKind = 'item_type';
			}

			let photoState: MapsShelfReceipt['photo'] = 'none';
			let photoFailure: string | null = null;
			if (photoFile && photos && ownerId) {
				const failure = await uploadPhotoFor(ownerKind, ownerId);
				if (failure) {
					photoState = 'failed';
					photoFailure = failure;
					// The ROW landed. The photo stays staged and the retry
					// uploads only the photo -- a failed file never abandons
					// the thing it was attached to.
					orphanPhoto = { owner: ownerKind, ownerId, label: plan.summary };
				} else {
					photoState = 'attached';
				}
			}

			receipts = [
				{
					id: ownerId ?? newTypeId ?? `receipt-${receipts.length}`,
					label: plan.summary,
					containerName: madeIn,
					published,
					photo: photoState,
					problem: photoFailure
				},
				...receipts
			].slice(0, 25);

			// EMPTY THE CARD, KEEP THE CONTAINER. The next entry is already in
			// the same drawer and waiting for a name -- which is the whole
			// difference between cataloguing a drawer and thirty form tours.
			draft = mapsShelfBlank();
			if (photoState !== 'failed') clearPhoto(false);
			photoProblem = null;
			restoredNotice = null;
			clearShelfMirror(mirrorKey);
			if (onchanged) await onchanged();
			await tick();
			nameInput?.focus();
		} finally {
			busy = false;
		}
	}

	async function retryPhoto() {
		if (!orphanPhoto || !photoFile || busy) return;
		busy = true;
		try {
			const failure = await uploadPhotoFor(orphanPhoto.owner, orphanPhoto.ownerId);
			if (failure) {
				saveProblem = failure;
				return;
			}
			receipts = receipts.map((r) =>
				r.id === orphanPhoto?.ownerId ? { ...r, photo: 'attached', problem: null } : r
			);
			orphanPhoto = null;
			clearPhoto(false);
			if (onchanged) await onchanged();
		} finally {
			busy = false;
		}
	}

	function chooseContainer(id: string) {
		containerId = id;
		changingContainer = false;
		containerFilter = '';
		scheduleMirror();
	}
</script>

<div class="shelf" data-testid="maps-shelf">
	<header class="shelf-head">
		<p class="eyebrow">Shelf entry</p>
		{#if container}
			<h2 data-testid="maps-shelf-container">{container.name}</h2>
			<p class="crumb" data-testid="maps-shelf-crumb">{containerPath}</p>
		{:else}
			<h2>Choose a container</h2>
			<p class="crumb">Everything entered here goes into the container you pick.</p>
		{/if}
		<button
			type="button"
			class="btn secondary head-btn"
			aria-expanded={changingContainer}
			onclick={() => (changingContainer = !changingContainer)}
			data-testid="maps-shelf-change-container"
		>
			{container ? 'Change container' : 'Pick a container'}
		</button>
	</header>

	{#if changingContainer || !container}
		<div class="picker" data-testid="maps-shelf-picker">
			<label class="field">
				<span class="label">Find a container</span>
				<input
					type="text"
					bind:value={containerFilter}
					placeholder="drawer, chest, room&hellip;"
					autocomplete="off"
				/>
			</label>
			<ul class="picker-list">
				{#each containerChoices as node (node.id)}
					<li>
						<button
							type="button"
							class="picker-row"
							class:current={node.id === containerId}
							onclick={() => chooseContainer(node.id)}
						>
							<span class="picker-name">{node.name}</span>
							<span class="picker-path">{mapsNodePath(data.nodes, node.id)}</span>
						</button>
					</li>
				{/each}
			</ul>
			{#if containerChoices.length === 0}
				<p class="hint">Nothing matches that. Clear the box to see every container.</p>
			{/if}
		</div>
	{/if}

	{#if restoredNotice}
		<p class="notice" role="status" data-testid="maps-shelf-restored">{restoredNotice}</p>
	{/if}
	{#if mirrorNotice}
		<p class="warn" role="status" data-testid="maps-shelf-mirror-warning">{mirrorNotice}</p>
	{/if}

	{#if container}
		<section class="card" data-testid="maps-shelf-card">
			{#if photos}
				<div class="photo" data-testid="maps-shelf-photo">
					<span class="label">Photo</span>
					{#if photoUrl && !photoDecodeFailed}
						<!-- object-fit: contain, because a filename says nothing about
						     whether the thing is in frame and cropping to fill hides
						     the cut-off edge the preview exists to catch. -->
						<img
							src={photoUrl}
							alt="What the camera just took, before it is saved"
							data-testid="maps-shelf-preview"
							onerror={() => (photoDecodeFailed = true)}
						/>
					{:else if photoFile}
						<p class="hint" data-testid="maps-shelf-preview-fallback">
							{photoFile.name || 'Photo'}, {describeBytes(photoFile.size)}. This browser cannot
							show a preview of it, which does not stop it uploading.
						</p>
					{/if}
					<div class="photo-controls">
						<!-- TWO INPUTS, WHICH IS THE RULE RATHER THAN A BELT AND
						     BRACES: `capture` is a HINT the spec only says a browser
						     SHOULD honour, Android acts on the attribute's PRESENCE
						     but not its VALUE, and `capture` additionally makes an
						     input camera-ONLY there. So the camera button carries
						     `capture` and the picker beside it does not, and the lens
						     is treated as unguaranteed. `accept` sits on BOTH here,
						     unlike a classroom hand-in, because the bucket's own rule
						     is images-only (0163) -- this filters to what will be
						     accepted rather than to what somebody may hand in. -->
						<label class="btn file-btn">
							Take photo
							<input
								type="file"
								accept="image/*"
								capture="environment"
								onchange={stagePhoto}
								data-testid="maps-shelf-camera"
							/>
						</label>
						<label class="btn secondary file-btn">
							Choose photo
							<input
								type="file"
								accept="image/*"
								onchange={stagePhoto}
								data-testid="maps-shelf-picker-input"
							/>
						</label>
						{#if photoFile}
							<button type="button" class="btn secondary" onclick={() => clearPhoto()}>
								Remove photo
							</button>
						{/if}
					</div>
					{#if photoProblem}
						<p class="problems-line" role="alert" data-testid="maps-shelf-photo-problem">
							{photoProblem}
						</p>
					{/if}
					{#if photoFile}
						<p class="hint" data-testid="maps-shelf-photo-warning">
							The picture is only in this browser until you save. Up to {describeBytes(
								MAPS_MEDIA_MAX_BYTES
							)} per photo.
						</p>
					{/if}
				</div>
			{/if}

			<div class="field">
				<label class="label" for="shelf-name">What is it?</label>
				<input
					id="shelf-name"
					type="text"
					bind:this={nameInput}
					bind:value={draft.name}
					oninput={touch}
					readonly={pickedType !== null}
					autocomplete="off"
					placeholder="hex key set, digital caliper&hellip;"
					data-testid="maps-shelf-name"
				/>
			</div>

			{#if pickedType}
				<div class="type-picked" data-testid="maps-shelf-picked-type">
					<p class="hint">
						Using the existing type <strong>{pickedType.name}</strong>, so this shares its
						search words. Editing those is the item type's own page, not this one.
					</p>
					{#if pickedType.aliases.length > 0 || pickedType.tags.length > 0}
						<p class="vocab">
							{[...pickedType.aliases, ...pickedType.tags].join(' · ')}
						</p>
					{/if}
					<button type="button" class="btn secondary" onclick={clearType}>
						Use a different name
					</button>
				</div>
			{:else}
				{#if suggestions.length > 0}
					<div class="suggests" data-testid="maps-shelf-suggestions">
						<p class="hint">Already on the map. Picking one keeps the search words together:</p>
						<div class="suggest-row">
							{#each suggestions as t (t.id)}
								<button type="button" class="btn secondary suggest" onclick={() => pickType(t.id)}>
									{t.name}
								</button>
							{/each}
						</div>
					</div>
				{/if}
				{#if exactMatch}
					<p class="warn" data-testid="maps-shelf-duplicate-warning">
						There is already an item type called "{exactMatch.name}". Pick it above to reuse its
						search words instead of making a second one.
					</p>
				{/if}

				<ChipListInput
					id="shelf-aliases"
					label="Other names for it"
					values={draft.aliases}
					placeholder="allen keys, hex wrenches"
					hint="What someone might call it when they cannot remember the real name."
					onchange={(next) => {
						draft.aliases = next;
						touch();
					}}
				/>
				<ChipListInput
					id="shelf-tags"
					label="Tags"
					values={draft.tags}
					placeholder="fastening, metric"
					hint="What it is for. This is how someone finds it without knowing its name."
					onchange={(next) => {
						draft.tags = next;
						touch();
					}}
				/>
			{/if}

			<fieldset class="how-many" data-testid="maps-shelf-how-many">
				<legend class="label">How many are here?</legend>
				<label class="choice">
					<input
						type="radio"
						name="shelf-kind"
						value="one"
						checked={draft.kind === 'one'}
						onchange={() => {
							draft.kind = 'one';
							touch();
						}}
					/>
					<span>Just this one</span>
				</label>
				<label class="choice">
					<input
						type="radio"
						name="shelf-kind"
						value="several"
						checked={draft.kind === 'several'}
						onchange={() => {
							draft.kind = 'several';
							touch();
						}}
					/>
					<span>Several of them</span>
				</label>
			</fieldset>

			{#if draft.kind === 'several'}
				<div class="qty" data-testid="maps-shelf-qty">
					<button
						type="button"
						class="btn secondary qty-btn"
						aria-label="One fewer"
						onclick={() => {
							draft.qty = Math.max(1, draft.qty - 1);
							touch();
						}}
					>
						&minus;
					</button>
					<span class="qty-value" aria-live="polite">{draft.qty}</span>
					<button
						type="button"
						class="btn secondary qty-btn"
						aria-label="One more"
						onclick={() => {
							draft.qty = draft.qty + 1;
							touch();
						}}
					>
						+
					</button>
				</div>
			{:else}
				<div class="field">
					<label class="label" for="shelf-serial">Serial (optional)</label>
					<input
						id="shelf-serial"
						type="text"
						bind:value={draft.serial}
						oninput={touch}
						autocomplete="off"
					/>
				</div>
			{/if}

			<div class="field">
				<label class="label" for="shelf-notes">Notes (optional)</label>
				<textarea id="shelf-notes" rows="2" bind:value={draft.notes} oninput={touch}></textarea>
			</div>

			{#if problems.length > 0 && hasWork}
				<ul class="problems" role="alert" data-testid="maps-shelf-problems">
					{#each problems as problem (problem)}<li>{problem}</li>{/each}
				</ul>
			{/if}
			{#if saveProblem}
				<p class="problems-line" role="alert" data-testid="maps-shelf-save-problem">{saveProblem}</p>
			{/if}

			{#if plan && hasWork && problems.length === 0}
				<p class="plan-line" data-testid="maps-shelf-plan">Saving makes {plan.summary}</p>
			{/if}

			<div class="actions">
				<button
					type="button"
					class="btn primary-btn"
					aria-disabled={problems.length > 0 || busy}
					onclick={() => save(false)}
					data-testid="maps-shelf-save"
				>
					{busy ? 'Saving…' : 'Save (draft)'}
				</button>
				{#if canPublish && !publishArmed}
					<button
						type="button"
						class="btn secondary"
						aria-disabled={problems.length > 0 || busy}
						onclick={() => (publishArmed = true)}
						data-testid="maps-shelf-publish-arm"
					>
						Save &amp; publish&hellip;
					</button>
				{/if}
			</div>

			{#if !canPublish}
				<p class="grant-note" data-testid="maps-shelf-grant-note">
					What you save here is a <strong>draft</strong>: editors can see it, the public map
					cannot. A site admin publishes it.
				</p>
			{/if}

			{#if canPublish && publishArmed}
				<div class="publish-confirm" data-testid="maps-shelf-publish-confirm">
					<p>
						Publishing puts this on the <strong>public map</strong>. Anyone can read it without
						signing in, and the photo is already fetchable by anyone with its address. A draft is
						visible to editors only.
					</p>
					<div class="confirm-row">
						<button
							type="button"
							class="btn primary-btn"
							onclick={() => save(true)}
							disabled={busy}
							data-testid="maps-shelf-publish-go"
						>
							Publish it
						</button>
						<button
							type="button"
							class="btn secondary"
							onclick={() => (publishArmed = false)}
							disabled={busy}
						>
							Keep it a draft
						</button>
					</div>
				</div>
			{/if}

			{#if orphanPhoto}
				<div class="retry" data-testid="maps-shelf-photo-retry">
					<p>
						{orphanPhoto.label} saved, but its photo did not upload. The photo is still here.
					</p>
					<button type="button" class="btn" onclick={retryPhoto} disabled={busy}>
						Upload the photo again
					</button>
				</div>
			{/if}
		</section>

		{#if receipts.length > 0}
			<section class="receipts" data-testid="maps-shelf-receipts">
				<h3>Added here</h3>
				<ul>
					{#each receipts as r (r.id)}
						<li>
							<span class="receipt-label">{r.label}</span>
							<MapsStatusChip state={r.published ? 'published' : 'draft'} />
							{#if r.photo === 'attached'}<span class="receipt-photo">photo</span>{/if}
							{#if r.photo === 'failed'}<span class="receipt-warn">photo not uploaded</span>{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="already" data-testid="maps-shelf-already">
			<h3>Already in {container.name}</h3>
			{#if alreadyHere.length === 0}
				<p class="hint">Nothing yet. This is the first thing recorded here.</p>
			{:else}
				<ul>
					{#each alreadyHere as row (row.id)}
						<li>
							<span class="receipt-label">{row.label}</span>
							<MapsStatusChip state={row.published ? 'published' : 'draft'} />
							{#if data.photos.some((p) => p.item_id === row.id || p.item_type_id === row.id)}
								{#if supabaseUrl}
									{@const key = data.photos.find(
										(p) => p.item_id === row.id || p.item_type_id === row.id
									)?.storage_key}
									{#if key}
										<img class="thumb" src={mapsPhotoUrl(supabaseUrl, key)} alt="" />
									{/if}
								{/if}
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

<style>
	.shelf {
		/* THE MAPS ACCENT SLOT. Spec section 10 leaves the identity to a Claude
		   Design pass; until it lands this resolves to a design-system neutral
		   and nothing here invents a colour. */
		--maps-accent: var(--gear);
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		min-width: 0;
		color: var(--white);
	}
	.shelf-head {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}
	.eyebrow {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	h2 {
		margin: 0;
		font-size: 1.35rem;
	}
	h3 {
		margin: 0 0 0.4rem;
		font-size: 0.95rem;
	}
	.crumb {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2, var(--dim));
		overflow-wrap: anywhere;
	}
	.head-btn {
		align-self: flex-start;
		margin-top: 0.3rem;
	}
	.picker {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		padding: 0.7rem;
		background: var(--bg1);
	}
	.picker-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 16rem;
		overflow-y: auto;
	}
	.picker-row {
		width: 100%;
		min-height: 44px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		padding: 0.4rem 0.6rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-control, 6px);
		color: var(--white);
		font-family: var(--font-display);
		text-align: left;
		cursor: pointer;
	}
	.picker-row:hover {
		background: var(--bg2);
	}
	.picker-row:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}
	.picker-row.current {
		background: var(--bg2);
		border-color: var(--maps-accent, var(--boundary));
	}
	.picker-name {
		font-size: 0.95rem;
	}
	.picker-path {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2, var(--dim));
		overflow-wrap: anywhere;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		padding: 0.8rem;
		background: var(--bg1);
		min-width: 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}
	.label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}
	input[type='text'],
	textarea {
		/* width + min-width beat the input's intrinsic size: without them a
		   text input's ~20-char default width overflows a 375px viewport by
		   14px, measured on this very surface's sibling. */
		width: 100%;
		min-width: 0;
		min-height: 44px;
		background: var(--bg2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		color: var(--white);
		font-family: var(--font-display);
		font-size: 1rem;
		padding: 0.5rem 0.6rem;
	}
	textarea {
		resize: vertical;
		min-height: 3.4rem;
	}
	input[readonly] {
		color: var(--text-2, var(--dim));
	}
	.photo {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.photo img {
		width: 100%;
		max-height: 14rem;
		object-fit: contain;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: var(--radius-control, 6px);
	}
	.photo-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.file-btn {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 0.55rem 0.9rem;
		cursor: pointer;
	}
	.file-btn input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}
	.suggests,
	.type-picked {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.suggest-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.suggest {
		min-height: 44px;
		padding: 0.5rem 0.9rem;
	}
	.vocab {
		margin: 0;
		font-size: 0.82rem;
		color: var(--text-2, var(--dim));
	}
	.how-many {
		border: 1px solid var(--line);
		border-radius: var(--radius-control, 6px);
		margin: 0;
		padding: 0.3rem 0.7rem 0.5rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 1rem;
	}
	legend {
		padding: 0 0.2rem;
	}
	.choice {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		min-height: 44px;
		font-size: 1rem;
		cursor: pointer;
	}
	.choice input {
		width: 20px;
		height: 20px;
		accent-color: var(--maps-accent, var(--green));
	}
	.qty {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.qty-btn {
		min-width: 56px;
		min-height: 44px;
		font-size: 1.2rem;
	}
	.qty-value {
		font-family: var(--font-mono);
		font-size: 1.2rem;
		min-width: 2.5rem;
		text-align: center;
	}
	.actions,
	.confirm-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.primary-btn {
		min-height: 48px;
		flex: 1 1 10rem;
	}
	.actions .btn.secondary {
		min-height: 48px;
		flex: 1 1 10rem;
	}
	.hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
	}
	.plan-line {
		margin: 0;
		font-size: 0.85rem;
		color: var(--white);
	}
	.notice,
	.warn,
	.grant-note,
	.publish-confirm,
	.retry {
		margin: 0;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		background: var(--bg2);
		font-size: 0.88rem;
		color: var(--white);
	}
	.warn,
	.publish-confirm {
		border-color: var(--amber);
	}
	.publish-confirm p,
	.retry p {
		margin: 0 0 0.6rem;
	}
	.problems {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--crimson);
		font-size: 0.85rem;
	}
	.problems-line {
		margin: 0;
		color: var(--crimson);
		font-size: 0.85rem;
	}
	.receipts ul,
	.already ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.receipts li,
	.already li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		border: 1px solid var(--line);
		border-radius: var(--radius-control, 6px);
		padding: 0.45rem 0.6rem;
		background: var(--bg1);
	}
	.receipt-label {
		flex: 1 1 auto;
		min-width: 0;
		font-size: 0.9rem;
		overflow-wrap: anywhere;
	}
	.receipt-photo,
	.receipt-warn {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.receipt-photo {
		color: var(--cyan);
	}
	.receipt-warn {
		color: var(--amber);
	}
	.thumb {
		width: 34px;
		height: 34px;
		object-fit: cover;
		border-radius: 3px;
		border: 1px solid var(--line);
	}
</style>
