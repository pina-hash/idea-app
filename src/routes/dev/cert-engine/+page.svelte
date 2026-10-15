<script lang="ts">
	/** /dev/cert-engine: the real engine components over fixtures, saving in memory. */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import EngineEditor from '$lib/certifications/desk/EngineEditor.svelte';
	import EngineList from '$lib/certifications/desk/EngineList.svelte';
	import ImportPanel from '$lib/certifications/desk/ImportPanel.svelte';
	import type { EngineSaveAnswer, ImportAnswer } from '$lib/certifications/desk/desk';
	import type { CertPackage } from '$lib/certifications/types';
	import '$lib/certifications/cert.css';
	import '$lib/certifications/desk/desk.css';
	import { ADMIN_GET_DRAFT, ADMIN_ROWS, IMPORT_DIFF, IMPORT_PROBLEMS, MILL, POOL, SAFE, SETTINGS } from '../cert-desk/fixtures';

	type State = 'list' | 'editor' | 'import-diff';
	let { data }: { data: { state: State } } = $props();

	let saved = $state<{ pkg: CertPackage; note: string }[]>([]);
	async function save(pkg: CertPackage, note: string): Promise<EngineSaveAnswer> {
		saved = [...saved, { pkg, note }];
		const problems = [...ADMIN_GET_DRAFT.publish_problems];
		if (pkg.study_guide.trim()) problems.shift();
		return { ok: true, revision: saved.length + 1, publish_problems: problems };
	}
	async function sendImport(form: FormData): Promise<ImportAnswer> {
		const file = form.get('file');
		const name = file instanceof File ? file.name : '';
		if (name.includes('bad')) return IMPORT_PROBLEMS;
		if (form.get('confirm') === '1') return { ...IMPORT_DIFF, id: MILL.id, revision: 4 };
		return IMPORT_DIFF;
	}

	let hydrated = $state(false);
	onMount(() => (hydrated = true));

	const themeParam = page.url.searchParams.get('theme');
	$effect(() => {
		if (themeParam !== 'space-white' && themeParam !== 'matrix') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', themeParam);
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});
</script>

<main class="cert-root harness" data-testid="cert-engine-harness" data-state={data.state} data-saves={saved.length} data-cert-engine-hydrated={hydrated ? 'yes' : 'no'}>
	{#if data.state === 'list'}
		<header class="cert-titlebar"><div><p class="eyebrow cert-eyebrow">IDEA // Certifications</p><h1 class="cert-title plate-title">Engine</h1></div></header>
		<EngineList rows={ADMIN_ROWS} isAdmin={true} settings={SETTINGS} />
	{:else if data.state === 'editor'}
		<EngineEditor cert={ADMIN_GET_DRAFT} pool={POOL} others={[MILL, SAFE].map((c) => ({ code: c.code, name: c.name }))} {save} />
	{:else}
		<header class="cert-titlebar"><div><p class="eyebrow cert-eyebrow">IDEA // Certifications</p><h1 class="cert-title plate-title">Import a package</h1></div></header>
		<ImportPanel send={sendImport} initial={IMPORT_DIFF} />
	{/if}
</main>
