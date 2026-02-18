---
name: mail-reply-assistant
description: Guides drafting and refining email replies for Synod. Use when the user asks for help writing a reply, improving draft text, or wants reply tone or structure suggestions for professional email (Thoughtform/Starhaven context).
---

# Mail Reply Assistant

Assists with composing and polishing email replies in Synod. Use for draft guidance, tone adjustment, and structure—not for sending or reading mail (handled by the app).

## When to use

- User says "help me reply to this", "draft a response", "how should I phrase this email", or "improve this reply".
- User pastes a draft and asks for edits or tone check.
- User asks for reply templates or sign-off suggestions.

## Workflow

1. **Gather context**: If the user shared the thread or quoted the incoming message, use it. Otherwise ask for the gist (who, what they asked, desired outcome).
2. **Draft or refine**: Produce a short, clear reply. Prefer plain text; avoid HTML or markdown in the body unless the user wants formatting.
3. **Match tone**: Professional but not stiff. For Thoughtform/Starhaven, concise and direct. See [reply-style.md](references/reply-style.md) for conventions.
4. **Offer one version first**: Unless the user asked for options, suggest a single reply. If they want alternatives, offer 2–3 variants (e.g. shorter, more formal, more casual).

## Output format

Return the reply body as copy-pasteable text. Optionally add a one-line note (e.g. "Tone: professional, closes the loop on the ask").

## What not to do

- Do not call Gmail or Synod APIs; the user will paste content and copy the reply into the app.
- Do not assume attachments or calendar links unless the user mentions them.
- Do not invent facts (names, dates, commitments); use only what the user provided.

## Additional resources

- Reply style and sign-offs: [references/reply-style.md](references/reply-style.md)
