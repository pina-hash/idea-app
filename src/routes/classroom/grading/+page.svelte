<script lang="ts">
	import GradingQueue from '$lib/classroom/GradingQueue.svelte';
	import { readNeedsGrading } from '$lib/classroom/grading-queue';
	import { sectionTitle } from '$lib/classroom/classroom';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	// svelte-ignore state_referenced_locally
	const supabase = data.supabase;
	// The classes he teaches, named as the switcher names them, so a class he
	// left out can be offered back by its title.
	const classes = $derived(
		(data.navSections ?? [])
			.filter((s) => s.teacher_email === data.me)
			.map((s) => ({ id: s.id, title: sectionTitle(s) }))
	);
</script>

<GradingQueue read={(exclude) => readNeedsGrading(supabase, exclude)} {classes} />
