<script lang="ts">
	/**
	 * Dev harness for the REAL `SharePanel` and `PartsPanel` -- never a copy of
	 * their markup, and never a copy of `checkout.ts` either: the controller is
	 * the shipping one, driven by an in-memory transport that answers exactly
	 * what `0207`'s RPCs answer.
	 *
	 * A NEW ROUTE RATHER THAN A STATE ON `/dev/ideacad`. That page belongs to
	 * ledger 0171 and mounts `BladeEditor`; this bundle owns neither. A new URL
	 * collides with nobody, and `tools/browser-verify/routes.mjs` derives a
	 * spec's filename from its own path, so two lanes adding two routes always
	 * produce two different files.
	 *
	 * States by query string:
	 *   role=owner                 the owner: share form, three parts, reassign
	 *   role=editor                a shared editor: claim and release, no sharing
	 *   role=viewer                VIEW ONLY -- the state whose whole point is
	 *                              that not one control that would be refused is
	 *                              on screen
	 *   role=owner&state=held      a part somebody else is holding live, so the
	 *                              blocked row and its refusal are reachable
	 *   role=editor&state=lost     the TERMINAL state: this client held a part
	 *                              and the owner moved it, which is the case a
	 *                              student has to SEE rather than discover on a
	 *                              refused write
	 *   role=editor&state=expiring a hold inside the warning fraction of the
	 *                              window, which is the other half of the same
	 *                              honesty and cannot be reached by waiting
	 *
	 * THE TRANSPORT IS IN MEMORY AND ANSWERS THE REAL SHAPES. Every method
	 * returns the exact `IdeacadHoldResult` its migration returns, reasons
	 * included, so the controller's own branches are exercised rather than a
	 * simplification of them. What it does NOT do is enforce anything: the
	 * database is the boundary and a harness that re-implemented the rules would
	 * be a second copy of them.
	 */
	import SharePanel from '$lib/ideacad/ui/SharePanel.svelte';
	import PartsPanel from '$lib/ideacad/ui/PartsPanel.svelte';
	import { createIdeacadCheckout, type IdeacadCheckoutState } from '$lib/ideacad/checkout';
	import type {
		IdeacadAssembly,
		IdeacadAssemblyPart,
		IdeacadAssemblyTransports,
		IdeacadHoldResult
	} from '$lib/ideacad/assembly';
	import type { IdeacadGrant } from '$lib/ideacad/sharing';

	/* READ ONCE INTO A `const`. This file is in runes mode -- it declares
	   `$state` below -- so a plain `let` reassigned after declaration and then
	   read in the template earns `non_reactive_update`, which would move the
	   repository's warning baseline for a value that never changes after the
	   first frame. `/dev/ideacad` gets away with the reassigning form only
	   because it declares no rune at all. */
	function query(key: string, fallback: string): string {
		if (typeof window === 'undefined') return fallback;
		return new URLSearchParams(location.search).get(key) ?? fallback;
	}
	const role = query('role', 'owner');
	const variant = query('state', '');

	const OWNER = 'ana.reyes@boscotech.net';
	const MATE = 'luis.ortega@boscotech.net';
	const VIEWER = 'sam.chen@boscotech.net';
	const me = role === 'owner' ? OWNER : role === 'viewer' ? VIEWER : MATE;

	/** The window `_ideacad_hold_window()` states, as `ideacad_assembly` returns it. */
	const WINDOW_SECONDS = 600;
	const DOC = '11111111-2222-3333-4444-555555555555';

	const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

	function part(
		id: string,
		position: number,
		name: string,
		heldBy: string | null,
		beatOffsetMs = 0
	): IdeacadAssemblyPart {
		const live = heldBy !== null && beatOffsetMs > -WINDOW_SECONDS * 1000;
		return {
			id,
			position,
			name,
			activeConceptId: `concept-${id}`,
			heldBy,
			heldAt: heldBy ? iso(beatOffsetMs) : null,
			holdBeatAt: heldBy ? iso(beatOffsetMs) : null,
			holdRevision: heldBy ? 3 : 1,
			holdLive: live,
			holdIsMine: live && heldBy === me,
			conceptCount: 2
		};
	}

	/**
	 * `state=expiring` IS A CLIENT WHOSE BEATS ARE NOT LANDING, which is the only
	 * shape in which a hold can actually run down.
	 *
	 * THE FIRST ATTEMPT SEEDED AN OLD BEAT AND NOTHING ELSE, AND IT DID NOT WORK
	 * -- caught by rasterizing and looking at it. The controller is the shipping
	 * one, so its heartbeat landed, the fake transport moved `holdBeatAt` to now,
	 * and the chip read "Your part for 10 min 00 s": a live client keeps its hold
	 * alive, correctly, and the warning state was unreachable.
	 *
	 * So this seeds the old beat AND makes the heartbeat throw, which is the real
	 * case the warning exists for -- the network is what went away, so no server
	 * answer is coming and the controller's OWN clock is the only thing that can
	 * tell the student. 40 seconds left, which is inside the 25% warning fraction
	 * of a 600-second window and comfortably longer than a browser pass.
	 */
	const MY_BEAT_MS = variant === 'expiring' ? -(WINDOW_SECONDS - 40) * 1000 : -5_000;

	/* A VIEWER'S FIXTURE HAS SOMEBODY HOLDING A PART, ALWAYS. The whole claim
	   about the viewer state is that they are shown the assembly and not one
	   control -- and "shown the assembly" means learning who has what. A fixture
	   in which every part is free would let the route pass its absence counts
	   while proving nothing about the half a viewer actually reads. */
	let parts: IdeacadAssemblyPart[] = [
		part('p1', 1, 'Blade body', variant === 'held' || role === 'viewer' ? MATE : null, -4_000),
		part(
			'p2',
			2,
			'Hub and bore',
			role === 'editor' && (variant === 'lost' || variant === 'expiring') ? me : null,
			MY_BEAT_MS
		),
		part('p3', 3, 'Tip weight', null)
	];

	const assemblyOf = (): IdeacadAssembly => ({
		documentId: DOC,
		viewer: me,
		isOwner: role === 'owner',
		canWrite: role !== 'viewer',
		holdWindowSeconds: WINDOW_SECONDS,
		holdRevisionTotal: parts.reduce((n, p) => n + p.holdRevision, 0),
		parts: parts.map((p) => ({
			...p,
			holdLive: p.heldBy !== null && Date.parse(p.holdBeatAt ?? '') > Date.now() - WINDOW_SECONDS * 1000,
			holdIsMine: p.heldBy === me
		}))
	});

	const find = (id: string) => parts.find((p) => p.id === id)!;

	const transports: IdeacadAssemblyTransports = {
		async assembly() {
			return assemblyOf();
		},
		async claimPart(partId): Promise<IdeacadHoldResult> {
			const p = find(partId);
			const live = p.heldBy !== null && Date.parse(p.holdBeatAt ?? '') > Date.now() - WINDOW_SECONDS * 1000;
			if (live && p.heldBy !== me) {
				return {
					ok: false,
					reason: 'held',
					partId,
					heldBy: p.heldBy,
					holdBeatAt: p.holdBeatAt,
					holdRevision: p.holdRevision
				};
			}
			p.heldBy = me;
			p.heldAt = iso(0);
			p.holdBeatAt = iso(0);
			p.holdRevision += 1;
			parts = [...parts];
			return { ok: true, reason: 'claimed', partId, heldBy: me, holdRevision: p.holdRevision };
		},
		async releasePart(partId): Promise<IdeacadHoldResult> {
			const p = find(partId);
			if (p.heldBy === null) {
				return { ok: true, reason: 'already_free', partId, holdRevision: p.holdRevision };
			}
			if (p.heldBy !== me && role !== 'owner') {
				return {
					ok: false,
					reason: 'not_yours',
					partId,
					heldBy: p.heldBy,
					holdRevision: p.holdRevision
				};
			}
			p.heldBy = null;
			p.heldAt = null;
			p.holdBeatAt = null;
			p.holdRevision += 1;
			parts = [...parts];
			return { ok: true, reason: 'released', partId, holdRevision: p.holdRevision };
		},
		async beatPart(partId, holdRevision): Promise<IdeacadHoldResult> {
			/* THE DISCONNECTED CLIENT. A throw is what a dead network produces,
			   and it is deliberately not a refusal: nothing was decided, so the
			   controller must NOT go terminal on it -- only its own clock may,
			   once the window has actually passed. */
			if (variant === 'expiring') throw new Error('network down');
			const p = find(partId);
			if (p.heldBy !== me || p.holdRevision !== holdRevision) {
				return { ok: false, reason: 'lost', partId, heldBy: p.heldBy, holdRevision: p.holdRevision };
			}
			p.holdBeatAt = iso(0);
			parts = [...parts];
			return {
				ok: true,
				reason: 'beating',
				partId,
				holdBeatAt: p.holdBeatAt,
				holdRevision: p.holdRevision
			};
		},
		async assignPart(partId, email): Promise<IdeacadHoldResult> {
			const p = find(partId);
			const previous = p.heldBy;
			if ((email ?? null) === previous) {
				return { ok: true, reason: 'unchanged', partId, heldBy: previous, holdRevision: p.holdRevision };
			}
			p.heldBy = email;
			p.heldAt = email ? iso(0) : null;
			p.holdBeatAt = email ? iso(0) : null;
			p.holdRevision += 1;
			parts = [...parts];
			return {
				ok: true,
				reason: email ? 'assigned' : 'cleared',
				partId,
				heldBy: email,
				previousHolder: previous,
				holdRevision: p.holdRevision
			};
		}
	};

	/* The SHIPPING controller, with its timers shortened so a browser pass is
	   seconds rather than minutes. The rules are unchanged; only the cadence is. */
	const checkout = createIdeacadCheckout(transports, { beatMs: 2_000, pollMs: 3_000, tickMs: 500 });
	let cs = $state<IdeacadCheckoutState | null>(null);
	checkout.subscribe((s) => (cs = s));
	void checkout.open(DOC);

	/**
	 * `state=lost` drives the TERMINAL path through the real controller rather
	 * than setting a flag: the owner reassigns the part this client holds, the
	 * next poll reads a moved generation, and `holdLostAgainst` is what produces
	 * the terminal notice. A harness that published `phase: 'lost'` directly
	 * would be measuring an arrangement the controller has no path to.
	 */
	if (variant === 'lost') {
		setTimeout(() => {
			const p = find('p2');
			p.heldBy = OWNER;
			p.holdBeatAt = iso(0);
			p.holdRevision += 1;
			parts = [...parts];
			void checkout.refresh();
		}, 400);
	}

	/* Sharing. The owner sees the form; nobody else does, which is `0205`'s rule
	   and `ideacadCanShare`'s answer rather than a branch in this file. */
	let grants = $state<IdeacadGrant[]>([
		{ granteeEmail: MATE, role: 'editor', grantedBy: OWNER, grantedAt: '2026-09-10T17:00:00Z' },
		{ granteeEmail: VIEWER, role: 'viewer', grantedBy: OWNER, grantedAt: '2026-09-11T17:00:00Z' }
	]);
	const documentRole = role === 'owner' ? 'owner' : role === 'editor' ? 'editor' : 'viewer';

	async function onshare(email: string, r: 'viewer' | 'editor') {
		/* The one refusal the DATABASE owns, reproduced verbatim so the surface's
		   verbatim-rendering rule is actually exercised by something. */
		if (!email.endsWith('@boscotech.net')) {
			throw new Error('You can only share this with a classmate in this class.');
		}
		grants = [
			...grants.filter((g) => g.granteeEmail !== email),
			{ granteeEmail: email, role: r, grantedBy: OWNER, grantedAt: iso(0) }
		].sort((a, b) => a.granteeEmail.localeCompare(b.granteeEmail));
	}
	async function onunshare(email: string) {
		grants = grants.filter((g) => g.granteeEmail !== email);
	}

	/**
	 * THE HARNESS'S OWN CLAIMS, as verdicts a route spec compares against an
	 * exact list. Geometry is asked HERE because only a real browser has a layout
	 * engine: `tests/dom/` reads every box as zero and would pass on all of it.
	 */
	function verdicts(): string[] {
		const out: string[] = [];
		const say = (claim: string, ok: boolean) => out.push(`${claim} ${ok ? 'ok' : 'FAILED'}`);
		const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
		const all = (sel: string) => [...document.querySelectorAll(sel)];
		const rows = all('[data-testid="ideacad-part-row"]');
		const panel = box('[data-testid="ideacad-parts"]');

		say('the parts list is on screen', !!panel && panel.width > 0 && panel.height > 0);
		say('every part has a row', rows.length === 3);
		say(
			'nothing is wider than the window',
			document.documentElement.scrollWidth <= document.documentElement.clientWidth + 0.5
		);
		/* THE CONTROLS ARE INSIDE THEIR PANEL. Ledger 0186 found a panel 446px
		   over its box, and this Chromium paints no scrollbar into a screenshot
		   at any colour, so a control past the edge is invisible to the eye and
		   to every content check. Only a geometric read tells them apart. */
		say(
			'every control sits inside the panel that owns it',
			all('[data-testid="ideacad-parts"] button, [data-testid="ideacad-parts"] select').every((el) => {
				const r = el.getBoundingClientRect();
				return r.width > 0 && r.left >= (panel?.left ?? 0) - 0.5 && r.right <= (panel?.right ?? 0) + 0.5;
			})
		);
		const share = box('[data-testid="ideacad-share"]');
		if (share) {
			say(
				'every sharing control sits inside the sharing panel',
				all('[data-testid="ideacad-share"] button, [data-testid="ideacad-share"] input, [data-testid="ideacad-share"] select').every(
					(el) => {
						const r = el.getBoundingClientRect();
						return r.width > 0 && r.left >= share.left - 0.5 && r.right <= share.right + 0.5;
					}
				)
			);
		}
		/* A SELECT'S OWN MARKER, which is the defect ledger 0186 caught by
		   looking: a label beside a select clipped it and cut off exactly the
		   part that mattered. A stacked label cannot, and the way to prove it is
		   that the select is as wide as the box reserved for it. */
		const picker = document.querySelector('[data-testid="ideacad-part-assign"]');
		if (picker) {
			const p = picker.getBoundingClientRect();
			const wrap = picker.parentElement!.getBoundingClientRect();
			say('the reassign picker fills the width reserved for it', p.width >= wrap.width - 1);
			say('its label is above it, not beside it', p.top > wrap.top + 1);
		}
		/* THE SAME CLAIM ON THE SHARE PANEL'S OWN PICKER, and it is here because
		   the reassign check ALONE passed over a real defect: a select in an
		   implicit `auto` grid track is sized by its longest OPTION rather than
		   by its field, and the reassign picker happened to escape only because
		   an email address is wider than its 13rem box. The role picker's
		   options are two short words, so it came out 103px in a 176px field
		   with 80px of dead gap beside it -- at both widths, invisible to every
		   content check, and caught by rasterizing and looking. */
		const rolePicker = document.querySelector('[data-testid="ideacad-share-form"] select');
		if (rolePicker) {
			const p = rolePicker.getBoundingClientRect();
			const wrap = rolePicker.parentElement!.getBoundingClientRect();
			say('the viewer-or-editor picker fills the width reserved for it', p.width >= wrap.width - 1);
			say('its label is above it, not beside it', p.top > wrap.top + 1);
		}
		return out;
	}

	/** Whether a viewer is shown anything that would be refused. An ABSENCE
	 *  claim, reported with the positive control beside it. */
	function writeControls(): { claim: number; release: number; assign: number; share: number; rows: number } {
		const n = (sel: string) => document.querySelectorAll(sel).length;
		return {
			claim: n('.act.claim'),
			release: n('.act.release'),
			assign: n('[data-testid="ideacad-part-assign"]'),
			share: n('[data-testid="ideacad-share-form"]'),
			rows: n('[data-testid="ideacad-part-row"]')
		};
	}

	if (typeof window !== 'undefined') {
		const w = window as unknown as Record<string, unknown>;
		w.__ideacadTeamVerdicts = verdicts;
		w.__ideacadTeamControls = writeControls;
		w.__ideacadTeamState = () => cs;
	}
