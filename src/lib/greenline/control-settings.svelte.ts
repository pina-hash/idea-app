/**
 * GREENLINE control bindings: the action registry (every rebindable input the
 * race reads) plus a reactive, localStorage-backed store of the player's
 * keyboard and gamepad bindings, mirroring the audio-settings pattern
 * (module-level $state for cross-component reactivity, localStorage so a
 * rebind survives a real reload). The race component resolves every input
 * through this store per keypress/frame, so a rebind in the settings overlay
 * changes what drives the car with no extra wiring; the settings overlay is
 * the only writer.
 *
 * Doctrine: ONE binding per action per device, and bindings on a device are
 * always unique. Keyboard bindings stay TOTAL (every action always has a key;
 * conflict resolution swaps, never drops). Gamepad bindings may be null
 * (reset-round ships unbound on pad, and swapping a binding into an unbound
 * action moves it rather than duplicating it). A keyboard key and a gamepad
 * input never conflict with each other.
 */
import { browser } from '$app/environment';

export type ControlAction =
	| 'accelerate'
	| 'brake'
	| 'steerLeft'
	| 'steerRight'
	| 'handbrake'
	| 'resetRound'
	| 'fire'
	| 'oil'
	| 'tether'
	| 'fireWeaponPrimary'
	| 'fireWeaponSecondary';

export type ControlDevice = 'key' | 'pad';

/** A gamepad input: one button, or one direction of one axis. */
export type PadBinding =
	| { kind: 'button'; index: number }
	| { kind: 'axis'; axis: number; dir: 1 | -1 };

/**
 * The registry, in display order. `kind` is how the race reads the action:
 * 'held' inputs are sampled continuously each frame, 'edge' inputs trigger
 * once per press.
 */
export const CONTROL_ACTIONS: {
	id: ControlAction;
	label: string;
	group: 'driving' | 'combat';
	kind: 'held' | 'edge';
}[] = [
	{ id: 'accelerate', label: 'Accelerate', group: 'driving', kind: 'held' },
	{ id: 'brake', label: 'Brake / Reverse', group: 'driving', kind: 'held' },
	{ id: 'steerLeft', label: 'Steer left', group: 'driving', kind: 'held' },
	{ id: 'steerRight', label: 'Steer right', group: 'driving', kind: 'held' },
	{ id: 'handbrake', label: 'Handbrake', group: 'driving', kind: 'held' },
	{ id: 'resetRound', label: 'Recover / reset round', group: 'driving', kind: 'edge' },
	{ id: 'fireWeaponPrimary', label: 'Primary weapon', group: 'combat', kind: 'edge' },
	{ id: 'fireWeaponSecondary', label: 'Secondary weapon', group: 'combat', kind: 'edge' },
	{ id: 'fire', label: 'EMP burst', group: 'combat', kind: 'edge' },
	{ id: 'oil', label: 'Oil slick', group: 'combat', kind: 'edge' },
	{ id: 'tether', label: 'Tether', group: 'combat', kind: 'edge' }
];

const ACTION_IDS = CONTROL_ACTIONS.map((a) => a.id);

export const ACTION_KIND = Object.fromEntries(
	CONTROL_ACTIONS.map((a) => [a.id, a.kind])
) as Record<ControlAction, 'held' | 'edge'>;

export function actionLabel(id: ControlAction): string {
	return CONTROL_ACTIONS.find((a) => a.id === id)?.label ?? id;
}

const KEY_DEFAULTS: Record<ControlAction, string> = {
	accelerate: 'KeyW',
	brake: 'KeyS',
	steerLeft: 'KeyA',
	steerRight: 'KeyD',
	handbrake: 'Space',
	resetRound: 'KeyR',
	fire: 'KeyF',
	oil: 'KeyE',
	tether: 'KeyQ',
	// Z / X: the left-hand bottom row, clear of the nine keys already bound.
	fireWeaponPrimary: 'KeyZ',
	fireWeaponSecondary: 'KeyX'
};

/**
 * Standard-mapping defaults matching the pre-remap hardcoded scheme: left
 * stick X steers (one HALF-AXIS per steer action, the same asymmetry the old
 * code had between keyboard's two discrete keys and the one analog stick),
 * RT/LT analog throttle/brake, A handbrake, RB fire, X oil, LB tether.
 * Reset ships unbound on pad (it never had a button), but is bindable.
 */
const PAD_DEFAULTS: Record<ControlAction, PadBinding | null> = {
	accelerate: { kind: 'button', index: 7 },
	brake: { kind: 'button', index: 6 },
	steerLeft: { kind: 'axis', axis: 0, dir: -1 },
	steerRight: { kind: 'axis', axis: 0, dir: 1 },
	handbrake: { kind: 'button', index: 0 },
	resetRound: null,
	fire: { kind: 'button', index: 5 },
	oil: { kind: 'button', index: 2 },
	tether: { kind: 'button', index: 4 },
	// B / Y: the two standard-mapping face buttons still free.
	fireWeaponPrimary: { kind: 'button', index: 1 },
	fireWeaponSecondary: { kind: 'button', index: 3 }
};

