// Tournament team, player and tournament names must hold a visible character (report a5fc5e64).
import { describe, expect, it } from 'vitest';
import { cleanName, hasVisibleText } from '$lib/tournaments/names';
import { validateSettings, tournamentCreateArgs, draftFromStored } from '$lib/tournaments/settings';

describe('blank tournament names', () => {
	it('refuses whitespace and invisible-only names, keeps real ones', () => {
		for (const blank of ['', '   ', '\t\n', '  ', '​​', '⠀', 'ㅤ ', null, undefined]) {
			expect(hasVisibleText(blank as string), JSON.stringify(blank)).toBe(false);
			expect(cleanName(blank as string)).toBe('');
		}
		expect(hasVisibleText('Team Rocket')).toBe(true);
		expect(cleanName('  Team ​ Rocket  ')).toBe('Team Rocket');
		expect(cleanName('Ñandú')).toBe('Ñandú');
	});

	it('the new tournament form refuses an invisible name and sends the cleaned one', () => {
		const d = draftFromStored('​ ', '', null);
		expect(validateSettings(d)).toBe('Give the tournament a name.');
		const ok = draftFromStored('  Spring Cup ', '', null);
		expect(validateSettings(ok)).toBeNull();
		expect(tournamentCreateArgs(ok).p_name).toBe('Spring Cup');
	});
});
