/**
 * THE TOOLS WHOSE CARD CARRIES A MOVING PICTURE OF THE GESTURE: the drawing
 * tools and the tools that make or move solid geometry, where a picture says
 * more than a sentence. `ToolDemo.svelte` draws them; this list is what a test
 * and the card read to know one exists.
 */
export const DEMO_TOOLS = ['rectangle', 'circle', 'line', 'polygon', 'arc', 'extrude', 'revolve', 'fillet', 'chamfer', 'shell', 'hole', 'move', 'rotate', 'scale', 'linear-pattern', 'circular-pattern', 'mate'] as const;
export type DemoTool = (typeof DEMO_TOOLS)[number];
export const hasDemo = (id: string | null | undefined): id is DemoTool => !!id && (DEMO_TOOLS as readonly string[]).includes(id);
/** One loop of every demo, in milliseconds. Under three seconds, so the whole gesture is seen before a student moves on. */
export const DEMO_LOOP_MS = 2400;
