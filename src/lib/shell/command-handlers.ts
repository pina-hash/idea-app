/**
 * WHICH `run` COMMANDS CAN HAPPEN RIGHT NOW, and what runs them.
 *
 * A registry command either navigates (`href`) or runs in place. The ones that
 * run in place need the surface that owns the state: "New post" needs the
 * class layout's composer, "Show missing work" needs the class page's filter,
 * "Classroom settings" needs the shell's panel. So the surface that CAN do it
 * registers a handler under the command's id while it is mounted, and the
 * palette offers the command only while one is registered. A command with no
 * handler is not shown, rather than shown and doing nothing -- absence is the
 * mechanism here exactly as it is for an omitted transport.
 *
 * Module state on purpose: there is one palette per page and the handlers are
 * the page's. It is client-only in practice (surfaces register from `$effect`,
 * which never runs during server rendering).
 */

export type CommandHandler = (arg?: string) => void | Promise<void>;

const handlers = new Map<string, CommandHandler>();

/**
 * Register what runs `id` while the caller is mounted. Returns the
 * unregister, which removes the entry only if it is still this handler, so a
 * second mount of the same surface and the first one's teardown cannot erase
 * each other in either order.
 */
export function registerCommandHandler(id: string, handler: CommandHandler): () => void {
	handlers.set(id, handler);
	return () => {
		if (handlers.get(id) === handler) handlers.delete(id);
	};
}

/** The ids that can run right now, for `runnableCommands`. */
export function liveCommandIds(): Set<string> {
	return new Set(handlers.keys());
}

/** Run a registered command. False when nothing is registered, which the palette never offers. */
export function runCommand(id: string, arg?: string): boolean {
	const handler = handlers.get(id);
	if (!handler) return false;
	void handler(arg);
	return true;
}
