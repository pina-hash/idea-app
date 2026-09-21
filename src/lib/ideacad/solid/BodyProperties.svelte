<script lang="ts">
	/**
	 * THE PER-BODY PANEL: name, material, appearance, the fixed flag for mates,
	 * the IdeaBlade role, and mass. Every write is one `metadata` command
	 * through `change`, which is the workspace's `apply`, so the history row
	 * carries the label given here.
	 *
	 * APPEARANCE SAYS WHICH RUNG APPLIES, IN WORDS. `describeAppearance` is the
	 * sentence and `bodyColour` is the shade; both read the same three rungs
	 * (`appearance.ts`), so the panel cannot claim a colour the viewport is not
	 * drawing. Every swatch carries its word, the current one carries a mark,
	 * and the free hex box is the way past the palette.
	 *
	 * DENSITY IS CITED OR IT IS NOT SHOWN. `hasCitedDensity` (`advisory.ts`) is
	 * the one predicate `bodyMass` multiplies by; a material that fails it shows
	 * an Unverified chip, no number, and the reason a number needs a MatWeb or
	 * Bambu Lab source. NOTHING IS CLAMPED: the mass box carries no min, and a
	 * negative or unparseable value is the reducer's own refusal.
	 */
	import { DEFAULT_BODY_COLOUR, BODY_COLOUR_PALETTE, bodyColour, colourName, describeAppearance, materialColourFor, parseHexColour } from './appearance';
	import { STOCK_MATERIALS, bodyMass, densitySourceName, hasCitedDensity } from './advisory';
	import type { BodyProjection, BodyRole, SolidCommand } from './types';
	let { body, canWrite, change, error }: { body: BodyProjection; canWrite: boolean; change: (command: SolidCommand, label: string) => void;
		/** Where a refusal shows: the workspace's own error line. Optional so the existing mount keeps working; without it an unparseable colour is sent as typed and the reducer's refusal shows instead. */
		error?: (message: string) => void } = $props();
	const material = $derived(STOCK_MATERIALS.find((m) => m.id === body.materialId));
	const mass = $derived(bodyMass(body));
	/** The cited density and its source, or null: the panel prints a number only from this. */
	const density = $derived(material && !material.printed && hasCitedDensity(material) ? { value: material.densityGcm3, source: material.source, host: densitySourceName(material.source) } : null);
	const sentence = $derived(describeAppearance(body, material));
	const drawn = $derived(bodyColour(body, materialColourFor(body.materialId)));
	const HEX_REFUSAL = 'Enter a colour as six hex digits, like #ff8800.';
	function pick(hex: string | null, label: string) {
		if ((body.color ?? null) === hex) return;
		change({ type: 'metadata', bodyId: body.id, color: hex }, label);
	}
	function typedHex(raw: string) {
		const text = raw.trim();
		if (text === '') { pick(null, 'Use material colour'); return; }
		const hex = parseHexColour(text);
		if (hex === null) { if (error) error(HEX_REFUSAL); else change({ type: 'metadata', bodyId: body.id, color: text }, 'Set body colour'); return; }
		pick(hex, `Colour body ${colourName(hex)}`);
	}
