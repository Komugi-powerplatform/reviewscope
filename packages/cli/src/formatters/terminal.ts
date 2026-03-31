import type { ReviewScopeResult, AttentionScore } from '@reviewscope/core';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function levelIcon(level: string): string {
  if (level === 'CRITICAL') return '🔴';
  if (level === 'REVIEW') return '🟡';
  return '🟢';
}

function renderBar(critical: number, review: number, autoOk: number, width = 30): string {
  const total = critical + review + autoOk;
  if (total === 0) return '';
  const cWidth = Math.max(critical > 0 ? 1 : 0, Math.round((critical / total) * width));
  const rWidth = Math.max(review > 0 ? 1 : 0, Math.round((review / total) * width));
  const aWidth = Math.max(0, width - cWidth - rWidth);
  return (
    `${COLORS.red}${'█'.repeat(cWidth)}${COLORS.yellow}${'▓'.repeat(rWidth)}${COLORS.green}${'░'.repeat(aWidth)}${COLORS.reset}` +
    `  ${COLORS.red}█ CRITICAL (${critical})${COLORS.reset}` +
    `  ${COLORS.yellow}▓ REVIEW (${review})${COLORS.reset}` +
    `  ${COLORS.green}░ AUTO-OK (${autoOk})${COLORS.reset}`
  );
}

function formatHunk(item: AttentionScore): string {
  const icon = levelIcon(item.level);
  const color = item.level === 'CRITICAL' ? COLORS.red : item.level === 'REVIEW' ? COLORS.yellow : COLORS.green;
  const lines: string[] = [];

  lines.push(
    `${icon} ${color}${COLORS.bold}[${item.level}]${COLORS.reset} ` +
    `${COLORS.white}${item.hunk.file}:${item.hunk.startLine}-${item.hunk.endLine}${COLORS.reset}` +
    `  ${COLORS.dim}(score: ${item.score})${COLORS.reset}`
  );

  for (const signal of item.signals) {
    if (signal.score > 0.1) {
      lines.push(`  ${COLORS.dim}├─${COLORS.reset} ${signal.reason}`);
    }
  }

  if (item.level !== 'AUTO-OK') {
    lines.push(`  ${COLORS.dim}└─${COLORS.reset} Estimated review: ${item.estimatedReviewMinutes} min`);
  }

  return lines.join('\n');
}

function computeTimeSaved(result: ReviewScopeResult): number {
  const totalLines = result.hunks.reduce(
    (sum, h) => sum + Math.max(1, h.hunk.endLine - h.hunk.startLine + 1), 0
  );
  const naiveMinutes = Math.round(totalLines / 25 * 1.5);
  return Math.max(0, naiveMinutes - result.summary.estimatedTotalMinutes);
}

export function formatTerminal(result: ReviewScopeResult): string {
  const { summary, metadata } = result;
  const lines: string[] = [];

  const needReview = summary.criticalCount + summary.reviewCount;

  // Header with ratio bar
  lines.push('');
  lines.push(
    `${COLORS.bold}ReviewScope${COLORS.reset}  ` +
    `${needReview} of ${summary.totalHunks} hunks need human review ` +
    `${COLORS.dim}(${summary.estimatedTotalMinutes} min)${COLORS.reset}`
  );
  lines.push(`             ${renderBar(summary.criticalCount, summary.reviewCount, summary.autoOkCount)}`);
  lines.push('');

  // CRITICAL and REVIEW hunks
  const flagged = result.hunks.filter(h => h.level !== 'AUTO-OK');
  for (const item of flagged) {
    lines.push(formatHunk(item));
    lines.push('');
  }

  // AUTO-OK summary
  const autoOk = result.hunks.filter(h => h.level === 'AUTO-OK');
  if (autoOk.length > 0) {
    const fileGroups = new Map<string, number>();
    for (const item of autoOk) {
      const key = item.signals.find(s => s.signalName === 'changeClassification')?.metadata?.changeType as string ?? 'other';
      fileGroups.set(key, (fileGroups.get(key) ?? 0) + 1);
    }
    const breakdown = [...fileGroups.entries()].map(([type, count]) => `${type} (${count})`).join(', ');
    lines.push(`${COLORS.green}🟢 [AUTO-OK]${COLORS.reset} ${autoOk.length} hunks skipped: ${breakdown}`);
    lines.push('');
  }

  // Footer with time saved and performance
  const timeSaved = computeTimeSaved(result);
  const analysisTime = metadata.analysisTimeMs < 1000
    ? `${metadata.analysisTimeMs}ms`
    : `${(metadata.analysisTimeMs / 1000).toFixed(1)}s`;

  if (timeSaved > 0) {
    lines.push(`${COLORS.dim}⏱  Estimated time saved: ~${timeSaved} min · Analyzed in ${analysisTime} · No API · No LLM${COLORS.reset}`);
  } else {
    lines.push(`${COLORS.dim}⏱  Analyzed in ${analysisTime} · No API · No LLM${COLORS.reset}`);
  }
  lines.push('');

  return lines.join('\n');
}
