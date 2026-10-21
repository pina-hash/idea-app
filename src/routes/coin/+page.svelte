<script lang="ts">
	import CoinHomePage from '$lib/coin-bar/CoinHomePage.svelte';
	import { armorySignIn } from '$lib/armory/sign-in';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<CoinHomePage home={data.home} coinDesk={data.coinDesk} onsignin={data.supabase ? () => armorySignIn(data.supabase) : null} />