</script>
<section aria-label="Body properties" data-testid="ideacad-body-panel">
	<label>Name<input value={body.name} disabled={!canWrite} data-testid="ideacad-body-name" onchange={(e) => change({ type: 'metadata', bodyId: body.id, name: e.currentTarget.value }, 'Rename body')}/></label>
	<label>Material<select value={body.materialId ?? ''} disabled={!canWrite} data-testid="ideacad-body-material" onchange={(e) => change({ type: 'metadata', bodyId: body.id, materialId: e.currentTarget.value || null, massG: null, massSource: 'measured' }, 'Set material')}><option value="">Unassigned</option>{#each STOCK_MATERIALS as m (m.id)}<option value={m.id}>{m.name}</option>{/each}</select></label>
	<div class="appearance" role="group" aria-label="Appearance">
		<p class="sentence" data-testid="ideacad-body-appearance"><span class="chip" style="background:{drawn}" aria-hidden="true"></span>{sentence}{#if body.color}<span class="own" data-testid="ideacad-body-colour-name">{` · ${colourName(body.color)} ${body.color}`}</span>{/if}</p>
		<div class="swatches">
			<button type="button" class="swatch" class:current={!body.color} aria-pressed={!body.color} disabled={!canWrite} data-testid="ideacad-body-colour-clear" onclick={() => pick(null, 'Use material colour')}><span class="chip" style="background:{materialColourFor(body.materialId) ?? DEFAULT_BODY_COLOUR}" aria-hidden="true"></span><span class="word">{material ? 'Material colour' : 'Machined stock'}</span>{#if !body.color}<span class="mark">✓ current</span>{/if}</button>
			{#each BODY_COLOUR_PALETTE as colour (colour.id)}<button type="button" class="swatch" class:current={body.color === colour.hex} aria-pressed={body.color === colour.hex} disabled={!canWrite} data-testid="ideacad-body-swatch-{colour.id}" onclick={() => pick(colour.hex, `Colour body ${colour.name}`)}><span class="chip" style="background:{colour.hex}" aria-hidden="true"></span><span class="word">{colour.name}</span>{#if body.color === colour.hex}<span class="mark">✓ current</span>{/if}</button>{/each}
		</div>
		<label>Custom colour (hex, like #ff8800)<input value={body.color ?? ''} placeholder="#rrggbb, or blank for the material colour" spellcheck="false" disabled={!canWrite} data-testid="ideacad-body-colour-hex" onchange={(e) => typedHex(e.currentTarget.value)}/></label>
	</div>
	<label class="check"><input type="checkbox" checked={!!body.fixed} disabled={!canWrite} data-testid="ideacad-body-fixed" onchange={(e) => change({ type: 'metadata', bodyId: body.id, fixed: e.currentTarget.checked }, e.currentTarget.checked ? 'Fix body in place' : 'Free body for mates')}/><span>Fixed in place: a mate never moves this body</span></label>
	<label>IdeaBlade role<select value={body.role} disabled={!canWrite} data-testid="ideacad-body-role" onchange={(e) => change({ type: 'metadata', bodyId: body.id, role: e.currentTarget.value as BodyRole }, 'Set body role')}><option value="part">Part</option><option value="blade">Blade</option><option value="hex-core">Hex core</option><option value="collar">Collar</option><option value="spin-bolt">Spin bolt</option></select></label>
	<label>{material?.printed ? 'Printed part mass (g)' : 'Part mass override (g)'}<input type="number" step="any" value={body.massG ?? ''} placeholder={material?.printed ? 'Enter finished part mass' : 'Optional measured mass'} disabled={!canWrite} data-testid="ideacad-body-mass" title="Enter the cleaned part mass. For a Bambu Studio estimate, exclude supports, purge tower, brim and other removable material. Geometry changes clear this value so it can be updated." onchange={(e) => change({ type: 'metadata', bodyId: body.id, massG: e.currentTarget.value === '' ? null : Number(e.currentTarget.value), massSource: body.massSource ?? 'measured' }, 'Set part mass')}/></label>
	{#if material?.printed}<label>Mass source<select value={body.massSource ?? 'measured'} disabled={!canWrite} data-testid="ideacad-body-mass-source" onchange={(e) => change({ type: 'metadata', bodyId: body.id, massSource: e.currentTarget.value as 'measured' | 'bambu-studio' }, 'Set mass source')}><option value="measured">Scale measurement</option><option value="bambu-studio">Bambu Studio estimate</option></select></label>{/if}
	<output data-testid="ideacad-body-mass-readout">Mass: {mass.grams === null ? 'Unknown' : `${mass.grams.toFixed(2)} g${mass.estimated ? ' · Estimate' : ''}`}</output>
	{#if material?.printed}<small>Exclude supports, purge, brim and other removable material. Shape changes clear the entered mass.</small>{/if}
	{#if material}
		<div class="density" data-testid="ideacad-body-density">
			<span class="key">Density</span>
			{#if density}
				<output data-testid="ideacad-body-density-value">{density.value.toFixed(2)} g/cm³ · Estimate</output>
				<a href={density.source} target="_blank" rel="noreferrer" title={material.sourceNote} data-testid="ideacad-body-density-source">Density reference · {density.host} ↗</a>
			{:else}
				<span class="unverified" data-testid="ideacad-body-density-unverified">Unverified</span>
				<small data-testid="ideacad-body-density-reason">{material.sourceNote} A density needs a MatWeb or Bambu Lab source before the modeler will estimate a mass from it.</small>
			{/if}
		</div>
	{/if}
</section>
<style>
	section{border-top:1px solid var(--hairline);margin-top:10px;padding-top:10px;display:grid;gap:10px}label{display:grid;gap:4px;font:600 15px Rajdhani,sans-serif;color:var(--text-2)}input,select{min-height:44px;width:100%;box-sizing:border-box;background:var(--surface-0);color:var(--text-1);border:1px solid var(--boundary);border-radius:4px;padding:0 8px;font:16px Rajdhani,sans-serif}output,a,small{font:15px Rajdhani,sans-serif;color:var(--text-2)}a{min-height:44px;display:flex;align-items:center;color:var(--cyan)}
	.appearance{display:grid;gap:8px;padding:8px;border:1px solid var(--hairline);border-radius:5px}.sentence{margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:600 15px Rajdhani,sans-serif;color:var(--text-1)}.own{color:var(--text-2);font-weight:500}
	.chip{display:inline-block;width:18px;height:18px;border-radius:50%;border:1px solid var(--hairline);flex-shrink:0}
	.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:6px}.swatch{min-height:44px;display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid var(--boundary);border-radius:5px;background:var(--surface-0);color:var(--text-1);font:600 15px Rajdhani,sans-serif;cursor:pointer;text-align:left}.swatch:hover:not(:disabled){background:var(--surface-2)}.swatch:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}.swatch.current{border-color:var(--green);color:var(--green);background:var(--green-tint,color-mix(in srgb,var(--green) 12%,var(--surface-1)))}.swatch:disabled{opacity:.5;cursor:default}.word{flex:1}.mark{font:12px 'Share Tech Mono',monospace}
	.check{display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer;color:var(--text-1)}.check input{width:22px;height:22px;min-height:0;margin:0;flex-shrink:0;accent-color:var(--green)}
	.density{display:grid;gap:4px}.key{font:600 15px Rajdhani,sans-serif;color:var(--text-2)}.unverified{justify-self:start;padding:3px 10px;border:1px solid var(--amber);border-radius:12px;color:var(--amber);font:600 13px 'Share Tech Mono',monospace;letter-spacing:.04em}
</style>
