# Cursor CLI Automation Playbook

This reference outlines how to use the Cursor CLI to script recurring maintenance for LuxLife. It focuses on headless runs for unattended fixes, shell mode for guided operations, and integration ideas for CI.

---

## 1. Prerequisites
- Install the CLI on the maintainer host or CI runner:
  ```bash
  brew install cursor-cursor          # macOS (recommended)
  # or
  npm install -g @cursor-cli/cursor   # cross-platform
  ```
- Authenticate once with the service account or operator profile:
  ```bash
  cursor login
  ```
- Confirm the repo contains `.cursor/mcp.json` and any API keys are available via environment variables (CI) or `cursor env set`.

---

## 2. Headless Maintenance Recipes

Each recipe below is tailored to a recurring LuxLife chore. They can be run manually or wired into a scheduler. When running unattended, add `--accept all` to auto-apply diffs; omit it when you prefer review mode.

### 2.1 Dependency tidy (local or CI)
Runs a prompt that bumps dependencies, runs tests, and writes a summary to `stdout`.
```bash
cursor headless \
  --cwd /Users/mac/Desktop/Websites/luxlife-mvp \
  --files package.json package-lock.json functions/package.json \
  --prompt "
You are maintaining the LuxLife repo. Update minor/patch dependencies (skip major bumps),
run npm install where needed, and describe the changes. Do not commit."
```
**Recommended follow-up:** Run `npm run lint` and `npm --prefix functions run build` before committing.

### 2.2 Firestore rules audit
```bash
cursor headless \
  --prompt "
Review firestore.rules and storage.rules for regressions or overly broad access.
Summarize issues and propose diffs without applying them automatically." \
  --files firestore.rules storage.rules
```
Pipe the output into a PR template or Slack message for manual action.

### 2.3 Docs regeneration
```bash
cursor headless \
  --prompt "
Generate a weekly status digest summarizing Automation_Roadmap.md progress.
Output markdown suitable for docs/Weekly_Status.md and update the file." \
  --files docs/Automation_Roadmap.md docs/Weekly_Status.md
```
Wrap in a cron job or GitHub Action to keep stakeholders updated.

### 2.4 Pipeline smoke-test and rollback plan
Use the CLI to trigger a synthetic order and verify pipeline stages without leaving terminal. This assumes our MCP tools are configured with test tokens.
```bash
cursor headless \
  --prompt "
Using the MCP Replicate and D-ID tools, simulate creating an order document
in Firestore (sandbox collection orders_sandbox). Confirm the queued Cloud
Functions finish, then summarize pipeline.generation.fallback flags and status." \
  --files functions/src/index.ts firestore.rules storage.rules
```
Pair the report with an automated rollback command (e.g., redeploy previous function version) if the summary shows consistent failures.

### 2.5 Credit usage watchdog
Cursor can query Firestore/Stripe via MCP and produce a warning when balances dip.
```bash
cursor headless \
  --prompt "
Query Firestore users collection for credits < 3, and Stripe for unpaid invoices.
Generate docs/Credit_Status.md with action items (top-up Replicate, Stripe invoice follow-up)." \
  --files docs/Credit_Status.md
```
Schedule daily in CI and have the action ping Slack with the rendered markdown.

---

## 3. Shell Mode for Guided Ops
`cursor shell` wraps your zsh/bash session. Use it when performing manual work (deploys, debugging) and you want inline AI assistance:
```bash
cursor shell --cwd /Users/mac/Desktop/Websites/luxlife-mvp
```
- Run commands normally (`firebase deploy --only functions`).
- Append `# help` or `?` to request guidance for the next command.
- Exit shell mode with `exit`.

Typical LuxLife uses:
- **Incident response:** attach to production Cloud Functions logs (`firebase functions:log`) and ask Cursor for context-aware suggestions mid-shell.
- **One-off migrations:** while editing security rules or data exports, use inline prompts (`# explain`) on commands before running them.
- **Feature toggles:** when enabling new pipeline flags, shell mode can draft the diff for `.env`/Firebase config and the associated rollback command.

---

## 4. CI Integration Pattern
Example GitHub Actions step that runs a weekly headless lint-fix job:
```yaml
name: Weekly Maintenance
on:
  schedule:
    - cron: "0 7 * * 1"   # Mondays 07:00 UTC
jobs:
  lint-fix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @cursor-cli/cursor
      - run: cursor login --api-key "${{ secrets.CURSOR_API_KEY }}"
      - run: |
          cursor headless \
            --prompt "Run npm run lint -- --fix and format all staged changes." \
            --files "src/**" "functions/src/**"
      - name: Commit changes
        run: |
          git config user.name "LuxLife Bot"
          git config user.email "automation@luxlife.ai"
          git commit -am "chore: weekly lint fixes" || echo "Nothing to commit"
      - uses: ad-m/github-push-action@v0.6.0
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
```
Notes:
- Use a Cursor API key scoped to repo automation.
- Gate potentially destructive prompts with review workflows (e.g., open PR instead of auto-push).

### 4.1 Repository workflow
We ship a production-ready flavor of the above as `.github/workflows/cursor-maintenance.yml`. It:
- Installs dependencies (root + functions)
- Authenticates the Cursor CLI via `${{ secrets.CURSOR_API_KEY }}`
- Runs lint auto-fixes and appends a summary to `docs/maintenance/weekly-lint-report.md`
- Verifies `npm --prefix functions run build` and `npm run lint`
- Opens a PR (`automation/cursor-weekly-maintenance`) when changes exist

**Setup:** add `CURSOR_API_KEY` to the repo secrets (Cursor → Settings → API Keys → create a scoped key). Optional: adjust the cron expression or prompt text to widen coverage.

---

## 5. Operational Guardrails
- **Dry-run first:** When drafting a new headless prompt, test locally with `--no-apply` and inspect diffs.
- **Log outputs:** Redirect headless runs to `logs/cursor/<date>.log` for traceability.
- **Secrets hygiene:** Configure required env vars in CI (`FIREBASE_TOKEN`, `STRIPE_SECRET_KEY`, etc.) before invoking prompts that call MCP tools.
- **Human approval:** For impactful changes (firestore rules, billing hooks), keep the CLI in “suggest” mode and route diffs through PR review.
- **Rollback strategy:** Keep `firebase deploy --only functions --force` & `firebase functions:delete` recipes documented so automation can bail out if a headless run introduces regressions.
- **Resource quotas:** When running headless tasks that invoke Replicate or D-ID, point them at test plans or sandbox collections to avoid burning production credits.

---

## 6. Next Steps
1. Install and login on the build runner.
2. Pilot the dependency tidy script locally; capture before/after diffs.
3. Convert the workflow into a GitHub Action once validated.
4. Extend with additional prompts:
   - Analytics rollups: regenerate retention metrics and push to `docs/analytics/`.
   - Marketing assets: sanity-check the landing page copy against `LuxLife-MVP-PRD.md`.
   - Backups: weekly verification that Storage buckets have the right lifecycle policies.

By standardizing these scripts, LuxLife’s maintenance work becomes predictable, auditable, and mostly automated while staying under human control.


