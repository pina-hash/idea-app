<!--
	The smallest real component, mounted by `tests/dom/vitest-project-dom.test.ts`
	and server-rendered by `tests/vitest-project-node.test.ts`.

	ONE component for both, deliberately: the two identity files are a matched
	pair asserting that the SAME source compiles to two different things in the
	two projects, and a fixture each would let that claim drift into two claims
	about two files.
-->
<script lang="ts">
	let { label = 'project-identity' }: { label?: string } = $props();
</script>

<p data-testid="project-identity">{label}</p>
