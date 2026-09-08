# Classification Guide

How to classify Slack messages. Each message gets exactly one type.

## Type Definitions

### BUG

Something is broken, producing errors, or behaving unexpectedly.

**Signal words:** "broken", "error", "crash", "not working", "stuck", "freeze", "blank screen", "won't load", "disappeared", "wrong"

**Examples:**
- "The chat just spins forever after I send a message"
- "I keep getting an error when I try to invite my co-parent"
- "We both finished the stage but it never advanced"
- "App crashed when I opened my session"
- Screenshot showing an error message or broken UI

### FEATURE

A request for new functionality or enhancement to existing functionality.

**Signal words:** "it would be nice", "can we add", "I wish", "what if", "could you make", "feature request", "would love to see"

**Examples:**
- "Can we add a way to export my session takeaways as PDF?"
- "It would be great if I got a reminder to do my tending check-in"
- "I wish I could see all my past inner-work entries side by side"
- "What if we added push notifications when my partner responds?"

### QUESTION

Asking how something works, where to find something, or seeking clarification.

**Signal words:** "how do I", "where is", "what does", "is there a way", "?", "wondering if", "does it"

**Examples:**
- "How do I invite the other person to a session?"
- "Where can I find my inner thoughts / knowledge base?"
- "What does 'felt heard' mean in the empathy step?"
- "Is there a way to archive or leave a session?"

### FEEDBACK

Sharing impressions, opinions, or suggestions about the experience without reporting a specific broken thing or requesting a specific new feature.

**Signal words:** "I like", "I don't like", "it feels", "the experience", "UX", "confusing", "love", "annoying"

**Examples:**
- "The new stage transitions feel really smooth, love it!"
- "The empathy step was a bit confusing -- I wasn't sure what to write"
- "The session summary is great but feels too long"
- "I find myself checking in every day now"

### REQUEST

A task, review, investigation, or action that requires substantive work — not just answering a question. Common in dev channels (#agentic-devs, DMs). The key signal: the requester expects the bot to *do* something, not just *answer* something.

**Signal words:** "do", "run", "review", "audit", "check", "build", "create", "investigate", "analyze", "set up", "deploy", "fix", imperatives

**Examples:**
- "Do a systems architecture review of this week's changes"
- "Run a security audit on the auth middleware"
- "Investigate why the pipeline is slow"
- "Build a workspace for handling deploy requests"
- "Create an issue to track the mobile redesign"
- "Audit the documentation for drift"
- "Set up monitoring for the new service"

### PRIORITIZE

A request to flag an existing issue or PR as high-priority. The requester wants something moved up in importance — not a new feature, not a bug report, but a priority escalation of existing work.

**Signal words:** "prioritize", "priority", "urgent", "high priority", "high-priority", "expedite", "fast-track", "bump up", "move up", "do first", "important"

**Signal emoji:** ⚡ (`:zap:` / lightning bolt) — when someone reacts with or includes ⚡ on a message referencing an issue or PR, treat it as a priority escalation request.

**Examples:**
- "Can you prioritize PR #123?"
- "That issue about the session list should be high priority"
- "Please flag the Stage 4 bug as urgent"
- "Make the mobile redesign high-priority"
- "Can you bump up the auth fix? It's blocking us"
- ⚡ emoji reaction on a message mentioning an issue or PR

### OBSERVATION

Personal reflection, status update, or conversational message with no action implied.

**Signal words:** "just tried", "interesting", "update:", status reports, thinking aloud

**Examples:**
- "Just resolved our first conflict in the app!"
- "The meditation really helped me settle before our session"
- "Interesting to see how my needs shifted over time"
- "Update: we've been using it daily for two weeks now"
- "Happy Friday everyone!"

## Ambiguity Rules

When a message could fit multiple types, use these tiebreakers:

| Overlap | Winner | Rationale |
|---|---|---|
| BUG + QUESTION | BUG | Broken behavior takes priority ("why isn't X working?" = bug) |
| FEATURE + FEEDBACK | FEATURE | Actionable request takes priority ("I wish the button was bigger" = feature) |
| OBSERVATION + FEEDBACK | FEEDBACK | Impressions with implicit suggestions are trackable ("just tried X, it felt slow") |
| BUG + FEATURE | BUG | If something should work and doesn't, it's a bug |
| QUESTION + OBSERVATION | QUESTION | If there's a question mark and they expect an answer, it's a question |
| QUESTION + REQUEST | REQUEST | If answering requires real investigation or work beyond doc lookup, it's a request |
| REQUEST + FEATURE | REQUEST | If it's asking the bot to do it now (not a wish for the product), it's a request |
| REQUEST + PRIORITIZE | PRIORITIZE | If the core ask is to escalate priority of an existing item, it's a prioritize |
| FEATURE + PRIORITIZE | PRIORITIZE | If they're asking to prioritize existing work, not requesting new functionality |

## Image Context

Messages with images often indicate:
- **Screenshots of errors/broken UI** --> BUG
- **Screenshots of desired behavior** --> FEATURE
- **Screenshots showing confusing flow** --> FEEDBACK
- **Screenshots of the app in everyday use** --> OBSERVATION

Always download and view images before classifying if `has_images` is true.
