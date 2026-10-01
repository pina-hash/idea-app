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
 * to whoever mounts it (`attach` and `destroy` are exposed for exactly that).
 *
 * ---------------------------------------------------------------------------
 * WHAT IT ADDED IN LEDGER 0360 (reports d983e776, 2d83c063)
 * ---------------------------------------------------------------------------
 *
 * `status`, ONE REACTIVE OBJECT THE RAIL READS: which fields the server has
 * not acknowledged, the one save machine an indicator should speak for, the
 * last acknowledgement, and what a browser backup copy put back. The machines
 * are `SaveState`s, whose `phase` is `$state`, so a derived reading `status`
 * tracks every machine it walked; `#version` is what makes it re-walk when a
 * NEW machine appears, because the controller builds them lazily in a plain
 * `Map`.
 *
 * THE BROWSER BACKUP COPY (`./draft-mirror`), when a `mirrorViewer` is given.
 * It is READ ON `attach()`, never in the constructor: the constructor runs
 * inside the item page's `$derived` and on the server too, and a restore that
 * differed between the server render and the client's would be a hydration
 * mismatch. `attach()` is client-only and runs after mount; the frame re-sends
 * `idea:state` whenever `values` moves, so a restore landing before or after
 * the document says `ready` reaches it either way.
 */

import {
	HxAnswers,
	type HxAnswersOptions,
	type HxRestoreNotice,
	type HxSaveStatus,
	type HxSavedAck
} from '$lib/classroom/html-assignment/answers';
import type { HxImageState } from '$lib/classroom/html-assignment/bridge';
import type { HtmlAssignmentAnswers } from '$lib/classroom/html-assignment/mount';
import { HxDraftMirror, hxMirrorFrom, hxPlanRestore } from '$lib/classroom/html-assignment/draft-mirror';

/**
 * Everything `HxAnswers` takes except the three callbacks, which this owns.
 *
 * A caller passing one of them would be writing a SECOND mirror of state this
 * class already mirrors, and the two would then disagree about which is the
 * one `ItemDetail` reads. Omitting them from the type is what makes that a
 * compile error rather than a review question.
 */
export type HxAnswersStoreOptions = Omit<HxAnswersOptions, 'onvalues' | 'onimages' | 'onsaved'> & {
	/**
	 * THE SIGNED-IN VIEWER'S OWN ID, which turns the browser backup copy on.
	 * Absent or null is no mirror at all -- an instructor's working copy, a
	 * test, a deployment that has not wired it -- and `status.mirror` says `off`.
	 */
	mirrorViewer?: string | null;
};

export class HxAnswersStore implements HtmlAssignmentAnswers {
	readonly #answers: HxAnswers;
	readonly #seed: Record<string, string | boolean>;
	readonly #mirror: HxDraftMirror | null;
	#values = $state<Record<string, string | boolean>>({});
	#images = $state<Record<string, HxImageState>>({});
	#ack = $state<HxSavedAck | null>(null);
	/** Bumped whenever the controller may have made or moved a machine. */
	#version = $state(0);
	#restore = $state<HxRestoreNotice | null>(null);
	#mirrorHealth = $state<HxSaveStatus['mirror']>('off');
	#restored = false;

