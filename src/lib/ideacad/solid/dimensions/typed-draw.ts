/**
 * TYPING A SIZE WHILE A SHAPE IS BEING DRAWN (friction F007). SolidWorks shows
 * a rectangle's width and height as fields beside it after the first click,
 * Tab moves between them and Enter finishes; SketchUp takes a typed value
 * during any draw with no mode switch at all. The research calls this the one
 * sketching mechanic IdeaCAD must not ship without. This module is the whole
 * of what it means, with no DOM and no viewport in it: which fields a tool
 * takes, what a key does to them, and where the drawing's second point lands
 * once a field holds a number. The drawing tool (`viewport/drawing.ts`) only
 * routes keys here and reads `typedPoint` instead of the pointer.
 *
 * THE POINTER STILL DECIDES THE DIRECTION. A typed width of 2 is 2 to the
 * side the pointer is on, a typed length runs toward the pointer, so typing
 * never throws the shape to a quadrant the student was not drawing in. A
 * field left empty, or holding something that is not yet a number (`-`, `1/`),
 * follows the pointer exactly as if nothing had been typed.
 *
 * NOTHING IS CLAMPED. A typed zero draws a zero-width rectangle, which the
 * sketch then refuses in its own words, like any other drawn shape.
 */
import { labelText, readLabel, type DisplayUnit } from './labels';
import type { DimensionUnit } from './model';
import type { Vec2 } from '../types';

export type TypedTool = 'rectangle' | 'circle' | 'polygon' | 'line';
export type FieldKey = 'width' | 'height' | 'diameter' | 'radius' | 'length' | 'angle';
export interface TypedField { key: FieldKey; label: string; unit: DimensionUnit; text: string }
export interface TypedDraw { tool: TypedTool; fields: TypedField[]; active: number }

const FIELDS: Record<TypedTool, [FieldKey, string, DimensionUnit][]> = {
	rectangle: [['width', 'Width', 'in'], ['height', 'Height', 'in']],
	circle: [['diameter', 'Diameter', 'in']],
	polygon: [['radius', 'Radius', 'in']],
	line: [['length', 'Length', 'in'], ['angle', 'Angle', 'deg']]
};
/** The fields a drawing tool takes, all empty and the first active; null for a tool with nothing to type (an arc is placed by its three points). */
export function startTypedDraw(tool: string): TypedDraw | null {
	const spec = FIELDS[tool as TypedTool];
	return spec ? { tool: tool as TypedTool, fields: spec.map(([key, label, unit]) => ({ key, label, unit, text: '' })), active: 0 } : null;
}
/**
 * A key that types into the active field: a digit, a point, a minus or a slash
 * starts a number; a space (for `1 1/2`) and a unit's letters (`mm`, `in`,
 * `deg`, `"`) only continue one, so a letter pressed before any digit is still
 * the shortcut it always was.
 */
export const typesIntoField = (key: string, current = '') => key.length === 1 && (/[0-9.\-/]/.test(key) || (current.trim() !== '' && /[ a-z"°]/i.test(key)));
/**
 * What a key does: a character is added to the active field; Backspace takes
 * the last one off; Tab and Shift+Tab move between fields, wrapping. Anything
 * else returns the state unchanged (the caller then lets the key through, so
 * Escape and Enter keep their meaning).
 */
export function typeKey(state: TypedDraw, key: string, shift = false): TypedDraw {
	if (key === 'Tab') { const n = state.fields.length; return { ...state, active: (state.active + (shift ? n - 1 : 1)) % n }; }
	const field = state.fields[state.active];
	if (key === 'Backspace') return withText(state, field.text.slice(0, -1));
	if (typesIntoField(key, field.text)) return withText(state, field.text + key);
	return state;
}
const withText = (state: TypedDraw, text: string): TypedDraw => ({ ...state, fields: state.fields.map((f, i) => (i === state.active ? { ...f, text } : f)) });
/** Whether anything has been typed, which is when Enter finishes the shape at the typed size rather than at the pointer. */
export const hasTyped = (state: TypedDraw | null) => !!state && state.fields.some((f) => f.text.trim() !== '');
/** A field's number in inches (or degrees), or null while it is empty or not yet a number. */
export function fieldValue(field: TypedField, display: DisplayUnit): number | null {
	if (!field.text.trim()) return null;
	const parsed = readLabel(field.text, field.unit, display);
	return parsed.ok ? parsed.value : null;
}
/**
 * Where the drawing's second point lands: the pointer, with every typed field
 * made true. `start` is the first press (a rectangle's first corner, a
 * circle's or polygon's centre, a line's start), both in the sketch plane.
 */
export function typedPoint(state: TypedDraw, start: Vec2, pointer: Vec2, display: DisplayUnit): Vec2 {
	const value = (key: FieldKey) => { const f = state.fields.find((x) => x.key === key); return f ? fieldValue(f, display) : null; };
	const du = pointer[0] - start[0], dv = pointer[1] - start[1], side = (d: number) => (d < 0 ? -1 : 1);
	if (state.tool === 'rectangle') {
		const w = value('width'), h = value('height');
		return [w === null ? pointer[0] : start[0] + side(du) * w, h === null ? pointer[1] : start[1] + side(dv) * h];
	}
	const reach = Math.hypot(du, dv), toward: Vec2 = reach > 1e-12 ? [du / reach, dv / reach] : [1, 0];
	if (state.tool === 'circle' || state.tool === 'polygon') {
		const typed = state.tool === 'circle' ? value('diameter') : value('radius');
		const r = typed === null ? reach : state.tool === 'circle' ? typed / 2 : typed;
		return [start[0] + toward[0] * r, start[1] + toward[1] * r];
	}
	const length = value('length'), angle = value('angle');
	const along: Vec2 = angle === null ? toward : [Math.cos(angle * Math.PI / 180), Math.sin(angle * Math.PI / 180)];
	const l = length === null ? reach : length;
	return [start[0] + along[0] * l, start[1] + along[1] * l];
}
/**
 * The words beside the pointer while typing: every field, the active one
 * marked with brackets so the student sees where the next key goes (colour
 * is never the only signal), a typed value as typed and an untyped one as the
 * pointer currently has it.
 */
export function typedReadout(state: TypedDraw, start: Vec2, pointer: Vec2, display: DisplayUnit): string {
	const at = typedPoint(state, start, pointer, display), du = at[0] - start[0], dv = at[1] - start[1];
	const live: Record<FieldKey, number> = { width: Math.abs(du), height: Math.abs(dv), diameter: 2 * Math.hypot(du, dv), radius: Math.hypot(du, dv), length: Math.hypot(du, dv), angle: ((Math.atan2(dv, du) * 180) / Math.PI + 360) % 360 };
	return state.fields.map((f, i) => {
		const shown = f.text.trim() ? f.text.trim() : labelText(live[f.key], f.unit, display);
		return i === state.active ? `${f.label} [${shown}]` : `${f.label} ${shown}`;
	}).join('  ');
}
