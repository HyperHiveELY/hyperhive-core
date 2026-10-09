import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['tests/{risk,risk-properties,matching,recovery-continuity}.test.ts'],maxWorkers:1}});
