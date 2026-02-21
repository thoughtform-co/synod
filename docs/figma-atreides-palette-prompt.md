# Figma Atreides Palette — Claude Code Prompt

Use this as a prompt when running Claude Code with the Figma MCP.

---

## Prompt

Use the Figma MCP generate_figma_design tool to create an "ATREIDES PALETTE" color swatch section in this existing Figma file:

https://www.figma.com/design/XO8yGN90SfxiG1hmYPGYXn/Thoughtform-Brand-Codex

The design should match the existing COLORS section style in the Brand Codex (node 24:411). That section uses:
- Dark background (#000B14)
- PT Mono font, uppercase labels
- Color swatches as large rectangular blocks with token name, HEX, and RGB printed on each swatch

Create a new frame called "ATREIDES PALETTE" with the same dimensions (2540 x 1440) and layout style as the existing COLORS frame. Include these color swatches:

### Atreides Theme Colors

1. **ATREIDES** — HEX #253025, RGB 37 48 37 — Deep military green (base accent)
2. **ATREIDES LIGHT** — HEX #364B33, RGB 54 75 51 — Lighter olive green
3. **SURFACE-0 (ATREIDES)** — HEX #0C0E0B, RGB 12 14 11 — Green-tinted dark surface
4. **SURFACE-1 (ATREIDES)** — HEX #111410, RGB 17 20 16 — Green-tinted elevation
5. **SURFACE-2 (ATREIDES)** — HEX #161A14, RGB 22 26 20 — Green-tinted higher surface
6. **SPICE** — HEX #A67C52, RGB 166 124 82 — Warm umber / amber
7. **NEBULAE** — HEX #1B2130, RGB 27 33 48 — Deep blue

### Layout

- Header: "BRAND GUIDELINES + ATREIDES PALETTE" in the same style as the other pages (PT Mono, with the cross/plus icon and horizontal rule)
- Large section label "ATREIDES PALETTE" at bottom-left in PT Mono, ~267px, uppercase, color #ECE3D6
- Color swatches arranged in a grid (3 columns, 3 rows with the last row having 1 swatch)
- Each swatch: large rectangle filled with the color, with the token name, HEX value, and RGB value as text overlaid in PT Mono
- Text color: #ECE3D6 (dawn) on dark swatches, #110F09 on light swatches
- Background: #000B14 (matching the existing COLORS page)

This is for the Thoughtform brand — a design system for AI navigation tools. Zero border-radius everywhere. Sharp geometry. The aesthetic is Dune-inspired (House Atreides military greens + desert spice tones).
