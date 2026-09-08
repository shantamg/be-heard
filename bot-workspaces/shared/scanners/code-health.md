# Code Health Scanner

Detect technical debt signals and code health issues that warrant attention.

## Prerequisites

- Git CLI access
- Working directory in repo root

## Process

### 1. Check for test coverage changes

Compare test file counts and recent test failures:

```bash
# Count test files per package
cd
find backend/ mobile/ shared/ website/ -name "*.test.ts" -o -name "*.spec.ts" | wc -l

# Check for recently deleted test files
git log --diff-filter=D --since="7 days ago" --name-only -- "*.test.ts" "*.spec.ts"

# Check for recently added source files without corresponding tests
git log --diff-filter=A --since="7 days ago" --name-only -- "*/src/**/*.ts" \
  | grep -v ".test.ts" | grep -v ".spec.ts" | grep -v "index.ts" | grep -v ".d.ts"
```

For each new source file, check if a corresponding test file exists.

### 2. Scan for TODO/FIXME in recent changes

```bash
# TODOs in files modified in last 7 days
git diff --name-only HEAD~50 -- repo root  | while read f; do
  grep -Hn "TODO\|FIXME\|HACK\|XXX" "$f" 2>/dev/null
done
```

Classify by age and severity:
- `FIXME` in recently modified files = high priority
- `TODO` in new code = medium priority
- `HACK` anywhere = worth flagging

### 3. Check for dependency vulnerabilities

```bash
cd && npm audit --json 2>/dev/null | jq '.advisories | to_entries | .[] | {severity: .value.severity, title: .value.title, module: .value.module_name}'
```

If health-check has already run recently, reference its findings instead of re-running.

### 4. Detect code churn hotspots

```bash
# Files changed most frequently in last 14 days (potential stability issues)
git log --since="14 days ago" --name-only --pretty=format: -- repo root  \
  | sort | uniq -c | sort -rn | head -20
```

High-churn files that also have TODOs or test gaps are priority items.

### 5. Rank findings

| Priority | Criteria | Autonomy Tier |
|---|---|---|
| High | Critical/high vulnerability in production dependency | `proceed` |
| High | FIXME in recently deployed code | `proceed` |
| Medium | New source files without tests | `suggestion` |
| Medium | High-churn files with no tests | `suggestion` |
| Low | TODO comments in new code | `suggestion` |
| Low | Moderate vulnerability | `suggestion` |

## Output Format

```
## Code Health Findings

**Status:** [clean | issues-found]
**Items found:** N

### Test Coverage
- New source files without tests: N
- Recently deleted test files: N

### Technical Debt
- FIXME/TODO in recent code: N items
- High-churn hotspots: N files

### Dependencies
- Critical vulnerabilities: N
- High vulnerabilities: N

### Items
1. **[Finding description]** — [severity: high/medium/low]
   - Location: [file:line]
   - Context: [why this matters]
   - Suggested action: [write tests | fix TODO | update dependency | refactor]
   - Autonomy tier: [proceed | suggestion]
```
