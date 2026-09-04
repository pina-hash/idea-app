<script lang="ts">
	/**
	 * WHERE A PASTED SCREENSHOT LANDS, in a real browser.
	 *
	 * The composer mounts FileUploadPanel TWICE inside one element that carries
	 * its own `onpaste`, and a paste bubbles. `tests/dom/composer-attach-*` pins
	 * that routing in happy-dom, which is where the arithmetic belongs -- but
	 * happy-dom cannot run Tiptap, so the ONE case it cannot reach is the case
	 * this page exists for: a screenshot pasted into the rich-text BODY EDITOR,
	 * where ProseMirror sees the event first and may or may not consume it.
	 * That was the reason the fix is written against `claimPaste` rather than
	 * against `event.defaultPrevented`, and this is where that reasoning is
	 * actually checked against a browser instead of against the library source.
	 *
	 * WHAT IS DISPATCHED IS NOT A SYSTEM PASTE, and the report must say so. A
	 * real Ctrl+V goes through the browser's own clipboard pipeline and its
	 * permission model; what `__paste` builds is a `ClipboardEvent` carrying a
	 * real `DataTransfer` with a real `File` on it. That is much closer to the
	 * article than the plain object a node test constructs -- the event is the
	 * browser's own class, it bubbles through the real tree, and ProseMirror's
	 * real handler runs on it -- but a synthetic event is still `isTrusted:
	 * false`, and nothing here proves what the OS clipboard would have handed
	 * over. Mr Pina's check on the preview is what settles that.
	 *
	 * The composer is mounted ONCE and every case is dispatched at it in turn,
	 * with the two lists cleared between cases, so the verdicts describe one
	 * real form rather than eight freshly mounted ones.
	 */
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import type { ClassroomComposerTransports, ClassroomSection } from '$lib/classroom/classroom';

	const SECTION: ClassroomSection = {
		id: 'sec-1',
		course_id: 'course-1',
		label: 'Block 3',
		block: '3',
		teacher_email: 'teacher@boscotech.edu',
		active: true,
		course: { id: 'course-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	};

	/** In memory, no network. Nothing here is reached by a paste -- staging is
	 *  entirely local until a save, which this page never makes. */
	const transports = {
		async createItem() {
			return { ok: true as const, itemId: 'item-1' };
		},
		async updateItem() {
			return { ok: true as const };
		},
		async uploadAttachment() {
			return { ok: true as const };
		},
		async uploadInstructorAttachment() {
			return { ok: true as const };
		},
		async deleteAttachment() {
			return { ok: true as const };
		},
		async loadCategorySuggestions() {
			return [] as string[];
		}
	} as unknown as ClassroomComposerTransports;

	/** A real one-pixel PNG, so the file the clipboard carries is a picture
	 *  rather than bytes that merely claim to be one. */
	function pngFile(name: string): File {
		const bytes = Uint8Array.from(
			atob(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
			),
			(c) => c.charCodeAt(0)
		);
		return new File([bytes], name, { type: 'image/png' });
	}

	/** The panels, found by the `data-role` each already renders. */
	const panel = (role: string) =>
		document.querySelector<HTMLElement>(`.fup[data-role="${role}"]`);

	const stagedIn = (role: string) =>
		panel(role) ? panel(role)!.querySelectorAll('.fup-name').length : -1;

	/**
	 * EVERY READ IS TAKEN AFTER A FLUSH, and this is not defensive.
	 *
	 * Svelte 5 applies a state change on a microtask, so a `.fup-name` count
	 * taken on the line after `dispatchEvent` reads the DOM as it was BEFORE the
	 * paste -- measured here first: every case reported `student: 0` with
	 * `prevented: true`, i.e. the event had plainly been consumed and the list
	 * had not repainted yet. A macrotask plus a frame is what the harness's own
	 * rule about rAF-or-timeout asks for, and the timeout is the half that
	 * matters if this ever runs in a throttled tab.
	 */
	const settle = () =>
		new Promise<void>((resolve) => {
			setTimeout(() => requestAnimationFrame(() => resolve()), 0);
		});

	/** Remove every staged row from both panels, so one case cannot be read as
	 *  the leftovers of the one before it. */
	async function clearAll() {
		for (const btn of Array.from(
			document.querySelectorAll<HTMLButtonElement>('.fup-row button')
		)) {
			const label = (btn.getAttribute('aria-label') ?? btn.textContent ?? '').toLowerCase();
			if (label.includes('remove')) btn.click();
			await settle();
		}
	}

	/** Dispatch a paste carrying one PNG at `node`, and report what each list
	 *  holds afterwards. */
	async function pasteAt(
		node: Element | null
	): Promise<{ student: number; instructor: number; prevented: boolean }> {
		if (!node) return { student: -1, instructor: -1, prevented: false };
		const dt = new DataTransfer();
		dt.items.add(pngFile('shot.png'));
		const ev = new ClipboardEvent('paste', {
			clipboardData: dt,
			bubbles: true,
			cancelable: true
		});
		node.dispatchEvent(ev);
		await settle();
		return {
			student: stagedIn('attachment'),
			instructor: stagedIn('instructor'),
			prevented: ev.defaultPrevented
		};
	}

	/** A plain-TEXT paste, which must be left completely alone. */
	async function pasteTextAt(
		node: Element | null
	): Promise<{ prevented: boolean; student: number; instructor: number }> {
		if (!node) return { prevented: false, student: -1, instructor: -1 };
		const dt = new DataTransfer();
		dt.setData('text/plain', 'ordinary typing');
		const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
		node.dispatchEvent(ev);
		await settle();
		return {
			prevented: ev.defaultPrevented,
			student: stagedIn('attachment'),
			instructor: stagedIn('instructor')
		};
	}

	if (typeof window !== 'undefined') {
		const w = window as unknown as Record<string, unknown>;

		/**
		 * DOES PROSEMIRROR CONSUME AN IMAGE PASTE BEFORE THE COMPOSER SEES IT?
		 *
		 * This is the measurement the fix's design rests on, so it is taken
		 * rather than reasoned. A listener on `.rt-editor` -- the element
		 * BETWEEN the ProseMirror surface and the form carrying `onpaste` --
		 * runs after the editor's own handler and before the composer's, so
		 * `defaultPrevented` read there is exactly "did the editor already take
		 * this". Whatever the answer, the composer must still attach the
		 * screenshot; the answer only says how much a `defaultPrevented`-based
		 * fix would have cost.
		 */
		w.__prosemirrorConsumes = async () => {
			const editor = document.querySelector('.rt-editor');
			const pm = document.querySelector('.rt-editor .ProseMirror');
			if (!editor || !pm) return 'MISSING';
			let seen: boolean | null = null;
			const probe = (e: Event) => {
				seen = e.defaultPrevented;
			};
			editor.addEventListener('paste', probe);
			try {
				await clearAll();
				await pasteAt(pm);
			} finally {
				editor.removeEventListener('paste', probe);
				await clearAll();
			}
			return `prosemirror consumed image paste before the form saw it: ${seen}`;
		};

		/** The raw table, printed by the spec's prepare step so a passing run
		 *  still hands the next reader the actual counts. */
		w.__pasteTable = async () => {
			const rows: Record<string, unknown>[] = [];
			const cases: [string, () => Element | null][] = [
				['instructor panel', () => panel('instructor')],
				['student panel', () => panel('attachment')],
				['body editor (ProseMirror)', () => document.querySelector('.rt-editor .ProseMirror')],
				['title field', () => document.querySelector('.composer input[type="text"]')]
			];
			for (const [label, find] of cases) {
				await clearAll();
				const node = find();
				rows.push({ case: label, found: !!node, ...(await pasteAt(node)) });
			}
			await clearAll();
			rows.push({
				case: 'plain text at title',
				...(await pasteTextAt(document.querySelector('.composer input[type="text"]')))
			});
			await clearAll();
			return JSON.stringify(rows, null, 1);
		};

		/**
		 * The verdicts. Each names what it checked, so a probe that stops
		 * existing changes the list rather than silently shrinking what ran.
		 */
		w.__pasteVerdicts = async () => {
			const out: string[] = [];
			const one = async (
				label: string,
				node: Element | null,
				want: { student: number; instructor: number }
			) => {
				await clearAll();
				if (!node) {
					out.push(`${label} MISSING`);
					return;
				}
				const got = await pasteAt(node);
				out.push(
					got.student === want.student && got.instructor === want.instructor
						? `${label} ok`
						: `${label} student=${got.student} instructor=${got.instructor}`
				);
			};

			// Aimed at a panel: that panel stages it, and the other list does not.
			await one('instructor paste', panel('instructor'), { student: 0, instructor: 1 });
			await one('student paste', panel('attachment'), { student: 1, instructor: 0 });
			// Aimed at the form: the composer's own handler is what catches it.
			// The body editor is the case happy-dom cannot reach.
			await one('body editor paste', document.querySelector('.rt-editor .ProseMirror'), {
				student: 1,
				instructor: 0
			});
			await one('title field paste', document.querySelector('.composer input[type="text"]'), {
				student: 1,
				instructor: 0
			});

			await clearAll();
			const text = await pasteTextAt(document.querySelector('.composer input[type="text"]'));
			out.push(
				!text.prevented && text.student === 0 && text.instructor === 0
					? 'plain text untouched ok'
					: `plain text untouched prevented=${text.prevented} student=${text.student} instructor=${text.instructor}`
			);
			await clearAll();
			return out;
		};

		/** The editor is loaded dynamically and browser-only, so the page is not
		 *  measurable until it is actually in the tree. */
		const ready = () => {
			if (document.querySelector('.rt-editor .ProseMirror') && panel('attachment') && panel('instructor')) {
				document.documentElement.setAttribute('data-composer-ready', '');
				return true;
			}
			return false;
		};
		if (!ready()) {
			const timer = setInterval(() => {
				if (ready()) clearInterval(timer);
			}, 50);
		}
	}
</script>

<svelte:head><title>Composer attach harness</title></svelte:head>

<div class="cr-root">
	<div class="harness">
		<h1>Composer attach: where a pasted screenshot lands</h1>
		<p class="lede">
			The real ContentComposer, both file lists mounted. A paste is routed to the list closest to
			where it was aimed, and to the student list when it was aimed at neither.
		</p>
		<ContentComposer
			mode="create"
			kind="assignment"
			sections={[SECTION]}
			initialTargets={['sec-1']}
			{transports}
			onsaved={() => {}}
		/>
	</div>
</div>

<style>
	.harness {
		padding: 1rem;
		max-width: 72rem;
		margin: 0 auto;
	}
	h1 {
		font-size: 1.2rem;
		margin: 0 0 0.4rem;
	}
	.lede {
		color: var(--text-2);
		font-size: 0.9rem;
		margin: 0 0 1rem;
	}
</style>
