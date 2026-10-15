/**
 * Every address in the IDEA Certification Portal, written once. A surface that
 * links to another names a function here, never a string, so a moved route
 * moves every link with it.
 */

export const CERT_ROOT = '/certifications';

export const CERT_PATHS = {
	catalog: CERT_ROOT,
	me: `${CERT_ROOT}/me`,
	holders: `${CERT_ROOT}/holders`,
	verify: `${CERT_ROOT}/verify`,
	publicKey: `${CERT_ROOT}/verify/public-key`,
	notifications: `${CERT_ROOT}/notifications`,
	desk: `${CERT_ROOT}/desk`,
	deskSittings: `${CERT_ROOT}/desk/sittings`,
	deskLive: `${CERT_ROOT}/desk/sittings/live`,
	deskRecords: `${CERT_ROOT}/desk/records`,
	deskAuthority: `${CERT_ROOT}/desk/authority`,
	deskEngine: `${CERT_ROOT}/desk/engine`,
	deskEngineImport: `${CERT_ROOT}/desk/engine/import`,
	deskLogs: `${CERT_ROOT}/desk/logs`
} as const;

export const certHref = (code: string) => `${CERT_ROOT}/${encodeURIComponent(code)}`;
export const examHref = (code: string, examId: string) =>
	`${CERT_ROOT}/${encodeURIComponent(code)}/exam/${encodeURIComponent(examId)}`;
export const certificateHref = (serial: string) =>
	`${CERT_ROOT}/certificate/${encodeURIComponent(serial)}`;
export const verifyHref = (serial?: string | null) =>
	serial ? `${CERT_PATHS.verify}?serial=${encodeURIComponent(serial)}` : CERT_PATHS.verify;
export const lessonDocumentHref = (lessonId: string) =>
	`${CERT_ROOT}/lesson/${encodeURIComponent(lessonId)}`;

export const deskStudentHref = (email: string) =>
	`${CERT_PATHS.desk}/students/${encodeURIComponent(email)}`;
export const deskReviewHref = (submissionId: string) =>
	`${CERT_PATHS.desk}/review/${encodeURIComponent(submissionId)}`;
export const deskAwardHref = (attemptId: string) =>
	`${CERT_PATHS.desk}/award/${encodeURIComponent(attemptId)}`;
export const deskRecordHref = (awardId: string) =>
	`${CERT_PATHS.deskRecords}/${encodeURIComponent(awardId)}`;
export const deskEngineHref = (certificationId: string) =>
	`${CERT_PATHS.deskEngine}/${encodeURIComponent(certificationId)}`;

/** The public, absolute verify URL the certificate's QR and the emails carry. */
export const CERT_SITE_ORIGIN = 'https://ideabosco.com';
export const verifyUrl = (serial: string, origin: string = CERT_SITE_ORIGIN) =>
	`${origin}${verifyHref(serial)}`;

/** API routes, for the fetches that need a server (a credential, a signature). */
export const CERT_API = {
	award: '/api/certifications/award',
	correct: '/api/certifications/correct',
	evidenceSign: '/api/certifications/evidence/sign',
	evidence: (path: string) => `/api/certifications/evidence/${path.split('/').map(encodeURIComponent).join('/')}`,
	exportLogs: '/api/certifications/export',
	packageExport: (id: string) => `/api/certifications/package/export/${encodeURIComponent(id)}`,
	packageImport: '/api/certifications/package/import',
	jobs: (job: string) => `/api/certifications/jobs/${job}`
} as const;

export interface DeskTab {
	id: 'desk' | 'sittings' | 'live' | 'records' | 'authority' | 'engine' | 'logs';
	label: string;
	href: string;
	/** Admin only tabs render for a certifier as read-only or not at all. */
	adminOnly: boolean;
}

export const DESK_TABS: readonly DeskTab[] = [
	{ id: 'desk', label: 'Desk', href: CERT_PATHS.desk, adminOnly: false },
	{ id: 'sittings', label: 'Sittings', href: CERT_PATHS.deskSittings, adminOnly: false },
	{ id: 'live', label: 'Live exam', href: CERT_PATHS.deskLive, adminOnly: false },
	{ id: 'records', label: 'Records', href: CERT_PATHS.deskRecords, adminOnly: false },
	{ id: 'authority', label: 'Authority', href: CERT_PATHS.deskAuthority, adminOnly: true },
	{ id: 'engine', label: 'Engine', href: CERT_PATHS.deskEngine, adminOnly: false },
	{ id: 'logs', label: 'Logs', href: CERT_PATHS.deskLogs, adminOnly: false }
];

export const isDeskPath = (pathname: string) =>
	pathname === CERT_PATHS.desk || pathname.startsWith(`${CERT_PATHS.desk}/`);

/** Which desk tab a path belongs to, by longest matching prefix. */
export function deskTabFor(pathname: string): DeskTab['id'] | null {
	if (!isDeskPath(pathname)) return null;
	let best: DeskTab | null = null;
	for (const tab of DESK_TABS) {
		if (pathname === tab.href || pathname.startsWith(`${tab.href}/`)) {
			if (!best || tab.href.length > best.href.length) best = tab;
		}
	}
	return best?.id ?? 'desk';
}

/** The student-side tabs in the portal's own bar. */
export const STUDENT_TABS = [
	{ id: 'catalog', label: 'Certifications', href: CERT_PATHS.catalog },
	{ id: 'me', label: 'My certifications', href: CERT_PATHS.me },
	{ id: 'holders', label: 'Holders', href: CERT_PATHS.holders },
	{ id: 'verify', label: 'Verify', href: CERT_PATHS.verify }
] as const;

export function studentTabFor(pathname: string): (typeof STUDENT_TABS)[number]['id'] | null {
	if (pathname === CERT_PATHS.me || pathname.startsWith(`${CERT_PATHS.me}/`)) return 'me';
	if (pathname === CERT_PATHS.holders) return 'holders';
	if (pathname === CERT_PATHS.verify || pathname.startsWith(`${CERT_PATHS.verify}/`)) return 'verify';
	if (pathname === CERT_PATHS.catalog || (pathname.startsWith(`${CERT_ROOT}/`) && !isDeskPath(pathname)))
		return 'catalog';
	return null;
}
