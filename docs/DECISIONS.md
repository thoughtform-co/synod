# Implementation Decisions (Synod Multi-Account Overhaul)

## Done action
- **Semantics**: Archive + mark read. Remove `INBOX` label and remove `UNREAD` from the thread so it no longer appears in Inbox and is marked read.

## Invites
- **Source**: Gmail search query `has:invite`; parse `text/calendar` MIME parts for event details.
- **Fallback**: If parsing fails or RSVP API unavailable, show thread with "Open in Gmail" / event link CTA.

## HTML email rendering
- **Policy**: Sanitized rendering only. Strict allowlist: no scripts, no unsafe styles. Block remote tracking (e.g. external images) by default. Use DOMPurify or equivalent with strict config.

## Shadcn scope (this iteration)
- **In scope**: Sidebar, thread list item, thread header/actions, calendar shell, settings panel.
- **Out of scope**: Deep mail body restyling (follow-up iteration).
