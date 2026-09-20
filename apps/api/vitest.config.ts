import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    reporters: ['default'],
    // Integration tests share one real Postgres database and each test
    // truncates it (test/helpers/app.ts); running files in parallel means
    // one file's TRUNCATE wipes another file's in-flight data. See
    // docs/decisions.md ADR-006.
    fileParallelism: false,
  },
});
