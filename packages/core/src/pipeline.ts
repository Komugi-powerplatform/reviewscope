import { execSync } from 'node:child_process';
import { parseDiff, flattenHunks } from './diff-parser.js';
import { analyzeChangeClassification } from './signals/change-classifier.js';
import { analyzeBlastRadius, clearBlastRadiusCache } from './signals/blast-radius.js';
import { analyzeTestCoverage } from './signals/test-coverage.js';
import { buildAttentionScore } from './fusion/attention-scorer.js';
import type { ReviewScopeResult, AnalysisContext, DiffHunk, SignalResult } from './types.js';

const AUTO_SKIP_PATTERNS = [
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^Gemfile\.lock$/,
  /^Cargo\.lock$/,
  /^go\.sum$/,
  /^composer\.lock$/,
  /^poetry\.lock$/,
  /node_modules\//,
  /^\.git\//,
  /\.(png|jpg|jpeg|gif|svg|ico|webp|bmp|woff|woff2|ttf|eot|mp3|mp4|zip|tar|gz|exe|dll|so|dylib)$/i,
];

function shouldSkipFile(filePath: string): boolean {
  return AUTO_SKIP_PATTERNS.some(p => p.test(filePath));
}

async function analyzeHunk(hunk: DiffHunk, context: AnalysisContext): Promise<SignalResult[]> {
  const results = await Promise.all([
    analyzeChangeClassification(hunk, context),
    analyzeBlastRadius(hunk, context),
    analyzeTestCoverage(hunk, context),
  ]);
  return results;
}

function listRepoFiles(repoRoot: string): string[] {
  try {
    const output = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    return output.trim().split('\n').filter(f => f && !f.startsWith('node_modules/'));
  } catch {
    return [];
  }
}

function listChangedFiles(diffText: string): string[] {
  const files = parseDiff(diffText);
  return files.map(f => f.newPath).filter(p => p !== '/dev/null');
}

export interface AnalyzeOptions {
  diffText: string;
  repoRoot: string;
}

export async function analyze(options: AnalyzeOptions): Promise<ReviewScopeResult> {
  // Clear caches from previous runs
  clearBlastRadiusCache();
  const start = performance.now();

  const files = parseDiff(options.diffText);
  const allHunks = flattenHunks(files);

  // Filter out lock files, binaries, node_modules, etc.
  const hunks = allHunks.filter(h => !shouldSkipFile(h.file));

  if (hunks.length === 0) {
    return {
      hunks: [],
      summary: {
        totalHunks: 0,
        criticalCount: 0,
        reviewCount: 0,
        autoOkCount: 0,
        estimatedTotalMinutes: 0,
      },
      metadata: {
        analysisTimeMs: Math.round(performance.now() - start),
        commitRange: '',
      },
    };
  }

  const context: AnalysisContext = {
    repoRoot: options.repoRoot,
    allFiles: listRepoFiles(options.repoRoot),
    changedFiles: listChangedFiles(options.diffText),
  };

  // Analyze all hunks in parallel
  const attentionScores = await Promise.all(
    hunks.map(async (hunk) => {
      const signals = await analyzeHunk(hunk, context);
      return buildAttentionScore(hunk, signals);
    })
  );

  // Sort: CRITICAL first, then REVIEW, then AUTO-OK
  const levelOrder = { CRITICAL: 0, REVIEW: 1, 'AUTO-OK': 2 };
  attentionScores.sort((a, b) => levelOrder[a.level] - levelOrder[b.level] || b.score - a.score);

  const summary = {
    totalHunks: attentionScores.length,
    criticalCount: attentionScores.filter(s => s.level === 'CRITICAL').length,
    reviewCount: attentionScores.filter(s => s.level === 'REVIEW').length,
    autoOkCount: attentionScores.filter(s => s.level === 'AUTO-OK').length,
    estimatedTotalMinutes: attentionScores.reduce((sum, s) => sum + s.estimatedReviewMinutes, 0),
  };

  return {
    hunks: attentionScores,
    summary,
    metadata: {
      analysisTimeMs: Math.round(performance.now() - start),
      commitRange: '',
    },
  };
}
