import { readFile } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import type { DiffHunk, SignalResult, AnalysisContext } from '../types.js';

const IMPORT_EXTRACT_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /import\s+.*from\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ],
  python: [
    /^from\s+(\S+)\s+import/gm,
    /^import\s+(\S+)/gm,
  ],
  go: [
    /import\s+"([^"]+)"/g,
    /import\s+\w+\s+"([^"]+)"/g,
  ],
  rust: [
    /use\s+([\w:]+)/g,
  ],
  java: [
    /import\s+([\w.]+)/g,
  ],
};

function extractImports(content: string, language: string): string[] {
  const patterns = IMPORT_EXTRACT_PATTERNS[language] ?? IMPORT_EXTRACT_PATTERNS.typescript;
  const imports: string[] = [];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      imports.push(match[1]);
    }
  }

  return imports;
}

function resolveImportToFile(importPath: string, fromFile: string, allFiles: string[]): string | null {
  // Handle relative imports
  if (importPath.startsWith('.')) {
    const dir = dirname(fromFile);
    const candidates = [
      join(dir, importPath),
      join(dir, importPath + '.ts'),
      join(dir, importPath + '.tsx'),
      join(dir, importPath + '.js'),
      join(dir, importPath + '.py'),
      join(dir, importPath, 'index.ts'),
      join(dir, importPath, 'index.js'),
    ];
    return candidates.find(c => allFiles.includes(c)) ?? null;
  }

  // Non-relative imports are typically external packages — skip
  return null;
}

export function extractChangedSymbols(hunk: DiffHunk): string[] {
  const newLines = hunk.newContent.split('\n');
  const symbols: string[] = [];

  for (const line of newLines) {
    // Extract exported function/class/const names
    const exportMatch = line.match(/export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface)\s+(\w+)/);
    if (exportMatch) symbols.push(exportMatch[1]);

    // Python: function/class definitions
    const pyMatch = line.match(/^(?:def|class)\s+(\w+)/);
    if (pyMatch) symbols.push(pyMatch[1]);

    // Go: exported functions (capitalized)
    const goMatch = line.match(/^func\s+(\w+)/);
    if (goMatch) symbols.push(goMatch[1]);
  }

  return [...new Set(symbols)];
}

async function buildImportGraph(
  changedFile: string,
  context: AnalysisContext,
): Promise<number> {
  let consumerCount = 0;
  const changedBasename = changedFile.replace(/\.\w+$/, '');

  // Check each file in the repo for imports of the changed file
  for (const file of context.allFiles) {
    if (file === changedFile) continue;

    // Quick filter: only check files with matching language
    const ext = file.slice(file.lastIndexOf('.'));
    if (!['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'].includes(ext)) continue;

    try {
      const content = await readFile(join(context.repoRoot, file), 'utf-8');
      const imports = extractImports(content, ext.startsWith('.ts') || ext.startsWith('.js') ? 'typescript' : 'python');

      for (const imp of imports) {
        if (imp.startsWith('.')) {
          const resolved = resolveImportToFile(imp, file, context.allFiles);
          if (resolved === changedFile || resolved === changedBasename) {
            consumerCount++;
            break;
          }
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return consumerCount;
}

export async function analyzeBlastRadius(
  hunk: DiffHunk,
  context: AnalysisContext,
): Promise<SignalResult> {
  const consumers = await buildImportGraph(hunk.file, context);
  const score = Math.min(1.0, consumers / 10);

  let reason: string;
  if (consumers === 0) {
    reason = 'No downstream consumers found';
  } else if (consumers <= 3) {
    reason = `${consumers} downstream consumer(s)`;
  } else {
    reason = `${consumers} downstream consumers — high blast radius`;
  }

  return {
    signalName: 'blastRadius',
    score,
    confidence: 0.75,
    reason,
    metadata: { consumerCount: consumers },
  };
}
