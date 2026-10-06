<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { invalidate } from '$app/navigation';
	import ArmoryFrame from '$lib/armory/ArmoryFrame.svelte';
	import ArmoryHowItWorks from '$lib/armory/ArmoryHowItWorks.svelte';
	import ArmorySetup from '$lib/armory/ArmorySetup.svelte';
	import ArmorySignIn from '$lib/armory/ArmorySignIn.svelte';
	import { armorySignIn } from '$lib/armory/sign-in';
	import { isSignedOutFailure, PollSignedOut, startPoller } from '$lib/classroom/poll';
	import { pollSignedOut } from '$lib/classroom/poll-session';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** How often the page asks whether a computer has connected, while none has. */
	const CONNECT_WATCH_MS = 10_000;
	let watching = $state(false);

	// THE THIRD STEP TICKS ITSELF. While the caller has no connected computer the
	// page counts their own `armory_devices` rows on the classroom's one poller
	// (out of step, paused while hidden, backing off, stopping when signed out),
	// and reloads its data once the count grows. It stops for good once one shows.
	onMount(() => {
		const start = untrack(() => ({ email: data.email, count: data.devices.length, supabase: data.supabase }));
		if (!start.email || start.count > 0 || !start.supabase) return;
		watching = true;
		const poller = startPoller({
			intervalMs: CONNECT_WATCH_MS,
			onSignedOut: pollSignedOut,
			async run() {
				const { count, error } = await start.supabase.from('armory_devices').select('id', { count: 'exact', head: true });
				if (error) {
					if (isSignedOutFailure(error)) throw new PollSignedOut();
					return 'failed';
				}
				if ((count ?? 0) > start.count) {
					poller.stop();
					watching = false;
					await invalidate('armory:start');
				}
				return 'ok';
			}
		});
		return () => poller.stop();
	});
</script>

<svelte:head><title>Set up Armory // IDEA</title></svelte:head>

<ArmoryFrame
	title="Set up Armory"
	crumbs={[{ href: '/armory', label: 'Armory' }]}
	lead="Four steps, about five minutes. Do them on the Windows computer you will use with SolidWorks."
>
	{#if !data.email}
		<ArmorySignIn reason="Sign in first, so this page can see when your computer connects." onSignIn={() => armorySignIn(data.supabase)} />
	{/if}
	<ArmorySetup
		release={data.release}
		devices={data.devices}
		projects={data.projects}
		mentor={data.mentor}
		flashOnly={data.flashOnly}
		{watching}
	/>
	<ArmoryHowItWorks />
</ArmoryFrame>
