<script lang="ts">
	import IdeaCadLayout from '../../ideacad/+layout.svelte';
	let {children}=$props();
</script>
<IdeaCadLayout>{@render children()}</IdeaCadLayout>
