# Stage: Implement

## Input

- GitHub issue number (from prompt)
- Issue body and comments (`gh issue view <N> --repo shantamg/meet-without-fear`)
- `CLAUDE.md` — docs routing table

## Process

1. **Read the issue** comments first (newest to oldest), then body. Look for an `<!-- implementation-brief -->` comment — if found, use it as the primary input (it has what to build, acceptance criteria, and files to modify). Skip the rest of the comment thread. If no brief exists, extract from the full issue:
   - What needs to be done (feature, refactor, config change, etc.)
   - Acceptance criteria (explicit or implied)
   - Any referenced files, paths, or components

2. **Find relevant docs** using the docs routing table in `CLAUDE.md`:
   - Match the area of work to a doc route
   - Read the relevant doc(s) to understand architecture and conventions
   - If no route matches, search for related docs or ask

3. **Investigate the code**:
   - Use sub-agents to explore relevant source files in parallel
   - Understand the existing patterns before making changes
   - Identify test files that cover the area being modified

4. **Implement the changes**:
   - Follow existing code patterns and conventions
   - Keep changes focused — only what the issue asks for
   - Do not over-engineer or add unrequested features

5. **Run tests**:
   - Run relevant test suites (`npm run test` or targeted test commands)
   - If tests fail, fix until green
   - Add tests for new behavior if the area has existing test coverage

## Output

- Implemented changes in the working tree (unstaged)
- List of files modified
- Test results (pass/fail)

## Completion

Proceed to `stages/02-pr/` with the list of modified files and test results.
