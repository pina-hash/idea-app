<script lang="ts">
	/**
	 * ANALYSIS: mass and balance, inertia about an axis, the spinner weapon
	 * add-on's readout, and interference between bodies. Every number is read
	 * off the projection (`analysis/mass.ts`, `analysis/balance.ts`) or asked
	 * of the engine (`interference`), and every number shows its formula in a
	 * disclosure beside it.
	 *
	 * HONEST NUMBERS. A value the modeler cannot stand behind is Unknown, with
	 * the bodies that block it, the reason each one does, and a Material
	 * control right there as the way forward. No density is ever assumed:
	 * `bodyMass` (`advisory.ts`) is the one predicate, and a measured mass is a
	 * total that gives the total and never a center of gravity.
	 *
	 * SELECTION IMPLIES THE AXIS AND THE BODIES. A selected round face, round
	 * or straight edge, or reference axis is offered first and chosen by
	 * default, and a selection on a body narrows the inertia to that body.
	 *
	 * INTERFERENCE IS AN ENGINE REQUEST. The section asks `api.request` for
	 * `interference`; a workspace whose worker does not know that request
	 * answers "Unknown geometry operation." and the section is simply absent,
	 * the way an absent transport removes its control. The request is injected
	 * code, so the effect tracks its inputs and runs the call inside `untrack`
	 * (CLAUDE.md); it is debounced and never sent while the workspace is busy,
	 * because the worker runs one thing at a time and a drag must not wait
	 * behind a check.
	 *
	 * WHAT IS DRAWN. With the balance known, the CG, its drop line to the
	 * ground, the footprint and the edge it tips over first are drawn through
	 * `api.guide` in the room's own tokens, and redrawn only when what they
	 * show changes, so another panel's guide is not wiped by every projection.
	 */
	import { onDestroy, untrack } from 'svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import type { WorkspaceApi } from './workspace-api';
	import type { Vec3 } from './types';
	import { STOCK_MATERIALS } from './advisory';
	import { addonEnabled } from './addons/registry';
	import { ENERGY_ADVICE_J_PER_KG, SPINNER_ADDON_ID, SPINNER_DEFAULTS, SPINNER_SOURCES, TIP_SPEED_ADVICE_MPH, spinnerReadout } from './addons/spinner';
	import { FRC_ADDON_ID, FRC_REFERENCE, NM_PER_IN_LBF, freeSpeedFtPerS, gravityLeverIn, holdingTorqueNm, worstLeverIn } from './addons/frc';
	import { BLOCKER_WORDS, centerOfGravity, inertiaAbout, massReport, massRows, radiusAbout, toKgM2, toLbIn2, type MassRow } from './analysis/mass';
	import { tipReport } from './analysis/balance';
	import { axisChoices, defaultAxisChoice, resolveAxis, selectedBodyIds } from './analysis/axes';
	import { sortPairs, type InterferencePair, type InterferenceReport } from './analysis/interference';
	import * as fmt from './analysis/format';
	let { api }: { api: WorkspaceApi } = $props();
	/** Heading ids for `aria-labelledby`, unique per mounted panel. */
	const uid = $props.id();

	const unit = $derived<fmt.LengthUnit>(api.prefs?.units.display === 'mm' ? 'mm' : 'in');
	const bodies = $derived(api.model.bodies);
	const nameOf = (id: string) => api.model.bodies.find((b) => b.id === id)?.name ?? id;

	/* ------------------------------------------------------ mass and balance */
	const report = $derived(massReport(api.model));
	const tip = $derived(report.cg && report.groundZ !== null ? tipReport(bodies, report.cg, report.groundZ) : null);

	/* --------------------------------------------------------------- inertia */
	let subjectMode = $state<'selection' | 'all'>('selection');
	const selectedIds = $derived(selectedBodyIds(api.model, api.selections));
	const subject = $derived(subjectMode === 'selection' && selectedIds.length ? bodies.filter((b) => selectedIds.includes(b.id)) : bodies);
	const subjectRows = $derived(massRows(subject));
	const subjectBlockers = $derived(subjectRows.filter((r) => !r.distributed));
	const subjectCg = $derived(subjectBlockers.length ? null : centerOfGravity(subjectRows));
	const choices = $derived(axisChoices(api.model, api.selections));
	/* A pick holds until the selection offers a different axis; then the selection's axis is the default again. */
	const selectionKey = $derived(choices.filter((c) => c.id.startsWith('sel:')).map((c) => c.id).join('|'));
	let picked = $state<{ key: string; id: string } | null>(null);
	const axisId = $derived(picked && picked.key === selectionKey && choices.some((c) => c.id === picked!.id) ? picked.id : defaultAxisChoice(choices));
	const choice = $derived(choices.find((c) => c.id === axisId));
	const axis = $derived(resolveAxis(choice, subjectCg));
	const inertia = $derived(axis ? inertiaAbout(subject, axis) : null);
	const inertiaG = $derived(inertia?.gIn2 ?? null);

	/* --------------------------------------------------------------- spinner */
	const spinnerOn = $derived(addonEnabled(api.model.addons, SPINNER_ADDON_ID));
	let typed = $state<Record<'rpm' | 'teeth' | 'attackInPerS' | 'volts', string>>({ rpm: String(SPINNER_DEFAULTS.rpm), teeth: String(SPINNER_DEFAULTS.teeth), attackInPerS: String(SPINNER_DEFAULTS.attackInPerS), volts: String(SPINNER_DEFAULTS.volts) });
	/** `Number('')` is 0, a number nobody typed; an empty field is not a number. */
	const number = (v: string) => (v.trim() === '' ? NaN : Number(v.trim()));
	/** Typed and not a number. An empty field is empty, not wrong: its result reads Unknown. */
	const invalid = (v: string) => v.trim() !== '' && !Number.isFinite(Number(v.trim()));
	const spinnerInputs = $derived({ rpm: number(typed.rpm), teeth: number(typed.teeth), attackInPerS: number(typed.attackInPerS), volts: number(typed.volts) });
	const tipRadius = $derived(axis ? radiusAbout(subject, axis) : null);
	const spin = $derived(spinnerReadout(spinnerInputs, inertiaG === null ? null : toKgM2(inertiaG), tipRadius, report.totalG === null ? null : report.totalG / 1000));
	const SPINNER_FIELDS: { key: keyof typeof typed; label: string; unit: string }[] = [
		{ key: 'rpm', label: 'Speed', unit: 'RPM' },
		{ key: 'teeth', label: 'Teeth', unit: '' },
		{ key: 'attackInPerS', label: 'Attack', unit: 'in/s' },
		{ key: 'volts', label: 'Battery', unit: 'V' }
	];

	/* ------------------------------------------------------------ FRC checks */
	const frcOn = $derived(addonEnabled(api.model.addons, FRC_ADDON_ID));
	/** The subject's mass, only when every body in it has one. */
	const subjectG = $derived(subjectRows.length && subjectRows.every((r) => r.grams !== null) ? subjectRows.reduce((n, r) => n + r.grams!, 0) : null);
	const armHere = $derived(subjectCg && axis && subjectG !== null ? holdingTorqueNm(subjectG / 1000, gravityLeverIn(subjectCg, axis)) : null);
	const armLevel = $derived(subjectCg && axis && subjectG !== null ? holdingTorqueNm(subjectG / 1000, worstLeverIn(subjectCg, axis)) : null);
	let drive = $state<Record<'rpm' | 'reduction', string>>({ rpm: '', reduction: '1' });
	const wheelIn = $derived(choice?.radius !== undefined ? choice.radius * 2 : null);
	const driveRpm = $derived(number(drive.rpm)), driveReduction = $derived(number(drive.reduction));
	const freeSpeed = $derived(wheelIn !== null && Number.isFinite(driveRpm) && Number.isFinite(driveReduction) ? freeSpeedFtPerS(wheelIn, driveRpm, driveReduction) : null);
	const torque = (nm: number) => `${fmt.sig(nm)} N·m`;

	/* ---------------------------------------------------------- interference */
	/** The worker's own sentence for a request it has no case for; the one answer that removes the section. */
	const UNSUPPORTED = 'Unknown geometry operation.';
	const DEBOUNCE_MS = 400;
	let supported = $state<'unknown' | 'yes' | 'no'>('unknown');
	let found = $state<InterferenceReport | null>(null);
	let checking = $state(false);
	let failed = $state<string | null>(null);
	/** What the check depends on: every body's identity, size and place. A projection with the same bodies re-asks nothing. */
	const geometryKey = $derived(bodies.map((b) => `${b.id}:${b.volume.toPrecision(12)}:${b.bounds.map((n) => n.toPrecision(10)).join(',')}:${b.centerOfMass.map((n) => n.toPrecision(10)).join(',')}`).join('|'));
	let asked = '';
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const key = geometryKey, busy = api.busy, count = bodies.length;
		untrack(() => schedule(key, busy, count));
	});
	function schedule(key: string, busy: boolean, count: number) {
		if (busy || supported === 'no' || key === asked || count < 2) return;
		clearTimeout(timer);
		/* The first ask goes at once, so the section appears with its answer; later ones wait for the model to settle. */
		if (supported === 'unknown' && !checking) void check(key);
		else timer = setTimeout(() => void check(key), DEBOUNCE_MS);
	}
	async function check(key: string) {
		asked = key; checking = true;
		const ask = api.request as unknown as <T>(method: string, value?: unknown) => Promise<T>;
		try {
			const r = await ask<InterferenceReport>('interference');
			if (asked !== key) return;
			found = r; failed = null; supported = 'yes';
		} catch (e) {
			const text = e instanceof Error ? e.message : String(e);
			if (text === UNSUPPORTED) { supported = 'no'; return; }
			if (asked === key) { failed = text; supported = 'yes'; }
		} finally { if (asked === key) checking = false; }
	}
	const pairs = $derived(found ? sortPairs(found.pairs) : []);
	const overlaps = $derived(pairs.filter((p) => p.kind === 'interference'));
	const touching = $derived(pairs.filter((p) => p.kind === 'touching'));
	const clear = $derived(pairs.filter((p) => p.kind === 'clear'));
	const unknownPairs = $derived(pairs.filter((p) => p.kind === 'unknown'));
	const NEAREST = 3;

	/* ---------------------------------------------------------------- guides */
	let root = $state<HTMLElement | null>(null);
	let showBalance = $state(true);
	let focus = $state<InterferencePair | null>(null);
	let drawn = '';
	const token = (name: string) => (root ? getComputedStyle(root).getPropertyValue(name).trim() : '') || undefined;
	const guideKey = $derived(focus ? `pair:${focus.a}/${focus.b}:${JSON.stringify(focus.point ?? focus.points)}` : showBalance && report.cg && tip ? `cg:${report.cg.join(',')}:${tip.hull.flat().join(',')}:${tip.least ? tip.least.a.join(',') + tip.least.b.join(',') : ''}` : '');
	$effect(() => {
		const key = guideKey, pair = focus, cg = report.cg, t = tip;
		untrack(() => draw(key, pair, cg, t));
	});
	function extent() {
		let lo = Infinity, hi = -Infinity;
		for (const b of api.model.bodies) for (let d = 0; d < 3; d++) { if (b.bounds[d] < lo) lo = b.bounds[d]; if (b.bounds[d + 3] > hi) hi = b.bounds[d + 3]; }
		return Number.isFinite(hi - lo) && hi > lo ? hi - lo : 1;
	}
	function cross(p: Vec3, size: number, color?: string) {
		for (let d = 0; d < 3; d++) { const a: Vec3 = [...p], b: Vec3 = [...p]; a[d] -= size; b[d] += size; api.guide([a, b], color); }
	}
	function draw(key: string, pair: InterferencePair | null, cg: Vec3 | null, t: typeof tip) {
		if (key === drawn) return;
		drawn = key;
		api.clearGuides();
		if (!key) return;
		const s = extent() * 0.04, meta = token('--ic-meta'), warn = token('--ic-warn'), line = token('--text-2');
		if (pair) {
			if (pair.point) cross(pair.point, s, warn);
			if (pair.points) { api.guide(pair.points, meta); cross(pair.points[0], s / 2, meta); cross(pair.points[1], s / 2, meta); }
			return;
		}
		if (!cg || !t) return;
		cross(cg, s, meta);
		api.guide([cg, [cg[0], cg[1], t.groundZ]], meta);
		if (t.hull.length > 1) api.guide([...t.hull, t.hull[0]].map(([x, y]): Vec3 => [x, y, t.groundZ]), line);
		if (t.least) api.guide([[t.least.a[0], t.least.a[1], t.groundZ], [t.least.b[0], t.least.b[1], t.groundZ]], warn);
	}
	onDestroy(() => { clearTimeout(timer); if (drawn) api.clearGuides(); });

	function showPair(p: InterferencePair) {
		if (focus && focus.a === p.a && focus.b === p.b) { focus = null; return; }
		focus = p;
		api.select({ bodyId: p.a, kind: 'body', id: p.a });
		api.select({ bodyId: p.b, kind: 'body', id: p.b }, true);
	}
	async function setMaterial(row: MassRow, materialId: string) {
		if (!materialId) return;
		try { await api.apply({ type: 'metadata', bodyId: row.id, materialId, massG: null, massSource: 'measured' }, 'Set material'); }
		catch (e) { api.error(e instanceof Error ? e.message : String(e)); }
	}
	const KIND_WORDS: Record<InterferencePair['kind'], string> = { interference: 'Overlap', touching: 'Touching', clear: 'Gap', unknown: 'Unknown' };
	const pairValue = (p: InterferencePair) => (p.kind === 'interference' ? fmt.volume(p.volume ?? NaN, unit) : p.kind === 'clear' ? fmt.length(p.distance ?? NaN, unit) : '');
	const subjectWord = $derived(subject.length === 1 ? subject[0].name : `${subject.length} bodies`);
	const signed = (deg: number) => (deg < 0 ? 'Tips now' : fmt.degrees(deg));
