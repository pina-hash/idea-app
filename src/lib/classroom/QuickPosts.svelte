<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import Disclosure from '$lib/Disclosure.svelte';
	import QuickPostComposer from '$lib/classroom/QuickPostComposer.svelte';
	import AttachmentList from '$lib/classroom/AttachmentList.svelte';
	import type { ClassroomAttachment, ClassroomSection } from '$lib/classroom/classroom';
	import type { ClassroomLive } from '$lib/classroom/live';
	import { PollSignedOut, startPoller, type Poller, type PollOutcome } from '$lib/classroom/poll';
	import { pollSessionKey, pollSignedOut } from '$lib/classroom/poll-session';
	import {
		QUICK_POSTS_POLL_MS,
		QUICK_POST_GLYPH,
		QUICK_POST_NOTICE_JITTER_MS,
		QUICK_POST_SHOWN,
		quickPostClassWords,
		quickPostFileSrc,
		quickPostLimits,
		quickPostLinks,
		quickPostNextChange,
		quickPostPostedWords,
		quickPostRefusalWords,
		quickPostRuns,
		quickPostShowing,
		quickPostSkewMs,
		quickPostSplit,
		quickPostUntilWords,
		type QuickPost,
		type QuickPostBoard,
		type QuickPostCreateResult,
		type QuickPostFile,
		type QuickPostTransports
	} from '$lib/classroom/quick-posts';

	/**
	 * THE CLASS'S NOTICES, DIRECTLY UNDER THE CLASS HEADER (ledger 0360, report
	 * R22): a teacher's quick posts, which a student sees at the top of the class
	 * without opening anything, and which disappear on their own when they end.
	 *
	 * UNMISTAKABLE, AND NEVER BY COLOUR ALONE. Each notice is a raised plate
	 * panel with a gold stripe down its leading edge, a megaphone, the word
	 * "Notice", and its end in words ("Until 3:00 PM today"). The body is the
	 * room's full-strength ink, its line breaks kept, and a link in it is a real
	 * link plus a 44px "Open <site>" key under it (at most three).
	 *
	 * HOW IT STAYS CURRENT, CHEAPEST FIRST:
	 *   1. AN END NEEDS NO NETWORK. The read carried every end, so a timer set to
	 *      the next one hides the notice at that moment on every open page, with
	 *      the server's clock corrected for when a device's is a few minutes off.
	 *   2. A TEACHER'S POST OR TAKE-DOWN IS ANNOUNCED on the class's live channel,
	 *      and each page that hears it re-reads after a random wait of up to
	 *      eight seconds, so a class does not ask in the same second.
	 *   3. THE FLOOR is the shared poller (ledger 0357) at `QUICK_POSTS_POLL_MS`,
	 *      ten minutes, with its own rules: one call in flight, one per tab
	 *      return, out of step, paused while hidden, a backoff on failure, and a
	 *      full stop handed to the app's signed-out handling.
	 *
	 * ABSENCE IS THE MECHANISM. A null `board` (the page load could not read,
	 * or the database has no quick posts yet) renders nothing and polls nothing.
	 * No `transports` means no refresh, no take down and no composer. A student
	 * never sees a manager's line or a Take down key: the board says who manages.
	 *
	 * A LONG NOTICE SHOWS A LEAD AND FOLDS THE REST (0233, report R04: "quick
	 * post shouldnt take up too much screen space ... if its a longer one it
	 * should be collapsible"). `quickPostSplit` is the one rule of where the
	 * lead ends; the rest is the one `Disclosure`, closed on arrival for
	 * everyone, a person's own press remembered per notice, and in the DOM
	 * either way so it prints. A notice's files sit under its words: pictures as
	 * small tiles that open the Lightbox on that notice's whole picture set,
	 * everything else as a download row (`AttachmentList compact`), each through
	 * the notice-file route, which signs a download and never serves inline.
	 */
	let {
		board,
		sectionId,
		transports = null,
		live = null,
		composing = false,
		oncomposerclose = null,
		sections = [],
		viewerEmail = null,
		pollMs = QUICK_POSTS_POLL_MS,
		noticeJitterMs = QUICK_POST_NOTICE_JITTER_MS,
		fileSrc = quickPostFileSrc
	}: {
		/** The page load's read. Null: no region, no poll. */
		board: QuickPostBoard | null;
		sectionId: string;
		transports?: QuickPostTransports | null;
		/** The class's live notice bus, shared with the hall pass and the queue. */
		live?: ClassroomLive | null;
		/** The header's Quick post key is pressed: the composer is open here. */
		composing?: boolean;
		/** The composer closed itself (posted, or cancelled). */
		oncomposerclose?: (() => void) | null;
		/** Every section the manager may post to (the page already loaded them). */
		sections?: ClassroomSection[];
		/** Whose classes "All my classes" means. */
		viewerEmail?: string | null;
		/** The refresh floor. The class page never passes it; a harness does. */
		pollMs?: number;
		/** The live notice's random wait. A harness and a test pass 0. */
		noticeJitterMs?: number;
		/** Where a notice file's bytes come from. The class page never passes it; a harness does. */
		fileSrc?: (fileId: string) => string;
	} = $props();

	/**
	 * The page load's answer, overlaid with whatever this page has since learned
	 * (a refresh, its own post, its own take-down): HallPass's `local` shape,
	 * keyed on WHICH page-load answer it overlays, so a reload or another class
	 * makes the page load win again.
	 */
	let local = $state.raw<{ over: QuickPostBoard | null; board: QuickPostBoard } | null>(null);
	const shown = $derived(local && local.over === board ? local.board : board);
	const loaded = $derived(board !== null);

	/** The device clock, and its correction to the server's from the last read. */
	let nowMs = $state(Date.now());
	// svelte-ignore state_referenced_locally
	let skew = $state(board ? quickPostSkewMs(board.now, Date.now()) : 0);
	const at = $derived(nowMs + skew);
	const visible = $derived((shown?.posts ?? []).filter((p) => quickPostShowing(p, at)));
	const first = $derived(visible.slice(0, QUICK_POST_SHOWN));
	const rest = $derived(visible.slice(QUICK_POST_SHOWN));
	const manages = $derived(shown?.manages === true);

	/** What this page last did, for the line that survives the composer closing. */
	let ack = $state<string | null>(null);
	/** A take-down refusal, in the database's words. */
	let problem = $state<string | null>(null);
	/** What a screen reader hears when a refresh brings a notice. */
	let said = $state('');
	let armed = $state<string | null>(null);
	let busy = $state<string | null>(null);

	/**
	 * THE NEXT CHANGE THAT NEEDS NO SERVER: the soonest end ahead, or the
	 * school's midnight (an end that read "tomorrow" now reads "today"). One
	 * timer, re-armed whenever the board or the clock moves.
	 */
	$effect(() => {
		const posts = shown?.posts ?? [];
		const t = at;
		const next = quickPostNextChange(posts, t);
		if (next === null) return;
		const wait = Math.min(Math.max(0, next - t) + 25, 2_000_000_000);
		const timer = setTimeout(() => {
			nowMs = Date.now();
		}, wait);
		return () => clearTimeout(timer);
	});

	/** A refresh answer, applied over the page load it was asked about. */
	function apply(next: QuickPostBoard, over: QuickPostBoard | null) {
		const onScreen = local && local.over === over ? local.board : over;
		const before = new Set((onScreen?.posts ?? []).map((p) => p.id));
		skew = quickPostSkewMs(next.now, Date.now());
		nowMs = Date.now();
		if (JSON.stringify(next.posts) === JSON.stringify(onScreen?.posts ?? []) && next.manages === onScreen?.manages) return;
		const arrived = next.posts.filter((p) => !before.has(p.id));
		if (arrived.length) said = arrived.length === 1 ? 'A new class notice was posted.' : `${arrived.length} new class notices were posted.`;
		local = { over, board: next };
	}

	/** THE POLL, on the shared poller (ledger 0357), exactly ClassTeams' shape. */
	let poller: Poller | null = null;
	$effect(() => {
		const t = transports;
		const section = sectionId;
		if (!t || !loaded || typeof document === 'undefined') return;
		let alive = true;
		let asked = 0;
		const run = async (): Promise<PollOutcome> => {
			const mine = ++asked;
			const over = board;
			let res;
			try {
				res = await untrack(() => t.read(section));
			} catch (e) {
				return e instanceof PollSignedOut ? 'signed-out' : 'failed';
			}
			if (!res.ok) {
				// The function went away (0230 rolled back): stop asking, keep the page.
				if (res.reason === 'unavailable') {
					untrack(() => poller?.stop());
					return 'ok';
				}
				return 'failed';
			}
			if (!alive || mine !== asked || over !== board) return 'ok';
			apply(res.board, over);
			return 'ok';
		};
		const p = untrack(() => startPoller({ intervalMs: pollMs, run, onSignedOut: pollSignedOut }));
		poller = p;
		return () => {
			alive = false;
			p.stop();
			if (poller === p) poller = null;
		};
	});
	$effect(() => {
		const key = pollSessionKey(page.data.claims);
		untrack(() => poller?.authChanged(key));
	});

	/**
	 * THE LIVE NOTICE: a re-read after a random wait, folded, so a burst of
	 * notices (a post to five classes is five) is one read. Track the inputs,
	 * untrack the `subscribe` call: the bus is injected code.
	 */
	$effect(() => {
		const bus = live;
		const section = sectionId;
		const jitter = noticeJitterMs;
		if (!bus || !loaded || !transports) return;
		let pending: ReturnType<typeof setTimeout> | null = null;
		const unsubscribe = untrack(() =>
			bus.subscribe(section, (topic) => {
				if (topic !== 'quick-posts' || pending) return;
				pending = setTimeout(
					() => {
						pending = null;
						poller?.runNow();
					},
					Math.floor(Math.random() * Math.max(0, jitter))
				);
			})
		);
		return () => {
			if (pending) clearTimeout(pending);
			unsubscribe();
		};
	});

	function announce(ids: readonly string[]) {
		for (const id of new Set(ids)) live?.announce(id, 'quick-posts');
	}

	/**
	 * THE DATABASE MADE THE NOTICE. With no files to follow it is announced and
	 * the composer closes, as it always did. With files, the classes hear about
	 * it once the first upload pass has finished (`filesLanded`), so a student's
	 * re-read arrives with the pictures on it rather than a moment before them.
	 */
	function created(res: Extract<QuickPostCreateResult, { ok: true }>, body: string, filesPending: number) {
		const nowAt = Date.now() + skew;
		ack = quickPostPostedWords(res.section_ids.length, res.expires_at, nowAt);
		problem = null;
		if (res.section_ids.includes(sectionId) && shown) {
			const post: QuickPost = {
				id: res.id,
				body,
				created_at: res.created_at,
				expires_at: res.expires_at,
				section_ids: [...res.section_ids],
				can_take_down: true,
				files: []
			};
			local = { over: board, board: { ...shown, posts: [post, ...shown.posts.filter((p) => p.id !== post.id)] } };
		}
		nowMs = Date.now();
		if (filesPending > 0) {
			pending = { id: res.id, sections: [...res.section_ids] };
			return;
		}
		announce(res.section_ids);
		oncomposerclose?.();
	}

	/** TWO PRESSES, AND THE SECOND NAMES WHAT IT COSTS: how many classes it leaves. */
	async function takeDown(post: QuickPost) {
		if (!transports || busy) return;
		if (armed !== post.id) {
			armed = post.id;
			return;
		}
		busy = post.id;
		problem = null;
		try {
			const res = await transports.takeDown(post.id);
			if (!res.ok) {
				problem = res.message;
				return;
			}
			if (shown) local = { over: board, board: { ...shown, posts: shown.posts.filter((p) => p.id !== post.id) } };
			ack = 'Notice taken down.';
			announce([...res.section_ids, sectionId]);
		} catch {
			problem = 'Could not reach the class. Check your connection and try again.';
		} finally {
			busy = null;
			armed = null;
		}
	}

	const classCount = (p: QuickPost) => Math.max(1, p.section_ids?.length ?? 1);

	/**
	 * A NOTICE WHOSE FILES ARE STILL GOING ON. The composer stays mounted while
	 * it holds one, even if the header's Quick post key is pressed again: an
	 * unmounted panel would drop the files that did not attach and every
	 * sentence about why.
	 */
	let pending = $state<{ id: string; sections: string[] } | null>(null);
	const limits = $derived(quickPostLimits(shown));

	function withFiles(postId: string, files: QuickPostFile[]) {
		if (!shown || !files.length) return;
		const at = shown.posts.findIndex((p) => p.id === postId);
		if (at < 0) return;
		const post = shown.posts[at];
		const merged = [...(post.files ?? []), ...files.filter((f) => !(post.files ?? []).some((g) => g.id === f.id))];
		const posts = [...shown.posts];
		posts[at] = { ...post, files: merged };
		local = { over: board, board: { ...shown, posts } };
	}

	/** After each upload pass: show what landed, tell the classes, close when nothing is left. */
	function filesLanded(postId: string, landed: QuickPostFile[], left: number) {
		withFiles(postId, landed);
		const sections = pending?.id === postId ? pending.sections : [sectionId];
		if (landed.length) announce(sections);
		if (left === 0) {
			pending = null;
			oncomposerclose?.();
		}
	}

	/** The composer let go: a cancel, or Close on a posted notice. */
	function composerClosed() {
		pending = null;
		oncomposerclose?.();
	}

	/** The composer's one write, through this board's transports. */
	const createPost: QuickPostTransports['create'] = (ids, body, expiresAt) =>
		transports
			? transports.create(ids, body, expiresAt)
			: Promise.resolve({ ok: false, reason: 'unavailable', message: quickPostRefusalWords('unavailable') });
