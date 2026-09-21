<!--
  THE LEGACY CHOOSER'S MOUNT OF THE LAUNCH PAGE. `IdeaCadApp.svelte` still
  mounts this with the props it always had (rows, api, sources, onopen,
  onchange); everything it renders is `launch/LaunchPage.svelte`, embedded, so
  the legacy chooser at `/ideacad?legacy=1` and the front door at `/ideacad`
  are ONE surface with two frames rather than two lists that drift.
-->
<script lang="ts">
	import type { DirectSummary, createSolidTransports } from './transport';
	import type { IdeaCadDocumentSource } from '../app/types';
	import type { LaunchApi } from './launch/api';
	import LaunchPage from './launch/LaunchPage.svelte';
	let { rows, api, sources, onopen, onchange }: { rows: DirectSummary[]; api: ReturnType<typeof createSolidTransports>; sources: IdeaCadDocumentSource[]; onopen: (id: string) => void; onchange: () => void } = $props();
	const launch = $derived<LaunchApi>({ ...api, create: (title) => api.transport.create(title) });
</script>

<LaunchPage api={launch} {rows} {sources} {onopen} {onchange} embedded />
