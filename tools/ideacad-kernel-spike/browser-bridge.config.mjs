import {defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
export default defineConfig({
	root:process.cwd(),cacheDir:resolve('.output/ideacad-browser/cache'),
	resolve:{alias:{$lib:resolve('src/lib')}},
	test:{environment:'node',include:['tools/ideacad-kernel-spike/browser-bridge.test.ts'],
		globalSetup:[resolve('tests/db/cluster.ts')],hookTimeout:180000,testTimeout:1800000,fileParallelism:false}
});