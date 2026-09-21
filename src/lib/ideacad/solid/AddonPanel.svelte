<script lang="ts">
	/**
	 * ADD-ONS: which are installed, which are on, and for each one that is on
	 * what it contributes -- its tools (each a word, a short form and a Run
	 * control), its starters, its reference geometry and its advisory report.
	 *
	 * THE PANEL KNOWS NO ADD-ON BY NAME. It lists `installedAddons()` from
	 * `addons/registry.ts` and renders each one's declared inputs; the
	 * IdeaBlade switch is the same On/Off control every add-on gets, writing
	 * the same `{type:'addon'}` command the 2026-09-15 switch wrote, so
	 * `api.model.addons.ideaBlade` still drives it.
	 *
	 * NOTHING IS CLAMPED AND NO INPUT CARRIES A BOUND. A field is text with a
	 * decimal keyboard, never `type="number"` (whose binding coerces) and never
	 * a `min` or `max`; what is typed goes to the tool as typed, and what the
	 * kernel will not build is the feature row's own sentence. The one thing
	 * judged here is that a number IS one, in the executor's own words, so a
	 * tool never receives NaN and a student reads "Enter a finite height."
	 * where every other refusal shows.
	 */
	import AdvisoryPanel from './AdvisoryPanel.svelte';
	import type { AdvisoryRules } from './advisory';
	import type { WorkspaceApi } from './workspace-api';
	import { addonEnabled, installedAddons, runSteps, type Addon, type AddonInput, type AddonInputValues, type AddonStep, type AddonTool } from './addons/registry';
	let { api, rules, onsettings }: { api: WorkspaceApi; rules: AdvisoryRules | null; onsettings: () => void } = $props();
	const addons = installedAddons();
	let open = $state<string | null>(null);
	let values = $state<Record<string, string>>({});
	const locked = $derived(!api.canWrite || api.busy);
	const key = (addon: Addon, tool: AddonTool, input?: AddonInput) => `${addon.id}/${tool.id}${input ? `/${input.key}` : ''}`;
	const valueOf = (k: string, input: AddonInput) => values[k] ?? String(input.default);
	/** `Number('')` is 0, which is a number nobody typed; an empty field is not a number. */
	const number = (v: string) => (v.trim() === '' ? NaN : Number(v.trim()));
	const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
	async function toggle(addon: Addon) {
		try { await api.apply({ type: 'addon', addon: addon.id, enabled: !addonEnabled(api.model.addons, addon.id) }, `Toggle ${addon.name}`); }
		catch (e) { api.error(message(e)); }
	}
	async function run(addon: Addon, tool: AddonTool) {
		const inputs: AddonInputValues = {};
		for (const input of tool.inputs) {
			const raw = valueOf(key(addon, tool, input), input);
			if (input.kind === 'number') { const n = number(raw); if (!Number.isFinite(n)) { api.error(`Enter a finite ${input.label.toLowerCase()}.`); return; } inputs[input.key] = n; }
			else inputs[input.key] = raw;
		}
		try { await tool.run(api, inputs); } catch (e) { api.error(message(e)); }
	}
	async function plan(steps: AddonStep[]) {
		try { await runSteps(api, steps); } catch (e) { api.error(message(e)); }
	}
