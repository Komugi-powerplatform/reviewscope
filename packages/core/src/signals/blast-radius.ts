import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
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

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java']);

function detectLangFromExt(ext: string): string {
  if (ext === '.py') return 'python';
  if (ext === '.go') return 'go';
  if (ext === '.rs') return 'rust';
  if (ext === '.java') return 'java';
  return 'typescript';
}

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

function resolveImportToFile(importPath: string, fromFile: string, allFilesSet: Set<string>): string | null {
  if (!importPath.startsWith('.')) return null;

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
  return candidates.find(c => allFilesSet.has(c)) ?? null;
}

// Shared cache across all blast-radius calls in a single analysis run
const blastRadiusCache = new Map<string, number>();
const fileContentCache = new Map<string, string>();

export function clearBlastRadiusCache(): void {
  blastRadiusCache.clear();
  fileContentCache.clear();
}

async function buildImportGraph(
  changedFile: string,
  context: AnalysisContext,
): Promise<number> {
  // Return cached result if already computed for this file
  const cached = blastRadiusCache.get(changedFile);
  if (cached !== undefined) return cached;

  let consumerCount = 0;
  const changedBasename = changedFile.replace(/\.\w+$/, '');
  const allFilesSet = new Set(context.allFiles);

  // Only check source files
  const sourceFiles = context.allFiles.filter(f => {
    const ext = f.slice(f.lastIndexOf('.'));
    return SOURCE_EXTENSIONS.has(ext);
  });

  // Read files with concurrency limit (batch of 20)
  const BATCH_SIZE = 20;
  for (let i = 0; i < sourceFiles.length; i += BATCH_SIZE) {
    const batch = sourceFiles.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (file) => {
      if (file === changedFile) return;

      try {
        let content = fileContentCache.get(file);
        if (content === undefined) {
          content = await readFile(join(context.repoRoot, file), 'utf-8');
          fileContentCache.set(file, content);
        }

        const ext = file.slice(file.lastIndexOf('.'));
        const lang = detectLangFromExt(ext);
        const imports = extractImports(content, lang);

        for (const imp of imports) {
          const resolved = resolveImportToFile(imp, file, allFilesSet);
          if (resolved === changedFile || resolved === changedBasename) {
            consumerCount++;
            break;
          }
        }
      } catch {
        // Skip unreadable files
      }
    }));
  }

  blastRadiusCache.set(changedFile, consumerCount);
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
