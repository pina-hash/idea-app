/**
 * THE CLASSROOM'S ONE PREFERENCE STORE, shared down the tree, and a reactive
 * view of it.
 *
 * The store is created ONCE by the outer classroom layout, which is not
 * remounted as the URL moves between classes and items, and handed down by
 * context so the section layout can read a default (the view a class opens
 * on) without a second store and without a second read of the profile row. A
 * surface mounted without it (a dev harness, a page outside /classroom) gets
 * null and falls back to the defaults.
 *
 * `reactivePreferences` is what lets a template read `current` and re-render
 * when it changes, WITHOUT an `$effect`: `createSubscriber` subscribes while
 * something is reading and unsubscribes when nothing is.
 */
import { getContext, setContext } from 'svelte';
import { createSubscriber } from 'svelte/reactivity';
import type { ClassroomPreferences } from './classroom';
import type { PreferenceStore } from './store';

const KEY = Symbol('idea.classroom-preferences');

export function provideClassroomPreferences(
	store: PreferenceStore<ClassroomPreferences> | null
): PreferenceStore<ClassroomPreferences> | null {
	setContext(KEY, store);
	return store;
}

export function classroomPreferences(): PreferenceStore<ClassroomPreferences> | null {
	return (getContext(KEY) as PreferenceStore<ClassroomPreferences> | null | undefined) ?? null;
}

/** A store's `current`, readable reactively from a template or a `$derived`. */
export function reactivePreferences<P extends object>(store: PreferenceStore<P>): { readonly current: P } {
	const subscribe = createSubscriber((update) => store.subscribe(() => update()));
	return {
		get current() {
			subscribe();
			return store.current;
		}
	};
}
