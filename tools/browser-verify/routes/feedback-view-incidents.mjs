/**
 * THE ARMORY APP'S INCIDENTS (website requests v0.3, item 4b; 0233), the REAL
 * console in `/dev/feedback?view=incidents` against the harness's samples:
 * nine incidents, seven known kinds and one the site has never heard of, two
 * app versions plus a beta, one with no project, one linked to its reporter's
 * note, across three school days.
 *
 * WHAT IS READ: the groups are headed "kind, version (n)" with the newest group
 * first; the per-day table has fourteen rows whose counts are TEXT and sum to
 * the incidents shown; the person and project filters narrow the count and
 * widen it back (both directions); every card has its own Download .json and
 * the bar offers one zip; nothing on the page is wider than a phone.
 */
export default {
	path: '/dev/feedback?view=incidents',
	label: 'Armory incidents tab: groups by kind and version, counts per school day, filters, downloads',
	presence: [
		{ selector: '[data-testid="feedback-source-incidents"].on[aria-current="page"]', label: 'the strip lights Armory incidents', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="ai-group"]', label: 'eight kind-and-version groups', expectPresent: 8, maxPresent: 8, expectVisible: 8 },
		{ selector: '[data-testid="ai-row"]', label: 'nine incidents', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '[data-testid="ai-day-row"]', label: 'fourteen school days', expectPresent: 14, maxPresent: 14, expectVisible: 14 },
		{ selector: '[data-testid="ai-download"]', label: 'one Download .json per card', expectPresent: 9, maxPresent: 9, expectVisible: 9 },
		{ selector: '[data-testid="ai-zip"]', label: 'one zip key for the bar', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.ai-day-bar[aria-hidden="true"]', label: 'every per-day bar is decoration (aria-hidden); a day with none draws a zero-width bar', expectPresent: 14, maxPresent: 14, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="ai-zip"]', label: 'the zip key says what it will take', must: ['Download 9 shown as zip'] },
		{ selector: '[data-testid="ai-count"]', label: 'the count', must: ['9 of 9 shown'] }
	],
	orderResult: [
		{
			label: 'the newest group leads, an unknown kind is shown as sent, and the per-day counts are text summing to nine',
			evaluate: `() => {
				const titles = [...document.querySelectorAll('.ai-group-title')].map((h) => h.textContent.replace(/\\s+/g, ' ').trim());
				const counts = [...document.querySelectorAll('.ai-day-n')].map((n) => Number(n.textContent.trim()));
				return [
					titles[0],
					titles.some((t) => t.startsWith('diskFull, version 0.3.1-beta')) ? 'an unknown kind is shown as sent' : 'NO RAW KIND: ' + titles.join(' | '),
					counts.every((n) => Number.isInteger(n)) ? 'every count is a number in text' : 'A COUNT IS NOT TEXT',
					'per-day total ' + counts.reduce((a, b) => a + b, 0)
				];
			}`,
			expected: ['Crash, version 0.3.0 (2)', 'an unknown kind is shown as sent', 'every count is a number in text', 'per-day total 9']
		},
		{
			label: 'the person and the project filters narrow, and clearing them widens back',
			evaluate: `async () => {
				const flush = () => new Promise((r) => setTimeout(r, 60));
				const count = () => document.querySelector('[data-testid="ai-count"]').textContent.trim();
				const set = async (id, v) => { const s = document.querySelector('[data-testid="' + id + '"]'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); await flush(); };
				const out = [count()];
				await set('ai-person', 'harness.mentor@boscotech.edu'); out.push(count());
				await set('ai-person', ''); out.push(count());
				await set('ai-project', 'none'); out.push(count());
				await set('ai-project', 'p-sumo'); out.push(count());
				await set('ai-project', ''); out.push(count());
				return out;
			}`,
			expected: ['9 of 9 shown', '1 of 9 shown', '9 of 9 shown', '1 of 9 shown', '1 of 9 shown', '9 of 9 shown']
		}
	],
	contrast: [
		{ selector: '.ai-summary', label: 'an incident summary', min: 4.5 },
		{ selector: '.ai-meta', label: 'who, where and how big', min: 4.5 },
		{ selector: '.ai-group-title', label: 'the group headings', min: 4.5 },
		{ selector: '.ai-day-table td', label: 'the per-day counts', min: 4.5 },
		{ selector: '.ai-linked-text', label: 'the linked note', min: 4.5 },
		{ selector: '.ai-tab', label: 'the status tabs', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.ai-control', label: 'every control on the tab', min: 44 },
		{ selector: '[data-testid="feedback-sources"] a', label: 'the source strip keys', min: 44 },
		{ selector: '[data-testid="ai-per-day"] .disc-trigger', label: 'the Per day trigger', min: 44 }
	]
};
