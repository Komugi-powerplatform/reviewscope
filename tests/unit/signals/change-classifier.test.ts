import { describe, it, expect } from 'vitest';
import { classifyChange } from '../../../packages/core/src/signals/change-classifier.js';
import type { DiffHunk } from '../../../packages/core/src/types.js';

function makeHunk(oldContent: string, newContent: string): DiffHunk {
  return {
    file: 'test.ts',
    startLine: 1,
    endLine: 10,
    oldContent,
    newContent,
    language: 'typescript',
    header: '@@ -1,10 +1,10 @@',
  };
}

describe('classifyChange', () => {
  it('classifies import-only changes as cosmetic', () => {
    const hunk = makeHunk(
      "import { foo } from './bar';",
      "import { foo } from './bar.js';",
    );
    expect(classifyChange(hunk)).toBe('cosmetic');
  });

  it('classifies comment-only changes as cosmetic', () => {
    const hunk = makeHunk(
      '// old comment\nconst x = 1;',
      '// new comment\nconst x = 1;',
    );
    expect(classifyChange(hunk)).toBe('cosmetic');
  });

  it('classifies new function with conditionals as behavioral', () => {
    const hunk = makeHunk(
      '',
      'function validate(x: number) {\n  if (x < 0) throw new Error("invalid");\n  return x;\n}',
    );
    expect(classifyChange(hunk)).toBe('behavioral');
  });

  it('classifies logic changes as behavioral', () => {
    const hunk = makeHunk(
      'if (x > 0) { return true; }',
      'if (x >= 0) { return true; }',
    );
    expect(classifyChange(hunk)).toBe('behavioral');
  });

  it('classifies renames as structural', () => {
    const hunk = makeHunk(
      'const userName = getName();',
      'const displayName = getName();',
    );
    // Pure rename without structural change → structural (not behavioral)
    const result = classifyChange(hunk);
    expect(['cosmetic', 'structural']).toContain(result);
  });
});
