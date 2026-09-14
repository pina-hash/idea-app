<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import BladeEditor from '../BladeEditor.svelte';
	import { createIdeacadStore, type IdeacadStoreState } from '../store';
	import { createIdeacadHistoryTransports, createIdeacadTransports } from '../transports';
	import { ideacadEditorSeed, ideacadSaveLabel, type IdeacadEditorWrites } from '../mount';
	import type { IdeaCadDocumentSource, IdeaCadDocumentSummary, IdeaCadPaneLayout } from './types';

	let { supabase, userId, documents, sources, initialLayout } = $props<{
		supabase: SupabaseClient;
		userId: string;
		documents: IdeaCadDocumentSummary[];
		sources: IdeaCadDocumentSource[];
		initialLayout: IdeaCadPaneLayout;
	}>();

	const transports = untrack(() => createIdeacadTransports(supabase));
	const store = createIdeacadStore(transports, { history: untrack(() => createIdeacadHistoryTransports(supabase)) });
	let editorState: IdeacadStoreState = $state(store.state);
	let opening = $state(false);
	let refusal = $state('');
	/* Opening the route is a choice point, even if a future store implementation
	 * restores a document eagerly. A document only gets the canvas after the
	 * person explicitly chooses it in this session. */
	let pickerOpen = $state(true);
	let activeTitle = $state('');
	let layout = $state(untrack(() => initialLayout));
	const unsubscribe = store.subscribe((next) => (editorState = next));
	onDestroy(() => { unsubscribe(); void store.destroy(); });

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

	function refusalFrom(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}

	async function openExisting(documentId: string, title: string) {
		opening = true; refusal = ''; pickerOpen = false; activeTitle = title;
		try { await store.openShared(documentId); }
		catch (error) { refusal = refusalFrom(error); }
		finally { opening = false; }
	}

	async function openNew(itemId: string, title: string) {
		opening = true; refusal = ''; pickerOpen = false; activeTitle = title;
		try { await store.open(itemId); }
		catch (error) { refusal = refusalFrom(error); }
		finally { opening = false; }
	}

	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	function saveLayout(next: IdeaCadPaneLayout) {
		layout = next;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(async () => {
			const { data } = await supabase.from('profiles').select('preferences').eq('id', userId).single();
			const preferences = (data?.preferences && typeof data.preferences === 'object') ? data.preferences : {};
			await supabase.from('profiles').update({ preferences: { ...preferences, ideacad: { panes: next } } }).eq('id', userId);
		}, 250);
	}
</script>

