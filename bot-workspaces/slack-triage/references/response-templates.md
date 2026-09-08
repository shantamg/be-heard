# Response Templates

Reply patterns for each message type. All replies use Slack mrkdwn syntax and are posted as thread replies via `slack-post.sh`.

## Formatting Reminder

- Bold: `*bold*` (NOT `**bold**`)
- Links: `<https://url|display text>` (NOT `[text](url)`)
- Bullets: use `\u2022` (NOT `-` or `*`)
- Separate sections with blank lines

## BUG -- Fixed with PR

Template:
```
Got it -- [brief description of what was wrong]. Just pushed a fix!

<https://github.com/shantamg/meet-without-fear/pull/N|PR #N>
```

Example:
```
Got it -- looks like the timer wasn't resetting after a session ends. Just pushed a fix!

<https://github.com/shantamg/meet-without-fear/pull/142|PR #142>
```

## BUG -- Tracked as issue

Template:
```
Thanks for flagging this! [Brief acknowledgment of the problem]. Created a tracking issue so the team can dig in:

<https://github.com/shantamg/meet-without-fear/issues/N|Issue #N>
```

Example:
```
Thanks for flagging this! Looks like the session list is showing stale data after a new message. Created a tracking issue so the team can dig in:

<https://github.com/shantamg/meet-without-fear/issues/87|Issue #87>
```

## BUG -- Already tracked

Template:
```
We're already tracking this one! [Brief context on status if available]:

<https://github.com/shantamg/meet-without-fear/issues/N|Issue #N>
```

## FEATURE

Template:
```
Great idea! Logged it for the team:

<https://github.com/shantamg/meet-without-fear/issues/N|Issue #N>
```

Example:
```
Great idea! A reminder for tending check-ins would be really handy. Logged it for the team:

<https://github.com/shantamg/meet-without-fear/issues/95|Issue #95>
```

## REQUEST

Template:
```
On it — tracking this here: <https://github.com/shantamg/meet-without-fear/issues/N|Issue #N>. The workspace dispatcher will pick it up shortly.
```

Example:
```
On it — tracking this here: <https://github.com/shantamg/meet-without-fear/issues/210|Issue #210>. The workspace dispatcher will pick it up shortly.
```

## PRIORITIZE -- Applied

Template:
```
Done — flagged as high-priority: <https://github.com/shantamg/meet-without-fear/issues/N|#N TITLE>
```

Example:
```
Done — flagged as high-priority: <https://github.com/shantamg/meet-without-fear/pull/142|#142 Fix health dashboard stale data>
```

## PRIORITIZE -- Already flagged

Template:
```
That one's already flagged as high-priority! <https://github.com/shantamg/meet-without-fear/issues/N|#N TITLE>
```

## PRIORITIZE -- Not found

Template:
```
I couldn't find an open issue or PR matching that — could you share the number or a link?
```

## QUESTION -- Answered

Template:
```
[Direct, friendly answer to the question]

[Optional: additional helpful context]
```

Example:
```
You can invite the other person right from your session -- tap Share/Invite and send them the link. Once they open it, they'll be guided into the same session to join you.

If they don't see it, double-check the link went through -- you can resend it from the same screen!
```

## QUESTION -- Don't know

Template:
```
Good question! I'm not sure about that one -- let me flag it for Shantam to follow up.
```

## FEEDBACK -- Positive

Template:
```
Love hearing that! [Brief response to what they said]. Logged it so the team sees this:

<https://github.com/shantamg/meet-without-fear/issues/N|Issue #N>
```

## FEEDBACK -- Constructive

Template:
```
That's really helpful feedback, thank you! [Brief acknowledgment]. Tracked it here:

<https://github.com/shantamg/meet-without-fear/issues/N|Issue #N>
```

## General Guidelines

1. **Keep it short.** Match the message length -- a one-line bug report gets a one-line acknowledgment.
2. **Acknowledge first.** Start with what they said before jumping to what you did.
3. **One link is enough.** Don't dump multiple links unless they're directly relevant.
4. **No code.** Never mention files, functions, or technical details.
5. **Be honest.** If you can't fix it or don't know the answer, say so.
