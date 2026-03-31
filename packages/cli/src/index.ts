import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { analyze } from '@reviewscope/core';
import { formatTerminal } from './formatters/terminal.js';

const VERSION = '0.1.0';

const HELP = `
ReviewScope — Human Attention Router for Code Review

Usage:
  reviewscope                   Analyze staged changes (or unstaged if none staged)
  reviewscope <target>          Analyze diff against target (branch, commit, HEAD~N)
  reviewscope --stdin           Read unified diff from stdin
  git diff main | reviewscope --stdin

Options:
  --stdin     Read diff from stdin instead of git
  --json      Output as JSON (for CI integration)
  --help      Show this help message
  --version   Show version

Examples:
  reviewscope main              Compare current branch against main
  reviewscope HEAD~3            Analyze last 3 commits
  git diff --cached | reviewscope --stdin   Pipe staged diff

Exit codes:
  0   No CRITICAL hunks found
  1   CRITICAL hunks found (use in CI to block merges)
`;

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`reviewscope ${VERSION}`);
    process.exit(0);
  }

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
