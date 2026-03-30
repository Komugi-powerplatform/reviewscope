export { analyze } from './pipeline.js';
export type { AnalyzeOptions } from './pipeline.js';
export { parseDiff, flattenHunks } from './diff-parser.js';
export { fuseSignals, classify, buildAttentionScore } from './fusion/attention-scorer.js';
export { analyzeChangeClassification, classifyChange } from './signals/change-classifier.js';
export { analyzeBlastRadius } from './signals/blast-radius.js';
export { analyzeTestCoverage } from './signals/test-coverage.js';
export type * from './types.js';
export { DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS } from './types.js';
