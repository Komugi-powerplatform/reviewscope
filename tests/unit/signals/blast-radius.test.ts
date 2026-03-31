import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeBlastRadius, clearBlastRadiusCache } from '../../../packages/core/src/signals/blast-radius.js';
import type { DiffHunk, AnalysisContext } from '../../../packages/core/src/types.js';

function makeHunk(file: string): DiffHunk {
  return {
    file,
    startLine: 1,
    endLine: 10,
    oldContent: '',
    newContent: 'export function foo() {}',
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

beforeEach(() => {
  clearBlastRadiusCache();
});

describe('analyzeBlastRadius', () => {
  it('returns 0 score when no files exist', async () => {
    const result = await analyzeBlastRadius(makeHunk('src/utils.ts'), makeContext());
    expect(result.score).toBe(0);
    expect(result.metadata.consumerCount).toBe(0);
  });

  it('returns signalName blastRadius', async () => {
    const result = await analyzeBlastRadius(makeHunk('src/utils.ts'), makeContext());
    expect(result.signalName).toBe('blastRadius');
  });

  it('has confidence between 0 and 1', async () => {
    const result = await analyzeBlastRadius(makeHunk('src/utils.ts'), makeContext());
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
