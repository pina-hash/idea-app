/**
 * THE REACTIVE HALF OF `HxAnswers`, AND THE ONLY THING IN THIS SUBSYSTEM THAT
 * KNOWS WHAT A RUNE IS.
 *
 * `HxAnswers` says of itself that it owns "no DOM, no reactivity and no
 * client", and it takes `onvalues` / `onimages` / `onsaved` for exactly this:
 * the surface holds the `$state` and the controller holds the rules. That seam
 * is what lets the controller be asserted in `tests/` with no browser and no
 * Svelte at all, and it is why this is a wrapper rather than a rune inside
 * `answers.ts`.
 *
 * IT IS ONE CLASS AND NOT A HELPER PER FIELD, because what a mount needs is one
 * object satisfying `HtmlAssignmentAnswers` -- the prop `ItemDetail` takes --
 * whose three readable members move when the controller moves. Reading them
 * off three separately-declared `$state` locals at a call site is the same
 * thing written three times at every mount, which is how one of them ends up
 * not being handed down.
 *
 * NO `$effect` LIVES HERE, DELIBERATELY. A `.svelte.ts` module is outside
 * `tests/classroom-composer-effect-reactivity.test.ts`'s sweep -- it parses
 * `.svelte` files, because "caller-supplied" is a `$props()` shape -- and that
 * gap is a tripwire rather than an omission: no such module runs an effect
 * today. This one holds `$state` and plain methods, and the LIFECYCLE belongs
 * to whoever mounts it (`destroy` is exposed for exactly that).
 */

import {
	HxAnswers,
	type HxAnswersOptions,
	type HxSavedAck
} from '$lib/classroom/html-assignment/answers';
import type { HxImageState } from '$lib/classroom/html-assignment/bridge';
import type { HtmlAssignmentAnswers } from '$lib/classroom/html-assignment/mount';

/**
 * Everything `HxAnswers` takes except the three callbacks, which this owns.
 *
 * A caller passing one of them would be writing a SECOND mirror of state this
 * class already mirrors, and the two would then disagree about which is the
 * one `ItemDetail` reads. Omitting them from the type is what makes that a
 * compile error rather than a review question.
 */
export type HxAnswersStoreOptions = Omit<HxAnswersOptions, 'onvalues' | 'onimages' | 'onsaved'>;

export class HxAnswersStore implements HtmlAssignmentAnswers {
	readonly #answers: HxAnswers;
	#values = $state<Record<string, string | boolean>>({});
	#images = $state<Record<string, HxImageState>>({});
	#ack = $state<HxSavedAck | null>(null);

	constructor(options: HxAnswersStoreOptions) {
		// SEEDED FROM THE SAME OBJECT THE CONTROLLER IS SEEDED FROM, so the first
		// render already carries what the database holds. The controller copies
		// its own; taking a second copy here rather than reading it back off the
		// controller keeps this class from needing an accessor that would only
		// ever be used once.
		this.#values = { ...(options.values ?? {}) };
		this.#images = { ...(options.images ?? {}) };
		this.#answers = new HxAnswers({
			...options,
			onvalues: (values) => {
				this.#values = values;
			},
			onimages: (images) => {
				this.#images = images;
			},
			onsaved: (ack) => {
				this.#ack = ack;
			}
		});
	}

	get values(): Record<string, string | boolean> {
		return this.#values;
	}

	get images(): Record<string, HxImageState> {
		return this.#images;
	}

	get saved(): HxSavedAck | null {
		return this.#ack;
	}

	/** True while any block still owes the server a write. NOT reactive -- the
	    controller's machines are not runes -- so this answers a question asked
	    at a moment (a navigation guard, a Submit) and never drives a render. */
	get dirty(): boolean {
		return this.#answers.dirty;
	}

	/*
		THE FOUR WRITES, AS BOUND ARROW PROPERTIES RATHER THAN METHODS.

		`ItemDetail` calls them THROUGH the object it is handed, so `this` would
		survive either way -- but this object is also the thing a test or a future
		mount may destructure, and a plain method torn off a class loses `this`
		silently and throws on the first private-field read. Binding here costs
		four closures per mounted assignment and removes the question.
	*/
	change = (change: { blockId: string; field: string; value: string | boolean }): void => {
		this.#answers.change(change);
	};

	image = (image: { blockId: string; field: string; name: string; bytes: string }): void => {
		void this.#answers.image(image);
	};

	imageRemove = (image: { blockId: string; field: string }): void => {
		void this.#answers.imageRemove(image);
	};

	imageCaption = (image: { blockId: string; field: string; caption: string }): void => {
		void this.#answers.imageCaption(image);
	};

	/** Write everything still owed and wait for it to settle. */
	flush(): Promise<void> {
		return this.#answers.flush();
	}

	/** Every machine's listeners and timers down. The mount owns calling this. */
	destroy(): void {
		this.#answers.destroy();
	}
}
