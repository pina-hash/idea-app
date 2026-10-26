<script lang="ts">
	/**
	 * THE TWO-TEAMMATE HARNESS (ledger 0436). A student's page mounts the REAL
	 * pieces the item page mounts -- `HxAnswersStore`, `TeamDocSession`,
	 * `TeamDocGate` (the opening line, the waiting sentence, the team bar) and
	 * `HtmlAssignmentFrame` over the team fixture document -- with transports
	 * that reach the in-memory stand-in at `./api` and a live bus fed by its
	 * server-sent notices, so two browser contexts are two teammates.
	 *
	 * `window.__teamDoc` is a plain snapshot of what is rendered, for the
	 * browser pass; it holds no state of its own.
	 */
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import HtmlAssignmentFrame from '$lib/classroom/html-assignment/HtmlAssignmentFrame.svelte';
	import TeamDocGate from '$lib/classroom/html-assignment/TeamDocGate.svelte';
	import { HxAnswersStore } from '$lib/classroom/html-assignment/answers-store.svelte';
	import { TeamDocSession } from '$lib/classroom/html-assignment/team-doc-session.svelte';
	import { TEAM_FIXTURE_FIELDS, TEAM_FIXTURE_MANIFEST } from '$lib/classroom/html-assignment/team-fixture';
	import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
	import type { ClassroomLive, ClassroomLiveTopic } from '$lib/classroom/live';

	let { data } = $props();

	const manifest = TEAM_FIXTURE_MANIFEST as unknown as HtmlAssignmentManifest;
	const itemId = 'fixture-item';

	async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
		const res = await fetch('/dev/team-document/api', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		return (await res.json()) as Record<string, unknown>;
	}

	/** The stand-in's notices, as the ClassroomLive interface the item page uses. */
	function sseLive(): ClassroomLive {
		const listeners = new Map<string, Set<(t: ClassroomLiveTopic) => void>>();
		if (browser) {
			const source = new EventSource('/dev/team-document/api');
			source.onmessage = (e) => {
				const n = JSON.parse(e.data) as { key: string; topic: ClassroomLiveTopic };
				for (const fn of listeners.get(n.key) ?? []) fn(n.topic);
			};
		}
		return {
			subscribe(key, onChange, onStatus) {
				const set = listeners.get(key) ?? new Set();
				listeners.set(key, set);
				set.add(onChange);
				onStatus?.('live');
				return () => set.delete(onChange);
			},
			announce(key, topic) {
				void call({ op: 'announce', key, topic });
			}
		};
	}

	// svelte-ignore state_referenced_locally
	const as = data.as;
	const student = untrack(() => data.student);
	const live = sseLive();
	const answers = student
		? new HxAnswersStore({
				itemId,
				manifest,
				transports: {
					saveResponse: async (_item: string, blockId: string, value: unknown) => {
						const out = await call({ op: 'save', as, block: blockId, value });
						return { ok: true, data: out } as never;
					}
				} as never,
				values: {},
				images: {},
				fileIds: new Map()
			})
		: null;
	const session =
		student && answers
			? new TeamDocSession({
					itemId,
					sectionId: `section-${student.section}`,
					manifest,
					answers,
					live,
					transports: {
						read: () => call({ op: 'read', as }),
						lock: (_item, block, take) => call({ op: 'lock', as, block, take })
					}
				})
			: null;

	$effect(() => {
		if (!session || !answers) return;
		const offAnswers = untrack(() => answers.attach());
		const offSession = untrack(() => session.start());
		return () => {
			offSession();
			offAnswers();
		};
	});
	$effect(() => {
		const ack = answers?.saved;
		if (ack?.ok && session) untrack(() => session.announceSaved());
	});

	let ready = $state(false);
	$effect(() => {
		if (!browser || !session || !answers) return;
		(window as unknown as { __teamDoc: unknown }).__teamDoc = {
			as,
			ready,
			loaded: session.loaded,
			waiting: session.waiting,
			team: session.doc?.team?.name ?? null,
			teamId: session.doc?.team?.id ?? null,
			states: $state.snapshot(session.fieldStates),
			values: $state.snapshot(answers.values),
			saved: $state.snapshot(answers.saved)
		};
	});

	// The teacher's panel.
	let log = $state<unknown[]>([]);
	async function teacher(op: string, args: Record<string, string> = {}) {
		await call({ op, args });
		const out = await call({ op: 'log' });
		log = (out.log as unknown[]) ?? [];
	}
</script>

<svelte:head><title>Team document harness</title></svelte:head>

<main class="cr-root cr-plate tdh">
	{#if student && session && answers}
		<p class="tdh-as" data-testid="tdh-as">Signed in as {student.name}, class {student.section}</p>
		<TeamDocGate {session}>
			<HtmlAssignmentFrame
				src="/dev/team-document/doc"
				title="Launcher plan (fixture)"
				fieldToBlockId={TEAM_FIXTURE_FIELDS}
				values={answers.values}
				images={answers.images}
				saved={answers.saved}
				teamState={session.statePayload}
				onready={() => (ready = true)}
				onchange={(c) => {
					if (session.shares(c.blockId)) {
						if (!session.mayWrite(c.field)) return;
						session.changed(c.blockId);
					}
					answers.change(c);
				}}
				onfieldfocus={(f) => void session.focus(f.blockId, f.field)}
				onfieldblur={(f) => void session.blur(f.blockId)}
			/>
		</TeamDocGate>
	{:else}
		<section class="card tdh-panel" data-testid="tdh-teacher">
			<h1 class="section-label">Teacher controls</h1>
			<div class="tdh-keys">
				<button class="btn" data-testid="post-a" onclick={() => teacher('post', { section: 'A' })}>Post class A</button>
				<button class="btn secondary" data-testid="unpost-a" onclick={() => teacher('unpost', { section: 'A' })}>Unpost class A</button>
				<button class="btn secondary" data-testid="move-s2" onclick={() => teacher('move', { student: 's2', team: 'A2' })}>Move Ben to Team 2</button>
				<button class="btn secondary" data-testid="reset" onclick={() => teacher('reset')}>Reset</button>
				<button class="btn ghost" data-testid="read-log" onclick={() => teacher('log')}>Read the log</button>
			</div>
			<pre class="tdh-log" data-testid="tdh-log">{JSON.stringify(log, null, 1)}</pre>
		</section>
	{/if}
</main>

<style>
	.tdh {
		max-width: 64rem;
		margin: 0 auto;
		padding: 1rem;
	}
	.tdh-as {
		font-family: var(--font-mono);
		color: var(--text-2, var(--dim));
	}
	.tdh-keys {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.tdh-log {
		max-height: 20rem;
		overflow: auto;
		font-size: 0.75rem;
	}
</style>
