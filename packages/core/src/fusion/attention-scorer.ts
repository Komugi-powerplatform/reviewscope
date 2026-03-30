import type { SignalResult, AttentionLevel, AttentionScore, DiffHunk, FusionWeights } from '../types.js';
import { DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS } from '../types.js';

const WEIGHT_KEY_MAP: Record<string, keyof FusionWeights> = {
  changeClassification: 'changeClassification',
  blastRadius: 'blastRadius',
  testCoverageGap: 'testCoverageGap',
  historicalRisk: 'historicalRisk',
  aiDetection: 'aiDetection',
  complexityDelta: 'complexityDelta',
};

export function fuseSignals(
  signals: SignalResult[],
  weights: FusionWeights = DEFAULT_WEIGHTS,
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const signal of signals) {
    const key = WEIGHT_KEY_MAP[signal.signalName];
    if (!key) continue;

    const w = weights[key];
    if (w === 0) continue;

    const effectiveWeight = w * signal.confidence;
    weightedSum += signal.score * effectiveWeight;
    totalWeight += effectiveWeight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100);
}

export function classify(
  score: number,
  thresholds = DEFAULT_THRESHOLDS,
): AttentionLevel {
  if (score >= thresholds.critical) return 'CRITICAL';
  if (score >= thresholds.review) return 'REVIEW';
  return 'AUTO-OK';
}

export function estimateReviewMinutes(hunk: DiffHunk, level: AttentionLevel): number {
  const lineCount = Math.max(1, hunk.endLine - hunk.startLine + 1);
  const baseMinutes = lineCount / 25;
  const multiplier = level === 'CRITICAL' ? 3.0 : level === 'REVIEW' ? 1.5 : 0;
  return Math.max(1, Math.round(baseMinutes * multiplier));
}

export function buildAttentionScore(
  hunk: DiffHunk,
  signals: SignalResult[],
  weights?: FusionWeights,
): AttentionScore {
  const score = fuseSignals(signals, weights);
  const level = classify(score);
  const minutes = estimateReviewMinutes(hunk, level);

  return {
    hunk,
    level,
    score,
    signals,
    estimatedReviewMinutes: minutes,
  };
}
