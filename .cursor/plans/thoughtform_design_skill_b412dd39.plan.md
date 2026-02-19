---
name: Thoughtform Design Skill
overview: Create a Thoughtform-specific fork of the generic frontend-design skill that encodes brand tokens, aesthetic direction, anti-patterns, and a screenshot-extraction workflow. Start lean and iterate.
todos:
  - id: create-skill-dir
    content: Create skill directory at C:\Users\buyss\.cursor\skills\thoughtform-design\ with SKILL.md
    status: pending
  - id: write-tokens-ref
    content: Write references/tokens.md consolidating colors, typography, spacing, and corners from the canonical token files
    status: pending
  - id: write-brand-ref
    content: Write references/brand-philosophy.md distilling BRAND.md principles, voice, product variations, and anti-patterns
    status: pending
  - id: update-synod-rule
    content: Update Synod's .cursor/rules/thoughtform-frontend-design.mdc to reference the new skill instead of the generic one
    status: pending
isProject: false
---

# Thoughtform Design Skill

## Context

Three design skill sources exist today:

- **Generic skill** at `C:\Users\buyss\.cursor\skills\frontend-design\SKILL.md` -- broad aesthetic guidance (typography, color, motion, anti-patterns), not brand-specific
- **Thoughtform Claude skill** at `01_thoughtform/.claude/skills/frontend-design/SKILL.md` -- HUD aesthetic, references Astrogation components, tightly coupled to the thoughtform.co codebase
- **Brand spec** at `01_thoughtform/design/thoughtform_redesign/BRAND.md` + token files in `01_thoughtform/packages/ui/src/tokens/` -- the canonical source of truth for Void/Dawn/Gold, PP Mondwest + IBM Plex, spacing grid, corner brackets, anti-patterns

None of these is portable across Thoughtform projects (Synod, Atlas, Astrolabe, etc.) as a single reusable skill. The goal is a new `**thoughtform-design**` skill that:

1. Works across any Thoughtform repo (not hardcoded to one codebase)
2. Encodes the full brand token system as reference material
3. Includes a screenshot-extraction workflow for pulling inspiration into code
4. Starts lean and grows through iteration

## Skill Structure

```
C:\Users\buyss\.cursor\skills\thoughtform-design\
  SKILL.md                     (core workflow + brand direction, <200 lines)
  references/
    tokens.md                  (complete color/type/spacing/corner reference)
    brand-philosophy.md        (principles, voice, anti-patterns, product variations)
```

Following the progressive disclosure pattern from the skill-creator guide: `SKILL.md` stays concise with the workflow and essential rules; heavy reference material lives in `references/` and is loaded only when needed.

## SKILL.md Content Plan

**Frontmatter**: Name `thoughtform-design`, description triggers on any frontend/UI/design/component/styling work across Thoughtform projects.

**Body sections** (~150 lines):

- **Brand Direction** -- One-paragraph distillation: refined industrial minimalism, restraint over decoration, sharp geometry, token-driven, Void/Dawn/Gold
- **Quick Token Reference** -- The 6 most-used CSS variables and font stacks (full reference in `references/tokens.md`)
- **Screenshot Extraction Workflow** -- Step-by-step: receive screenshot, identify layout patterns, extract color/type/spacing choices, map to nearest Thoughtform tokens, propose implementation using brand primitives. This is the "inspiration extraction" loop.
- **Component Patterns** -- BEM naming, border/transition conventions, active-state language (gold accents), zero border-radius
- **Anti-Patterns** -- Compact list from BRAND.md (no purple gradients, no rounded corners, no box-shadows, no system fonts, no hardcoded colors)
- **References** -- Pointers to `references/tokens.md` and `references/brand-philosophy.md` with guidance on when to load each

## references/tokens.md Content Plan

Consolidated from `colors.ts`, `typography.ts`, `spacing.ts`, `corners.ts`:

- **Colors**: Full Void/Surface/Dawn/Gold/Alert/Verde palette with CSS variable names and hex/rgba values
- **Typography**: Font stacks (PP Mondwest display, IBM Plex Mono body/data, IBM Plex Sans where used), fluid size scale, weight/spacing/line-height tokens, presets (hudLabel, sectionHeader, bodyText)
- **Spacing**: 8px grid scale (xs through 4xl), layout tokens (hudPadding, railWidth, contentMaxWidth, etc.), frame sizing
- **Corners**: Corner bracket system (arm lengths, thicknesses, presets, position tokens)

## references/brand-philosophy.md Content Plan

Distilled from `BRAND.md` and `DESIGN_SYSTEM.md`:

- **Core Principles**: Restraint over decoration, sharp geometry, token-driven, particles for atmosphere
- **Brand Voice**: Precise, curious, confident, technical. Key phrases.
- **Product Variations**: Atlas (research station, heavy particles), Ledger (data-focused, minimal), Astrolabe (navigation, moderate), Synod (productivity, clean), Thoughtform.co (editorial, subtle)
- **Anti-Patterns**: Full do/don't list with concrete examples
- **Light Mode Notes**: How Synod (and future products) handle the Dawn-on-Void inversion

## What This Replaces

- The Synod cursor rule `thoughtform-frontend-design.mdc` will be updated to point to this new skill instead of the generic one
- The generic `frontend-design` skill remains untouched (it's useful for non-Thoughtform projects)
- The Claude skill in `01_thoughtform` remains untouched (it's codebase-specific)

## Iteration Plan

Start with V1 (this plan), then iterate by:

1. Sharing screenshots and testing the extraction workflow
2. Adding product-specific reference files as needed (e.g., `references/synod.md`)
3. Tuning the anti-pattern list based on real output quality