	constructor(options: HxAnswersStoreOptions) {
		const { mirrorViewer, ...rest } = options;
		// SEEDED FROM THE SAME OBJECT THE CONTROLLER IS SEEDED FROM, so the first
		// render already carries what the database holds. The controller copies
		// its own; taking a second copy here rather than reading it back off the
		// controller keeps this class from needing an accessor that would only
		// ever be used once.
		this.#seed = { ...(rest.values ?? {}) };
		this.#values = { ...this.#seed };
		this.#images = { ...(rest.images ?? {}) };
		this.#answers = new HxAnswers({
			...rest,
			onvalues: (values) => {
				this.#values = values;
			},
			onimages: (images) => {
				this.#images = images;
			},
			onsaved: (ack) => {
				this.#ack = ack;
				this.#version += 1;
				// An acknowledgement may be the last thing owed, which CLEARS the
				// slot; the debounce runs after the machine has moved to `saved`.
				this.#mirror?.schedule();
			}
		});
		const viewer = (mirrorViewer ?? '').trim();
		this.#mirror = viewer
			? new HxDraftMirror({
					viewerId: viewer,
					itemId: rest.itemId,
					snapshot: () =>
						this.#answers.unsavedFields().length === 0
							? null
							: hxMirrorFrom(
									rest.manifest,
									rest.itemId,
									this.#answers.values,
									this.#answers.acknowledged(),
									Date.now()
								),
					onhealth: (health) => {
						this.#mirrorHealth = health;
					}
				})
			: null;
		if (this.#mirror) this.#mirrorHealth = 'ok';
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

	/**
	 * WHAT THE RAIL NEEDS TO KNOW ABOUT SAVING, reactive (see the header). A
	 * fresh object per read, so a renderer compares fields rather than identity.
	 */
	get status(): HxSaveStatus {
		void this.#version;
		return {
			unsaved: this.#answers.unsavedFields(),
			save: this.#answers.worstMachine(),
			ack: this.#ack,
			itemId: this.#answers.itemId,
			restore: this.#restore,
			dismissRestore: this.#restore ? this.dismissRestore : null,
			mirror: this.#mirrorHealth
		};
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
		this.#version += 1;
		this.#mirror?.schedule();
	};

	image = (image: { blockId: string; field: string; name: string; bytes: string }): void => {
		void this.#answers.image(image);
		this.#version += 1;
	};

	imageRemove = (image: { blockId: string; field: string }): void => {
		void this.#answers.imageRemove(image);
		this.#version += 1;
	};

	imageCaption = (image: { blockId: string; field: string; caption: string }): void => {
		void this.#answers.imageCaption(image);
		this.#version += 1;
	};

	/** Write everything still owed and wait for it to settle. */
	flush(): Promise<void> {
		return this.#answers.flush();
	}

	/**
	 * PUT BACK WHAT THIS BROWSER KEPT, ONCE PER STORE. Client-only (it is called
	 * from `attach`), so the server render and the client's first render agree.
	 * Never throws: a mirror that cannot be read is no mirror.
	 */
	#restoreFromMirror(): void {
		if (this.#restored || !this.#mirror) return;
		this.#restored = true;
		try {
			const found = this.#mirror.read();
			if (!found) return;
			const plan = hxPlanRestore(this.#answers.manifest, found, this.#seed);
			if (!plan) {
				this.#mirror.writeNow();
				return;
			}
			this.#answers.restore(plan.values);
			this.#restore = plan.notice;
			this.#version += 1;
			this.#mirror.schedule();
		} catch {
			// Nothing a backup copy does may take the worksheet down.
		}
	}

	/** Dismiss the restore notice once it has been read. */
	dismissRestore = (): void => {
		this.#restore = null;
	};

	/**
	 * The durability net over every block, including the blocks whose machines
	 * do not exist yet. Handed straight back from an `$effect` by the mounting
	 * surface, exactly as `AssignmentEngine` and the other five do -- see
	 * `HxAnswers.attach` for why it cannot be one pair of listeners.
	 *
	 * IT IS ALSO WHERE THE BACKUP COPY IS READ (see the header), and where a
	 * pending copy is written synchronously when the tab is hidden or closing:
	 * the copy is the half of the net that survives when the write cannot.
	 *
	 * NOT CALLED FROM AN `$effect` IN HERE. This module deliberately runs no
	 * effect (see the header): a `.svelte.ts` is outside
	 * `tests/classroom-composer-effect-reactivity.test.ts`'s sweep, and that gap
	 * is a tripwire rather than an omission. The LIFECYCLE belongs to whoever
	 * mounts this, which is the same rule `destroy` already follows.
	 */
	attach(): () => void {
		this.#restoreFromMirror();
		const off = this.#answers.attach();
		const mirror = this.#mirror;
		// THE COPY IS WRITTEN BEFORE THE MACHINES GO DOWN, in every teardown:
		// the snapshot asks the machines what is unsaved, and once they are
		// destroyed the answer is "nothing", which would CLEAR the slot holding
		// exactly the work a navigation away is about to abandon.
		if (!mirror || typeof document === 'undefined' || typeof window === 'undefined') {
			return () => {
				mirror?.destroy();
				off();
			};
		}
		const onHidden = () => {
			if (document.visibilityState === 'hidden') mirror.writeNow();
		};
		const onPageHide = () => mirror.writeNow();
		document.addEventListener('visibilitychange', onHidden);
		window.addEventListener('pagehide', onPageHide);
		return () => {
			document.removeEventListener('visibilitychange', onHidden);
			window.removeEventListener('pagehide', onPageHide);
			mirror.destroy();
			off();
		};
	}

	/** Every machine's listeners and timers down. The mount owns calling this.
	    The copy goes first, for the reason `attach`'s teardown gives. */
	destroy(): void {
		this.#mirror?.destroy();
		this.#answers.destroy();
	}
}
