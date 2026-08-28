/**
 * A `$state` array with a read-then-write mutator, which is the whole shape
 * this fixture exists to supply.
 *
 * It is a deliberate copy of the classroom dev harness's own `note()`
 * (`src/routes/dev/classroom/+page.svelte`), down to the `[new, ...old]` and
 * the cap: that function is what actually took the composer down with
 * `effect_update_depth_exceeded` the first time somebody opened the harness,
 * and a fixture that merely WRITES state would not reproduce it. The read is
 * what joins the calling effect's dependency set; the write is what
 * re-triggers it. Both, in one synchronous statement, is the defect.
 *
 * A `.svelte.ts` module because `$state` is a rune and only the svelte plugin
 * compiles one. It runs in the DOM project, so its effects and its scheduler
 * are the real client ones.
 */
export interface ReactiveLog {
	/** Reading this SUBSCRIBES, which is half of what makes the fixture bite. */
	readonly entries: readonly string[];
	/** Reads `entries` and writes it, in one statement, synchronously. */
	note(call: string, args: unknown): void;
}

export function createReactiveLog(): ReactiveLog {
	let entries = $state<string[]>([]);
	return {
		get entries() {
			return entries;
		},
		note(call: string, args: unknown) {
			entries = [`${call} ${JSON.stringify(args)}`, ...entries].slice(0, 60);
		}
	};
}
