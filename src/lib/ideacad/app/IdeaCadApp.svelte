<script lang="ts">
	/**
	 * `/ideacad`: the command bar, the CHOOSER, and the editor behind it.
	 *
	 * THE CHOOSER IS THE FIRST SCREEN ANYBODY SEES, which is why it carries as
	 * much of this file as the editor mount does. Everything it DECIDES --
	 * ordering, narrowing, what a card says, what a refusal reads -- is in
	 * `./types.ts`, the pure layer, so it is assertable without a browser. What
	 * is here is the mount, the transports and the arrangement.
	 */
	import { onMount,onDestroy, tick, untrack } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import BladeEditor from '../BladeEditor.svelte';
	import DirectDocuments from '../solid/DirectDocuments.svelte';
	import AdvisorySettings from '../solid/AdvisorySettings.svelte';
	import {createSolidTransports,type DirectSummary} from '../solid/transport';
	import type {SolidDocument} from '../solid/types';
	import type {AdvisoryRules} from '../solid/advisory';
	import { createIdeacadStore, type IdeacadStoreState } from '../store';
	import { createIdeacadHistoryTransports, createIdeacadTransports } from '../transports';
	import { createIdeacadArchiveTransports } from '../archive-transports';
	import { ideacadEditorSeed, ideacadSaveLabel, type IdeacadEditorWrites } from '../mount';
	import {
		IDEACAD_CHOOSER_ARCHIVED_CHIP,
		IDEACAD_CHOOSER_ARCHIVED_NOTE,
		IDEACAD_CHOOSER_FILTERS,
		IDEACAD_CHOOSER_FILTER_LABELS,
		IDEACAD_CHOOSER_SORTS,
		IDEACAD_CHOOSER_SORT_LABELS,
		ideaCadChooserArchiveConfirm,
		ideaCadChooserEmptyNote,
		ideaCadChooserRestoreConfirm,
		ideaCadChooserRows,
		ideaCadEditedExact,
		ideaCadEditedLabel,
		ideaCadOpenRefusal,
		ideaCadOwnerLabel,
		ideaCadThumbnailPoints,
		type IdeaCadChooserFilter,
		type IdeaCadChooserSort,
		type IdeaCadDocumentSource,
		type IdeaCadDocumentSummary,
		type IdeaCadPaneLayout
	} from './types';

	let { supabase, userId, documents, sources, initialLayout,directDocuments=[],directError=null,debugSolid=false } = $props<{
		supabase: SupabaseClient;
		userId: string;
		documents: IdeaCadDocumentSummary[];
		sources: IdeaCadDocumentSource[];
		initialLayout: IdeaCadPaneLayout;
		directDocuments?:DirectSummary[];directError?:string|null;debugSolid?:boolean;
	}>();
	const directApi=untrack(()=>createSolidTransports(supabase));
	let Workspace=$state<typeof import('../solid/SolidWorkspace.svelte').default|null>(null);
	let solid:SolidDocument|null=$state.raw(null),directRows:DirectSummary[]=$state(untrack(()=>directDocuments)),directMessage=$state(untrack(()=>directError??'')),rules:AdvisoryRules|null=$state(null),settingsOpen=$state(false);
	async function refreshDirect(){try{directRows=await directApi.list();directMessage='';}catch(err){directMessage=err instanceof Error?err.message:String(err);}}
	async function readRules(){try{rules=await directApi.advisoryTransport.read();}catch{rules=null;}}
	async function directOpen(id?:string,source?:IdeaCadDocumentSource){if(opening)return;const linked=source?directRows.find(r=>r.isOwn&&r.itemId===source.itemId):null;id??=linked?.id;opening=id??'new';refusal=null;try{Workspace??=(await import('../solid/SolidWorkspace.svelte')).default;let opened=id?await directApi.transport.open(id):await directApi.transport.create(source?.title??'Untitled document');if(source&&!id){await directApi.link(opened.id,source.itemId);opened=await directApi.transport.open(opened.id);}solid=opened;chooserOpen=false;}catch(err){refusal={key:id??'new',subject:'IdeaCAD model',message:err instanceof Error?err.message:String(err)};await refreshDirect();}finally{opening='';}}
	onMount(()=>{void readRules();});

	const transports = untrack(() => createIdeacadTransports(supabase));
	const archiveTransports = untrack(() => createIdeacadArchiveTransports(supabase));
	const store = createIdeacadStore(transports, { history: untrack(() => createIdeacadHistoryTransports(supabase)) });
	let editorState: IdeacadStoreState = $state(store.state);
	let opening = $state('');
	/**
	 * THE REFUSAL CARRIES WHAT IT WAS ABOUT AND WHERE IT WAS PRESSED.
	 *
	 * `subject` because thirty documents on one assignment carry one title, so a
	 * sentence with no subject leaves a manager unable to tell which row refused.
	 * `key` -- the document id, or the starter's item id -- because A REFUSAL
	 * RENDERS WHERE THE PERSON WAS WORKING, and on this screen that is the card
	 * under their pointer rather than a panel at the top of a list they may have
	 * scrolled past. The top-of-chooser panel survives as the FALLBACK for the
	 * one case where the card is no longer on screen: a search or a filter typed
	 * after the press, which would otherwise take the sentence away with it.
	 */
	let refusal = $state<{ key: string; subject: string; message: string } | null>(null);
	/* This local gate, rather than store state, owns entry to the canvas. The store
	 * may eventually hydrate or restore a document, but /ideacad still cannot show
	 * it until this mount records an explicit choice from the chooser. */
	let documentChosen = $state(false);
	let chooserOpen = $state(true);
	let activeTitle = $state('');
	let activeOwner = $state<string | null>(null);
	let newDocumentSection = $state<HTMLElement>();
	let layout = $state(untrack(() => initialLayout));
	const unsubscribe = store.subscribe((next) => (editorState = next));
	onDestroy(() => { unsubscribe(); void store.destroy(); });

	/* WHEN THIS RENDER THINKS "NOW" IS, read ONCE and threaded into every label.
	   A component that reads its own clock per row silently disagrees with the
	   ordering beside it, and a label that cannot be given an instant cannot be
	   asserted at one either. It is deliberately not live: a chooser whose
	   timestamps tick is a list that redraws under somebody reading it. */
	const now = untrack(() => Date.now());

	let query = $state('');
	let filter = $state<IdeaCadChooserFilter>('all');
	let sort = $state<IdeaCadChooserSort>('recent');

	/**
	 * ROWS THIS SESSION ARCHIVED OR RESTORED, over the load's own payload.
	 *
	 * The load runs on navigation, so a document archived from this screen would
	 * otherwise keep its old chip until a reload -- a control that appears to do
	 * nothing. The overlay holds only what the DATABASE confirmed (it is written
	 * after the RPC resolves, never before), and a real reload replaces the
	 * payload underneath it, so it can never outlive the fact it records.
	 */
	let archivedOverlay = $state(new Map<string, string | null>());
	let archiveBusy = $state('');
	let armed = $state('');

	const rowsIn = $derived(
		(documents as IdeaCadDocumentSummary[]).map((row) =>
			archivedOverlay.has(row.id) ? { ...row, archivedAt: archivedOverlay.get(row.id) ?? null } : row
		)
	);
	const view = $derived(ideaCadChooserRows(rowsIn, { query, filter, sort }));
	const emptyNote = $derived(ideaCadChooserEmptyNote(view));
	/* Is the control that refused still drawn? If a narrowing took it off screen
	   the sentence has nowhere to live, and a refusal that silently disappears is
	   the one failure this whole path exists to avoid. */
	const refusalIsPlaced = $derived(
		refusal !== null &&
			(view.rows.some((row) => row.id === refusal!.key) ||
				(sources as IdeaCadDocumentSource[]).some((s) => s.itemId === refusal!.key))
	);

	const seed = $derived(ideacadEditorSeed(editorState));
	const writes = $derived<IdeacadEditorWrites | null>(editorState?.document ? {
		edit: (features) => store.edit(features),
		create: async (name, features) => { const row = await store.create(name, features); return { id: row.id, name: row.name }; },
		rename: (id, name) => store.rename(id, name),
		reposition: (id, position) => store.reposition(id, position),
		remove: async (id) => { await store.delete(id); return { activeConceptId: store.state.activeConceptId ?? id }; },
		activate: (id) => store.setActive(id),
		setPrediction: (id, rationale) => store.setPrediction(id, rationale),
		commit: (id) => store.commit(id),
		undo: editorState.historyReady ? () => store.undo() : undefined,
		redo: editorState.historyReady ? () => store.redo() : undefined
	} : null);

	async function openExisting(document: IdeaCadDocumentSummary) {
		if(opening)return;
		solid=null;
		opening = document.id; refusal = null;
		try {
			await store.openShared(document.id);
			documentChosen = true;
			chooserOpen = false;
			activeTitle = document.title;
			activeOwner = ideaCadOwnerLabel(document);
		}
		/* THE MESSAGE IS WHAT THE SERVER SAID, NEVER A SUMMARY OF IT.
		   `ideaCadOpenRefusal`'s header carries the measurement that makes this
		   a rule: a generalised sentence here cost a lane hours. */
		catch (error) { refusal = { key: document.id, subject: document.title, message: ideaCadOpenRefusal(error) }; }
		finally { opening = ''; }
	}

	async function openNew(source: IdeaCadDocumentSource) {
		await directOpen(undefined,source);
	}

	/** Archive or restore, after the two-step confirm. The overlay is written
	 *  only once `0214` has agreed; a refusal renders where the press happened. */
	async function setArchived(document: IdeaCadDocumentSummary, archived: boolean) {
		archiveBusy = document.id; refusal = null;
		try {
			await archiveTransports.setArchived(document.id, archived);
			archivedOverlay.set(document.id, archived ? new Date().toISOString() : null);
			archivedOverlay = new Map(archivedOverlay);
			armed = '';
		}
		catch (error) { refusal = { key: document.id, subject: document.title, message: ideaCadOpenRefusal(error) }; }
		finally { archiveBusy = ''; }
	}

	async function showNewDocument() {
		await directOpen();
	}

	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	function saveLayout(next: IdeaCadPaneLayout) {
		layout = next;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(async () => {
			const { data } = await supabase.from('profiles').select('preferences').eq('id', userId).single();
			const preferences = (data?.preferences && typeof data.preferences === 'object') ? data.preferences : {};
			/* A SPREAD-MERGE INSIDE `ideacad` TOO: the solid modeler keeps its own preferences at `ideacad.solid`, and writing `{ panes }` alone would erase them. */
			const ideacad = (preferences.ideacad && typeof preferences.ideacad === 'object' && !Array.isArray(preferences.ideacad)) ? preferences.ideacad : {};
			await supabase.from('profiles').update({ preferences: { ...preferences, ideacad: { ...ideacad, panes: next } } }).eq('id', userId);
		}, 250);
	}

	/* The thumbnail's box, once. The profile runs UP the part, so the card's
	   picture is portrait; `ideaCadThumbnailPoints` projects into exactly this. */
	const THUMB_W = 64;
	const THUMB_H = 84;
