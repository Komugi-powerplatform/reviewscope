export type SupportedLanguage = 'typescript' | 'python' | 'go' | 'rust' | 'java' | 'unknown';

export type ChangeType = 'cosmetic' | 'structural' | 'behavioral';
export type AttentionLevel = 'CRITICAL' | 'REVIEW' | 'AUTO-OK';

export interface DiffHunk {
  file: string;
  startLine: number;
  endLine: number;
  oldContent: string;
  newContent: string;
  language: SupportedLanguage;
  header: string;
}

export interface SignalResult {
  signalName: string;
  score: number;
  confidence: number;
  reason: string;
  metadata: Record<string, unknown>;
}

export interface AttentionScore {
  hunk: DiffHunk;
  level: AttentionLevel;
  score: number;
  signals: SignalResult[];
  estimatedReviewMinutes: number;
}

export interface ReviewScopeResult {
  hunks: AttentionScore[];
  summary: {
    totalHunks: number;
    criticalCount: number;
    reviewCount: number;
    autoOkCount: number;
    estimatedTotalMinutes: number;
  };
  metadata: {
    analysisTimeMs: number;
    commitRange: string;
  };
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
}

export interface SignalAnalyzer {
  name: string;
  analyze(hunk: DiffHunk, context: AnalysisContext): Promise<SignalResult>;
}

export interface AnalysisContext {
  repoRoot: string;
  allFiles: string[];
  changedFiles: string[];
}

export interface FusionWeights {
  changeClassification: number;
  blastRadius: number;
  testCoverageGap: number;
  historicalRisk: number;
  aiDetection: number;
  complexityDelta: number;
}

export const DEFAULT_WEIGHTS: FusionWeights = {
  changeClassification: 0.30,
  blastRadius: 0.25,
  testCoverageGap: 0.25,
  historicalRisk: 0.10,
  aiDetection: 0.10,
  complexityDelta: 0.00, // Phase 1: not yet implemented
};

export const DEFAULT_THRESHOLDS = {
  critical: 70,
  review: 40,
} as const;
