# ReviewScope

**Human Attention Router for Code Review**

> Skip the imports. Focus on the logic changes. Save 40% of your review time.

```
ReviewScope: 3 of 14 hunks need human review (estimated 6 min)

🔴 [CRITICAL] src/auth/session.ts:45-62  (score: 87)
  ├─ Change type: behavioral (auth logic modification)
  ├─ Blast radius: 7 downstream consumers
  ├─ Test coverage: no test file found
  └─ Estimated review: 4 min

🟡 [REVIEW] src/api/routes.ts:120-135  (score: 52)
  ├─ Change type: behavioral (new endpoint)
  ├─ Blast radius: 2 downstream consumers
  └─ Estimated review: 2 min

🟢 [AUTO-OK] 11 hunks skipped: cosmetic (6), structural (3), behavioral (2)
```

## What is this?

ReviewScope analyzes your git diffs and tells you **where to spend your review time**. It does not find bugs, suggest fixes, or review your code. It routes your attention.

Every PR has hunks that are just import reordering, comment updates, or rename refactors. And it has hunks that change auth logic with no tests. ReviewScope separates them so you can spend your brain on the parts that matter.

## How is this different from CodeRabbit / PR-Agent / SonarQube?

| | ReviewScope | CodeRabbit | PR-Agent | SonarQube |
|---|---|---|---|---|
| What it does | **Where** to look | What to fix | What to fix | Quality gates |
| LLM required | No | GPT-4 | GPT-4 | No |
| API key needed | No | Yes | Yes | Yes |
| Works offline | Yes | No | No | Partial |
| Speed | < 1 second | 30-60s | 30-60s | Minutes |
| Cost | Free | $$$/month | $$$/month | $$$/month |

**ReviewScope complements these tools.** Use it to know *where* to focus, then use whatever tool you want for the deep analysis.

## Quick Start

```bash
# Analyze staged changes
cd your-repo
git diff --cached | npx tsx path/to/reviewscope/packages/cli/src/index.ts --stdin

# Analyze against a branch
git diff main...HEAD | npx tsx path/to/reviewscope/packages/cli/src/index.ts --stdin

# JSON output for CI
git diff --cached | npx tsx path/to/reviewscope/packages/cli/src/index.ts --stdin --json
```

## How It Works

```
git diff → [Parse Hunks] → [3 Signal Analyzers] → [Weighted Fusion] → [Attention Map]
```

### Signals

| Signal | What it detects | Weight | Example |
|---|---|---|---|
| **Change Classification** | Is this cosmetic, structural, or behavioral? | 35% | Import reorder → cosmetic (skip), `if` condition change → behavioral (review) |
| **Blast Radius** | How many files depend on what changed? | 30% | Utility used in 12 files → high radius → needs review |
| **Test Coverage Gap** | Does a test file exist? Was it updated? | 35% | Logic changed but no test file → flag it |

### Scoring

Each signal produces a score (0.0–1.0) with a confidence level. Signals are fused via weighted average, normalized to 0–100:

- **CRITICAL** (70–100): Stop and review carefully
- **REVIEW** (40–69): Worth a look
- **AUTO-OK** (0–39): Safe to skim or skip

## What This Is NOT

- Not a linter (use ESLint, Ruff, etc.)
- Not an AI code reviewer (use CodeRabbit, PR-Agent)
- Not a static analysis tool (use SonarQube, Semgrep)
- Not a replacement for human judgment — it helps you *allocate* that judgment

## Supported Languages

TypeScript, JavaScript, Python (for import graph analysis). Other languages get change classification and test coverage signals.

## Development

```bash
git clone https://github.com/your-username/reviewscope
cd reviewscope
npm install
npm test          # 20 tests
```

## Roadmap

- [ ] GitHub Action (auto-comment on PRs)
- [ ] AI-generation detector signal
- [ ] Historical risk signal (git log analysis)
- [ ] Complexity delta signal
- [ ] `.reviewscope.yml` configuration
- [ ] Go, Rust, Java import graph support

## License

MIT
