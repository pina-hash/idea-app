<script lang="ts">
	/**
	 * THE PARAMETER FORM for the feature the design tree has selected. It reads
	 * the FULL feature off `api.manifest` (the projection row carries only a
	 * summary) and writes every edit as one `set-feature` patch labelled
	 * "Edit <feature name>", which the engine replays from that feature down.
	 *
	 * NOTHING IS CLAMPED. A number box is a text field with a decimal keyboard
	 * and no min or max: any finite value a student types is sent exactly as
	 * typed, and a value the kernel refuses comes back as the feature's own
	 * error on its row. The one refusal this form makes itself is a value that
	 * is not a number at all, said where every other refusal shows.
	 *
	 * REFERENCES ARE WORDS, READ-ONLY, WITH THEIR CURRENT STANDING: found on
	 * the model, not on the model, or reattached by shape. Re-picking a face is
	 * a viewport gesture and belongs to the surface that owns the viewport.
	 */
	import type { WorkspaceApi } from './workspace-api';
	import { fieldsFor, patchFor, REF_STATUS_WORDS, typeLabel, type Field } from './tree/params';
	import { STATUS_WORDS } from './tree/rows';
	let { api, featureId }: { api: WorkspaceApi; featureId: string } = $props();
	const feature = $derived(api.manifest.features.find((f) => f.id === featureId));
	const row = $derived(api.model.features.find((r) => r.id === featureId));
	const fields = $derived(feature ? fieldsFor(feature, { manifest: api.manifest, model: api.model, row }) : []);
	const editable = $derived(api.canWrite && !api.busy);
	const show = (n: number | undefined) => (n === undefined ? '' : String(n));
	async function commit(field: Field, value: unknown) {
		if (!feature) return;
		try { await api.apply({ type: 'set-feature', id: feature.id, patch: patchFor(feature, field.id, value) }, `Edit ${feature.name}`); }
		catch (error) { api.error(error instanceof Error ? error.message : String(error)); }
	}
	/** Any finite number, as typed: no rounding, no clamp, no sign rule. Null (and a sentence) for anything else. */
	function parse(raw: string, label: string): number | null {
		const n = Number(raw.trim());
		if (raw.trim() === '' || !Number.isFinite(n)) { api.error(`Enter a finite number for ${label.toLowerCase()}.`); return null; }
		return n;
	}
	/** What the manifest holds for a field NOW, after a commit: the workspace answers a refused apply by showing the sentence and keeping the manifest, so the box is put back to what the model actually has rather than left reading a value the kernel refused. */
	function stored(id: string, i?: number): number | undefined {
		const fresh = fields.find((f) => f.id === id);
		return fresh?.kind === 'number' ? fresh.value : fresh?.kind === 'vector' && i !== undefined ? fresh.value[i] : undefined;
	}
	async function onNumber(field: Extract<Field, { kind: 'number' }>, e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		if (input.value.trim() === '' && field.optional) { if (field.value !== undefined) await commit(field, undefined); input.value = show(stored(field.id)); return; }
		const n = parse(input.value, field.label);
		if (n !== null && n !== field.value) await commit(field, n);
		input.value = show(stored(field.id));
	}
	async function onVector(field: Extract<Field, { kind: 'vector' }>, i: number, e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const n = parse(input.value, `${field.label} ${field.names?.[i] ?? i + 1}`);
		if (n !== null && n !== field.value[i]) { const next = [...field.value]; next[i] = n; await commit(field, next); }
		input.value = show(stored(field.id, i));
	}