<main class="app-shell" data-testid="ideacad-app">
	<nav class="command-bar" aria-label="IdeaCAD commands">
		<a href="/" class="brand" aria-label="IDEA home">IDEA<span>CAD</span></a>
		<button class:active={pickerOpen} onclick={() => (pickerOpen = !pickerOpen)} aria-expanded={pickerOpen}>Documents</button>
		<button class="new" onclick={() => (pickerOpen = true)}>+ New document</button>
		{#if activeTitle}<strong class="document-title" title={activeTitle}><span>OPEN</span>{activeTitle}</strong>{/if}
		<span class="spacer"></span>
		<a href="/" class="exit">Exit to IDEA</a>
	</nav>

	{#if pickerOpen || !editorState?.document}
		<section class="start" aria-label="IdeaCAD documents">
			<div class="start-card">
				<header class="start-heading">
					<p class="eyebrow">IDEACAD // DOCUMENT CONTROL</p>
					<h1>{editorState?.document ? 'Choose a document' : 'Your documents'}</h1>
					<p>Continue your own work or start with an available IdeaCAD assignment.</p>
				</header>
				{#if refusal}<p class="refusal" role="alert">{refusal}</p>{/if}
				{#if documents.length}
					<div class="section-label"><h2>Recent documents</h2><span>{documents.length} available</span></div>
					<div class="document-grid">
						{#each documents as document (document.id)}
							<button onclick={() => openExisting(document.id, document.title)} disabled={opening}>
								<span class="card-code">DOCUMENT</span><strong>{document.title}</strong><span>Edited {new Date(document.updatedAt).toLocaleDateString()}</span>
							</button>
						{/each}
					</div>
				{:else}
					<div class="empty-state"><span aria-hidden="true">＋</span><div><h2>No documents yet</h2><p>Your work will appear here after you create your first document.</p></div></div>
				{/if}
				<div class="section-label"><h2>Start new</h2><span>Choose a workspace</span></div>
				{#if sources.length}
					<div class="document-grid new-grid">
						{#each sources as source (source.itemId)}<button onclick={() => openNew(source.itemId, source.title)} disabled={opening}><span class="card-code">NEW DOCUMENT</span><strong>{source.title}</strong><span>Create and open →</span></button>{/each}
					</div>
				{:else}<div class="empty new-empty"><strong>No starters available</strong><span>An IdeaCAD assignment must be made available before a new document can be created.</span></div>{/if}
				{#if editorState?.document}<button class="close" onclick={() => (pickerOpen = false)}>Back to graphics</button>{/if}
			</div>
		</section>
	{:else if seed}
		<div class="editor-frame">
			<BladeEditor standalone paneLayout={layout} onPaneLayout={saveLayout} concepts={seed.concepts as never} activeConceptId={seed.activeConceptId} config={seed.config as never} history={seed.history} prediction={seed.prediction} {writes} undoStep={writes?.undo} redoStep={writes?.redo} setPrediction={writes?.setPrediction} commitConceptCard={writes?.commit} saveLabel={ideacadSaveLabel(editorState?.phase)} />
		</div>
	{/if}
</main>

<style>
	:global(html), :global(body) { width: 100%; height: 100%; overflow: hidden; }
	:global(body) { margin: 0; }
	.app-shell { width: 100vw; height: 100vh; overflow: hidden; display: grid; grid-template-rows: 52px minmax(0, 1fr); background: var(--surface-0); color: var(--text-1); font-family: 'Share Tech Mono', monospace; }
	.command-bar { position: relative; display: flex; align-items: stretch; gap: 0; padding: 0 12px; border-bottom: 1px solid var(--boundary); background: var(--surface-1); box-shadow: 0 8px 24px color-mix(in srgb, var(--surface-0) 72%, transparent); }
	.command-bar::after { content: ''; position: absolute; inset: auto 0 -1px; height: 1px; background: linear-gradient(90deg, var(--cyan), transparent 35%, transparent 70%, var(--green)); opacity: .5; }
	.command-bar button, .command-bar a { min-height: 51px; padding: 0 16px; display: inline-flex; align-items: center; color: var(--text-2); background: transparent; border: 0; border-left: 1px solid var(--boundary); text-decoration: none; font: 700 11px 'Share Tech Mono', monospace; letter-spacing: .06em; text-transform: uppercase; }
	.command-bar button:hover, .command-bar a:hover, .command-bar button.active { color: var(--text-1); background: var(--surface-2); }
	.brand { color: var(--text-1) !important; font-family: var(--font-hero) !important; font-size: 16px !important; font-weight: 800 !important; letter-spacing: .14em !important; border-left: 0 !important; padding-left: 4px !important; padding-right: 22px !important; } .brand span { color: var(--cyan); } .new { color: var(--green) !important; border-right: 1px solid var(--boundary) !important; }
	.document-title { align-self: center; min-width: 0; margin-left: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-hero); letter-spacing: .03em; } .document-title span { margin-right: 8px; color: var(--cyan); font: 9px 'Share Tech Mono', monospace; letter-spacing: .12em; } .spacer { flex: 1; }
	.exit { border-right: 1px solid var(--boundary) !important; }
	.editor-frame { min-height: 0; overflow: hidden; }
	.start { min-height: 0; overflow: auto; display: grid; place-items: start center; padding: clamp(28px, 6vw, 76px) clamp(18px, 5vw, 64px); background: linear-gradient(color-mix(in srgb, var(--boundary) 28%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--boundary) 28%, transparent) 1px, transparent 1px), radial-gradient(circle at 50% -20%, color-mix(in srgb, var(--cyan) 12%, transparent), transparent 48%); background-size: 32px 32px, 32px 32px, auto; }
	.start-card { width: min(960px, 100%); } .start-heading { max-width: 660px; margin-bottom: 42px; } h1 { margin: 5px 0 10px; color: var(--text-1); font-family: var(--font-hero); font-size: clamp(32px, 5vw, 56px); line-height: .95; letter-spacing: -.035em; text-transform: uppercase; } .start-heading > p:last-child { color: var(--text-2); line-height: 1.65; }
	.eyebrow { margin: 0; color: var(--cyan); letter-spacing: .16em; font-size: 11px; }
	.section-label { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--boundary); } .section-label h2 { margin: 0; color: var(--text-1); font: 700 13px var(--font-hero); letter-spacing: .08em; text-transform: uppercase; } .section-label span { color: var(--text-2); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
	.document-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: 10px; }
	.document-grid button { position: relative; min-height: 118px; padding: 18px; text-align: left; display: grid; align-content: space-between; gap: 8px; color: var(--text-1); background: color-mix(in srgb, var(--surface-1) 94%, transparent); border: 1px solid var(--boundary); border-radius: 0; }
	.document-grid button::before { content: ''; position: absolute; inset: -1px auto auto -1px; width: 24px; height: 2px; background: var(--cyan); } .document-grid button:hover { border-color: var(--cyan); background: var(--surface-2); transform: translateY(-1px); } .document-grid button:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
	.document-grid button > strong { font-family: var(--font-hero); font-size: 17px; } .document-grid button > span:last-child { color: var(--text-2); font-size: 11px; } .card-code { color: var(--cyan); font-size: 9px; letter-spacing: .13em; }
	.new-grid button::before { background: var(--green); } .new-grid .card-code, .new-grid button > span:last-child { color: var(--green); }
	.empty-state { min-height: 136px; display: flex; align-items: center; gap: 22px; padding: 24px; border: 1px dashed var(--boundary); background: color-mix(in srgb, var(--surface-1) 80%, transparent); } .empty-state > span { color: var(--cyan); font: 36px var(--font-hero); } .empty-state h2 { margin: 0 0 7px; font: 700 17px var(--font-hero); text-transform: uppercase; } .empty-state p { margin: 0; color: var(--text-2); line-height: 1.5; }
	.empty { display: grid; gap: 7px; padding: 18px; color: var(--text-2); border-left: 2px solid var(--boundary); background: var(--surface-1); font-size: 11px; } .empty strong { color: var(--text-1); text-transform: uppercase; letter-spacing: .08em; } .close { margin-top: 24px; min-height: 44px; color: var(--text-1); background: var(--surface-2); border: 1px solid var(--boundary); } .refusal { padding: 12px 16px; color: var(--crimson); border: 1px solid var(--crimson); background: var(--surface-1); }
	@media (max-width: 680px) { .command-bar { padding: 0 4px; } .document-title { display: none; } .command-bar button, .command-bar a { padding: 0 8px; font-size: 10px; } .brand { padding-right: 10px !important; } .new { font-size: 0 !important; } .new::after { content: 'New'; font-size: 10px; } .start { padding-top: 32px; } .start-heading { margin-bottom: 28px; } }
</style>
