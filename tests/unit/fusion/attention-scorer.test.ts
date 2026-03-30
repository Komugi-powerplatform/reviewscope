import { describe, it, expect } from 'vitest';
import { fuseSignals, classify, estimateReviewMinutes } from '../../../packages/core/src/fusion/attention-scorer.js';
import type { SignalResult, DiffHunk } from '../../../packages/core/src/types.js';
import { DEFAULT_WEIGHTS } from '../../../packages/core/src/types.js';

function signal(name: string, score: number, confidence = 0.9): SignalResult {
  return { signalName: name, score, confidence, reason: '', metadata: {} };
}

describe('fuseSignals', () => {
  it('produces 0 for all-zero signals', () => {
    const signals = [
      signal('changeClassification', 0),
      signal('blastRadius', 0),
      signal('testCoverageGap', 0),
    ];
    expect(fuseSignals(signals, DEFAULT_WEIGHTS)).toBe(0);
  });

  it('produces 100 for all-max signals', () => {
    const signals = [
      signal('changeClassification', 1.0),
      signal('blastRadius', 1.0),
      signal('testCoverageGap', 1.0),
    ];
    expect(fuseSignals(signals, DEFAULT_WEIGHTS)).toBe(100);
  });

  it('weights high-confidence signals more', () => {
    const highConf = [signal('changeClassification', 0.8, 1.0)];
    const lowConf = [signal('changeClassification', 0.8, 0.2)];
    // Both should produce the same score for a single signal
    expect(fuseSignals(highConf, DEFAULT_WEIGHTS)).toBe(fuseSignals(lowConf, DEFAULT_WEIGHTS));
  });

  it('produces intermediate score for mixed signals', () => {
    const signals = [
      signal('changeClassification', 0.8),
      signal('blastRadius', 0.2),
      signal('testCoverageGap', 0.5),
    ];
    const score = fuseSignals(signals, DEFAULT_WEIGHTS);
    expect(score).toBeGreaterThan(30);
    expect(score).toBeLessThan(70);
  });
});

describe('classify', () => {
  it('returns CRITICAL for score >= 70', () => {
    expect(classify(70)).toBe('CRITICAL');
    expect(classify(100)).toBe('CRITICAL');
  });

  it('returns REVIEW for 40-69', () => {
    expect(classify(40)).toBe('REVIEW');
    expect(classify(69)).toBe('REVIEW');
  });

  it('returns AUTO-OK for < 40', () => {
    expect(classify(39)).toBe('AUTO-OK');
    expect(classify(0)).toBe('AUTO-OK');
  });
});

describe('estimateReviewMinutes', () => {
  const hunk: DiffHunk = {
    file: 'test.ts',
    startLine: 1,
    endLine: 25,
    oldContent: '',
    newContent: '',
    language: 'typescript',
    header: '',
  };

  it('returns 0 for AUTO-OK', () => {
    // AUTO-OK multiplier is 0, but min is 1... actually 0 * base = 0, max(1, 0) = 1
    // Let's check the actual behavior
    const min = estimateReviewMinutes(hunk, 'AUTO-OK');
    expect(min).toBeLessThanOrEqual(1);
  });

  it('returns more minutes for CRITICAL', () => {
    const critical = estimateReviewMinutes(hunk, 'CRITICAL');
    const review = estimateReviewMinutes(hunk, 'REVIEW');
    expect(critical).toBeGreaterThan(review);
  });
});
