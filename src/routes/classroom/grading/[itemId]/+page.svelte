<script lang="ts">
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import {
		createBulkGradingTransports,
		createTeacherEngineTransports
	} from '$lib/classroom/transports';
	import { createBulkFileSource } from '$lib/classroom/bulk-download-source';
	import { blockLabelsFromManifest, blockLabelsFromSpec } from '$lib/classroom/bulk-download';
	import { htmlAssignmentMount } from '$lib/classroom/html-assignment/mount';
	import { htmlManifestShaped } from '$lib/classroom/transports';
	import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// One stable client for the session (the item page's convention).
	// svelte-ignore state_referenced_locally
	const transports = createTeacherEngineTransports(data.supabase);
	// THE BULK CAPABILITY IS ONE PROP. Handing it in is what turns the console
	// into the cross-class, many-student surface; the per-section route hands in
	// nothing and gets the console it has always had.
	// svelte-ignore state_referenced_locally
	const bulk = createBulkGradingTransports(data.supabase);
	// "DOWNLOAD ALL FILES" (ledger 0298): a ported document names its blocks
	// from its manifest, everything else from its spec.
	const fileDownload = $derived(
		createBulkFileSource(
			data.supabase,
			data.htmlAssignment
				? blockLabelsFromManifest(data.htmlAssignment.manifest)
				: blockLabelsFromSpec(data.spec)
		)
	);

	/**
	 * WHICH ENGINE THIS ITEM IS, ASKED THE WAY THE PER-CLASS CONSOLE ASKS IT
	 * (ledger 0298, R24), so the two consoles hand the console, and therefore
	 * the graded-work export, the same one of the two: the manifest for a ported
	 * document, the spec otherwise, never both. An item carrying a leftover spec
	 * beside its document is legal and the MANIFEST decides; before this the
	 * leftover spec went in here and the export read that instead of the answers.
	 */
	const htmlMount = $derived(htmlAssignmentMount(data.item, data.htmlAssignment));
	const manifest = $derived(
		htmlMount === 'html' && htmlManifestShaped(data.htmlAssignment?.manifest)
			? (data.htmlAssignment?.manifest as HtmlAssignmentManifest)
			: null
	);
</script>

<GradingConsole
	section={data.section}
	item={data.item}
	spec={htmlMount === 'spec' ? data.spec : null}
	{manifest}
	rubric={data.rubric}
	{transports}
	{bulk}
	{fileDownload}
/>