</script>

<svelte:head><title>IdeaCAD team harness</title></svelte:head>

<main class="harness">
	<h1>IdeaCAD: sharing and part checkout</h1>
	<div class="cols">
		<SharePanel
			role={documentRole}
			ownerEmail={OWNER}
			{grants}
			onshare={role === 'owner' ? onshare : undefined}
			onunshare={role === 'owner' ? onunshare : undefined}
		/>
		<PartsPanel
			assembly={cs?.assembly ?? null}
			myPartId={cs?.myPartId ?? null}
			secondsLeft={cs?.secondsLeft ?? null}
			phase={cs?.phase ?? 'idle'}
			notice={cs?.notice ?? null}
			teammates={grants.map((g) => g.granteeEmail)}
			onclaim={role === 'viewer' ? undefined : (id) => void checkout.claim(id)}
			onrelease={role === 'viewer' ? undefined : (id) => void checkout.release(id)}
			onassign={role === 'owner' ? (id, email) => void checkout.assign(id, email) : undefined}
			ondismiss={() => checkout.clearNotice()}
		/>
	</div>
</main>

<style>
	.harness {
		padding: 1rem;
		display: grid;
		gap: 1rem;
	}
	h1 {
		margin: 0;
		font-size: 1.2rem;
		color: var(--text-1);
	}
	/* Two panels of UNEQUAL HEIGHT side by side, so a multi-column container and
	   never a grid: a grid ROW is as tall as its tallest member, which kills the
	   short panel's column for the whole height of the long one. `column-width`
	   with a COUNT CEILING, because multicol has no `auto-fit` and would
	   otherwise leave a third empty column beside two panels. */
	.cols {
		columns: 26rem 2;
		column-gap: 1rem;
	}
	.cols > :global(*) {
		break-inside: avoid;
		/* Multicol has no row gap; the margin is it. */
		margin-bottom: 1rem;
	}
</style>
