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
	let pickerOpen = $state(false);
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
	<div class="command-bar">
		<a href="/" class="brand" aria-label="IDEA home">IDEA<span>CAD</span></a>
		<button onclick={() => (pickerOpen = !pickerOpen)} aria-expanded={pickerOpen}>Documents</button>
		<button class="new" onclick={() => (pickerOpen = true)}>New document</button>
		{#if activeTitle}<strong title={activeTitle}>{activeTitle}</strong>{/if}
		<span class="spacer"></span>
		<a href="/" class="exit">Exit</a>
	</div>

	{#if pickerOpen || !editorState?.document}
		<section class="start" aria-label="IdeaCAD documents">
			<div class="start-card">
				<p class="eyebrow">IDEACAD</p><h1>{editorState?.document ? 'Open another document' : 'Your documents'}</h1>
				<p>Open an existing model or start a new one. IdeaCAD does not need a classroom page around it.</p>
				{#if refusal}<p class="refusal" role="alert">{refusal}</p>{/if}
				<div class="document-grid">
					{#each documents as document (document.id)}
						<button onclick={() => openExisting(document.id, document.title)} disabled={opening}>
							<strong>{document.title}</strong><span>Edited {new Date(document.updatedAt).toLocaleDateString()}</span>
						</button>
					{/each}
				</div>
				<h2>New document</h2>
				{#if sources.length}
					<div class="document-grid new-grid">
						{#each sources as source (source.itemId)}<button onclick={() => openNew(source.itemId, source.title)} disabled={opening}><strong>{source.title}</strong><span>Create and open</span></button>{/each}
					</div>
				{:else}<p class="empty">There are no available document starters right now.</p>{/if}
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
	.app-shell { width: 100vw; height: 100vh; overflow: hidden; display: grid; grid-template-rows: 48px minmax(0, 1fr); background: var(--surface-0); color: var(--text-1); }
	.command-bar { display: flex; align-items: center; gap: .4rem; padding: 0 .65rem; border-bottom: 1px solid var(--boundary); background: var(--surface-1); font-family: 'Share Tech Mono', monospace; }
	.command-bar button, .command-bar a { min-height: 36px; padding: 0 .7rem; display: inline-flex; align-items: center; color: var(--text-1); background: var(--surface-2); border: 1px solid var(--boundary); text-decoration: none; }
	.brand { font-weight: 800; letter-spacing: .12em; } .brand span { color: var(--cyan); } .new { border-color: var(--green) !important; }
	.command-bar strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .spacer { flex: 1; }
	.editor-frame { min-height: 0; overflow: hidden; }
	.start { min-height: 0; overflow: auto; display: grid; place-items: start center; padding: clamp(1rem, 5vw, 4rem); background: radial-gradient(circle at 50% 0, color-mix(in srgb, var(--cyan) 10%, transparent), transparent 45%); }
	.start-card { width: min(900px, 100%); } h1 { margin: .15rem 0; font-family: var(--font-hero); } h2 { margin-top: 2rem; }
	.eyebrow { color: var(--cyan); letter-spacing: .14em; font: 12px 'Share Tech Mono', monospace; }
	.document-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: .75rem; }
	.document-grid button { min-height: 88px; padding: 1rem; text-align: left; display: grid; gap: .35rem; color: var(--text-1); background: var(--surface-1); border: 1px solid var(--boundary); }
	.document-grid button:hover { border-color: var(--cyan); } .document-grid span, .empty { color: var(--text-2); font: 12px 'Share Tech Mono', monospace; }
	.new-grid button { border-color: var(--green); } .close { margin-top: 1rem; min-height: 44px; } .refusal { color: var(--crimson); }
	@media (max-width: 600px) { .command-bar { gap: .2rem; } .command-bar strong { display: none; } .command-bar button, .command-bar a { padding: 0 .45rem; } .exit { display: none !important; } }
</style>