</script>

{#snippet refusalPanel(message: string, subject: string)}
	<!-- RENDERED VERBATIM. The sentence is whatever the database or the transport
	     said; this surface never rewrites, shortens or re-tones one. See
	     `ideaCadOpenRefusal`, whose header carries the measurement that makes
	     that a rule rather than a preference. -->
	<div class="refusal" role="alert">
		<p class="refusal-subject">{subject}</p>
		<p class="refusal-message">{message}</p>
	</div>
{/snippet}

{#snippet documentCard(document: IdeaCadDocumentSummary)}
	{@const owner = ideaCadOwnerLabel(document)}
	{@const edited = ideaCadEditedLabel(document.updatedAt, now)}
	{@const isArchived = document.archivedAt !== null}
	<article class="doc" class:archived={isArchived}>
		<button
			class="doc-open"
			onclick={() => openExisting(document)}
			disabled={opening !== ''}
			aria-busy={opening === document.id}
		>
			<span class="thumb" aria-hidden="true">
				{#if document.profile}
					<svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} width={THUMB_W} height={THUMB_H}>
						<line x1="4" y1="3" x2="4" y2={THUMB_H - 3} class="axis" />
						<polyline points={ideaCadThumbnailPoints(document.profile, THUMB_W, THUMB_H)} class="line" />
					</svg>
					{#if document.profile.bladeCount > 0}<b class="blades">{document.profile.bladeCount}×</b>{/if}
				{:else}
					<span class="thumb-none">NO<br />PROFILE</span>
				{/if}
			</span>
			<span class="doc-body">
				<span class="card-code">
					{opening === document.id ? 'OPENING' : 'DOCUMENT'}
					{#if isArchived}<b class="chip">{IDEACAD_CHOOSER_ARCHIVED_CHIP}</b>{/if}
				</span>
				<strong>{document.title}</strong>
				<!-- A null owner renders NOTHING: no placeholder and no "you". -->
				{#if owner}<span class="owner" title={document.ownerEmail}>{owner}</span>{/if}
				<span class="meta">
					{#if edited}<span title={ideaCadEditedExact(document.updatedAt)}>Edited {edited}</span>{/if}
					<span>{document.conceptCount === 1 ? '1 concept' : `${document.conceptCount} concepts`}</span>
				</span>
			</span>
		</button>
		{#if isArchived}<p class="doc-note">{IDEACAD_CHOOSER_ARCHIVED_NOTE}</p>{/if}
		{#if refusal?.key === document.id}
			<div class="doc-refusal">{@render refusalPanel(refusal.message, refusal.subject)}</div>
		{/if}
		{#if document.canArchive}
			<!-- ARCHIVE IS THE ONLY REMOVAL THERE IS. Decision 29 (2026-09-13):
			     a document is archived, never deleted. The confirm says so. -->
			<div class="doc-actions">
				{#if armed === document.id}
					<p class="confirm-note" role="status">
						{isArchived ? ideaCadChooserRestoreConfirm(document) : ideaCadChooserArchiveConfirm(document)}
					</p>
					<div class="confirm-row">
						<button
							class="danger"
							onclick={() => setArchived(document, !isArchived)}
							disabled={archiveBusy !== ''}
						>{isArchived ? 'Restore it' : 'Archive it'}</button>
						<button onclick={() => (armed = '')} disabled={archiveBusy !== ''}>Keep as is</button>
					</div>
				{:else}
					<button class="quiet" onclick={() => (armed = document.id)}>{isArchived ? 'Restore' : 'Archive'}</button>
				{/if}
			</div>
		{/if}
	</article>
{/snippet}

{#snippet starterCard(source: IdeaCadDocumentSource, primary: boolean)}
	<div class="starter-slot">
	<button
		class="doc-open starter"
		class:primary
		onclick={() => openNew(source)}
		disabled={opening !== ''}
		aria-busy={opening === source.itemId}
	>
		<span class="thumb new" aria-hidden="true">＋</span>
		<span class="doc-body">
			<span class="card-code">{opening === source.itemId ? 'CREATING' : 'NEW DOCUMENT'}</span>
			<strong>{source.title}</strong>
			<span class="meta"><span>Create and open →</span></span>
		</span>
	</button>
	{#if refusal?.key === source.itemId}
		{@render refusalPanel(refusal.message, refusal.subject)}
	{/if}
	</div>
{/snippet}

{#if solid&&!chooserOpen&&Workspace}
	<div class="direct-frame">{#key solid.id}<Workspace dev={debugSolid} document={solid} transport={directApi.transport} advisoryTransport={directApi.advisoryTransport} onback={()=>{solid=null;chooserOpen=true;void refreshDirect();}}/>{/key}</div>
{:else}
<main class="app-shell" data-testid="ideacad-app">
	<nav class="command-bar" aria-label="IdeaCAD commands">
		<a href="/" class="brand" aria-label="IDEA home">IDEA<span>CAD</span></a>
		<!-- ITEM 6: THE NAME IS A TITLE, NOT A CONTROL. It takes the editor
		     header's own eyebrow-over-heading shape and its font-hero face,
		     sits outside the bordered control group, and is never uppercase
		     mono -- which is the vocabulary of the buttons beside it. -->
		{#if documentChosen && activeTitle}
			<div class="titleblock" data-testid="ideacad-document-title">
				<span class="eyebrow">IDEACAD / DOCUMENT</span>
				<h1 title={activeTitle}>{activeTitle}</h1>
			</div>
			{#if activeOwner}<span class="title-owner" title={activeOwner}>{activeOwner}</span>{/if}
		{/if}
		<span class="spacer"></span>
		{#if rules?.canEdit}<button onclick={()=>{void readRules().then(()=>settingsOpen=true);}}>IdeaBlade limits</button>{/if}
		<button class:active={chooserOpen} onclick={() => (chooserOpen = true)} aria-expanded={chooserOpen}>Documents</button>
		<button class="new" onclick={showNewDocument} disabled={opening!==''}>+ New document</button>
		<a href="/" class="exit">Exit to IDEA</a>
	</nav>

	{#if chooserOpen || !documentChosen}
		<section class="start" aria-label="IdeaCAD documents">
			<div class="start-card">
				<header class="start-heading">
					<p class="eyebrow">IDEACAD // DOCUMENT CONTROL</p>
					<h1>{view.total+directRows.length === 0 ? 'Start your first document' : 'Your documents'}</h1>
					<p>
						Create a model, continue your work, or open a shared document.
					</p>
				</header>
				{#if directMessage}<div class="refusal" role="alert">{directMessage}</div>{/if}
				<DirectDocuments rows={directRows} api={directApi} {sources} onopen={id=>void directOpen(id)} onchange={()=>void refreshDirect()}/>

				<!-- THE FALLBACK ONLY. A refusal renders inside the card that was
				     pressed; this is where it goes when a narrowing has since taken
				     that card off screen, so the sentence can never vanish with it. -->
				{#if refusal && !refusalIsPlaced}
					{@render refusalPanel(refusal.message, refusal.subject)}
				{/if}

				{#if view.total > 0}
					<div class="section-label">
						<h2>Documents</h2>
						<span>{view.rows.length === view.total ? `${view.total} available` : `${view.rows.length} of ${view.total}`}</span>
					</div>

					{#if view.showControls}
						<!-- ITEM 3: drawn only once the list is long enough to need it.
						     Below `IDEACAD_CHOOSER_CONTROLS_AT` these cost a reader more
						     than they save. -->
						<div class="controls">
							<label class="search">
								<span class="sr-only">Search documents</span>
								<input
									type="search"
									bind:value={query}
									placeholder="Search by name or owner"
									autocomplete="off"
								/>
							</label>
							<div class="filters" role="group" aria-label="Filter documents">
								{#each IDEACAD_CHOOSER_FILTERS as key (key)}
									<button
										class:active={filter === key}
										aria-pressed={filter === key}
										onclick={() => (filter = key)}
									>{IDEACAD_CHOOSER_FILTER_LABELS[key]} <b>{view.counts[key]}</b></button>
								{/each}
							</div>
							<label class="sort">
								<span>Sort</span>
								<select bind:value={sort}>
									{#each IDEACAD_CHOOSER_SORTS as key (key)}
										<option value={key}>{IDEACAD_CHOOSER_SORT_LABELS[key]}</option>
									{/each}
								</select>
							</label>
						</div>
					{/if}

					{#if emptyNote}
						<p class="empty narrowed" role="status">{emptyNote}</p>
					{:else}
						<div class="document-grid">
							{#each view.rows as document (document.id)}
								{@render documentCard(document)}
							{/each}
						</div>
					{/if}
				{/if}

				<div class="new-document-section" bind:this={newDocumentSection} tabindex="-1">
					{#if view.total > 0}
						<div class="section-label"><h2>New document</h2><span>Choose a workspace</span></div>
					{/if}
					{#if sources.length}
						<!-- ITEM 4: with nothing started yet the starters ARE the empty
						     state's primary action, composed in place, rather than a
						     button that scrolls somewhere else. -->
						<div class="document-grid new-grid" class:lead={view.total === 0}>
							{#each sources as source, i (source.itemId)}
								{@render starterCard(source, view.total === 0 && i === 0)}
							{/each}
						</div>
					{:else}
						<button class="close" onclick={()=>void directOpen()} disabled={opening!==''}>+ Blank model</button>
					{/if}
				</div>

				{#if documentChosen}<button class="close" onclick={() => (chooserOpen = false)}>Back to graphics</button>{/if}
			</div>
		</section>
	{:else if documentChosen && seed}
		<div class="editor-frame">
			<BladeEditor standalone paneLayout={layout} onPaneLayout={saveLayout} concepts={seed.concepts as never} activeConceptId={seed.activeConceptId} config={seed.config as never} history={seed.history} prediction={seed.prediction} {writes} undoStep={writes?.undo} redoStep={writes?.redo} setPrediction={writes?.setPrediction} commitConceptCard={writes?.commit} saveLabel={ideacadSaveLabel(editorState?.phase)} />
		</div>
	{/if}
</main>
{/if}
{#if settingsOpen&&rules}<div class="rules-overlay ic-root"><AdvisorySettings {rules} transport={directApi.advisoryTransport} onchange={value=>rules=value} onclose={()=>settingsOpen=false}/></div>{/if}

<style>
	.direct-frame{position:fixed;inset:0;z-index:50}.rules-overlay{position:fixed;inset:0;z-index:70;background:#0008;display:grid;place-items:center}
	/* THE SHELL OWNS THE WINDOW BY BEING FIXED, NEVER BY LOCKING THE DOCUMENT.
	   A `:global(html), :global(body) { overflow: hidden }` here used to do it,
	   and a client-side navigation never removes a route's stylesheet, so after
	   one visit to IdeaCAD every later page in the tab could not scroll until a
	   reload (ledger 0298, R29). A fixed box covers the window with nothing to
	   leak; `tests/no-global-document-lock.test.ts` refuses the old rule. */
	.app-shell { position: fixed; inset: 0; max-width:none; margin:0; padding:0; overflow: hidden; display: grid; grid-template-rows: 52px minmax(0, 1fr); background: var(--surface-0); color: var(--text-1); font-family: Rajdhani, sans-serif; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

	/* THE COMMAND BAR SPEAKS THE EDITOR'S LANGUAGE: 12px Share Tech Mono at
	   .08em for chrome, var(--font-hero) for a heading, the same
	   --surface/--boundary register. `BladeEditor`'s own header is the model. */
	.command-bar { position: relative; display: flex; align-items: stretch; gap: 0; padding: 0 12px; border-bottom: 1px solid var(--boundary); background: var(--surface-1); box-shadow: 0 8px 24px color-mix(in srgb, var(--surface-0) 72%, transparent); }
	.command-bar::after { content: ''; position: absolute; inset: auto 0 -1px; height: 1px; background: linear-gradient(90deg, var(--cyan), transparent 35%, transparent 70%, var(--green)); opacity: .5; }
	/* THE 44px FLOOR IS A MIN-WIDTH AS WELL AS A MIN-HEIGHT, and the width is
	   the half that was failing: at 375 the mobile rule below trims the padding
	   and swaps "Exit to IDEA" for "Exit", which measured 41.8 x 51 -- tall
	   enough and too narrow, which a height-only floor cannot see. */
	.command-bar button, .command-bar a { min-height: 51px; min-width: 44px; padding: 0 16px; display: inline-flex; align-items: center; justify-content: center; color: var(--text-2); background: transparent; border: 0; border-left: 1px solid var(--boundary); text-decoration: none; font: 12px 'Share Tech Mono', monospace; letter-spacing: .08em; text-transform: uppercase; }
	.command-bar button:hover, .command-bar a:hover, .command-bar button.active { color: var(--text-1); background: var(--surface-2); }
	.command-bar button:focus-visible, .command-bar a:focus-visible { outline: 2px solid var(--cyan); outline-offset: -3px; }
	.brand { color: var(--text-1) !important; font-family: var(--font-hero) !important; font-size: 16px !important; font-weight: 800 !important; letter-spacing: .14em !important; border-left: 0 !important; padding-left: 4px !important; padding-right: 20px !important; } .brand span { color: var(--cyan); }
	.new { color: var(--green) !important; } .exit { border-right: 1px solid var(--boundary) !important; }
	.titleblock { display: flex; flex-direction: column; justify-content: center; gap: 1px; min-width: 0; padding: 0 14px; border-left: 1px solid var(--boundary); }
	.titleblock .eyebrow { margin: 0; color: var(--cyan); font: 10px 'Share Tech Mono', monospace; letter-spacing: .14em; }
	.titleblock h1 { margin: 0; max-width: 34ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-1); font-family: var(--font-hero); font-size: 17px; font-weight: 700; letter-spacing: .01em; text-transform: none; line-height: 1.1; }
	.title-owner { align-self: center; max-width: 22ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: 10px; padding: 3px 8px; color: var(--text-2); border: 1px solid var(--boundary); font: 11px 'Share Tech Mono', monospace; }
	.spacer { flex: 1; }
	.editor-frame { min-height: 0; overflow: hidden; }

	.start { min-height: 0; overflow: auto; display: grid; place-items: start center; padding: clamp(28px, 6vw, 76px) clamp(18px, 5vw, 64px); background: linear-gradient(color-mix(in srgb, var(--boundary) 28%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--boundary) 28%, transparent) 1px, transparent 1px), radial-gradient(circle at 50% -20%, color-mix(in srgb, var(--cyan) 12%, transparent), transparent 48%); background-size: 32px 32px, 32px 32px, auto; }
	.start-card { width: min(1040px, 100%); } .start-heading { max-width: 660px; margin-bottom: 34px; }
	.start-heading h1 { margin: 5px 0 10px; color: var(--text-1); font-family: var(--font-hero); font-size: clamp(30px, 5vw, 52px); line-height: .95; letter-spacing: -.035em; text-transform: uppercase; }
	.start-heading > p:last-child { color: var(--text-2); line-height: 1.65; max-width: 60ch; }
	.eyebrow { margin: 0; color: var(--cyan); letter-spacing: .16em; font: 11px 'Share Tech Mono', monospace; }
	.section-label { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--boundary); }
	.section-label h2 { margin: 0; color: var(--text-1); font: 700 13px var(--font-hero); letter-spacing: .08em; text-transform: uppercase; }
	.section-label h2::before { content: none; }
	.section-label span { color: var(--text-2); font: 10px 'Share Tech Mono', monospace; letter-spacing: .08em; text-transform: uppercase; }

	.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 14px; }
	.controls .search { flex: 1 1 220px; min-width: 0; display: flex; }
	.controls input[type='search'] { flex: 1; min-width: 0; min-height: 44px; padding: 0 12px; color: var(--text-1); background: var(--surface-1); border: 1px solid var(--boundary); font: 13px Rajdhani, sans-serif; }
	.controls input[type='search']::placeholder { color: var(--text-2); }
	.filters { display: flex; flex-wrap: wrap; gap: 6px; }
	.filters button { min-height: 44px; padding: 0 12px; color: var(--text-2); background: var(--surface-1); border: 1px solid var(--boundary); font: 11px 'Share Tech Mono', monospace; letter-spacing: .06em; text-transform: uppercase; }
	.filters button b { color: var(--text-1); font-weight: 700; }
	.filters button.active { color: var(--surface-0); background: var(--green); border-color: var(--green); }
	.filters button.active b { color: var(--surface-0); }
	.sort { display: inline-flex; align-items: center; gap: 7px; color: var(--text-2); font: 11px 'Share Tech Mono', monospace; letter-spacing: .06em; text-transform: uppercase; }
	.sort select { min-height: 44px; padding: 0 8px; color: var(--text-1); background: var(--surface-1); border: 1px solid var(--boundary); font: 12px 'Share Tech Mono', monospace; }
	.controls :is(input, button, select):focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }

	.document-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 10px; align-items: start; }
	.doc { position: relative; display: flex; flex-direction: column; border: 1px solid var(--boundary); background: color-mix(in srgb, var(--surface-1) 94%, transparent); }
	.doc::before { content: ''; position: absolute; inset: -1px auto auto -1px; width: 24px; height: 2px; background: var(--cyan); z-index: 1; }
	.doc.archived::before { background: var(--amber); }
	.doc-open { width: 100%; min-height: 108px; padding: 14px; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 14px; align-items: start; text-align: left; color: var(--text-1); background: transparent; border: 0; font-family: Rajdhani, sans-serif; }
	.doc-open:hover:not(:disabled) { background: var(--surface-2); }
	.doc:hover { border-color: var(--cyan); }
	.doc.archived:hover { border-color: var(--amber); }
	.doc-open:focus-visible { outline: 2px solid var(--cyan); outline-offset: -3px; }
	.doc-open:disabled { cursor: progress; }
	.doc-open[aria-busy='true'] { opacity: .75; }
	.thumb { position: relative; display: grid; place-items: center; width: 64px; height: 84px; background: var(--surface-0); border: 1px solid var(--hairline); }
	.thumb svg { display: block; }
	.axis { stroke: var(--boundary); stroke-width: 1; stroke-dasharray: 3 3; }
	.line { fill: none; stroke: var(--green); stroke-width: 2; stroke-linejoin: round; }
	.archived .line { stroke: var(--text-2); }
	.blades { position: absolute; right: 2px; bottom: 2px; padding: 1px 4px; color: var(--surface-0); background: var(--cyan); font: 700 10px 'Share Tech Mono', monospace; }
	.thumb-none { color: var(--text-2); text-align: center; font: 9px 'Share Tech Mono', monospace; letter-spacing: .1em; line-height: 1.4; }
	.thumb.new { color: var(--green); font: 30px var(--font-hero); border-style: dashed; border-color: var(--boundary); }
	.doc-body { display: grid; gap: 5px; min-width: 0; }
	.card-code { display: flex; align-items: center; gap: 6px; color: var(--cyan); font: 9px 'Share Tech Mono', monospace; letter-spacing: .13em; }
	.chip { padding: 1px 5px; color: var(--surface-0); background: var(--amber); font: 700 9px 'Share Tech Mono', monospace; letter-spacing: .08em; text-transform: uppercase; }
	.doc-body strong { font-family: var(--font-hero); font-size: 17px; line-height: 1.15; overflow-wrap: anywhere; }
	.owner { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 12px 'Share Tech Mono', monospace; }
	.meta { display: flex; flex-wrap: wrap; gap: 4px 10px; color: var(--text-2); font-size: 12px; }
	.doc-note { margin: 0 14px 10px; color: var(--text-2); font-size: 12px; line-height: 1.5; }
	.doc-actions { display: grid; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--hairline); }
	.doc-actions button { min-height: 44px; padding: 0 14px; color: var(--text-1); background: var(--surface-1); border: 1px solid var(--boundary); font: 11px 'Share Tech Mono', monospace; letter-spacing: .08em; text-transform: uppercase; }
	.doc-actions button:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
	.doc-actions .quiet { justify-self: start; color: var(--text-2); }
	.doc-actions .quiet:hover { color: var(--text-1); }
	.doc-actions .danger { color: var(--surface-0); background: var(--amber); border-color: var(--amber); }
	.doc-refusal { padding: 0 14px 12px; }
	.starter-slot { display: grid; gap: 8px; align-content: start; }
	.starter-slot .doc-open { width: 100%; }
	.confirm-note { margin: 0; color: var(--text-1); font-size: 13px; line-height: 1.55; }
	.confirm-row { display: flex; flex-wrap: wrap; gap: 8px; }

	.new-grid .doc-open { border: 1px solid var(--boundary); background: color-mix(in srgb, var(--surface-1) 94%, transparent); }
	.new-grid .doc-open:hover:not(:disabled) { border-color: var(--green); background: var(--surface-2); }
	.new-grid .card-code, .new-grid .meta { color: var(--green); }
	.new-grid.lead .doc-open.primary { border-color: var(--green); box-shadow: inset 3px 0 0 var(--green); }
	.new-document-section:focus { outline: none; }
	.new-document-section:focus-visible .section-label { border-bottom-color: var(--green); }

	.empty { display: grid; gap: 7px; padding: 18px; color: var(--text-2); border-left: 2px solid var(--boundary); background: var(--surface-1); font-size: 13px; line-height: 1.55; }
	.narrowed { border-left-color: var(--cyan); }
	.close { margin-top: 24px; min-height: 44px; padding: 0 16px; color: var(--text-1); background: var(--surface-2); border: 1px solid var(--boundary); font: 11px 'Share Tech Mono', monospace; letter-spacing: .08em; text-transform: uppercase; }
	.close:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
	.refusal { display: grid; gap: 4px; padding: 12px 16px; border: 1px solid var(--crimson); background: var(--surface-1); }
	.refusal-subject { margin: 0; color: var(--crimson); font: 10px 'Share Tech Mono', monospace; letter-spacing: .12em; text-transform: uppercase; }
	.refusal-message { margin: 0; color: var(--text-1); font-size: 14px; line-height: 1.55; user-select: text; }

	@media (max-width: 680px) {
		.command-bar { padding: 0 4px; }
		/* The title STAYS on a phone -- it is the one thing on this bar that says
		   where you are. The eyebrow and the owner chip are what give way. */
		.titleblock { padding: 0 8px; } .titleblock .eyebrow { display: none; } .titleblock h1 { font-size: 14px; max-width: 16ch; }
		.title-owner { display: none; }
		.command-bar button, .command-bar a { padding: 0 8px; font-size: 11px; }
		.brand { padding-right: 8px !important; font-size: 14px !important; }
		.new { font-size: 0 !important; } .new::after { content: '+ New'; font-size: 11px; }
		.exit { font-size: 0 !important; } .exit::after { content: 'Exit'; font-size: 11px; }
		.start { padding-top: 32px; } .start-heading { margin-bottom: 26px; }
	}
</style>
