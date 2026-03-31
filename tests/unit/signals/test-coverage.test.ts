import { describe, it, expect } from 'vitest';
import { analyzeTestCoverage } from '../../../packages/core/src/signals/test-coverage.js';
import type { DiffHunk, AnalysisContext } from '../../../packages/core/src/types.js';

function makeHunk(file: string): DiffHunk {
  return {
    file,
    startLine: 1,
    endLine: 10,
    oldContent: '',
    newContent: 'const x = 1;',
    language: 'typescript',
    header: '@@ -1,10 +1,10 @@',
  };
}

function makeContext(overrides?: Partial<AnalysisContext>): AnalysisContext {
  return {
    repoRoot: '/tmp/fake-repo',
    allFiles: [],
    changedFiles: [],
    ...overrides,
  };
}

describe('analyzeTestCoverage', () => {
  it('returns score 0 for test files themselves', async () => {
    const result = await analyzeTestCoverage(makeHunk('src/auth.test.ts'), makeContext());
    expect(result.score).toBe(0.0);
    expect(result.metadata.isTestFile).toBe(true);
  });

  it('returns high score when no test file exists and PR has no tests', async () => {
    const result = await analyzeTestCoverage(makeHunk('src/auth.ts'), makeContext());
    expect(result.score).toBeGreaterThanOrEqual(0.7);
  });

  it('returns lower score when PR contains other test files', async () => {
    const result = await analyzeTestCoverage(
      makeHunk('src/auth.ts'),
      makeContext({ changedFiles: ['src/auth.ts', 'src/other.test.ts'] }),
    );
    expect(result.score).toBeLessThan(0.9);
  });

  it('returns signalName testCoverageGap', async () => {
    const result = await analyzeTestCoverage(makeHunk('src/auth.ts'), makeContext());
    expect(result.signalName).toBe('testCoverageGap');
  });
});
