import { error } from '@sveltejs/kit';
import { itemById } from '../../../../classroom-palette/fixture';
import type { PageLoad } from './$types';

/** The item load, mirroring the real one: it returns the ITEM and nothing else. */
export const load: PageLoad = async ({ params }) => {
	const item = itemById(params.itemId);
	if (!item) error(404, 'Not found');
	return { item };
};
