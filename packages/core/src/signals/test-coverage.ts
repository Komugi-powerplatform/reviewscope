import { access } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import type { DiffHunk, SignalResult, AnalysisContext } from '../types.js';

const TEST_FILE_PATTERNS: Record<string, (file: string) => string[]> = {
  typescript: (file) => {
    const dir = dirname(file);
    const base = basename(file, '.ts').replace('.tsx', '');
    return [
      join(dir, `${base}.test.ts`),
      join(dir, `${base}.test.tsx`),
      join(dir, `${base}.spec.ts`),
      join(dir, `__tests__`, `${base}.test.ts`),
      join(dir, `__tests__`, `${base}.test.tsx`),
    ];
  },
  python: (file) => {
    const dir = dirname(file);
    const base = basename(file, '.py');
    return [
      join(dir, `test_${base}.py`),
      join(dir, `${base}_test.py`),
      join(dir, 'tests', `test_${base}.py`),
    ];
  },
  go: (file) => {
    const base = file.replace('.go', '');
    return [`${base}_test.go`];
  },
  rust: (file) => {
    // Rust tests are typically inline, but can also be in tests/
    const dir = dirname(file);
    const base = basename(file, '.rs');
    return [
      join(dirname(dir), 'tests', `${base}.rs`),
    ];
  },
  java: (file) => {
    const base = basename(file, '.java');
    // Common convention: src/main → src/test
    const testPath = file.replace('/main/', '/test/').replace(`${base}.java`, `${base}Test.java`);
    return [testPath];
  },
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findTestFile(hunk: DiffHunk, context: AnalysisContext): Promise<{ exists: boolean; modified: boolean }> {
  const lang = hunk.language;
  if (lang === 'unknown') return { exists: false, modified: false };

  const patternFn = TEST_FILE_PATTERNS[lang] ?? TEST_FILE_PATTERNS.typescript;
  const candidates = patternFn(hunk.file);

  for (const candidate of candidates) {
    const absPath = join(context.repoRoot, candidate);
    if (await fileExists(absPath)) {
      const modified = context.changedFiles.includes(candidate);
      return { exists: true, modified };
    }
  }

  return { exists: false, modified: false };
}

function prContainsTests(context: AnalysisContext): boolean {
  return context.changedFiles.some(f =>
    f.includes('.test.') ||
    f.includes('.spec.') ||
    f.includes('_test.') ||
    f.includes('test_') ||
    f.includes('Test.java') ||
    f.includes('/tests/')
  );
}

export async function analyzeTestCoverage(
  hunk: DiffHunk,
  context: AnalysisContext,
): Promise<SignalResult> {
  // Skip test files themselves
  const file = hunk.file;
  if (file.includes('.test.') || file.includes('.spec.') || file.includes('_test.') || file.includes('test_')) {
    return {
      signalName: 'testCoverageGap',
      score: 0.0,
      confidence: 1.0,
      reason: 'This is a test file',
      metadata: { isTestFile: true },
    };
  }

  const testFile = await findTestFile(hunk, context);

  if (testFile.exists && testFile.modified) {
    return {
      signalName: 'testCoverageGap',
      score: 0.20,
      confidence: 0.70,
      reason: 'Test file exists and was updated in this PR',
      metadata: { testExists: true, testModified: true },
    };
  }

  if (testFile.exists && !testFile.modified) {
    return {
      signalName: 'testCoverageGap',
      score: 0.50,
      confidence: 0.60,
      reason: 'Test file exists but was NOT updated — possible gap',
      metadata: { testExists: true, testModified: false },
    };
  }

  // No test file found
  const hasAnyTests = prContainsTests(context);

  return {
    signalName: 'testCoverageGap',
    score: hasAnyTests ? 0.70 : 0.90,
    confidence: 0.80,
    reason: 'No test file found for this module',
    metadata: { testExists: false, prHasTests: hasAnyTests },
  };
}
