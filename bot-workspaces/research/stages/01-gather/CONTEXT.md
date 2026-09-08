# Stage 01: Gather

## Input

- GitHub issue with `bot:research` label
- Issue body containing the topic or question to research
- `CLAUDE.md` docs routing table (for codebase research agent)
- `shared/references/github-ops.md` (for issue reading)

## Process

### 1. Read the issue

Fetch the full issue body and any existing comments via `gh issue view <number>`. Extract:
- **Research question**: What needs to be understood before building?
- **Scope hints**: Any areas of the codebase, external APIs, or constraints mentioned
- **Downstream intent**: Is this heading toward a spec (feature) or a fix (bug)?

### 2. Fan out parallel sub-agents

Launch three sub-agents in parallel. Each returns a structured findings block.

#### Agent A: Codebase Research

Search the repository for code relevant to the issue:
- Use the docs routing table in `CLAUDE.md` to identify which docs to read first
- Grep for relevant functions, types, routes, and components
- Read key files to understand current architecture in the affected area
- Check `backend/prisma/schema.prisma` if data model is involved
- Look at recent commits in affected areas (`git log --oneline -20 -- <path>`)

Output: list of relevant files, current architecture summary, existing patterns, and technical constraints.

#### Agent B: Web Research

Research external documentation, APIs, and best practices:
- Look up official docs for any third-party services or libraries mentioned
- Find best practices for the approach being considered
- Check for known issues or caveats with relevant technologies
- Research alternative approaches if applicable

Output: links to key resources, best practice recommendations, known pitfalls.

**Note**: If the issue is purely internal (no external APIs, libraries, or standards involved), this agent reports "No external research needed" with a brief justification and completes immediately.

#### Agent C: Internal Research

Search for related prior work within the project:
- Search closed issues and PRs for related topics: `gh issue list --state closed --search "<keywords>"` and `gh pr list --state closed --search "<keywords>"`
- Check if there are existing docs in `docs/` covering the area
- Look for related open issues that might overlap or conflict
- Search `.planning/` for any existing plans in the area

Output: related issues/PRs (with links), relevant docs found, potential conflicts with open work.

### 3. Collect and validate results

Wait for all sub-agents to complete. Verify each returned structured findings (not empty or error). If a sub-agent failed, note the gap -- do not block synthesis.

### 4. Post meta tag

Post a comment with the raw findings and a meta tag:
```
<!-- bot:research-meta: {"stage": "gather", "agents": {"codebase": "done", "web": "done", "internal": "done"}} -->
```

## Output

- Three structured findings blocks (codebase, web, internal) ready for synthesis
- Meta tag posted indicating gather is complete

## Completion

Proceed to `stages/02-synthesize/` with the collected findings.