</script>
{#if feature && row}
	<section class="params" aria-label={`${feature.name} parameters`} data-testid="ideacad-feature-params">
		<h3><span class="type">{typeLabel(feature.type)}</span>{feature.name}</h3>
		{#if row.message}<p class="message {row.status}" role={row.status === 'error' ? 'alert' : 'status'}><span class="glyph" aria-hidden="true">{STATUS_WORDS[row.status].glyph}</span> {STATUS_WORDS[row.status].word}: {row.message}</p>{/if}
		<div class="fields">
			{#each fields as field (field.id)}
				{#if field.kind === 'number'}
					<label class="field"><span class="label">{field.label}{#if field.unit}<span class="unit">{field.unit}</span>{/if}</span><input type="text" inputmode="decimal" autocomplete="off" value={show(field.value)} placeholder={field.optional ? 'none' : ''} disabled={!editable} data-testid={`ideacad-param-${field.id}`} onchange={(e) => void onNumber(field, e)} /></label>
				{:else if field.kind === 'enum'}
					<label class="field"><span class="label">{field.label}</span><select value={field.value} disabled={!editable} data-testid={`ideacad-param-${field.id}`} onchange={(e) => void commit(field, e.currentTarget.value)}>{#each field.options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}</select></label>
				{:else if field.kind === 'boolean'}
					<label class="field check"><input type="checkbox" checked={field.value} disabled={!editable} data-testid={`ideacad-param-${field.id}`} onchange={(e) => void commit(field, e.currentTarget.checked)} /><span class="label">{field.label}</span></label>
				{:else if field.kind === 'text'}
					<div class="field"><span class="label">{field.label}</span><span class="text">{field.value}</span></div>
				{:else if field.kind === 'vector'}
					<fieldset class="field vector" style:--cols={field.columns}><legend class="label">{field.label}{#if field.unit}<span class="unit">{field.unit}</span>{/if}</legend>{#each field.value as component, i (i)}<input type="text" inputmode="decimal" autocomplete="off" aria-label={`${field.label} ${field.names?.[i] ?? i + 1}`} value={show(component)} disabled={!editable} data-testid={`ideacad-param-${field.id}-${i}`} onchange={(e) => void onVector(field, i, e)} />{/each}</fieldset>
				{:else if field.kind === 'ref'}
					<div class="field ref"><span class="label">{field.label}</span><span class="words">{field.ref.words} <span class="ref-status {field.ref.status}">{REF_STATUS_WORDS[field.ref.status]}</span></span></div>
				{:else}
					<div class="field ref"><span class="label">{field.label} <span class="count">{field.refs.length}</span></span><ul>{#each field.refs as item, i (i)}<li class="words">{item.words} <span class="ref-status {item.status}">{REF_STATUS_WORDS[item.status]}</span></li>{/each}</ul></div>
				{/if}
			{/each}
		</div>
	</section>
{/if}
<style>
	.params{padding:8px 10px 12px;font-family:Rajdhani,sans-serif;color:var(--text-1)}h3{margin:0 0 6px;font-size:16px;font-weight:600;display:flex;gap:8px;align-items:baseline;min-width:0}h3 .type{flex-shrink:0;font:11px 'Share Tech Mono',monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--text-2)}
	.message{margin:0 0 8px;font-size:13px;line-height:1.4;color:var(--text-2)}.message.error{color:var(--ic-fail-ink,#e07474)}.message.warning{color:var(--ic-warn,var(--amber))}.glyph{font-size:12px}
	.fields{display:grid;gap:8px}.field{display:grid;gap:4px;min-width:0}.label{font:12px 'Share Tech Mono',monospace;color:var(--text-2);display:flex;gap:6px;align-items:baseline}.unit,.count{color:var(--text-2);opacity:.85}
	input,select{min-height:44px;width:100%;box-sizing:border-box;border:1px solid var(--boundary);border-radius:4px;background:var(--surface-0);color:var(--text-1);font:15px 'Share Tech Mono',monospace;padding:0 8px}input:disabled,select:disabled{opacity:.6}input:focus-visible,select:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
	.check{display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer}.check input{width:22px;height:22px;min-height:0;flex-shrink:0;accent-color:var(--green)}.check .label{font:600 14px Rajdhani,sans-serif;color:var(--text-1)}
	.vector{margin:0;padding:0;border:0;display:grid;grid-template-columns:repeat(var(--cols,3),minmax(0,1fr));gap:4px}.vector legend{padding:0;margin-bottom:4px}.text,.words{font-size:14px;line-height:1.35;overflow-wrap:anywhere}ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}
	.ref-status{font:11px 'Share Tech Mono',monospace;letter-spacing:.05em;white-space:nowrap}.ref-status.found{color:var(--green)}.ref-status.missing{color:var(--ic-fail-ink,#e07474)}.ref-status.reattached{color:var(--ic-warn,var(--amber))}
</style>
