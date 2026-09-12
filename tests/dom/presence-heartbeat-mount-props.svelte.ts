// tests/dom/presence-heartbeat-mount-props.svelte.ts
//
// A REACTIVE PROPS CELL, kept out of the assertions that use it for the reason
// `mount.ts` states, and a `.svelte.ts` because runes do not compile inside a
// `.test.ts`.
//
// WHY THIS EXISTS AT ALL. `tests/dom/mount.ts` mounts with a PLAIN props object,
// which is right for every assertion that has ever needed it -- a component is
// mounted, driven and read. It cannot express the one thing ledger 0172 has to
// measure: what happens when a caller CHANGES a prop underneath a live mount.
// `mount.ts` is ledger 0152's file and is not this bundle's to widen, so the
// cell lives here instead, named to match this bundle's own surface.
//
// THE PROPS OBJECT IS `$state`, which is what makes an update propagate the way
// a route's `$derived` transport would. Without it a prop write lands on a plain
// object nothing is watching, and a test asserting "the component ignored it"
// would pass because nothing was ever offered.
import { flushSync, mount, unmount } from 'svelte';
import type { Component } from 'svelte';

export interface LiveMount {
	target: HTMLElement;
	/** Write a prop. Reactive: the component sees it if it is reading it. */
	set(key: string, value: unknown): void;
	flush(): void;
	stop(): Promise<void>;
}

export function mountWithLiveProps(
	component: Component<Record<string, unknown>>,
	initial: Record<string, unknown>
): LiveMount {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const props = $state<Record<string, unknown>>({ ...initial });
	const app = mount(component, { target, props });
	flushSync();
	let stopped = false;
	return {
		target,
		set(key, value) {
			props[key] = value;
			flushSync();
		},
		flush: () => flushSync(),
		async stop() {
			if (stopped) return;
			stopped = true;
			await unmount(app, { outro: false });
			target.remove();
		}
	};
}
