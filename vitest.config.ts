import {defineConfig} from 'vitest/config';

export default defineConfig({
  test:{
    include:['tests/**/*.test.ts'],
    testTimeout:30000,
    hookTimeout:30000,
    maxWorkers:2,
    coverage:{
      provider:'v8',
      include:['packages/**/*.ts','apps/{api,auditor,mcp,paper,signer,worker}/**/*.ts'],
      exclude:['**/*.d.ts'],
      reporter:['text-summary','json-summary','lcovonly'],
      thresholds:{lines:95},
    },
  },
});