</script>
<section class="addons panel" aria-label="Add-ons" data-testid="ideacad-addon-panel">
	<h2>Add-ons</h2>
	<p class="lede">An add-on adds tools, a starter and reference geometry, and may advise. It never changes what the base tools do.</p>
	{#each addons as addon (addon.id)}
		{@const on = addonEnabled(api.model.addons, addon.id)}
		<article class="addon" data-addon={addon.id} data-enabled={on}>
			<button type="button" class="switch" class:selected={on} aria-pressed={on} disabled={locked} data-testid="ideacad-addon-switch" onclick={() => void toggle(addon)}>{addon.name} <span class="state">{on ? 'On' : 'Off'}</span></button>
			<p class="description">{addon.description}</p>
			{#if on}
				<h3>Tools <span class="count">{addon.tools.length}</span></h3>
				<ul class="tools">
					{#each addon.tools as tool (tool.id)}
						{@const k = key(addon, tool)}
						<li data-tool={tool.id}>
							<button type="button" class="tool" aria-expanded={open === k} aria-controls={`addon-form-${addon.id}-${tool.id}`} onclick={() => (open = open === k ? null : k)}>
								<span class="title">{#if tool.icon}<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={tool.icon} /></svg>{/if}{tool.name}<span class="caret" aria-hidden="true">{open === k ? '▾' : '▸'}</span></span>
								<span class="sentence">{tool.description}</span>
							</button>
							{#if open === k}
								<form id={`addon-form-${addon.id}-${tool.id}`} class="tool-form" onsubmit={(e) => { e.preventDefault(); void run(addon, tool); }}>
									<p class="needs">{tool.selection}</p>
									{#each tool.inputs as input (input.key)}
										{@const ik = key(addon, tool, input)}
										<label class="field">
											<span class="label">{input.label}{#if input.kind === 'number' && input.unit} <small>{input.unit}</small>{/if}</span>
											{#if input.kind === 'text'}
												<textarea rows={input.rows ?? 3} value={valueOf(ik, input)} data-input={input.key} oninput={(e) => (values[ik] = e.currentTarget.value)}></textarea>
											{:else}
												<input type="text" inputmode="decimal" value={valueOf(ik, input)} data-input={input.key} oninput={(e) => (values[ik] = e.currentTarget.value)} />
											{/if}
											{#if input.hint}<small class="hint">{input.hint}</small>{/if}
										</label>
									{/each}
									<button type="submit" class="run" disabled={locked}>Run {tool.name}</button>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
				{#if addon.starters.length}
					<h3>Starters</h3>
					<ul class="plans">{#each addon.starters as starter (starter.id)}<li><button type="button" class="plan" data-starter={starter.id} disabled={locked} onclick={() => void plan(starter.steps())}><span class="title">Start: {starter.name}</span><span class="sentence">{starter.description}</span></button></li>{/each}</ul>
				{/if}
				{#if addon.references.length}
					<h3>Reference geometry</h3>
					<ul class="plans">{#each addon.references as reference (reference.id)}<li><button type="button" class="plan" data-reference={reference.id} disabled={locked} onclick={() => void plan([reference.step()])}><span class="title">Add {reference.name}</span><span class="sentence">{reference.description}</span></button></li>{/each}</ul>
				{/if}
				{#if addon.advise}
					<h3>Advisory</h3>
					<div class="advisory"><AdvisoryPanel model={api.model} {rules} {onsettings} /></div>
				{/if}
			{:else if addon.advise && rules?.canEdit}
				<button type="button" class="settings" onclick={onsettings}>Edit advisory limits</button>
			{/if}
		</article>
	{/each}
</section>
<style>
	.addons{display:grid;gap:8px}h2{margin:0;font-size:18px}.lede,.description{margin:0;font-size:14px;color:var(--text-2)}
	h3{margin:6px 0 0;display:flex;justify-content:space-between;align-items:baseline;font:600 15px Rajdhani,sans-serif;color:var(--text-1);border-bottom:1px solid var(--boundary);padding-bottom:4px}.count{font:12px 'Share Tech Mono',monospace;color:var(--text-2)}
	.addon{display:grid;gap:8px}
	button{min-height:44px;border:1px solid var(--boundary);border-radius:5px;background:transparent;color:var(--text-1);font:600 16px Rajdhani,sans-serif;cursor:pointer;text-align:left}button:disabled{opacity:.4;cursor:default}button:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
	.switch{display:flex;justify-content:space-between;align-items:center;padding:0 12px}.switch.selected{border-color:var(--green);color:var(--green)}.state{font-size:13px;color:var(--text-2)}
	ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
	.tool,.plan{width:100%;display:grid;gap:2px;padding:8px 12px}.tool[aria-expanded="true"]{border-color:var(--green)}
	.title{display:flex;align-items:center;gap:8px;font-size:16px}.title svg{flex-shrink:0;color:var(--text-2)}.caret{margin-left:auto;color:var(--text-2)}.sentence{font-weight:400;font-size:14px;color:var(--text-2)}
	.tool-form{display:grid;gap:8px;padding:8px 0 4px;border-bottom:1px solid var(--boundary)}.needs{margin:0;font-size:13px;color:var(--text-2)}
	.field{display:grid;gap:4px;font-size:14px}.label{color:var(--text-1)}.label small{font:12px 'Share Tech Mono',monospace;color:var(--text-2)}.hint{color:var(--text-2);font-size:12px}
	input,textarea{min-height:44px;width:100%;box-sizing:border-box;padding:0 8px;border:1px solid var(--boundary);border-radius:5px;background:var(--surface-0);color:var(--text-1);font:16px Rajdhani,sans-serif}textarea{padding:8px;font:15px 'Share Tech Mono',monospace;resize:vertical}
	.run{background:var(--green);color:#15191d;border-color:var(--green);padding:0 16px}
	.settings{width:100%;border-color:var(--green);color:var(--green)}
	.advisory{display:grid}
</style>
