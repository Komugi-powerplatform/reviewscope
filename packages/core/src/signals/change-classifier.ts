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
  /\b=\b/, /\+=/, /-=/, /\*=/, /\/=/,
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

function hasBehavioralChange(oldLines: string[], newLines: string[]): boolean {
  const oldBehavioral = oldLines.filter(l => !isWhitespaceLine(l) && !isCommentLine(l, 'typescript'));
  const newBehavioral = newLines.filter(l => !isWhitespaceLine(l) && !isCommentLine(l, 'typescript'));

  if (oldBehavioral.length !== newBehavioral.length) return true;

  // Check if any behavioral keywords were added or removed
  const oldKeywordCount = oldBehavioral.reduce(
    (sum, line) => sum + BEHAVIORAL_KEYWORDS.filter(p => p.test(line)).length, 0
  );
  const newKeywordCount = newBehavioral.reduce(
    (sum, line) => sum + BEHAVIORAL_KEYWORDS.filter(p => p.test(line)).length, 0
  );

  if (oldKeywordCount !== newKeywordCount) return true;

  // Check for non-trivial content changes beyond renames
  for (let i = 0; i < oldBehavioral.length; i++) {
    const oldTrimmed = oldBehavioral[i].trim();
    const newTrimmed = newBehavioral[i].trim();
    if (oldTrimmed !== newTrimmed) {
      // Check if only identifiers changed (rename)
      const oldTokens = oldTrimmed.split(/\W+/).filter(Boolean);
      const newTokens = newTrimmed.split(/\W+/).filter(Boolean);
      if (oldTokens.length !== newTokens.length) return true;

      // If structural tokens (keywords, operators) differ, it's behavioral
      const oldStructural = oldTrimmed.replace(/[a-zA-Z_$][a-zA-Z0-9_$]*/g, '_');
      const newStructural = newTrimmed.replace(/[a-zA-Z_$][a-zA-Z0-9_$]*/g, '_');
      if (oldStructural !== newStructural) return true;
    }
  }

  return false;
}

export function classifyChange(hunk: DiffHunk): ChangeType {
  const oldLines = hunk.oldContent.split('\n').filter(l => l.length > 0);
  const newLines = hunk.newContent.split('\n').filter(l => l.length > 0);
  const lang = hunk.language;

  // Pure additions or deletions are likely behavioral
  if (oldLines.length === 0 || newLines.length === 0) {
    const lines = oldLines.length > 0 ? oldLines : newLines;
    const allImports = lines.every(l => isImportLine(l, lang));
    const allComments = lines.every(l => isCommentLine(l, lang) || isWhitespaceLine(l));
    if (allImports) return 'cosmetic';
    if (allComments) return 'cosmetic';
    return 'behavioral';
  }

  // Check if only imports changed
  const oldNonImport = oldLines.filter(l => !isImportLine(l, lang) && !isWhitespaceLine(l));
  const newNonImport = newLines.filter(l => !isImportLine(l, lang) && !isWhitespaceLine(l));
  if (oldNonImport.length === 0 && newNonImport.length === 0) {
    return 'cosmetic';
  }

  // Check if only comments/whitespace changed
  const oldCode = oldLines.filter(l => !isCommentLine(l, lang) && !isWhitespaceLine(l));
  const newCode = newLines.filter(l => !isCommentLine(l, lang) && !isWhitespaceLine(l));
  if (oldCode.join('\n') === newCode.join('\n')) {
    return 'cosmetic';
  }

  // Check for behavioral changes
  if (hasBehavioralChange(oldCode, newCode)) {
    return 'behavioral';
  }

  return 'structural';
}

const SCORE_MAP: Record<ChangeType, number> = {
  cosmetic: 0.05,
  structural: 0.30,
  behavioral: 0.80,
};

export async function analyzeChangeClassification(
  hunk: DiffHunk,
  _context: AnalysisContext
): Promise<SignalResult> {
  const changeType = classifyChange(hunk);

  return {
    signalName: 'changeClassification',
    score: SCORE_MAP[changeType],
    confidence: 0.85,
    reason: `Change type: ${changeType}`,
    metadata: { changeType },
  };
}
