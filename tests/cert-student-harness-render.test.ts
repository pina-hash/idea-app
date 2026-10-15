// tests/cert-student-harness-render.test.ts
//
// EVERY STUDENT HARNESS RENDERS, IN EVERY STATE (ledger 0391). The browser
// pass drives these pages for geometry and contrast; this is the cheaper
// guard that the REAL page components server-render over every fixture
// without throwing and with the hooks the specs name present in the markup,
// so a fixture or a component change that breaks a state is found here before
// a harness run spends minutes on a page that never painted.
//
// The harness `+page.svelte` files themselves read `$app/state` and mount the
// shell (ProfileMenu, the logo); what is rendered here is the same page
// component each harness mounts, over the same fixtures, with the same props.
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import CertificationPage from '$lib/certifications/student/CertificationPage.svelte';
import HoldersBoard from '$lib/certifications/student/HoldersBoard.svelte';
import MyCertifications from '$lib/certifications/student/MyCertifications.svelte';
import NotificationsList from '$lib/certifications/student/NotificationsList.svelte';
import { KIT_SECTIONS, sectionId } from '$lib/certifications/student/kit';
import { certFor, HOLDERS, ME, NOTIFICATIONS, PAGE_STATES, SETTINGS } from '../src/routes/dev/cert-certification/fixtures';

const strip = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe('the certification page renders every harness state', () => {
	for (const state of PAGE_STATES) {
		it(`state ${state}: the checklist, nine anchored sections, no address, no em dash`, () => {
			const cert = certFor(state);
			const html = strip(render(CertificationPage, { props: { cert, settings: SETTINGS, anchorPrefix: `kit-${state}`, post: null, rpc: null, makeUploader: null } }).body);
			expect(count(html, /data-testid="cert-check-row"/g)).toBe(5);
			expect(count(html, /data-testid="cert-kit-section"/g)).toBe(9);
			for (const section of KIT_SECTIONS) expect(html, section).toContain(`id="${sectionId(`kit-${state}`, section)}"`);
			expect(html).not.toContain('@boscotech');
			expect(html).not.toContain('—');
			// With no transports, no RPC-driven control is offered (absence is the mechanism).
			expect(count(html, /data-testid="cert-lesson-complete"/g)).toBe(0);
		});
	}

	it('the states differ where they should: Start only before an attempt, forms only where unlocked and pending', () => {
		const html = (state: (typeof PAGE_STATES)[number]) =>
			strip(render(CertificationPage, { props: { cert: certFor(state), settings: SETTINGS, anchorPrefix: 'kit', post: null, rpc: null, makeUploader: null } }).body);
		expect(count(html('fresh'), /data-testid="cert-start"/g)).toBe(1);
		expect(count(html('fresh'), /data-testid="cert-withdraw"/g)).toBe(0);
		expect(count(html('training'), /data-testid="cert-start"/g)).toBe(0);
		expect(count(html('training'), /data-testid="cert-withdraw"/g)).toBe(1);
		expect(count(html('training'), /data-testid="cert-submission-form"/g)).toBe(0);
		expect(count(html('guided'), /data-testid="cert-submission-form"/g)).toBe(1);
		expect(html('guided')).toContain('data-part="guided"');
		expect(count(html('review'), /data-testid="cert-submission-form"/g)).toBe(0);
		expect(count(html('review'), /data-testid="cert-review"/g)).toBe(2);
		expect(count(html('exam'), /data-testid="cert-exam-open-key"/g)).toBe(1);
		expect(count(html('cooldown'), /data-testid="cert-exam-cooldown"/g)).toBe(1);
		expect(html('cooldown')).toContain('June 1, 2031');
		expect(count(html('complete'), /data-state="done"/g)).toBe(5);
		expect(count(html('complete'), /data-testid="cert-checklist-earned"/g)).toBe(1);
	});
});

describe('the other student pages render their fixtures', () => {
	it('My certifications: two earned, one in progress, three in history', () => {
		const html = strip(render(MyCertifications, { props: { me: ME } }).body);
		expect(count(html, /data-testid="cert-award-card"/g)).toBe(2);
		expect(count(html, /data-testid="cert-me-attempt"/g)).toBe(1);
		expect(count(html, /data-testid="cert-me-history-row"/g)).toBe(3);
		expect(html).toContain('1 of 5 parts done');
		expect(html).not.toContain('@boscotech');
		const empty = strip(render(MyCertifications, { props: { me: { attempts: [], awards: [], notifications_unread: 0 } } }).body);
		expect(count(empty, /data-testid="cert-me-no-awards"/g)).toBe(1);
		expect(count(empty, /data-testid="cert-award-card"/g)).toBe(0);
	});

	it('the holders board: three certifications, eight rows, six people, never an address', () => {
		const byCert = strip(render(HoldersBoard, { props: { holders: HOLDERS } }).body);
		expect(count(byCert, /data-testid="cert-holders-cert"/g)).toBe(3);
		expect(count(byCert, /data-testid="cert-holder-row"/g)).toBe(8);
		expect(byCert).toContain('6 holders');
		const byPerson = strip(render(HoldersBoard, { props: { holders: HOLDERS, initialView: 'person' } }).body);
		expect(count(byPerson, /data-testid="cert-holder-person"/g)).toBe(6);
		for (const html of [byCert, byPerson]) {
			expect(html).not.toMatch(/@[a-z0-9.-]+\.(net|edu|com)/i);
			expect(html).toContain('Suspended');
			expect(html).toContain('Revoked');
		}
		const empty = strip(render(HoldersBoard, { props: { holders: { by_certification: [], by_person: [] } } }).body);
		expect(count(empty, /data-testid="cert-holders-empty"/g)).toBe(1);
	});

	it('notifications: newest first, the unread marked New, Mark all read offered while any is unread', () => {
		const html = strip(render(NotificationsList, { props: { rows: NOTIFICATIONS, post: null } }).body);
		expect(count(html, /data-testid="cert-notification"/g)).toBe(3);
		expect(count(html, /data-read="no"/g)).toBe(2);
		expect(html).toContain('2 new');
		expect(html.indexOf('Your guided project was returned')).toBeLessThan(html.indexOf('You earned Shop Safety'));
		expect(html).toMatch(/aria-disabled="false"[^>]*data-testid="cert-mark-all-read"/);
		const read = strip(render(NotificationsList, { props: { rows: NOTIFICATIONS.map((n) => ({ ...n, read_at: n.read_at ?? n.created_at })), post: null } }).body);
		expect(count(read, /data-read="no"/g)).toBe(0);
		expect(read).toMatch(/aria-disabled="true"[^>]*data-testid="cert-mark-all-read"/);
	});
});