const KEY_STORE = 'greenline_control_keys';
const PAD_STORE = 'greenline_control_pad';

function keyDefaults(): Record<ControlAction, string> {
	return { ...KEY_DEFAULTS };
}

function padDefaults(): Record<ControlAction, PadBinding | null> {
	const out = {} as Record<ControlAction, PadBinding | null>;
	for (const a of ACTION_IDS) {
		const d = PAD_DEFAULTS[a];
		out[a] = d ? { ...d } : null;
	}
	return out;
}

function validPadBinding(v: unknown): v is PadBinding {
	if (typeof v !== 'object' || v === null) return false;
	const b = v as Record<string, unknown>;
	if (b.kind === 'button')
		return typeof b.index === 'number' && Number.isInteger(b.index) && b.index >= 0;
	if (b.kind === 'axis')
		return (
			typeof b.axis === 'number' &&
			Number.isInteger(b.axis) &&
			b.axis >= 0 &&
			(b.dir === 1 || b.dir === -1)
		);
	return false;
}

export function samePadBinding(a: PadBinding | null, b: PadBinding | null): boolean {
	if (!a || !b) return false;
	if (a.kind === 'button') return b.kind === 'button' && a.index === b.index;
	return b.kind === 'axis' && a.axis === b.axis && a.dir === b.dir;
}

function loadKeyboard(): Record<ControlAction, string> {
	const map = keyDefaults();
	if (!browser) return map;
	try {
		const raw = JSON.parse(localStorage.getItem(KEY_STORE) ?? '{}') as Record<string, unknown>;
		for (const a of ACTION_IDS) {
			const v = raw[a];
			if (typeof v === 'string' && v.length > 0) map[a] = v;
		}
	} catch {
		/* keep defaults */
	}
	// A corrupt/partial store could double-bind one key; uniqueness is an
	// invariant, so a broken map falls back to defaults wholesale.
	const codes = ACTION_IDS.map((a) => map[a]);
	if (new Set(codes).size !== codes.length) return keyDefaults();
	return map;
}

function loadGamepad(): Record<ControlAction, PadBinding | null> {
	const map = padDefaults();
	if (!browser) return map;
	try {
		const raw = JSON.parse(localStorage.getItem(PAD_STORE) ?? '{}') as Record<string, unknown>;
		for (const a of ACTION_IDS) {
			if (!(a in raw)) continue;
			const v = raw[a];
			if (v === null) map[a] = null;
			else if (validPadBinding(v)) map[a] = { ...v };
		}
	} catch {
		/* keep defaults */
	}
	const bound = ACTION_IDS.map((a) => map[a]).filter((b): b is PadBinding => b !== null);
	for (let i = 0; i < bound.length; i++)
		for (let j = i + 1; j < bound.length; j++)
			if (samePadBinding(bound[i], bound[j])) return padDefaults();
	return map;
}

/** The live bindings, one map per device. Read per frame by the race. */
export const controlSettings = $state({
	keyboard: loadKeyboard(),
	gamepad: loadGamepad()
});

function persistKeys(): void {
	if (browser) localStorage.setItem(KEY_STORE, JSON.stringify(controlSettings.keyboard));
}

function persistPad(): void {
	if (browser) localStorage.setItem(PAD_STORE, JSON.stringify(controlSettings.gamepad));
}

/** The action a key code drives, or null if the key is unbound. */
export function actionForKey(code: string): ControlAction | null {
	return keyConflict(code);
}

/** The action (other than `ignore`) currently holding this key, if any. */
export function keyConflict(code: string, ignore?: ControlAction): ControlAction | null {
	for (const a of ACTION_IDS) if (a !== ignore && controlSettings.keyboard[a] === code) return a;
	return null;
}

/** The action (other than `ignore`) currently holding this pad input, if any. */
export function padConflict(b: PadBinding, ignore?: ControlAction): ControlAction | null {
	for (const a of ACTION_IDS) if (a !== ignore && samePadBinding(controlSettings.gamepad[a], b)) return a;
	return null;
}

export function setKeyBinding(action: ControlAction, code: string): void {
	controlSettings.keyboard[action] = code;
	persistKeys();
}

/** Exchange two actions' key bindings (conflict resolution: never drops a key). */
export function swapKeyBindings(a: ControlAction, b: ControlAction): void {
	const t = controlSettings.keyboard[a];
	controlSettings.keyboard[a] = controlSettings.keyboard[b];
	controlSettings.keyboard[b] = t;
	persistKeys();
}

export function setPadBinding(action: ControlAction, b: PadBinding | null): void {
	controlSettings.gamepad[action] = b;
	persistPad();
}

