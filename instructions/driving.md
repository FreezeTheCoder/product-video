# Driving the app

Read this before exploring or recording. Commands go to the open browser:
`node "$SKILL_DIR/src/cli.ts" do "$OUT" <command>`.

| Command | Does |
|---|---|
| `look` | prints URL, title and the page's accessibility tree; saves `look.png` (view it when layout matters) and the full tree in `look.yaml` |
| `step '<yaml>'` | runs one step, not recorded, then prints `look` |
| `run <file>` | runs all steps of a steps file, not recorded |
| `record <file>` | opens `start`, records the whole file as one take |
| `close` | closes the browser |

If a step fails, the error and a fresh `look` come back. Nothing is recorded
from a failed take.

## Steps file

```yaml
start: https://app.example.com/dashboard   # optional; default: current page
steps:
  - click: 'role=link[name="Approvals"]'
  - click: 'role=row[name=/Hamburg/] >> role=button[name="Open"]'
  - fill: 'role=textbox[name="Comment"]'
    text: Looks good, approved.
  - select: 'role=combobox[name="Status"]'
    option: Approved
  - press: Enter
  - hover: 'role=button[name="Export"]'
  - scroll: 500                 # px with the wheel (negative = up), or a target to bring into view
  - wait: 1500
  - goto: /reports              # absolute or relative URL
  - click: 'text=Monthly summary'
    pause: 3000                 # ms to stay after the step (default 1400 in a take)
```

## Targets

Use the names from `look`, as Playwright selectors:
- `role=button[name="Save"]` (exact text: `name="Save"s`; pattern: `name=/save/i`)
- `text=Monthly summary`, or a CSS selector as a last resort
- several matches: the first one is used; pick another with `>> nth=1`, or narrow
  with a parent: `role=row[name=/Hamburg/] >> role=button[name="Open"]`

## Making a good take

- Follow the brief's steps in order. Don't wander into other screens.
- Explore with `step` first; write `steps.yaml` only once every target works.
  Then go back to the start state (`start:` does this) and `record`.
- Pacing: the default pause (1.4 s) suits most clicks. Add `pause: 2500–4000`
  where the viewer needs to read a screen the narration talks about.
  Long holds can be cut in `script.yaml`, missing time can't be added.
- Typed text appears letter by letter. Use realistic demo data. Never type
  personal data and never type passwords or one-time codes: the tool refuses,
  and the user types those.
- Ask the user before a step that saves, sends, approves, deletes or pays for
  something real, saying exactly what it will do. Prefer demo or test records.
- After `record`, view 2–3 screenshots from `$OUT/shots` to confirm the take
  looks right before writing the script.
- Only the first tab is recorded. If a link opens a new tab, use `goto` with its URL.
- If the user is signed out (a sign-in page appears in `look`), stop and ask
  them to sign in again in the window.
