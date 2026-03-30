#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { analyze } from '../../core/src/index.js';
import { formatTerminal } from './formatters/terminal.js';

async function main() {
  const args = process.argv.slice(2);

  // Determine diff source
  let diffText: string;
  let repoRoot: string;

  const targetArg = args.find(a => !a.startsWith('-'));

  const stdinFlag = args.includes('--stdin');

  if (stdinFlag || process.stdin.isTTY === false) {
    // Piped input: cat diff | reviewscope --stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    diffText = Buffer.concat(chunks).toString('utf-8');
    repoRoot = resolve('.');
  } else {
    // Git-based diff
    repoRoot = resolve('.');
    const target = targetArg ?? 'HEAD';

    try {
      // Try staged changes first, then diff against target
      diffText = execSync(`git diff --cached`, {
        cwd: repoRoot,
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
      });
      if (!diffText.trim()) {
        diffText = execSync(`git diff ${target}`, {
          cwd: repoRoot,
          encoding: 'utf-8',
          maxBuffer: 50 * 1024 * 1024,
        });
      }
    } catch (err) {
      console.error(`Failed to get diff. Are you in a git repository?`);
      process.exit(1);
    }
  }

  if (!diffText.trim()) {
    console.log('No changes found.');
    process.exit(0);
  }

  const result = await analyze({ diffText, repoRoot });

  // Output format
  const jsonFlag = args.includes('--json');
  if (jsonFlag) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatTerminal(result));
  }

  // Exit code: non-zero if CRITICAL hunks exist
  if (result.summary.criticalCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('ReviewScope error:', err);
  process.exit(2);
});
