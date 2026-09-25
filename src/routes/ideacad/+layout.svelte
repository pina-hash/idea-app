<script lang="ts">
	let { children } = $props();
</script>

<!-- No `:global(main)` reset here any more (ledger 0298). A route's stylesheet
     stays in the page after a client-side navigation, so it took the reading
     column and the padding off every later page's main. Each IdeaCAD main
     resets itself in its own scoped rule; tests/no-global-document-lock.test.ts
     refuses a rule that names no class. -->
{@render children()}
