# Writing the voice-over

Read this before writing any `script.yaml`. Even good AI voices sound natural
only when the script is written for speech.

## Language
- Write every line and every card in the brief's language, natively: not a
  translation of English sentences. Use that language's natural word order and idioms.
- The style rules below apply in spirit: short sentences, conversational, the
  informal "you" where the culture and audience allow it (e.g. "du" for a German
  startup audience, "Sie" for corporate or older audiences; ask if unsure).
- Keep product names and UI labels exactly as they appear on screen.

## Voice
- Talk to one person, like a colleague showing them the app. Use "you".
- Contractions always: you'll, it's, that's, here's, don't.
- Short sentences: 6–14 words. One idea per sentence.
- Vary rhythm: a short line, then a longer one. Questions work ("Ready to submit?").
- Lead with the benefit, then the action: "Need a quick status? The home screen has it."
- No brochure language: avoid "seamlessly", "robust", "leverage", "empower",
  "one-stop", "streamline", "cutting-edge", "comprehensive".
- Never narrate the click itself ("Now I click the card"). Say why it matters.
- Never read out personal data from the screen (names, emails, phone numbers, addresses).

## Punctuation is pacing
The voice follows punctuation. Use it to direct delivery:
- Comma = short breath. Full stop = pause. A dash ( – ) = a quick turn.
- Use `...` at most once per video (a real dramatic beat). It makes ElevenLabs
  hesitate, which sounds unsure when overused.
- Put a full stop before key reveals: "And the best part? It's already fixed."
- Avoid long lists; if needed, keep lists to three items.
- Write numbers the way they're said: "eighty-five centers", "Q3" -> "Q three".
- Spell out abbreviations the first time, or write them phonetically (see `brand.md`).

## Structure
1. **Hook** (first line, under 6 seconds): the problem or outcome, not the product name.
2. **Walkthrough**: one segment per meaningful step the viewer sees.
3. **Close**: one line with the product name and the main benefit.

## Flow: sound like one person talking
A video feels robotic when it's a list of separate sentences with silence in
between. Make the lines one continuous talk:
- Link lines with connectors: "From here,", "Now", "And once that's done,",
  "That's it –", "Next up,". Not every line, but most.
- Each line hands over to the next: end on what's about to happen
  ("...and it goes straight to your manager.") and pick up from it.
- Vary length: one short line, one longer. Three short lines in a row sound choppy.
- Fill the time: aim for the voice to cover most of each stretch of recording.
  The tool cuts frozen screen time, but it can't cut a moving cursor or a page
  loading, so long motion with no voice still leaves a gap.

## Timing
- About 2.5 words per second of video before the next segment.
- When Claude drove the recording, the cursor glides for up to a second before
  each logged click. Anchor `at` about 800–1000 ms before the click, so the
  voice starts as the cursor starts moving. For manual recordings: 200–400 ms.
- A line may run long; the tool holds the frame. Keep holds under ~3 seconds each.
- Merge rapid clicks into one line. Skip scrolls unless they reveal something new.
- Silences are tightened automatically: frozen screen time is cut so gaps
  between lines stay under about a second. Use `cuts` for mistakes or for
  moving-but-boring stretches (a slow page load). `tighten: false` turns
  automatic trimming off.

## Voices
Set `voice` to the brief's choice: `female` or `male`. That picks a good default
voice for whichever engine runs (ElevenLabs when a key is set, else Kokoro).
- ElevenLabs: any voice ID from the user's ElevenLabs library also works, if
  they ask for one. ElevenLabs reads the neighbouring lines for context, so
  delivery flows across segments.
- Kokoro (English only): `af_heart` (female default), `af_bella`, `bf_emma`
  (British), `am_michael` (male default), `am_fenrir`, `bm_george` (British).
Use `speed: 1.05` for energetic demos, `0.95` for tutorials.

## Before rendering, check
- Read the whole script in one go, out loud in your head. It should sound like
  one person talking, not a list of captions.
- Read every line out loud in your head. If it sounds like a brochure, rewrite it.
- No two consecutive lines start the same way.
- The first line hooks; the last line names the product.
