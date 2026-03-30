import type { DiffFile, DiffHunk, SupportedLanguage } from './types.js';

const LANGUAGE_MAP: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'typescript',
  '.jsx': 'typescript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
};

function detectLanguage(filePath: string): SupportedLanguage {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  return LANGUAGE_MAP[ext] ?? 'unknown';
}

export function parseDiff(diffText: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diffText.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Find file header
    if (!lines[i].startsWith('diff --git')) {
      i++;
      continue;
    }

    let oldPath = '';
    let newPath = '';
    i++;

    // Parse file paths from --- and +++ lines
    while (i < lines.length && !lines[i].startsWith('@@')) {
      if (lines[i].startsWith('--- a/')) {
        oldPath = lines[i].slice(6);
      } else if (lines[i].startsWith('--- /dev/null')) {
        oldPath = '/dev/null';
      } else if (lines[i].startsWith('+++ b/')) {
        newPath = lines[i].slice(6);
      } else if (lines[i].startsWith('+++ /dev/null')) {
        newPath = '/dev/null';
      }
      i++;
    }

    const filePath = newPath !== '/dev/null' ? newPath : oldPath;
    const language = detectLanguage(filePath);
    const hunks: DiffHunk[] = [];

    // Parse hunks
    while (i < lines.length && !lines[i].startsWith('diff --git')) {
      if (lines[i].startsWith('@@')) {
        const header = lines[i];
        const match = header.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        const startLine = match ? parseInt(match[1], 10) : 1;
        const lineCount = match && match[2] ? parseInt(match[2], 10) : 1;

        const oldLines: string[] = [];
        const newLines: string[] = [];
        i++;

        while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git')) {
          const line = lines[i];
          if (line.startsWith('-')) {
            oldLines.push(line.slice(1));
          } else if (line.startsWith('+')) {
            newLines.push(line.slice(1));
          } else if (line.startsWith(' ')) {
            oldLines.push(line.slice(1));
            newLines.push(line.slice(1));
          }
          i++;
        }

        hunks.push({
          file: filePath,
          startLine,
          endLine: startLine + lineCount - 1,
          oldContent: oldLines.join('\n'),
          newContent: newLines.join('\n'),
          language,
          header,
        });
      } else {
        i++;
      }
    }

    if (hunks.length > 0) {
      files.push({ oldPath, newPath, hunks });
    }
  }

  return files;
}

export function flattenHunks(files: DiffFile[]): DiffHunk[] {
  return files.flatMap(f => f.hunks);
}
