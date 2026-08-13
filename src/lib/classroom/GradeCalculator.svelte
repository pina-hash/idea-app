<script lang="ts">
	import {
		formatPercent,
		gradeCalcResult,
		type GradeCalculatorConfig
	} from '$lib/classroom/reference-spec';

	/**
	 * The grade calculator (calc tool `gradeCalculator`).
	 *
	 * ENTIRELY CLIENT-SIDE, and that is the feature rather than an
	 * implementation detail: nothing here is saved, transmitted, or written
	 * anywhere -- no autosave, no response row, no RPC, no fetch. A student can
	 * type a hypothetical score for a category they have not sat yet and nobody
	 * ever sees it. The authored disclaimer beneath says exactly that, and
	 * validation requires it for that reason.
	 *
	 * THE COMPLETED-ONLY TOGGLE is the difference between "where do I stand right
	 * now" and "what will this be if I score nothing else": OFF counts every
	 * category against its full points possible (a blank reads as zero earned),
	 * ON counts only the categories with a value entered. The arithmetic lives in
	 * gradeCalcResult, not here.
	 */
	let { config }: { config: GradeCalculatorConfig } = $props();

	let entered = $state<string[]>(config.categories.map(() => ''));
	let completedOnly = $state(false);

	const result = $derived(gradeCalcResult(config, entered, completedOnly));
</script>

<div class="calc">
	<div class="calc-scroll">
		<table class="calc-table">
			<thead>
				<tr>
					<th scope="col">Category</th>
					<th scope="col" class="num">Earned</th>
					<th scope="col" class="num">Out of</th>
					<th scope="col" class="num">Weight</th>
					<th scope="col" class="num">Percent</th>
					<th scope="col" class="num">Contribution</th>
				</tr>
			</thead>
			<tbody>
				{#each result.rows as row, i (i)}
					<tr class:muted={!row.counted}>
						<th scope="row">{row.name}</th>
						<td class="num">
							<input
								type="number"
								class="score"
								inputmode="decimal"
								min="0"
								step="any"
								aria-label={`Points earned in ${row.name}`}
								bind:value={entered[i]}
							/>
						</td>
						<td class="num">{row.pointsPossible}</td>
						<td class="num">{row.weight}</td>
						<td class="num">{formatPercent(row.percent)}</td>
						<td class="num">
							{row.counted ? formatPercent(row.contribution, 2) : 'not counted'}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="calc-foot">
		<label class="toggle">
			<input type="checkbox" bind:checked={completedOnly} />
			<span>Only count categories I have entered</span>
		</label>
		<p class="overall">
			<span class="overall-label">Estimated overall</span>
			<span class="overall-value">{formatPercent(result.overall)}</span>
			<span class="overall-meta">
				{result.countedWeight} of {result.totalWeight} weight counted
			</span>
		</p>
	</div>

	<p class="disclaimer">{config.disclaimer}</p>
</div>

<style>
	.calc {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.calc-scroll {
		overflow-x: auto;
	}
	.calc-table {
		width: 100%;
		border-collapse: collapse;
		min-width: 30rem;
	}
	.calc-table th[scope='col'] {
		text-align: left;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--cyan);
		border-bottom: 1px solid var(--line);
		padding: 0.3rem 0.4rem;
		font-weight: 400;
	}
	.calc-table th[scope='row'] {
		text-align: left;
		font-weight: 600;
		font-size: 0.88rem;
	}
	.calc-table td,
	.calc-table th[scope='row'] {
		border-bottom: 1px solid var(--line);
		padding: 0.3rem 0.4rem;
		font-size: 0.88rem;
	}
	.num {
		text-align: right;
		font-family: 'Share Tech Mono', monospace;
	}
	tr.muted td,
	tr.muted th {
		opacity: 0.55;
	}
	.score {
		width: 5rem;
		box-sizing: border-box;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
		padding: 0.28rem 0.4rem;
		text-align: right;
	}
	.score:focus {
		outline: none;
		border-color: var(--line-strong);
	}
	.calc-foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.toggle {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.85rem;
		cursor: pointer;
		min-height: 44px;
	}
	.toggle input {
		accent-color: var(--green);
		width: 1rem;
		height: 1rem;
	}
	.overall {
		margin: 0;
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.overall-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--dim);
	}
	.overall-value {
		font-family: 'Share Tech Mono', monospace;
		font-size: 1.3rem;
		color: var(--green);
	}
	.overall-meta {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--dim);
	}
	.disclaimer {
		margin: 0;
		font-size: 0.78rem;
		color: var(--dim);
		line-height: 1.45;
	}
	@media print {
		.calc-scroll {
			overflow: visible;
		}
		.calc-table {
			min-width: 0;
		}
	}
</style>
