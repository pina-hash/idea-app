/**
 * THE SMALLEST POSSIBLE PROOF THAT EFFECTS RUN HERE.
 *
 * Measured on the node project before this split existed, and recorded in the
 * header of `tests/classroom-composer-effect-reactivity.test.ts`: a bare
 * `$effect.root` in a `.svelte.ts` module runs its effect ZERO times, because
 * `svelte` resolves to its server build and there is no scheduler. So this is
 * the one-line control for the whole capability -- if it ever reports 0 again,
 * the mount tests in this directory have gone vacuous rather than passing.
 */
import { flushSync } from 'svelte';

export function effectRunCount(): number {
	let runs = 0;
	const value = $state({ n: 0 });
	const destroy = $effect.root(() => {
		$effect(() => {
			void value.n;
			runs += 1;
		});
	});
	flushSync();
	destroy();
	return runs;
}
