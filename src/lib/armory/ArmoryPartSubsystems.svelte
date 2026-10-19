<script lang="ts">
	/**
	 * THE SUBSYSTEM CODES (ledger 0405): the third group of every part number,
	 * DATA a mentor of any project or a site admin extends, never a constant.
	 * A code is retired, never removed, because numbers already name it.
	 * `save` and `retire` are handed in only for a curator; absent, the list is
	 * read-only.
	 */
	import type { CotsAnswer, PartSubsystem } from '$lib/armory/part-numbers';

	let {
		subsystems,
		save = null,
		retire = null
	}: {
		subsystems: PartSubsystem[];
		save?: ((code: string, name: string) => Promise<CotsAnswer>) | null;
		retire?: ((code: string, retired: boolean) => Promise<CotsAnswer>) | null;
	} = $props();

	let code = $state('');
	let name = $state('');
	let busy = $state(false);
	let result = $state<{ bad: boolean; text: string } | null>(null);
	const existing = $derived(subsystems.find((s) => s.code === code.trim().toUpperCase()) ?? null);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!save || busy) return;
		busy = true;
		result = null;
		try {
			const c = code.trim().toUpperCase();
			const answer = await save(c, name.trim());
			result = answer.ok ? { bad: false, text: existing ? `Renamed ${c}.` : `Added ${c}.` } : { bad: true, text: answer.message };
			if (answer.ok) code = name = '';
		} finally {
			busy = false;
		}
	}
	async function toggle(s: PartSubsystem) {
		if (!retire) return;
		const answer = await retire(s.code, !s.retired);
		result = answer.ok ? { bad: false, text: s.retired ? `${s.code} is back.` : `${s.code} is retired. Numbers that use it keep it.` } : { bad: true, text: answer.message };
	}
</script>

<section class="ar-panel as-root" data-testid="armory-subsystems">
	<h2>Subsystem codes</h2>
	<ul class="as-list">
		{#each subsystems as s (s.code)}
			<li class="as-row" data-retired={s.retired} data-testid="armory-subsystem">
				<span class="as-code">{s.code}</span>
				<span class="as-name">{s.name}</span>
				{#if s.retired}<span class="ar-readout">Retired</span>{/if}
				{#if retire}
					<button class="btn secondary ar-btn as-key" type="button" data-testid="armory-subsystem-retire" onclick={() => toggle(s)}>
						{s.retired ? 'Bring back' : 'Retire'}
					</button>
				{/if}
			</li>
		{/each}
	</ul>
	{#if save}
		<form class="as-form" onsubmit={submit} data-testid="armory-subsystem-form">
			<label class="ar-field as-code-field">
				<span>Code</span>
				<input class="plate-well" type="text" maxlength="2" bind:value={code} placeholder="PN" autocapitalize="characters" />
			</label>
			<label class="ar-field as-name-field">
				<span>Name</span>
				<input class="plate-well" type="text" maxlength="40" bind:value={name} placeholder="Pneumatics" />
			</label>
			<button class="btn secondary ar-btn" type="submit" aria-disabled={busy}>{existing ? 'Rename' : 'Add code'}</button>
		</form>
	{/if}
	{#if result}<p class={`ar-message ${result.bad ? 'bad' : ''}`} role="status">{result.text}</p>{/if}
</section>

<style>
	.as-list {
		list-style: none;
		margin: 0 0 0.5rem;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(15rem, 100%), 1fr));
		gap: 0 1.25rem;
	}
	.as-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 44px;
		border-bottom: 1px solid var(--hairline, var(--line));
	}
	.as-code {
		font-family: var(--font-mono);
		font-weight: 700;
		color: var(--text-1);
		width: 2rem;
	}
	.as-name {
		flex: 1 1 auto;
		color: var(--text-1);
	}
	.as-row[data-retired='true'] .as-name,
	.as-row[data-retired='true'] .as-code {
		color: var(--text-2);
	}
	.as-key {
		padding-inline: 0.7rem;
	}
	.as-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.5rem 0.75rem;
	}
	.as-code-field {
		flex: 0 0 5rem;
	}
	.as-name-field {
		flex: 1 1 12rem;
	}
</style>
