import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  noExternal: ['@reviewscope/core'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
