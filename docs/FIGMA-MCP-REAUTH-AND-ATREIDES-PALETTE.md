# Figma MCP re-authentication and Atreides palette

## Re-authenticating Figma MCP (Cursor)

You have two Figma-related MCPs; both must use the account that can access the Thoughtform Brand Codex file.

### 1. Figma (API / Personal Access Token)

- In **Cursor > Settings > Tools & MCP**, find **Figma** in "Installed MCP Servers".
- Open its configuration (dropdown or edit). You will see a place to set a **Personal Access Token**.
- In **Figma**: Profile (avatar) > **Settings** > **Personal access tokens**. Create a new token for the correct account (e.g. `vince@thoughtform.co` or the one that owns the Brand Codex file).
- Paste the token into the Figma MCP config in Cursor and save. Restart Cursor or reload the MCP if needed.

### 2. Figma Desktop (desktop app connection)

- **Figma Desktop** MCP talks to the **Figma desktop app** on your machine.
- Ensure the **Figma desktop app** is open and logged into the same account that has access to the Thoughtform Brand Codex file.
- In Cursor **Tools & MCP**, the Figma Desktop server does not use a token; it discovers the running app. If it was pointing at another account, log out in the desktop app and log in with the correct account, then try again.

### 3. Removing and re-adding (if needed)

- In **Tools & MCP**, you can remove an MCP server and add it again. For **Figma**, re-adding will prompt for a new Personal Access Token. For **Figma Desktop**, re-adding just reconnects to the desktop app (make sure the app is open and on the right account).

---

## Atreides palette for Thoughtform Brand Codex (Figma)

Encode these in your [Thoughtform-Brand-Codex](https://www.figma.com/design/XO8yGN90SfxiG1hmYPGYXn/Thoughtform-Brand-Codex?node-id=1265-382) board so the Synod Atreides theme and future products stay in sync.

| Token / name        | HEX       | RGB              | Usage (Synod)                          |
|---------------------|-----------|------------------|----------------------------------------|
| **Atreides**        | `#253025` | 37, 48, 37       | Deep military green (base)             |
| **Atreides Light**  | `#364B33` | 54, 75, 51       | Lighter olive; reply composer accent   |
| **Atreides Dim**    | —         | 37, 48, 37 @ 15% | Subtle green tint (from-me messages)   |
| **Spice**           | `#A67C52` | 166, 124, 82     | Warm umber; collapsed count accent     |
| **Spice Dim**       | —         | 166, 124, 82 @ 15% | Subtle spice tint                   |
| **Nebulae**         | `#1B2130` | 27, 33, 48       | Deep blue (from brand guidelines)      |

**Atreides theme surfaces (green-tinted dark):**

| Surface   | HEX       |
|----------|-----------|
| surface-0 | `#0C0E0B` |
| surface-1 | `#111410` |
| surface-2 | `#161A14` |

Add these as color styles or variables in the Brand Codex file so they can be reused in Synod and other Thoughtform products. Synod’s `tokens.css` already uses these values for the Atreides theme. After re-authenticating the Figma MCP, use it in Cursor to read from the Brand Codex file (`get_design_context`, `get_metadata`) to keep code and design in sync. The Figma MCP is read-only; encoding the palette into the board is done by creating these color styles/variables in Figma (e.g. in the node 1265:382 area or your COLORS section).
