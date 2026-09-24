<!--
	THE VISIBLE WORD ON A PICTURE THAT OPENS LARGE (ledger 0297, package ITEM).

	Every thumbnail that opens the classroom lightbox is a real <button>, and
	CLAUDE.md asks every control to carry a visible word, not only a glyph: a
	`title` is not discoverable and a phone cannot hover. So each one carries
	this chip in its corner, drawn over the picture and taking no layout space.
	ONE component, so the word, the glyph and the ground are one decision on
	every surface that has a picture in it.

	It is `aria-hidden`: the button around it is named for the picture it opens
	("Open <alt> larger"), and a screen reader hearing "Enlarge" after that
	would hear the same thing twice.

	The ground is a fixed dark scrim with a near-white word, in every theme,
	because it sits on an arbitrary photograph rather than on a room's plate:
	no theme token can promise contrast against a picture, a scrim can.
-->
<span class="enlarge-cue" aria-hidden="true">
	<svg viewBox="0 0 16 16" focusable="false">
		<path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />
	</svg>
	Enlarge
</span>

<style>
	.enlarge-cue {
		position: absolute;
		right: 0.35rem;
		bottom: 0.35rem;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.5rem;
		border-radius: 999px;
		background: rgba(8, 10, 8, 0.78);
		color: #f2f1ea;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		line-height: 1.2;
		pointer-events: none;
	}
	.enlarge-cue svg {
		width: 0.8rem;
		height: 0.8rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	/* A control's word, so it does not print: on paper the picture is the
	   picture and there is nothing to press. */
	@media print {
		.enlarge-cue {
			display: none;
		}
	}
</style>
