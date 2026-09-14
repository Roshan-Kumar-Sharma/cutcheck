import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const CUTCHECK_VERSION: string = (require('../package.json') as { version: string }).version;
