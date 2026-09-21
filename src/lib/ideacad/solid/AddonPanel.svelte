<script lang="ts">
	/**
	 * ADD-ONS: which are on, what each contributes, and its advisory report.
	 *
	 * THIS COMPONENT IS THE ADD-ON SURFACE'S TO REPLACE, together with
	 * `addons/registry.ts`. The spine version keeps the 2026-09-15 behaviour:
	 * the IdeaBlade switch and its advisory panel.
	 */
	import AdvisoryPanel from './AdvisoryPanel.svelte';
	import type { AdvisoryRules } from './advisory';
	import type { WorkspaceApi } from './workspace-api';
	let { api, rules, onsettings }: { api: WorkspaceApi; rules: AdvisoryRules | null; onsettings: () => void } = $props();
</script>
<section class="addons panel" aria-label="Add-ons" data-testid="ideacad-addon-panel">
	<h2>Add-ons</h2>
	<button class:selected={api.model.addons.ideaBlade} aria-pressed={api.model.addons.ideaBlade} disabled={!api.canWrite || api.busy} onclick={() => void api.apply({ type: 'addon', enabled: !api.model.addons.ideaBlade }, 'Toggle IdeaBlade')}>IdeaBlade <span>{api.model.addons.ideaBlade ? 'On' : 'Off'}</span></button>
	{#if api.model.addons.ideaBlade}<AdvisoryPanel model={api.model} {rules} {onsettings} />{:else if rules?.canEdit}<button onclick={onsettings}>Edit advisory limits</button>{/if}
</section>
<style>
	.addons{display:grid;gap:8px}h2{margin:0;font-size:18px}button{min-height:44px;display:flex;justify-content:space-between;align-items:center;padding:0 12px;border:1px solid var(--boundary);border-radius:5px;background:transparent;color:var(--text-1);font:600 16px Rajdhani,sans-serif;cursor:pointer}button.selected{border-color:var(--green);color:var(--green)}button span{font-size:13px;color:var(--text-2)}button:disabled{opacity:.4}
</style>
