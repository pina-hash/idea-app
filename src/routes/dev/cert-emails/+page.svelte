<script lang="ts">
	/**
	 * /dev/cert-emails: every certification email, rendered on the server by
	 * the REAL `renderCertEmail` and shown here inside sandboxed frames at a
	 * phone width (375) and a desktop width (600), side by side at 1440 and
	 * stacked on a phone, with the subject (and its length) and the plain-text
	 * part beside each. The kind keys are real links (`?kind=`), lit on the
	 * current one; Show all is the page with no query.
	 *
	 * The frames are `srcdoc` with an EMPTY sandbox: no script, no same-origin
	 * reach, exactly what a mail client grants. The harness blocks every
	 * non-loopback request, so the IDEA mark inside a frame shows its alt
	 * text here; the asset itself is measured by `tests/cert-email-render`.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import '$lib/certifications/cert.css';
	import CertShell from '$lib/certifications/student/CertShell.svelte';
	import type { NotificationKind } from '$lib/certifications/types';

	let {
		data
	}: {
		data: {
			kind: NotificationKind | null;
			kinds: NotificationKind[];
			emails: { kind: NotificationKind; to: string; title: string; subject: string; html: string; text: string }[];
		};
	} = $props();

	let hydrated = $state(false);
	onMount(() => (hydrated = true));

	const themeParam = page.url.searchParams.get('theme');
	$effect(() => {
		if (themeParam !== 'space-white' && themeParam !== 'matrix') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', themeParam);
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});

	const themeQuery = $derived(themeParam ? `&theme=${encodeURIComponent(themeParam)}` : '');
	const hrefFor = (kind: NotificationKind | null) => (kind ? `/dev/cert-emails?kind=${kind}${themeQuery}` : `/dev/cert-emails${themeQuery ? `?${themeQuery.slice(1)}` : ''}`);
	const words = (kind: string) => kind.replace(/_/g, ' ');
</script>

<div data-cert-emails-hydrated={hydrated ? 'yes' : undefined} data-testid="cert-emails-harness">
	<CertShell title="Email family" eyebrow="IDEA // Certifications // Emails" lead="Every notification kind, rendered by the server and shown at a phone width and a desktop width. The frames are sandboxed the way a mail client is.">
		<nav class="cert-actions ce-keys" aria-label="Email kinds" data-testid="cert-emails-keys">
			<a class="btn secondary cert-btn ce-key" class:on={data.kind === null} aria-current={data.kind === null ? 'page' : undefined} href={hrefFor(null)} data-testid="cert-emails-all">Show all</a>
			{#each data.kinds as kind (kind)}
				<a class="btn secondary cert-btn ce-key" class:on={data.kind === kind} aria-current={data.kind === kind ? 'page' : undefined} href={hrefFor(kind)} data-testid="cert-emails-key" data-kind={kind}>{words(kind)}</a>
			{/each}
		</nav>

		{#each data.emails as email (email.kind)}
			<section class="cert-panel ce-email" data-testid="cert-email" data-kind={email.kind} aria-labelledby="ce-h-{email.kind}">
				<h2 class="ce-kind" id="ce-h-{email.kind}">{words(email.kind)}</h2>
				<p class="ce-subject-row">
					<span class="ce-label">Subject</span>
					<span class="ce-subject" data-testid="cert-email-subject" data-length={email.subject.length}>{email.subject}</span>
					<span class="cert-readout" class:is-bad={email.subject.length > 70} class:is-ok={email.subject.length <= 70} data-testid="cert-email-subject-length">{email.subject.length} characters</span>
				</p>
				<p class="ce-subject-row"><span class="ce-label">To</span><span class="ce-to">{email.to}</span></p>
				<div class="ce-frames">
					<figure class="ce-frame ce-frame-phone">
						<figcaption class="ce-label">Phone, 375px</figcaption>
						<iframe class="ce-iframe" title="{words(email.kind)} email at a phone width" srcdoc={email.html} sandbox="" loading="lazy" data-testid="cert-email-phone"></iframe>
					</figure>
					<figure class="ce-frame ce-frame-desktop">
						<figcaption class="ce-label">Desktop, 600px</figcaption>
						<iframe class="ce-iframe" title="{words(email.kind)} email at a desktop width" srcdoc={email.html} sandbox="" loading="lazy" data-testid="cert-email-desktop"></iframe>
					</figure>
					<div class="ce-text">
						<p class="ce-label">Plain text part</p>
						<pre class="ce-pre" data-testid="cert-email-text">{email.text}</pre>
					</div>
				</div>
			</section>
		{/each}
	</CertShell>
</div>

<style>
	.ce-keys {
		margin: 0 0 1.25rem;
	}
	.ce-key {
		text-transform: capitalize;
	}
	.ce-email {
		margin-bottom: 1.5rem;
	}
	.ce-kind {
		text-transform: capitalize;
		margin-bottom: 0.5rem;
	}
	.ce-kind::before {
		content: none;
	}
	.ce-subject-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.75rem;
		margin: 0 0 0.5rem;
	}
	.ce-label {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.ce-subject {
		font-weight: 700;
		color: var(--text-1);
	}
	.ce-to {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-1);
	}
	/* Side by side above 1024: the phone frame, the desktop frame, the text. */
	.ce-frames {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
		align-items: start;
	}
	@media (min-width: 1024px) {
		.ce-frames {
			grid-template-columns: 375px minmax(0, 600px);
		}
		.ce-text {
			grid-column: 1 / -1;
		}
	}
	.ce-frame {
		margin: 0;
		min-width: 0;
	}
	.ce-frame figcaption {
		display: block;
		margin: 0 0 0.35rem;
	}
	.ce-iframe {
		display: block;
		width: 100%;
		height: 46rem;
		/* The frame's ground is the email's own paper (#f7f9f9), so its edge is
		   measured against that, not the plate: the certificate's rule green
		   (5.5:1 on the paper), never the plate's boundary token (1.15:1 there). */
		border: 2px solid #3b6c36;
		border-radius: var(--radius-card, 4px);
		background: #f7f9f9;
	}
	.ce-frame-phone .ce-iframe {
		max-width: 375px;
	}
	.ce-frame-desktop .ce-iframe {
		max-width: 600px;
	}
	.ce-pre {
		margin: 0;
		padding: 0.85rem 1rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 4px);
		background: var(--surface-0, var(--bg0));
		color: var(--text-1);
		font-family: var(--font-mono);
		font-size: 0.82rem;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
