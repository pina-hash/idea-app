<script lang="ts">
	/**
	 * The telemetry charts: one `.cert-panel` per chart, an h2, a plain-SVG
	 * bar chart and a legend in words. The axis labels are the data's own
	 * words (a code, a topic, a part); empty data says so in words rather than
	 * drawing an empty axis. Stalled attempts and time per part are lists,
	 * because a name and a number of days read better as a row than a bar.
	 */
	import { deskStudentHref } from '$lib/certifications/nav';
	import type { TelemetryJson } from '$lib/certifications/types';
	import { CHART_EMPTY_WORDS, partWord, telemetryCharts } from './desk';
	import BarChart from './BarChart.svelte';

	let { telemetry }: { telemetry: TelemetryJson | null } = $props();
	const charts = $derived(telemetryCharts(telemetry));
	const stalled = $derived(telemetry?.stalled ?? []);
	const perPart = $derived(telemetry?.time_per_part_hours ?? []);
</script>

<section id="telemetry" aria-labelledby="cert-telemetry-h" data-testid="cert-telemetry">
	<h2 class="cert-section-h" id="cert-telemetry-h">Telemetry</h2>
	{#if !telemetry}
		<p class="dk-empty" data-testid="cert-telemetry-none">{CHART_EMPTY_WORDS}</p>
	{:else}
		<div class="dk-charts">
			{#each charts as chart (chart.id)}
				<section class="cert-panel" id="chart-{chart.id}" data-testid="cert-chart" data-chart={chart.id}>
					<h2>{chart.title}</h2>
					{#if chart.bars.length === 0}
						<p class="dk-empty" data-testid="cert-chart-empty">{CHART_EMPTY_WORDS}</p>
					{:else}
						<BarChart bars={chart.bars} unit={chart.unit} title={chart.title} />
						<ul class="dk-legend" aria-label="Legend">
							{#each chart.legend as line (line)}<li>{line}</li>{/each}
							<li>Figures are {chart.unit}.</li>
						</ul>
					{/if}
				</section>
			{/each}

			<section class="cert-panel" id="chart-stalled" data-testid="cert-chart" data-chart="stalled">
				<h2>Stalled attempts</h2>
				{#if stalled.length === 0}
					<p class="dk-empty" data-testid="cert-chart-empty">{CHART_EMPTY_WORDS}</p>
				{:else}
					<ul class="cert-well">
						{#each stalled as row (row.attempt_id)}
							<li class="dk-row">
								<div class="dk-row-main">
									<span class="dk-row-name">{row.student_name ?? 'A student with no name yet'}</span>
									<span class="dk-row-meta">{row.code}</span>
									<span class="dk-row-meta">{row.days_idle} day{row.days_idle === 1 ? '' : 's'} idle</span>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section class="cert-panel" id="chart-time-per-part" data-testid="cert-chart" data-chart="time-per-part">
				<h2>Average hours per part</h2>
				{#if perPart.length === 0}
					<p class="dk-empty" data-testid="cert-chart-empty">{CHART_EMPTY_WORDS}</p>
				{:else}
					<BarChart
						bars={perPart.map((r) => ({ label: `${r.code} ${partWord(r.part)}`, value: Math.round(r.average * 10) / 10 }))}
						unit="hours"
						title="Average hours per part"
					/>
					<ul class="dk-legend" aria-label="Legend"><li>Green: average hours from a part unlocking to its check.</li><li>Figures are hours.</li></ul>
				{/if}
			</section>
		</div>
	{/if}
</section>
