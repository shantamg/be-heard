# Stage: Decompose

## Input

- `output/scope.md` from Stage 01
- `shared/decomposition-guide.md` — right-sizing rules

## Process

1. **Read scope document** and decomposition guide

2. **Identify work items**: break the scope into discrete deliverables, each representing a single meaningful change

3. **Right-size each item** using the decomposition guide:
   - One PR per sub-issue
   - One workspace per sub-issue (assign appropriate `bot:*` label)
   - Clear success criteria (what "done" looks like)
   - Independently buildable by a single agent

4. **For each sub-issue, draft**:
   - **Title**: concise, action-oriented (e.g., "Add retry logic to LLM turn requests")
   - **Body**: context, requirements, success criteria, relevant references
   - **Labels**: which `bot:*` workspace label applies
   - **Acceptance criteria**: bullet list of what must be true when done

5. **Validate decomposition**:
   - No sub-issue requires changes across more than 2-3 files/areas
   - No sub-issue depends on uncommitted work from another sub-issue at the same time
   - All scope items from `scope.md` are covered by at least one sub-issue
   - No duplicate or overlapping sub-issues

6. **Write issues document** to `output/issues.md`:
   - Numbered list of sub-issues with title, body, labels, and acceptance criteria

## Output

`output/issues.md` — complete list of planned sub-issues with full details.

## Completion

Proceed to `stages/03-sequence/` with the issues document.