/** Exchange two actions' pad bindings (a null side moves, never duplicates). */
export function swapPadBindings(a: ControlAction, b: ControlAction): void {
	const t = controlSettings.gamepad[a];
	controlSettings.gamepad[a] = controlSettings.gamepad[b];
	controlSettings.gamepad[b] = t;
	persistPad();
}

/**
 * Reset one action (both devices) to its defaults. If another action holds
 * the default input, the two SWAP (deterministic, keeps every binding unique,
 * and never silently unbinds the other action).
 */
export function resetActionBindings(action: ControlAction): void {
	const defKey = KEY_DEFAULTS[action];
	const kHolder = keyConflict(defKey, action);
	if (kHolder) controlSettings.keyboard[kHolder] = controlSettings.keyboard[action];
	controlSettings.keyboard[action] = defKey;
	const defPad = PAD_DEFAULTS[action];
	if (defPad) {
		const pHolder = padConflict(defPad, action);
		if (pHolder) controlSettings.gamepad[pHolder] = controlSettings.gamepad[action];
	}
	controlSettings.gamepad[action] = defPad ? { ...defPad } : null;
	persistKeys();
	persistPad();
}

/** Restore the entire default scheme on both devices. */
export function resetAllBindings(): void {
	controlSettings.keyboard = keyDefaults();
	controlSettings.gamepad = padDefaults();
	persistKeys();
	persistPad();
}

// ---- Gamepad reads (pure; the race calls these per frame) ----

/** Stick dead zone for analog axis reads (the historical steer dead zone). */
export const PAD_DEADZONE = 0.12;
/** How far an axis must travel to count as a digital press (held/edge reads). */
export const PAD_PRESS_THRESHOLD = 0.5;

/**
 * Analog 0..1 read of a binding: a button's analog value (triggers; digital
 * buttons report 0/1), or the bound direction of an axis past the dead zone.
 * Unbound reads 0.
 */
export function padBindingValue(pad: Gamepad, b: PadBinding | null): number {
	if (!b) return 0;
	if (b.kind === 'button') return pad.buttons[b.index]?.value ?? 0;
	const v = (pad.axes[b.axis] ?? 0) * b.dir;
	return v > PAD_DEADZONE ? v : 0;
}

/** Digital read of a binding (held state; edge detection is the caller's). */
export function padBindingHeld(pad: Gamepad, b: PadBinding | null): boolean {
	if (!b) return false;
	if (b.kind === 'button') return pad.buttons[b.index]?.pressed ?? false;
	return (pad.axes[b.axis] ?? 0) * b.dir > PAD_PRESS_THRESHOLD;
}

// ---- Display labels ----

const KEY_LABELS: Record<string, string> = {
	Space: 'Space',
	ArrowUp: '↑',
	ArrowDown: '↓',
	ArrowLeft: '←',
	ArrowRight: '→',
	ShiftLeft: 'L-Shift',
	ShiftRight: 'R-Shift',
	ControlLeft: 'L-Ctrl',
	ControlRight: 'R-Ctrl',
	AltLeft: 'L-Alt',
	AltRight: 'R-Alt',
	Enter: 'Enter',
	Tab: 'Tab',
	Backspace: 'Bksp',
	CapsLock: 'Caps',
	Backquote: '`',
	Minus: '-',
	Equal: '=',
	BracketLeft: '[',
	BracketRight: ']',
	Backslash: '\\',
	Semicolon: ';',
	Quote: "'",
	Comma: ',',
	Period: '.',
	Slash: '/'
};

/** Short display label for a key code ('KeyW' to 'W', 'ArrowUp' to an arrow). */
export function keyLabel(code: string | null): string {
	if (!code) return 'NONE';
	if (KEY_LABELS[code]) return KEY_LABELS[code];
	if (code.startsWith('Key')) return code.slice(3);
	if (code.startsWith('Digit')) return code.slice(5);
	if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
	return code;
}

const PAD_BUTTON_LABELS = [
	'A',
	'B',
	'X',
	'Y',
	'LB',
	'RB',
	'LT',
	'RT',
	'Back',
	'Start',
	'LS',
	'RS',
	'D-Pad ↑',
	'D-Pad ↓',
	'D-Pad ←',
	'D-Pad →',
	'Home'
];

/** Short display label for a pad binding, standard-mapping names. */
export function padLabel(b: PadBinding | null): string {
	if (!b) return 'NONE';
	if (b.kind === 'button') return PAD_BUTTON_LABELS[b.index] ?? `B${b.index}`;
	if (b.axis <= 3) {
		const stick = b.axis < 2 ? 'LS' : 'RS';
		const arrow = b.axis % 2 === 0 ? (b.dir < 0 ? '←' : '→') : (b.dir < 0 ? '↑' : '↓');
		return `${stick} ${arrow}`;
	}
	return `Axis ${b.axis}${b.dir < 0 ? '-' : '+'}`;
}
