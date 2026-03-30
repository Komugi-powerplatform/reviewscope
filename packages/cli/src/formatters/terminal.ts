import type { ReviewScopeResult, AttentionScore } from '../../../core/src/types.js';

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

function levelColor(level: string): string {
  if (level === 'CRITICAL') return COLORS.red;
  if (level === 'REVIEW') return COLORS.yellow;
  return COLORS.green;
}

function levelIcon(level: string): string {
  if (level === 'CRITICAL') return '🔴';
  if (level === 'REVIEW') return '🟡';
  return '🟢';
}

function formatHunk(item: AttentionScore): string {
  const color = levelColor(item.level);
  const icon = levelIcon(item.level);
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

export function formatTerminal(result: ReviewScopeResult): string {
  const { summary } = result;
  const lines: string[] = [];

  // Header
  const needReview = summary.criticalCount + summary.reviewCount;
  lines.push('');
  lines.push(
    `${COLORS.bold}ReviewScope:${COLORS.reset} ` +
    `${needReview} of ${summary.totalHunks} hunks need human review ` +
    `${COLORS.dim}(estimated ${summary.estimatedTotalMinutes} min)${COLORS.reset}`
  );
  lines.push('');

  // CRITICAL and REVIEW hunks — show details
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
    lines.push(
      `${COLORS.green}🟢 [AUTO-OK]${COLORS.reset} ${autoOk.length} hunks skipped: ${breakdown}`
    );
    lines.push('');
  }

  return lines.join('\n');
}
