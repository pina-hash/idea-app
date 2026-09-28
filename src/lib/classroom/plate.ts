/**
 * THE CLASSROOM'S SHAPE LANGUAGE IS ON WHILE THIS IS 'cr-plate' (ledger 0345).
 *
 * It is the ONE place the class is spelled. src/routes/classroom/+layout.svelte
 * puts it on the classroom's `.cr-root`, and ./plate.css keys every rule on it,
 * so this line is the whole switch: set it to '' and every classroom page
 * renders exactly as it did before the Plate shipped.
 *
 * The classroom `/dev` harnesses and `/dev/themes-shape`'s after column read
 * this same constant rather than writing the class out, which is what keeps
 * the mockup, the harnesses and the live site from drifting apart: a harness
 * that wore a class the real page did not would measure a look nobody sees.
 */
export const CLASSROOM_PLATE = 'cr-plate';
