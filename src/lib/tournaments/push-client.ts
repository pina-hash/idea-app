/**
 * Browser side of tournament match alerts: register the minimal push service
 * worker (static/push-sw.js -- push + notification click only, no caching),
 * subscribe with the deployment's public VAPID key, and record the
 * subscription through the push_subscribe RPC (0063).
 *
 * The public key rides $env/dynamic/public so an unconfigured deployment
 * degrades to pushState() === 'unconfigured' and the UI hides itself -- never
 * a build break (the PUBLIC_FSP_* convention).
 */

import { env as publicEnv } from '$env/dynamic/public';
import type { SupabaseClient } from '@supabase/supabase-js';

const SW_PATH = '/push-sw.js';

export type PushAvailability = 'unconfigured' | 'unsupported' | 'denied' | 'available';

export function pushAvailability(): PushAvailability {
	if (!publicEnv.PUBLIC_VAPID_PUBLIC_KEY) return 'unconfigured';
	if (
		typeof window === 'undefined' ||
		!('serviceWorker' in navigator) ||
		!('PushManager' in window) ||
		!('Notification' in window)
	) {
		return 'unsupported';
	}
	if (Notification.permission === 'denied') return 'denied';
	return 'available';
}

/** Whether THIS browser already holds a push subscription (registration may
 * still be missing server-side if the account changed; enabling re-upserts). */
export async function hasLocalSubscription(): Promise<boolean> {
	if (pushAvailability() !== 'available') return false;
	try {
		const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
		return !!(reg && (await reg.pushManager.getSubscription()));
	} catch {
		return false;
	}
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
	const padding = '='.repeat((4 - (base64.length % 4)) % 4);
	const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** "Windows · Chrome" style label so the account's device list reads sanely. */
export function deviceLabel(): string {
	const ua = navigator.userAgent;
	const os = /Windows/.test(ua)
		? 'Windows'
		: /Android/.test(ua)
			? 'Android'
			: /iPhone|iPad|iPod/.test(ua)
				? 'iOS'
				: /Mac/.test(ua)
					? 'macOS'
					: /Linux|CrOS/.test(ua)
						? (/CrOS/.test(ua) ? 'ChromeOS' : 'Linux')
						: 'Device';
	const browser = /Edg\//.test(ua)
		? 'Edge'
		: /OPR\//.test(ua)
			? 'Opera'
			: /Chrome\//.test(ua)
				? 'Chrome'
				: /Firefox\//.test(ua)
					? 'Firefox'
					: /Safari\//.test(ua)
						? 'Safari'
						: 'Browser';
	return `${os} · ${browser}`;
}

/**
 * The whole enable flow: permission -> SW registration -> push subscription
 * -> push_subscribe RPC. Resolves { ok } or { ok: false, error } with a
 * user-facing message; safe to call again (re-upserts the same endpoint).
 */
export async function enablePush(
	supabase: SupabaseClient
): Promise<{ ok: boolean; error?: string }> {
	const avail = pushAvailability();
	if (avail === 'unconfigured') {
		return { ok: false, error: 'Push notifications are not configured on this deployment.' };
	}
	if (avail === 'unsupported') {
		return {
			ok: false,
			error: 'This browser does not support push notifications. On iPhone/iPad, add the site to your Home Screen first.'
		};
	}
	if (avail === 'denied' || (await Notification.requestPermission()) !== 'granted') {
		return { ok: false, error: 'Notifications are blocked for this site in your browser settings.' };
	}
	try {
		const reg = await navigator.serviceWorker.register(SW_PATH);
		await navigator.serviceWorker.ready;
		const sub =
			(await reg.pushManager.getSubscription()) ??
			(await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(
					publicEnv.PUBLIC_VAPID_PUBLIC_KEY!
				) as unknown as BufferSource
			}));
		const raw = sub.toJSON();
		if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
			return { ok: false, error: 'The browser returned an incomplete subscription.' };
		}
		const { error } = await supabase.rpc('push_subscribe', {
			p_endpoint: raw.endpoint,
			p_p256dh: raw.keys.p256dh,
			p_auth: raw.keys.auth,
			p_device_label: deviceLabel()
		});
		if (error) return { ok: false, error: error.message };
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
