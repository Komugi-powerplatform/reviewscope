import type { ChangeType, DiffHunk, SignalResult, AnalysisContext } from '../types.js';

const IMPORT_PATTERNS: Record<string, RegExp[]> = {
  typescript: [/^import\s/, /^export\s.*from\s/, /^require\(/],
  python: [/^import\s/, /^from\s.*import\s/],
  go: [/^import\s/],
  rust: [/^use\s/, /^mod\s/],
  java: [/^import\s/],
};

const COMMENT_PATTERNS: Record<string, RegExp[]> = {
  typescript: [/^\s*\/\//, /^\s*\/\*/, /^\s*\*/, /^\s*\*\//],
  python: [/^\s*#/, /^\s*"""/, /^\s*'''/],
  go: [/^\s*\/\//, /^\s*\/\*/],
  rust: [/^\s*\/\//, /^\s*\/\*/],
  java: [/^\s*\/\//, /^\s*\/\*/, /^\s*\*/],
};

const BEHAVIORAL_KEYWORDS = [
  /\bif\b/, /\belse\b/, /\bswitch\b/, /\bmatch\b/,
  /\bfor\b/, /\bwhile\b/, /\bloop\b/,
  /\breturn\b/, /\bthrow\b/, /\braise\b/,
  /\btry\b/, /\bcatch\b/, /\bexcept\b/,
  /\bawait\b/, /\byield\b/,
];

function isImportLine(line: string, language: string): boolean {
  const patterns = IMPORT_PATTERNS[language] ?? IMPORT_PATTERNS.typescript;
  return patterns.some(p => p.test(line.trim()));
}

function isCommentLine(line: string, language: string): boolean {
  const patterns = COMMENT_PATTERNS[language] ?? COMMENT_PATTERNS.typescript;
  return patterns.some(p => p.test(line));
}

function isWhitespaceLine(line: string): boolean {
  return line.trim() === '';
}

/**
 * Extract only the lines that actually changed (not context lines present in both sides).
 * Context lines appear identically in both oldContent and newContent.
 */
function extractChangedLines(oldLines: string[], newLines: string[]): { removed: string[]; added: string[] } {
  const oldSet = new Map<string, number>();
  for (const line of oldLines) {
    oldSet.set(line, (oldSet.get(line) ?? 0) + 1);
  }
  const newSet = new Map<string, number>();
  for (const line of newLines) {
    newSet.set(line, (newSet.get(line) ?? 0) + 1);
  }

  const removed: string[] = [];
  const added: string[] = [];

  for (const [line, count] of oldSet) {
    const inNew = newSet.get(line) ?? 0;
    for (let i = 0; i < count - inNew; i++) {
      removed.push(line);
    }
  }

  for (const [line, count] of newSet) {
    const inOld = oldSet.get(line) ?? 0;
    for (let i = 0; i < count - inOld; i++) {
      added.push(line);
    }
  }

  return { removed, added };
}

function hasStringLiteralChange(oldLines: string[], newLines: string[]): boolean {
  const extractStrings = (lines: string[]): string[] =>
    lines.flatMap(l => {
      const matches = l.match(/(['"`])(?:(?!\1).)*\1/g);
      return matches ?? [];
    });

  const oldStrings = extractStrings(oldLines).sort().join('|');
  const newStrings = extractStrings(newLines).sort().join('|');
  return oldStrings !== newStrings;
}

function hasBehavioralKeywordChange(removed: string[], added: string[]): boolean {
  const countKeywords = (lines: string[]) =>
    lines.reduce((sum, line) => sum + BEHAVIORAL_KEYWORDS.filter(p => p.test(line)).length, 0);

  return countKeywords(removed) !== countKeywords(added);
}

export function classifyChange(hunk: DiffHunk): ChangeType {
  const oldLines = hunk.oldContent.split('\n').filter(l => l.length > 0);
  const newLines = hunk.newContent.split('\n').filter(l => l.length > 0);
  const lang = hunk.language;

  // Extract only actually changed lines (strip context lines)
  const { removed, added } = extractChangedLines(oldLines, newLines);

  // No actual changes (identical content)
  if (removed.length === 0 && added.length === 0) {
    return 'cosmetic';
  }

  const allChangedLines = [...removed, ...added];
  const nonEmpty = allChangedLines.filter(l => !isWhitespaceLine(l));

  // If no non-empty changes, it's whitespace-only
  if (nonEmpty.length === 0) {
    return 'cosmetic';
  }

  // Check if all changed lines are imports
  if (nonEmpty.every(l => isImportLine(l, lang))) {
    return 'cosmetic';
  }

  // Check if all changed lines are comments
  if (nonEmpty.every(l => isCommentLine(l, lang))) {
    return 'cosmetic';
  }

  // Filter to code-only changed lines for deeper analysis
  const removedCode = removed.filter(l => !isImportLine(l, lang) && !isCommentLine(l, lang) && !isWhitespaceLine(l));
  const addedCode = added.filter(l => !isImportLine(l, lang) && !isCommentLine(l, lang) && !isWhitespaceLine(l));

  // If no code changed (only imports + comments changed)
  if (removedCode.length === 0 && addedCode.length === 0) {
    return 'cosmetic';
  }

  // Check for behavioral keyword changes (if/for/return/throw added or removed)
  if (hasBehavioralKeywordChange(removedCode, addedCode)) {
    return 'behavioral';
  }

  // Check for string literal changes (API URLs, config values)
  if (hasStringLiteralChange(removedCode, addedCode)) {
    return 'behavioral';
  }

  // If line count changed significantly (code added or removed), it's at least structural
  // If the added code contains behavioral keywords, classify as behavioral
  if (addedCode.length > 0 && removedCode.length === 0) {
    // Pure addition — check if it contains any logic
    const hasLogic = addedCode.some(l => BEHAVIORAL_KEYWORDS.some(p => p.test(l)));
    return hasLogic ? 'behavioral' : 'structural';
  }

  if (removedCode.length > 0 && addedCode.length === 0) {
    // Pure deletion
    return 'structural';
  }

  // Both removed and added code exist — compare structural patterns
  const normalize = (line: string) => line.trim().replace(/[a-zA-Z_$][a-zA-Z0-9_$]*/g, '_');
  const removedNorm = removedCode.map(normalize).sort().join('\n');
  const addedNorm = addedCode.map(normalize).sort().join('\n');

  if (removedNorm === addedNorm) {
    // Same structural pattern — likely a rename or reformat
    return 'structural';
  }

  return 'behavioral';
}

const SCORE_MAP: Record<ChangeType, number> = {
  cosmetic: 0.05,
  structural: 0.30,
  behavioral: 0.80,
};

const NON_CODE_EXTENSIONS = new Set([
  '.md', '.mdx', '.txt', '.json', '.yml', '.yaml', '.toml',
  '.xml', '.html', '.css', '.scss', '.less', '.svg',
  '.lock', '.config', '.cfg', '.ini', '.env',
]);

function isNonCodeFile(filePath: string): boolean {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  return NON_CODE_EXTENSIONS.has(ext);
}

export async function analyzeChangeClassification(
  hunk: DiffHunk,
  _context: AnalysisContext,
): Promise<SignalResult> {
  const changeType = classifyChange(hunk);
  const nonCode = isNonCodeFile(hunk.file);

  // Non-code files get reduced confidence and score cap
  const confidence = nonCode ? 0.40 : 0.85;
  const score = nonCode ? Math.min(SCORE_MAP[changeType], 0.30) : SCORE_MAP[changeType];

  return {
    signalName: 'changeClassification',
    score,
    confidence,
    reason: nonCode ? `Non-code file (${changeType})` : `Change type: ${changeType}`,
    metadata: { changeType, nonCodeFile: nonCode },
  };
}
