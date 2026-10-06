/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * IDEA ARMORY (ledger armory-b-website): every website state of the vault,
 * stacked on /dev/armory through the real components. What has to be true of
 * each: the state is said in WORDS beside its glyph (never colour alone), a
 * student surface's controls clear 44px, the words clear 4.5:1, and the last
 * mentor is never offered a Remove whose only answer is a refusal.
 */
export default {
	path: '/dev/armory',
	label: 'IDEA Armory: files, live marks, people, history, connect and download (every state)',
	prepare: [{ waitFor: '() => !!document.querySelector("[data-armory-hydrated]")' }],
	presence: [
		{ selector: '[data-view="empty"] [data-testid="armory-empty"]', label: 'the empty project says how files arrive', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="editing"] [data-state="editing"]', label: 'two files being edited', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-view="synced"] [data-state="synced"]', label: 'five files saved', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-view="offline"] [data-state="editing-quiet"]', label: 'one file held by a quiet computer', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="offline"] [data-state="waiting"]', label: 'one file waiting for its first upload', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="side"] [data-testid="armory-side-chip"]', label: 'side-version chips', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-view="storage-off"] [data-testid="armory-storage-off"]', label: 'storage not configured, in words', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="synced"] [data-testid="armory-add-member"]', label: 'a student is offered no Add', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="editing"] [data-testid="armory-add-member"]', label: 'a mentor is offered Add', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="file-side"] [data-kind="side_version"]', label: 'side versions in the history', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-view="connect"] [data-testid="armory-connect-form"]', label: 'the connect question', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="download-none"] [data-testid="armory-flash-drive"]', label: 'no token: the flash-drive sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="download-none"] a[href^="/armory/download/"]', label: 'no token: no broken download link', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-view="download"] a[href^="/armory/download/"]', label: 'two installer links', expectPresent: 2, maxPresent: 2, expectVisible: 2 }
	],
	textContains: [
		{ selector: '[data-view="editing"] [data-state="editing"]', label: 'editing is said in plain words', must: ['Someone is editing this', 'Lab PC 3'] },
		{ selector: '[data-view="offline"] [data-state="editing-quiet"]', label: 'a quiet computer is said in plain words', must: ['gone quiet', 'Lab PC 7'] },
		{ selector: '[data-view="file-side"]', label: 'a side version says why it exists', must: ['Side version', 'Nothing was lost'] },
		{ selector: '[data-view="connect"]', label: 'the contract 3b question', must: ['Connect Lab PC 3 to Armory as ana.reyes@boscotech.net?'] },
		{ selector: '[data-view="download-none"]', label: 'the flash drive', must: ['Ask Mr. Pina for the Armory flash drive'] },
		{ selector: '[data-view="download"]', label: 'WebView2 and the SHA-256', must: ['WebView2', 'Windows 11', '65f65ac9ccb90667ec42fd298cb95fffa3e1556de68b50ff52d10201d51cbcdd'] }
	],
	tapTargets: [
		{ selector: '[data-view="editing"] a.ar-file', label: 'file rows', min: 44 },
		{ selector: '[data-view="editing"] .ar-member .ar-btn', label: 'Remove', min: 44 },
		{ selector: '[data-view="editing"] [data-testid="armory-add-member"] :is(input, select, button)', label: 'the add form', min: 44 },
		{ selector: '[data-view="projects"] a.ar-project', label: 'project cards', min: 44 },
		{ selector: '[data-view="connect"] .ar-btn', label: 'Connect and Not now', min: 44 },
		{ selector: '[data-view="download"] .ar-btn', label: 'download buttons', min: 44 }
	],
	contrast: [
		{ selector: '[data-view="editing"] .ar-file-name', label: 'file names', min: 4.5 },
		{ selector: '[data-view="editing"] .ar-file-line', label: 'who and when', min: 4.5 },
		{ selector: '[data-view="editing"] .ar-state.ar-tone-editing', label: 'the editing word', min: 4.5 },
		{ selector: '[data-view="synced"] .ar-state.ar-tone-synced', label: 'the saved word', min: 4.5 },
		{ selector: '[data-view="offline"] .ar-state.ar-tone-quiet', label: 'the quiet word', min: 4.5 },
		{ selector: '[data-view="editing"] .ar-member-email', label: 'member emails and roles', min: 4.5 },
		{ selector: '[data-view="file-side"] .ar-entry-why', label: 'why a side version exists', min: 4.5 },
		{ selector: '[data-view="download"] .ar-hash', label: 'the SHA-256', min: 4.5 }
	]
};
