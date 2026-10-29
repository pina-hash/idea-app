<script lang="ts">
	import GradesPanel from '$lib/classroom/GradesPanel.svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// THE CLASS'S FILL EMPTY GRADES ONLY SWITCH (0315), re-checked by its RPC.
	async function setProtection(on: boolean): Promise<string | null> {
		const { error } = await data.supabase.rpc('classroom_set_grade_protection', {
			p_section_id: data.section.id,
			p_on: on
		});
		if (error) return error.message;
		await invalidateAll();
		return null;
	}

	// THE COURSE'S SYLLABUS CATEGORIES AND TARGETS (0321), re-checked by its RPC.
	async function setTargets(rows: Array<{ category: string; target_points: number | null }>): Promise<string | null> {
		const { error } = await data.supabase.rpc('classroom_set_grade_targets', {
			p_course_id: data.section.course_id,
			p_targets: rows
		});
		if (error) return error.message;
		await invalidateAll();
		return null;
	}

</script>

<GradesPanel
	section={data.section}
	standings={data.standings}
	resubmittedAfterGrading={data.resubmittedAfterGrading}
	gradebook={data.gradebook}
	protection={data.protection}
	onprotection={setProtection}
	targetTally={data.targetTally}
	ontargets={setTargets}
/>
