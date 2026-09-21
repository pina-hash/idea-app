/**
 * THE WORDS BESIDE THE CURSOR. One place turns a drag value or a drawing in
 * progress into the sentence the workspace floats at the pointer, so every
 * drag reads the same way and a number is never formatted twice.
 *
 * THIS MODULE IS THE DIMENSIONAL-CONTROL SURFACE'S. Units, precision, the
 * value shown for each tool, and what the readout says while a typed override
 * is open all live here; the workspace only positions the text.
 */
import type { Tool, DragValue } from '../viewport';

export const INCH_DECIMALS = 3;
export const inches = (n: number) => `${n.toFixed(INCH_DECIMALS)} in`;
export const degrees = (n: number) => `${n.toFixed(1)}°`;

/** What a drag is worth right now, for the tool that started it. */
export function dragReadout(tool: Tool, value: DragValue): string {
	if (tool === 'revolve' || tool === 'rotate') return degrees(value.angle);
	if (tool === 'circular-pattern') return `${value.count} × ${degrees(360 / value.count)}`;
	if (tool === 'linear-pattern') return `${value.count} × ${inches(value.distance)}`;
	if (tool === 'scale') return `× ${(1 + value.distance).toFixed(3)}`;
	if (tool === 'move' && value.handle?.mode === 'free') return `${inches(Math.hypot(...value.delta))} free`;
	return value.handle?.label && tool === 'move' ? `${inches(value.distance)} ${value.handle.label}` : inches(value.distance);
}

/** What a drawing in progress is worth: width x height, a diameter, a polygon radius, or the current segment. */
export function drawingReadout(input: { tool: string; du: number; dv: number; segment: number }): string {
	const { tool, du, dv, segment } = input;
	if (tool === 'circle') return `⌀ ${inches(2 * Math.hypot(du, dv))}`;
	if (tool === 'rectangle') return `${Math.abs(du).toFixed(INCH_DECIMALS)} × ${Math.abs(dv).toFixed(INCH_DECIMALS)} in`;
	if (tool === 'polygon') return `R ${inches(Math.hypot(du, dv))}`;
	return inches(segment);
}
