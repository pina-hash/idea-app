/**
 * THE MARK ROSTER, DERIVED, AND THE ONE IMPLEMENTATION OF A MARK'S ID.
 *
 * WHY THIS FILE EXISTS. `/dev/marks` and `tools/browser-verify/routes/marks.mjs`
 * each used to carry a HAND-WRITTEN list of eleven marks, and the spec pinned
 * its counts to the literal 11/12/22. `$lib/marks` held twelve. The twelfth --
 * `MapsMark` -- arrived in `ca5d950`, which touched neither file, so it was
 * mounted by nothing and swept by nothing, AND THE SPEC STAYED GREEN: the page
 * still rendered eleven component cells plus FRC, which is exactly the twelve
 * the ceiling allowed. A check that covers eleven of twelve while reporting
 * success is the shape `IDEA_VERIFICATION_ADDENDA` rule 33 names -- an
 * assertion that cannot fail is not an assertion -- and bumping 11 to 12 would
 * have left the thirteenth mark in precisely the same hole.
 *
 * SO THE ROSTER IS READ FROM THE FILESYSTEM ON BOTH SIDES, and neither side
 * carries a number. The page globs `$lib/marks/*.svelte` and mounts whatever
 * comes back; the spec reads the same directory and derives every count and
 * every per-mark motion row from its length. A mark added tomorrow is mounted
 * and swept with nobody remembering either file.
 *
 * ONE RULE, ONE COPY, TWO RUNTIMES. The id is a pure function of the filename
 * and it is written down HERE rather than twice: the page resolves it through
 * Vite and the spec imports this same file through Node's own ESM loader,
 * which is why it is plain `.js` with JSDoc types rather than `.ts` (Node
 * cannot load TypeScript) and why it sits beside the harness that owns it.
 * Two spellings of "what is this mark called" is the pair that stops agreeing,
 * and the drift would be silent in exactly the direction that already bit:
 * a `data-mark` the spec never selects.
 *
 * AND A DRIFT IS NOW LOUD ANYWAY, which is the property that matters more than
 * the sharing. Every id becomes a `motion` row selecting `[data-mark="<id>"]`,
 * and `motionSweep` requires `animated > 0` for a gated row -- so a selector
 * matching NOTHING reports zero animated elements and reddens. The old design
 * could only fail by counting too many; this one fails by finding too few,
 * which is the direction a forgotten mark actually goes.
 */

/**
 * A mark's `data-mark` id, from its component filename.
 *
 * `MapsMark.svelte` -> `maps`, `CoinDeskMark.svelte` -> `coin-desk`. The
 * trailing `Mark` is dropped and the remaining camel case becomes kebab case.
 *
 * IT IS NO LONGER A COPY OF THE LAUNCHER'S `icon` ID, and one id moved when
 * this stopped being hand-written: `CoinMark.svelte` yields `coin` where the
 * old list said `coins`. That is deliberate rather than tolerated. The launcher
 * keys its snippet on `PortalApp.icon`, which is a registry field a card
 * chooses; this harness is about the twelve FILES in `$lib/marks`, and naming
 * a cell after anything but its own file is how a roster derived from disk
 * starts needing a translation table again. Nothing outside this harness reads
 * these ids -- `data-mark` appears in the page and in its spec and nowhere
 * else in the tree.
 *
 * @param {string} filename A basename such as `CoinDeskMark.svelte`.
 * @returns {string} The kebab-case id.
 */
export function markIdFromFile(filename) {
	const base = filename.replace(/\.svelte$/, '').replace(/Mark$/, '');
	return base
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.toLowerCase();
}

/**
 * A mark's caption, from its id. `coin-desk` -> `Coin Desk`.
 *
 * The caption is rendered `text-transform: uppercase`, so deriving it costs
 * nothing a reader can see: every name the old hand-written list carried
 * already reached the screen in caps.
 *
 * @param {string} id
 * @returns {string}
 */
export function markNameFromId(id) {
	return id
		.split('-')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

/**
 * The roster, from a list of filenames or paths, sorted by filename.
 *
 * IT REFUSES AN EMPTY ROSTER RATHER THAN RETURNING ONE. A glob that resolved
 * nothing and a directory read that pointed at the wrong path both produce an
 * empty array, and an empty array here would give the spec zero motion rows,
 * zero expected cells and a clean pass over a page showing nothing -- rule 29's
 * control that can go to zero rows silently. Both callers are constructing the
 * roster from a directory that is known to be non-empty, so empty means the
 * read failed, and a throw at module load is the loudest place to say so.
 *
 * @param {string[]} paths Filenames or full paths ending in `<Name>Mark.svelte`.
 * @returns {{ file: string, id: string, name: string }[]}
 */
export function markRoster(paths) {
	const roster = paths
		.map((p) => /** @type {string} */ (p.split('/').pop()))
		.filter((f) => f.endsWith('Mark.svelte'))
		.sort()
		.map((file) => {
			const id = markIdFromFile(file);
			return { file, id, name: markNameFromId(id) };
		});
	if (roster.length === 0) {
		throw new Error(
			'mark roster is empty: nothing matched `*Mark.svelte`. The roster is read from ' +
				'$lib/marks on both sides, so an empty result means the read missed the directory ' +
				'rather than that there are no marks.'
		);
	}
	return roster;
}