</script>

{#snippet runs(text: string)}
	{#each quickPostRuns(text) as run, i (i)}{#if run.href}<a
				class="qp-link"
				href={run.href}
				target="_blank"
				rel="noopener noreferrer">{run.text}</a
			>{:else}{run.text}{/if}{/each}
{/snippet}

{#snippet notice(post: QuickPost)}
	{@const links = quickPostLinks(post.body)}
	{@const split = quickPostSplit(post.body)}
	{@const files = (post.files ?? []).map(
		(f): ClassroomAttachment => ({ id: f.id, filename: f.filename, mime_type: 'application/octet-stream', size_bytes: f.size_bytes })
	)}
	<article class="card qp-card" data-testid="quick-post" data-post={post.id}>
		<span class="qp-stripe" aria-hidden="true"></span>
		<p class="qp-head">
			<svg class="qp-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d={QUICK_POST_GLYPH} /></svg>
			<span class="qp-word">Notice</span>
			<span class="chip qp-until" data-testid="quick-post-until">{quickPostUntilWords(post.expires_at, at)}</span>
		</p>
		<p class="qp-body" data-testid="quick-post-body">{@render runs(split.lead)}</p>
		{#if split.rest !== null}
			<!-- The rest of a long notice: in the DOM either way, closed on arrival. -->
			<Disclosure
				label="Rest of the notice"
				scope={`quick-post:${post.id}`}
				collapseWhen={true}
				testId="quick-post-more"
			>
				<p class="qp-body qp-rest" data-testid="quick-post-rest">{@render runs(split.rest)}</p>
			</Disclosure>
		{/if}
		{#if files.length}
			<div class="qp-files" data-testid="quick-post-files">
				<AttachmentList attachments={files} compact resolveSrc={(a) => fileSrc(a.id)} />
			</div>
		{/if}
		{#if links.length}
			<div class="qp-links">
				{#each links as l (l.href)}
					<a
						class="btn secondary tiny qp-open"
						href={l.href}
						target="_blank"
						rel="noopener noreferrer"
						data-testid="quick-post-open-link">Open {l.host}</a
					>
				{/each}
			</div>
		{/if}
		{#if manages}
			<div class="qp-manage" data-testid="quick-post-manage">
				<span class="qp-reach">Posted to {quickPostClassWords(classCount(post))}</span>
				{#if transports && post.can_take_down}
					{#if armed === post.id}
						<button
							type="button"
							class="btn secondary tiny danger"
							disabled={busy === post.id}
							data-testid="quick-post-take-down-confirm"
							onclick={() => void takeDown(post)}
						>
							Take it down from {quickPostClassWords(classCount(post))}
						</button>
						<button
							type="button"
							class="btn secondary tiny"
							data-testid="quick-post-take-down-keep"
							onclick={() => (armed = null)}>Keep it</button
						>
					{:else}
						<button
							type="button"
							class="btn secondary tiny"
							data-testid="quick-post-take-down"
							onclick={() => void takeDown(post)}>Take down</button
						>
					{/if}
				{:else if transports}
					<span class="qp-reach">Only the teacher who posted it, or a teacher of every class it went to, can take it down.</span>
				{/if}
			</div>
		{/if}
	</article>
{/snippet}

{#if loaded}
	{#if visible.length || ((composing || pending) && transports && manages) || ack || problem}
		<section class="qp" aria-label="Class notices" data-testid="quick-posts">
			{#if (composing || pending) && transports && manages}
				<QuickPostComposer
					{sections}
					currentSectionId={sectionId}
					{viewerEmail}
					create={createPost}
					oncreated={created}
					oncancel={composerClosed}
					onfiles={filesLanded}
					uploadFile={transports.uploadFile ?? null}
					{limits}
				/>
			{/if}
			{#if ack}
				<p class="qp-ack" role="status" data-testid="quick-post-ack">{ack}</p>
			{/if}
			{#if problem}
				<p class="qp-problem" role="alert" data-testid="quick-post-problem">{problem}</p>
			{/if}
			{#each first as post (post.id)}
				{@render notice(post)}
			{/each}
			{#if rest.length}
				<Disclosure
					label={`${rest.length} more notice${rest.length === 1 ? '' : 's'}`}
					scope={`quick-posts:${sectionId}`}
					collapseWhen={true}
					testId="quick-posts-more"
				>
					{#each rest as post (post.id)}
						{@render notice(post)}
					{/each}
				</Disclosure>
			{/if}
		</section>
	{/if}
	<!-- Always mounted while the board is; only its text moves. -->
	<p class="sr-only" role="status" data-testid="quick-posts-said">{said}</p>
{/if}

<style>
	.qp {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		min-width: 0;
	}
	/* A raised panel (the plate's `.card`), with a gold stripe and a glyph and
	   a word, so a notice is never told apart by colour alone. The stripe is
	   its own element because the plate repaints every side of a card's border. */
	.qp-card {
		position: relative;
		margin: 0;
		padding: var(--space-3) var(--space-3) var(--space-3) calc(var(--space-3) + 6px);
		min-width: 0;
		overflow: hidden;
	}
	.qp-stripe {
		position: absolute;
		inset: 0 auto 0 0;
		width: 6px;
		background: var(--gold);
		pointer-events: none;
	}
	.qp-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0 0 var(--space-2);
	}
	.qp-glyph {
		flex: none;
		width: 1.25rem;
		height: 1.25rem;
		fill: none;
		stroke: var(--gold);
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.qp-word {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-1);
	}
	.qp-until {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--text-1);
	}
	.qp-body {
		margin: 0;
		color: var(--text-1);
		font-size: 1.05rem;
		line-height: 1.45;
		white-space: pre-line;
		overflow-wrap: break-word;
	}
	.qp-rest {
		margin-top: var(--space-2);
	}
	.qp-files {
		margin-top: var(--space-1);
		min-width: 0;
	}
	.qp-link {
		color: var(--body-link, var(--cyan));
		text-decoration: underline;
		overflow-wrap: anywhere;
	}
	.qp-links,
	.qp-manage {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
	}
	.qp :global(.btn.tiny) {
		font-size: 0.6875rem;
	}
	.qp-reach {
		font-size: 0.85rem;
		color: var(--text-2);
	}
	.qp-ack,
	.qp-problem {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-1);
	}
	.qp-problem {
		padding-left: 0.5rem;
		border-left: 3px solid var(--amber);
	}
	.qp :global(.disc-body) {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.qp :global(.disc-body[data-open='false']) {
		display: none;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
</style>
