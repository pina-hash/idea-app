/**
 * THE SHAPES A POST'S THUMBNAIL SLOT IS DRAWN IN (ledger 0396), and the one
 * rule of which shape a person sees. No imports, on purpose: the classroom
 * preference schema names these, and it is read on every classroom page.
 * `$lib/classroom/thumbnail` re-exports all of it beside what a slot shows.
 */

/**
 * THE SHAPES, append-only: a class's default is stored by id (0268's CHECK
 * names the same four) and a person's choice sits in their device slot.
 */
export const THUMB_SHAPES = ['off', 'tile', 'wide', 'banner'] as const;
export type ThumbShape = (typeof THUMB_SHAPES)[number];

/** A person's choice: one of the shapes, or "whatever the class says". */
export const THUMB_SHAPE_CHOICES = ['class', ...THUMB_SHAPES] as const;
export type ThumbShapeChoice = (typeof THUMB_SHAPE_CHOICES)[number];

/**
 * THE BUILT-IN DEFAULT IS TILE, NOT OFF, because the report is that a class
 * page of posts is a wall of text, and a default of Off would leave every class
 * exactly as reported until somebody found a setting.
 */
export const THUMB_SHAPE_DEFAULT: ThumbShape = 'tile';

export const THUMB_SHAPE_LABELS: Readonly<Record<ThumbShape, string>> = {
	off: 'Off',
	tile: 'Tile',
	wide: 'Wide',
	banner: 'Banner'
};

/** What each shape is, in a phrase a teacher choosing one reads. */
export const THUMB_SHAPE_HINTS: Readonly<Record<ThumbShape, string>> = {
	off: 'No pictures, titles only',
	tile: 'A square in front of the title',
	wide: 'A 16:9 picture above the title',
	banner: 'A short strip across the top of the row'
};

export function isThumbShape(v: unknown): v is ThumbShape {
	return typeof v === 'string' && (THUMB_SHAPES as readonly string[]).includes(v);
}

export function isThumbShapeChoice(v: unknown): v is ThumbShapeChoice {
	return typeof v === 'string' && (THUMB_SHAPE_CHOICES as readonly string[]).includes(v);
}

/**
 * THE SHAPE A PERSON SEES, in one place: their own choice when they made one,
 * otherwise the class's default, otherwise Tile. A class default that is not a
 * known shape (a later build's, a hand edit) reads as no default.
 */
export function resolveThumbShape(personal: ThumbShapeChoice | null | undefined, classDefault: unknown): ThumbShape {
	if (personal && personal !== 'class' && isThumbShape(personal)) return personal;
	if (isThumbShape(classDefault)) return classDefault;
	return THUMB_SHAPE_DEFAULT;
}

