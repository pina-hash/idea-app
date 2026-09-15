<script lang="ts">
	import {onMount} from 'svelte';
	import type {ComponentProps} from 'svelte';
	import type {SupabaseClient} from '@supabase/supabase-js';
	import IdeaCadApp from '$lib/ideacad/app/IdeaCadApp.svelte';
	import {fixtureClient} from './fixture';
	let fixture:ComponentProps<typeof IdeaCadApp>|null=$state.raw(null),problem=$state('');
	onMount(()=>{void (async()=>{try{
		const query=new URLSearchParams(location.search),client=fixtureClient(query.get('endpoint')??'',query.get('token')??'',query.get('actor')??'owner');
		fixture={...await client.snapshot(),supabase:client.supabase as unknown as SupabaseClient,debugSolid:true};
	}catch(err){problem=err instanceof Error?err.message:String(err);}})();});
</script>
<svelte:head><title>IdeaCAD · Local database verification</title></svelte:head>
{#if fixture}<IdeaCadApp {...fixture}/>{:else}<p role="status">{problem||'Opening local fixture…'}</p>{/if}