</script>

{#snippet blockerList(rows: MassRow[], testid: string, controls: boolean)}
	<ul class="blockers" data-testid={testid}>
		{#each rows as row (row.id)}
			<li data-body={row.id}>
				<span class="who">{row.name}</span><span class="an-why" data-blocker={row.blocker}>{row.blocker ? BLOCKER_WORDS[row.blocker] : ''}</span>
				{#if controls && api.canWrite}
					<select aria-label={`Material for ${row.name}`} disabled={api.busy} data-testid="ideacad-analysis-material" onchange={(e) => void setMaterial(row, e.currentTarget.value)}>
						<option value="">Material</option>
						{#each STOCK_MATERIALS as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
					</select>
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet pairRow(p: InterferencePair)}
	<li>
		<button type="button" class="pair {p.kind}" aria-pressed={!!focus && focus.a === p.a && focus.b === p.b} data-kind={p.kind} onclick={() => showPair(p)}>
			<span class="names">{nameOf(p.a)} <span aria-hidden="true">×</span> {nameOf(p.b)}</span>
			<span class="kind">{KIND_WORDS[p.kind]}{#if p.quality === 'approximate'}<span class="an-chip">Approximate</span>{/if}</span>
			<span class="value">{#if pairValue(p)}{#if p.quality === 'approximate'}<span class="approx" aria-hidden="true">≈</span>{/if}{pairValue(p)}{/if}</span>
			{#if p.message}<span class="an-said">{p.message}</span>{/if}
		</button>
	</li>
{/snippet}

<section class="analysis panel" aria-label="Analysis" data-testid="ideacad-analysis-panel" bind:this={root}>
	<h2>Analysis</h2>
	{#if !bodies.length}
		<p class="an-empty">No bodies</p>
	{:else}
		<section class="block" aria-labelledby={`${uid}-mass`} data-testid="ideacad-analysis-mass">
			<div class="head"><h3 id={`${uid}-mass`}>Mass</h3><output class:unknown={report.totalG === null} data-testid="ideacad-analysis-total">{report.totalG === null ? 'Unknown' : `${fmt.grams(report.totalG)} · ${fmt.pounds(report.totalG)}`}</output></div>
			<table class="rows">
				<thead><tr><th scope="col">Body</th><th scope="col">Mass</th><th scope="col">Share</th></tr></thead>
				<tbody>
					{#each report.rows as row (row.id)}
						<tr data-body={row.id} class:unknown={row.grams === null}>
							<th scope="row">{row.name}{#if row.grams === null && row.blocker}<small>{BLOCKER_WORDS[row.blocker]}</small>{/if}</th>
							<td>{row.grams === null ? 'Unknown' : fmt.grams(row.grams)}</td>
							<td>{row.share === null ? '' : fmt.percent(row.share)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<Disclosure label="Formulas" collapseWhen={true} testId="ideacad-analysis-mass-formulas">
				<ul class="formulas">
					<li><code>m = V × ρ</code><span>V from the kernel, ρ a cited density; or a measured mass</span></li>
					<li><code>Total = Σ m</code>{#if report.totalG !== null}<span>{report.rows.map((r) => fmt.grams(r.grams ?? 0)).join(' + ')}</span>{:else}<span>Unknown until every body has a mass</span>{/if}</li>
				</ul>
			</Disclosure>
		</section>

		<section class="block" aria-labelledby={`${uid}-balance`} data-testid="ideacad-analysis-balance">
			<div class="head"><h3 id={`${uid}-balance`}>Balance</h3>{#if report.cg}<button type="button" class="toggle" aria-pressed={showBalance} onclick={() => { showBalance = !showBalance; focus = null; }}>In view</button>{/if}</div>
			{#if report.cg}
				<dl class="facts">
					<dt>CG</dt><dd data-testid="ideacad-analysis-cg">{fmt.point(report.cg, unit, 2)} {unit}</dd>
					<dt>CG height</dt><dd data-testid="ideacad-analysis-cg-height">{fmt.length(report.cgHeight ?? NaN, unit)}</dd>
					<dt>Tips first</dt>
					<dd data-testid="ideacad-analysis-tip">
						{#if !tip}Unknown{:else if tip.least}{signed(tip.least.angleDeg)} <span class="toward">{tip.stands ? 'toward' : 'past'} {tip.least.toward}</span>{:else if tip.footprint === 'line'}0° <span class="toward">rests on a line</span>{:else}0° <span class="toward">rests on a point</span>{/if}
					</dd>
					{#if tip?.least && tip.stands}<dt>Tips at</dt><dd data-testid="ideacad-analysis-tip-accel">{fmt.sig(tip.least.inside / tip.height)} g <span class="toward">sideways</span></dd>{/if}
				</dl>
			{:else}
				<dl class="facts"><dt>CG</dt><dd class="unknown" data-testid="ideacad-analysis-cg">Unknown</dd></dl>
				{@render blockerList(report.blockers, 'ideacad-analysis-cg-blockers', true)}
			{/if}
			<Disclosure label="Formulas" collapseWhen={true} testId="ideacad-analysis-balance-formulas">
				<ul class="formulas">
					<li><code>CG = Σ m·c / Σ m</code><span>c: each body's center of mass</span></li>
					<li><code>h = CG z − lowest z</code>{#if report.cgHeight !== null && report.cg}<span>{fmt.length(report.cg[2], unit)} − {fmt.length(report.groundZ ?? NaN, unit)}</span>{/if}</li>
					<li><code>θ = atan(d / h)</code>{#if tip?.least}<span>d = {fmt.length(tip.least.inside, unit)}, h = {fmt.length(tip.height, unit)}</span>{/if}<span>d: CG to the footprint edge, on the ground. Standard statics.</span></li>
					<li><code>a = g·d / h</code><span>Sideways acceleration that lifts the far side. Standard statics.</span></li>
				</ul>
			</Disclosure>
		</section>

		<section class="block" aria-labelledby={`${uid}-inertia`} data-testid="ideacad-analysis-inertia">
			<div class="head"><h3 id={`${uid}-inertia`}>Inertia</h3></div>
			<label class="an-field">Axis
				<select value={axisId} data-testid="ideacad-analysis-axis" onchange={(e) => (picked = { key: selectionKey, id: e.currentTarget.value })}>
					{#each choices as c (c.id)}<option value={c.id}>{c.label}</option>{/each}
				</select>
			</label>
			{#if selectedIds.length}
				<label class="an-field">Bodies
					<select value={subjectMode} data-testid="ideacad-analysis-subject" onchange={(e) => (subjectMode = e.currentTarget.value as 'selection' | 'all')}>
						<option value="selection">Selected ({selectedIds.length})</option>
						<option value="all">All ({bodies.length})</option>
					</select>
				</label>
			{/if}
			{#if inertiaG !== null}
				<dl class="facts">
					<dt>I</dt><dd><span data-testid="ideacad-analysis-inertia-lb">{fmt.sig(toLbIn2(inertiaG))} lb·in²</span><span class="si" data-testid="ideacad-analysis-inertia-si">{fmt.sig(toKgM2(inertiaG))} kg·m²</span></dd>
				</dl>
			{:else}
				<dl class="facts"><dt>I</dt><dd class="unknown" data-testid="ideacad-analysis-inertia-lb">Unknown</dd></dl>
				{@render blockerList(subjectBlockers, 'ideacad-analysis-inertia-blockers', !report.blockers.length)}
			{/if}
			<Disclosure label="Formulas" collapseWhen={true} testId="ideacad-analysis-inertia-formulas">
				<ul class="formulas">
					<li><code>I = Σ (ρ·nᵀJn + m·d²)</code><span>Parallel-axis theorem. J: the kernel's tensor about each body's CG. d: CG to the axis.</span></li>
					{#each inertia?.terms ?? [] as t (t.id)}<li><span>{t.name}: {fmt.sig(toLbIn2(t.own))} + {fmt.sig(toLbIn2(t.transfer))} lb·in², d = {fmt.length(t.distance, unit)}</span></li>{/each}
				</ul>
			</Disclosure>
		</section>

		{#if spinnerOn}
			<section class="block" aria-labelledby={`${uid}-spinner`} data-testid="ideacad-analysis-spinner">
				<div class="head"><h3 id={`${uid}-spinner`}>Spinner weapon</h3></div>
				<div class="inputs">
					{#each SPINNER_FIELDS as f (f.key)}
						<label class="an-field"><span>{f.label}{#if f.unit} <small>{f.unit}</small>{/if}</span>
							<input type="text" inputmode="decimal" value={typed[f.key]} aria-invalid={invalid(typed[f.key])} data-input={f.key} oninput={(e) => (typed[f.key] = e.currentTarget.value)} />
						</label>
					{/each}
				</div>
				<dl class="facts">
					<dt>Of</dt><dd class="subject" data-testid="ideacad-analysis-spinner-subject">{subjectWord}</dd>
					<dt>Energy</dt>
					<dd data-testid="ideacad-analysis-energy">{#if spin.energyJ === null}<span class="unknown">Unknown</span> <span class="toward">needs inertia</span>{:else}{fmt.sig(spin.energyJ)} J{#if spin.energyPerKg !== null} <span class="toward">{fmt.sig(spin.energyPerKg)} J/kg</span>{/if}{/if}</dd>
					<dt>Tip speed</dt>
					<dd data-testid="ideacad-analysis-tip-speed">{#if spin.tipMph === null}Unknown{:else}{fmt.sig(spin.tipMph)} mph <span class="toward">{fmt.sig(spin.tipMps ?? NaN)} m/s</span>{#if spin.tipMph > TIP_SPEED_ADVICE_MPH}<span class="an-chip an-warn">Over {TIP_SPEED_ADVICE_MPH} mph</span>{/if}{/if}</dd>
					<dt>Bite</dt><dd data-testid="ideacad-analysis-bite">{fmt.length(spin.biteIn, unit)}</dd>
					<dt>Motor</dt><dd data-testid="ideacad-analysis-kv">{fmt.sig(spin.kv)} kV</dd>
				</dl>
				<Disclosure label="Formulas" collapseWhen={true} testId="ideacad-analysis-spinner-formulas">
					<ul class="formulas">
						<li><code>E = ½·I·ω²</code><span>ω = RPM × 2π / 60 = {fmt.sig(spin.omega)} rad/s</span><a href={SPINNER_SOURCES.jcr.url} target="_blank" rel="noreferrer">{SPINNER_SOURCES.jcr.name}</a></li>
						<li><code>v = ω·r</code>{#if tipRadius !== null}<span>r = {fmt.length(tipRadius, unit)}</span>{/if}</li>
						<li><code>bite = attack × 60 / (RPM × teeth)</code><a href={SPINNER_SOURCES.aaron.url} target="_blank" rel="noreferrer">{SPINNER_SOURCES.aaron.name}</a></li>
						<li><code>kV = RPM / V</code><span>Rules of thumb: tip under {TIP_SPEED_ADVICE_MPH} mph; at least {ENERGY_ADVICE_J_PER_KG} J per kg of weight class.</span></li>
					</ul>
				</Disclosure>
			</section>
		{/if}

		{#if frcOn}
			<section class="block" aria-labelledby={`${uid}-frc`} data-testid="ideacad-analysis-frc">
				<div class="head"><h3 id={`${uid}-frc`}>FRC checks</h3><span class="an-chip">Estimate</span></div>
				<dl class="facts">
					<dt>Of</dt><dd class="subject">{subjectWord}</dd>
					<dt>Hold here</dt>
					<dd data-testid="ideacad-analysis-arm-here">{#if armHere === null}<span class="unknown">Unknown</span> <span class="toward">needs a CG</span>{:else}{torque(armHere)} <span class="toward">{fmt.sig(armHere / NM_PER_IN_LBF)} in·lbf</span>{/if}</dd>
					<dt>Hold level</dt>
					<dd data-testid="ideacad-analysis-arm-level">{#if armLevel === null}<span class="unknown">Unknown</span>{:else}{torque(armLevel)} <span class="toward">{fmt.sig(armLevel / NM_PER_IN_LBF)} in·lbf</span>{/if}</dd>
				</dl>
				<div class="inputs">
					<label class="an-field"><span>Motor <small>RPM</small></span><input type="text" inputmode="decimal" value={drive.rpm} aria-invalid={invalid(drive.rpm)} data-input="motor-rpm" oninput={(e) => (drive.rpm = e.currentTarget.value)} /></label>
					<label class="an-field"><span>Reduction <small>to 1</small></span><input type="text" inputmode="decimal" value={drive.reduction} aria-invalid={invalid(drive.reduction)} data-input="reduction" oninput={(e) => (drive.reduction = e.currentTarget.value)} /></label>
				</div>
				<dl class="facts">
					<dt>Wheel</dt><dd data-testid="ideacad-analysis-wheel">{#if wheelIn === null}<span class="unknown">Unknown</span> <span class="toward">needs a round face</span>{:else}{fmt.length(wheelIn, unit)}{/if}</dd>
					<dt>Free speed</dt><dd data-testid="ideacad-analysis-free-speed">{#if freeSpeed === null}<span class="unknown">Unknown</span>{:else}{fmt.sig(freeSpeed)} ft/s <span class="toward">{fmt.sig(freeSpeed * 0.3048)} m/s</span>{/if}</dd>
				</dl>
				<Disclosure label="Formulas" collapseWhen={true} testId="ideacad-analysis-frc-formulas">
					<ul class="formulas">
						<li><code>τ = m·g·d</code><span>d: the horizontal distance from the axis to the CG; level is the arm held flat.</span></li>
						<li><code>v = π·D·n / (60·G)</code><span>D: the round face's diameter. No friction or efficiency loss.</span><a href={FRC_REFERENCE.url} target="_blank" rel="noreferrer">{FRC_REFERENCE.name}</a></li>
					</ul>
				</Disclosure>
			</section>
		{/if}

		{#if supported === 'yes' && bodies.length > 1}
			<section class="block" aria-labelledby={`${uid}-interference`} data-testid="ideacad-analysis-interference" aria-busy={checking}>
				<div class="head"><h3 id={`${uid}-interference`}>Interference</h3><output data-testid="ideacad-analysis-overlaps">{#if checking}Checking…{:else if found}{overlaps.length} overlap{overlaps.length === 1 ? '' : 's'}{/if}</output></div>
				{#if failed}<p class="an-said" role="status">{failed}</p>{/if}
				{#if found}
					<ul class="pairs" data-testid="ideacad-analysis-pairs">
						{#each overlaps as p (p.a + p.b)}{@render pairRow(p)}{/each}
						{#each touching as p (p.a + p.b)}{@render pairRow(p)}{/each}
						{#each unknownPairs as p (p.a + p.b)}{@render pairRow(p)}{/each}
						{#each clear.slice(0, NEAREST) as p (p.a + p.b)}{@render pairRow(p)}{/each}
					</ul>
					{#if clear.length > NEAREST}
						<Disclosure label="More clearances" collapseWhen={true} testId="ideacad-analysis-more-clearances">
							{#snippet meta()}{clear.length - NEAREST}{/snippet}
							<ul class="pairs">{#each clear.slice(NEAREST) as p (p.a + p.b)}{@render pairRow(p)}{/each}</ul>
						</Disclosure>
					{/if}
					<p class="meta" data-testid="ideacad-analysis-interference-meta">{found.pairsChecked} pairs · {Math.round(found.ms)} ms</p>
				{/if}
				<Disclosure label="Formulas" collapseWhen={true} testId="ideacad-analysis-interference-formulas">
					<ul class="formulas">
						<li><code>V = volume(A ∩ B)</code><span>The kernel's exact intersection. Approximate rows used its faceted fallback.</span></li>
						<li><code>gap = min |a − b|</code><span>Exact when it equals the bounding-box gap; otherwise the least distance a search found.</span></li>
					</ul>
				</Disclosure>
			</section>
		{/if}
	{/if}
</section>

<style>
	.analysis{display:grid;gap:10px;min-width:0}h2{margin:0;font-size:18px}
	.block{display:grid;gap:6px;min-width:0;padding-top:6px;border-top:1px solid var(--hairline)}
	/* The panel title's own band already rules off the first section. */
	.block:first-of-type{border-top:0;padding-top:0}
	.head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:28px}
	h3{margin:0;font:var(--ic-fs-eyebrow,11px)/1.2 var(--font-mono,'Share Tech Mono',monospace);letter-spacing:var(--ic-track,.1em);text-transform:uppercase;color:var(--text-1)}
	.head output{font:var(--ic-fs-num,14px)/1.2 var(--font-mono,'Share Tech Mono',monospace);color:var(--text-1);text-align:right}.head output.unknown{color:var(--ic-warn,var(--amber))}.head .an-chip{margin-left:auto}
	.an-empty,.an-said{margin:0;font:13px/1.4 var(--font-display,Rajdhani,sans-serif);color:var(--text-2)}
	.an-said{color:var(--ic-warn,var(--amber))}
	table.rows{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px}
	.rows th,.rows td{padding:3px 0;border-bottom:1px solid var(--hairline);vertical-align:top}
	.rows thead th{font:var(--ic-fs-label,12px)/1.2 var(--font-mono,'Share Tech Mono',monospace);color:var(--text-2);text-align:left;font-weight:400}
	.rows thead th:nth-child(2),.rows thead th:nth-child(3){text-align:right}
	.rows tbody th{font:500 14px/1.25 var(--font-display,Rajdhani,sans-serif);color:var(--text-1);text-align:left;overflow-wrap:anywhere}
	.rows tbody th small{display:block;font:var(--ic-fs-label,12px)/1.2 var(--font-mono,'Share Tech Mono',monospace);color:var(--ic-warn,var(--amber))}
	.rows td{font:13px/1.25 var(--font-mono,'Share Tech Mono',monospace);color:var(--text-1);text-align:right;white-space:nowrap}
	.rows thead th:nth-child(2){width:36%}.rows thead th:nth-child(3){width:17%}
	tr.unknown td{color:var(--ic-warn,var(--amber))}
	dl.facts{margin:0;display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:baseline}
	dt{font:var(--ic-fs-label,12px)/1.2 var(--font-mono,'Share Tech Mono',monospace);color:var(--text-2)}
	dd{margin:0;font:var(--ic-fs-num,14px)/1.3 var(--font-mono,'Share Tech Mono',monospace);color:var(--text-1);text-align:right;overflow-wrap:anywhere}
	dd.unknown,.unknown{color:var(--ic-warn,var(--amber))}
	dd .si{display:block;font-size:13px;color:var(--text-2)}
	dd.subject{font:500 14px/1.25 var(--font-display,Rajdhani,sans-serif)}
	.toward{margin-left:6px;font:12px/1.2 var(--font-mono,'Share Tech Mono',monospace);color:var(--text-2)}
	.an-chip{display:inline-block;margin-left:6px;padding:1px 6px;border:1px solid var(--boundary);border-radius:10px;font:11px/1.3 var(--font-mono,'Share Tech Mono',monospace);color:var(--text-2)}
	.an-chip.an-warn{border-color:var(--ic-warn,var(--amber));color:var(--ic-warn,var(--amber))}
	ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
	.blockers li{display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:baseline}
	.who{font:500 14px/1.25 var(--font-display,Rajdhani,sans-serif);color:var(--text-1);overflow-wrap:anywhere}
	.an-why{font:var(--ic-fs-label,12px)/1.2 var(--font-mono,'Share Tech Mono',monospace);color:var(--ic-warn,var(--amber));text-align:right}
	.blockers select{grid-column:1/-1}
	.an-field{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;font:var(--ic-fs-label,12px)/1.2 var(--font-mono,'Share Tech Mono',monospace);color:var(--text-2)}.an-field small{font:inherit;color:var(--text-2)}
	select,input{min-height:44px;width:100%;min-width:0;box-sizing:border-box;padding:0 8px;border:1px solid var(--boundary);border-radius:var(--ic-radius,4px);background:var(--ic-field,var(--surface-0));color:var(--text-1);font:15px var(--font-display,Rajdhani,sans-serif)}
	input{font:15px var(--font-mono,'Share Tech Mono',monospace)}
	input[aria-invalid='true']{border-color:var(--ic-warn,var(--amber))}
	.inputs{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:6px}
	button{min-height:44px;box-sizing:border-box;border:1px solid var(--boundary);border-radius:var(--ic-radius,4px);background:var(--ic-control,var(--surface-2));color:var(--text-1);font:500 14px/1.2 var(--font-display,Rajdhani,sans-serif);cursor:pointer;padding:4px 10px;text-align:left}
	button:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
	/* A pressed pair is a SELECTION, not a mode that is on: the list's own ink over the tint, as the tree's rows do, rather than the room's filled pressed tool. */
	.pairs button[aria-pressed='true']{border-color:var(--ic-accent,var(--green));background:var(--green-tint,color-mix(in srgb,var(--green) 12%,var(--surface-1)));color:var(--text-1)}
	.toggle{min-width:44px;padding:4px 12px;font-size:13px}
	.pairs button{width:100%;display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:baseline}
	.pairs .names{grid-column:1/-1;font-size:14px;overflow-wrap:anywhere;min-width:0}
	.pairs .kind{font:12px/1.3 var(--font-mono,'Share Tech Mono',monospace);color:var(--text-2)}
	.pairs .value{font:13px/1.2 var(--font-mono,'Share Tech Mono',monospace);text-align:right;white-space:nowrap}
	.pairs .approx{margin-right:2px;color:var(--text-2)}
	.pairs .an-said{grid-column:1/-1}
	.pair.interference{border-left:3px solid var(--ic-fail,var(--crimson))}.pair.interference .value{color:var(--ic-fail-ink,#e07474)}
	.pair.touching{border-left:3px solid var(--ic-warn,var(--amber))}
	.pair.unknown{border-left:3px dashed var(--ic-warn,var(--amber))}
	.meta{margin:0;font:11px/1.3 var(--font-mono,'Share Tech Mono',monospace);color:var(--text-2)}
	.formulas{gap:6px;padding:2px 0 4px}
	.formulas li{display:grid;gap:2px;font:13px/1.35 var(--font-display,Rajdhani,sans-serif);color:var(--text-2)}
	.formulas code{font:13px/1.3 var(--font-mono,'Share Tech Mono',monospace);color:var(--text-1)}
	.formulas a{display:flex;align-items:center;min-height:44px;color:var(--ic-meta,var(--cyan));overflow-wrap:anywhere}
	/* The shared disclosure's trigger is a borderless row; in this room `.ic-root button:hover` would give it a plate and an edge, so it keeps its own gutter and says so. */
	.analysis :global(.disc .disc-trigger){padding:2px 8px;box-shadow:none;border:1px solid transparent;border-radius:var(--ic-radius,4px);background:transparent;min-height:44px}
	.analysis :global(.disc .disc-trigger:hover){border-color:var(--ic-accent,var(--green));background:var(--ic-control-hover,var(--surface-2))}
</style>
