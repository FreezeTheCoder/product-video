# Animated cards

Full-screen motion graphics that play between parts of the recording.

## Default: title + outro only
Every video gets exactly one `title` card first and one `outro` card last, and
nothing else. Add `points` or `stat` cards **only when the user explicitly asks
for them** in the brief's special requirements (e.g. "add a stat card for 85
centers", "a slide listing the three benefits"). Never add them on your own.

## Types

| type | fields | when |
|---|---|---|
| `title` | `title`, `subtitle` | always, first. Shows the logo |
| `outro` | `title`, `subtitle` | always, last. Shows the logo |
| `points` | `title`, `points` (2–4 short items) | only if the user asks for it |
| `stat` | `title`, `value` (number), `prefix`, `suffix`, `label` | only if the user asks for it |

```yaml
- at: 2000
  card: { type: title, title: "Approvals & Reports", subtitle: "AutoSmart Audit for area managers" }
  text: Checking dealership fixes shouldn't take all week. Here's how it works.
```

## Rules
- Card text is short: titles under 6 words, subtitles under 10, points under 8 each.
- The narration says more than the card; never read the card word for word.
- `stat` values must come from the user or the screen. Never invent numbers.
- For the outro, set the script's `end` to the card's `at`, so the recording
  doesn't keep playing after it.
- Everything is centred. Use `align: left` on a card only if the user asks.
- Quote every string inside `{ }`.

## Look (house style)
White background, black text (`#12110d`), orange accents (`#ef9820`) from the
logo, logo on title and outro. The logo file is `assets/logo.png`. Change the
look only if the user asks, via the script's optional `theme`:

```yaml
theme: { accent: "#ef9820", background: "#ffffff", text: "#12110d", logo: "assets/logo.png" }
```
