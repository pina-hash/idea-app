<script lang="ts">
	import { invalidate } from '$app/navigation';
	import ArmoryFrame from '$lib/armory/ArmoryFrame.svelte';
	import ArmoryNotice from '$lib/armory/ArmoryNotice.svelte';
	import ArmoryProjectParts from '$lib/armory/ArmoryProjectParts.svelte';
	import ArmorySignIn from '$lib/armory/ArmorySignIn.svelte';
	import { armorySignIn } from '$lib/armory/sign-in';
	import { partsErrorWords, type PartNumberRow, type PrefixAnswer, type TakeAnswer } from '$lib/armory/part-numbers';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const parts = $derived(data.parts);

	/*
	 * THE SAME FUNCTION THE SOLIDWORKS ADD-IN CALLS (docs/ARMORY.md, "Part
	 * numbers"), with no file: a number taken here can be linked to its file
	 * later. Every call carries its own operation id, so a retried press
	 * answers the same number rather than a second one.
	 */
	const take = $derived(
		parts?.can_take
			? async (input: { subsystem: string; assembly: number | null; description: string }): Promise<TakeAnswer> => {
					const { data: row, error } = await data.supabase.rpc('armory_part_number_take', {
						p_project: parts.project.id,
						p_subsystem: input.subsystem,
						p_assembly: input.assembly,
						p_file: null,
						p_file_name: null,
						p_description: input.description,
						p_operation: crypto.randomUUID()
					});
					if (error) return { ok: false, message: partsErrorWords(error) };
					await invalidate('armory:parts');
					return { ok: true, row: row as PartNumberRow };
				}
			: null
	);

	const setPrefix = $derived(
		parts?.can_set_prefix
			? async (prefix: string): Promise<PrefixAnswer> => {
					const { error } = await data.supabase.rpc('armory_set_part_prefix', {
						p_project: parts.project.id,
						p_prefix: prefix,
						p_operation: crypto.randomUUID()
					});
					if (error) return { ok: false, message: partsErrorWords(error) };
					await invalidate('armory:parts');
					return { ok: true };
				}
			: null
	);
</script>

<svelte:head><title>{parts ? `Part numbers, ${parts.project.name} // Armory` : 'Part numbers // Armory'}</title></svelte:head>

{#if !data.email}
	<ArmoryFrame title="Part numbers" crumbs={[{ href: '/armory', label: 'Armory' }]}>
		<ArmorySignIn reason="Sign in to see this project's part numbers." onSignIn={() => armorySignIn(data.supabase)} />
	</ArmoryFrame>
{:else if !parts}
	<ArmoryFrame title="Part numbers" crumbs={[{ href: '/armory', label: 'Armory' }]}>
		<ArmoryNotice title="Part numbers are not switched on yet." testid="armory-parts-not-ready">
			Mr. Pina is still setting them up. Check back soon.
		</ArmoryNotice>
	</ArmoryFrame>
{:else}
	<ArmoryFrame
		title="Part numbers"
		crumbs={[
			{ href: '/armory', label: 'Armory' },
			{ href: `/armory/${parts.project.id}`, label: parts.project.name }
		]}
		lead={`Every number ${parts.project.name} has taken, by subsystem and assembly.`}
	>
		{#snippet actions()}
			<a class="btn secondary ar-btn" href={`/armory/${parts.project.id}`}>Project files</a>
			<a class="btn secondary ar-btn" href="/armory/cots">COTS library</a>
		{/snippet}
		<ArmoryProjectParts data={parts} now={data.now} {take} {setPrefix} />
	</ArmoryFrame>
{/if}
