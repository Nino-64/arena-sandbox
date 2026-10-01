# Orbita: a one-touch orbit runner

**Orbita** is a complete, single-file HTML5 Canvas game. Save the file below as `index.html` and open it in any modern browser. There is no build step and nothing to install, and it makes no network requests. It works offline and from `file://`.

**How it plays:** your light circles a pulsing core. One input (tap, click, or Space) hops it between the inner and outer orbit. You collect gold orbs to build a **chain**: every 4 orbs collected within 3 seconds of each other raises the multiplier, up to ×6. Red stars kill you. Each one flashes a warning first and becomes deadly 0.75 s later. If you dodge a star by a hair, you get a **CLOSE** bonus, a brief slow-mo, and extra chain time. Speed and the number of hazards rise every 10 seconds and every 8 orbs. When you die, the results screen appears in under a second. Tap, Space, or R starts the next run immediately.

## The questions that shaped it

I started by working out how a game like this usually breaks. The design follows from the answers.

| Question | Answer | What it decided |
|---|---|---|
| What makes a loop addictive and not just busy? | A decision every second, runs under a minute, near-misses that feel earned, a number to beat, and a visible "next unlock" bar. | One-button orbit hopping, a chain multiplier, close-call bonuses, and progress toward the next trail shown on the menu and the results screen. |
| What breaks "instant restart"? | Two things. Restarting is too slow, or it is too fast: the frantic tap that killed you also skips past your result. | Taps are ignored during the 0.9 s death animation and for 0.45 s after results appear. **R** restarts immediately at any time, because a key press is deliberate. |
| How do one-button games feel unfair? | Something appears on top of you, or two hazards form a wall you cannot get through. | Hazards only spawn where you have at least 1.15 s (plus their own drift speed) to react, and they are harmless while they telegraph. Hazards on different orbits always keep an angular gap that leaves time to weave. Drifting hazards reverse direction rather than close that gap. A bot that played 120 s at maximum speed never met an impossible situation. |
| What breaks at different frame rates? | Collisions get skipped at 30 fps, the game runs faster at 144 Hz, and switching tabs causes a huge time jump. | The simulation runs in fixed 1/120 s sub-steps no matter the refresh rate. Frame time is capped at 100 ms. The game pauses when the tab is hidden or the window loses focus. |
| What breaks LocalStorage? | Private mode or blocked storage throws on access. Data can be corrupt or hand-edited (NaN, negative numbers, unknown skins). A full quota throws on write. Two tabs can overwrite each other. | Every access is wrapped in try/catch, and the game falls back to in-memory saving with a visible notice. Every loaded field is validated and clamped. Unreadable JSON is backed up to `orbita:save:v1:corrupt` rather than destroyed. Saves merge with what is on disk (records by max, unlocks by union), and a `storage` listener picks up results from other tabs. |
| What breaks Web Audio? | Autoplay policy (the context starts suspended), Safari's `webkitAudioContext`, missing support, too many voices, and a flood of notes after a stall. | Audio is created and resumed on the first gesture, with an extra `touchend` unlock for iOS. If audio is unavailable, the game runs silently. There is a 32-voice cap and a compressor on the master bus. The music scheduler skips missed steps rather than bursting them out. Audio is suspended while the tab is hidden. Mute is saved. |
| What breaks input? | Key auto-repeat, two thumbs landing on the same frame and cancelling each other out, Space "clicking" a focused button, scroll and zoom gestures, right-clicks, long-press menus. | `e.repeat` is ignored. Taps within 45 ms of each other count once. Focus is cleared when a run starts. Buttons handle their own clicks and never also trigger a hop. `touch-action: none`, gesture and context-menu blocking, and right-click filtering. |
| What breaks the screen? | High-DPI blur, resizing or rotating in the middle of a run, notches, tiny landscape phones, people sensitive to motion. | The game world is in resolution-independent units (outer orbit = 1), so resizing never moves gameplay. Pixel ratio is capped at 2. Safe-area insets are respected. Compact layout under 560 px of height. `prefers-reduced-motion` cuts screen shake by 80% and flashes by 70%, and turns off UI animations. |
| What keeps it running smoothly on weak phones? | Garbage-collection pauses and `shadowBlur`. | A pooled, swap-removed particle system (720 max) with no allocation per frame. Glows are drawn as layered translucent shapes, not `shadowBlur`. The HUD's DOM updates only when the score changes. |

## Requirement checklist

1. **Self-contained, instant restart:** one HTML file with no external assets. Tap, Space, or R starts a new run straight from the results screen. R also restarts in the middle of a run. P or Esc pauses.
2. **Juice:**
   - Trauma-based screen shake (shake grows with trauma², plus a slight rotation).
   - Hit flashes, slow-mo on death and on close calls.
   - Pooled additive particles, shockwave rings, floating score text.
   - A combo timer ring around the core.
   - A core that pulses on the music's kick drum.
   - A glowing trail, a squash "pop" on hops and pickups.
   - Hazard warnings and drift trails, a parallax starfield, and an animated HUD score.
3. **Procedural sound:** every sound is synthesized with Web Audio, with no audio files:
   - Hop blips that differ for the inner and outer orbit.
   - Pickups that climb a pentatonic scale as your chain grows.
   - Multiplier stingers, a filtered-noise whoosh for close calls, and a click when a hazard turns deadly.
   - A lap tick, a level-up arpeggio, and a layered noise-and-saw death sound.
   - Unlock fanfares and UI sounds.
   - An adaptive beat (kick, hats, bass, arpeggio) whose tempo and number of layers rise with your level.
4. **Save system:** stored under the LocalStorage key `orbita:save:v1`:
   - Records: best score, best chain, total runs, total orbs, total score.
   - Settings: chosen trail, mute.
   - The tutorial-seen flag.
   - **Six unlockable trails**, each with a requirement:

     | Trail | Requirement |
     |---|---|
     | Ion | Starter trail |
     | Ember | Score 250 in one run |
     | Venom | Collect 200 orbs total |
     | Nova | Chain 16 orbs |
     | Aurum | Finish 30 runs |
     | Prism | Score 1,500 in one run (rainbow trail) |

   - A trail recolours the whole game: core, rings, trail and UI accent.

## Controls

| Action | Input |
|---|---|
| Hop orbit / start / retry | Tap, click, Space, Enter, arrows, WASD |
| Restart now | R |
| Pause / resume | P, Esc, or the on-screen pause button |
| Mute | M or the speaker button |

## Assumptions

- I took "self-contained" literally: one file with zero dependencies. Phaser, Three.js, and React would add a download or a build step and give this 2D design nothing it needs, so the React and bundler best-practice guidance doesn't apply.
- "Progression" means records that carry over between runs plus cosmetic unlocks, with no pay-to-win upgrades. Every run starts fair, so a high score is comparable between runs.
- An abandoned run (restart, quit to menu, or closing the tab) still banks its orbs and score toward records. It only counts toward "runs played" if it lasted at least 3 seconds, so spamming R can't farm the Aurum unlock.

## How it was checked

I ran it in headless Chromium at 1280×800 and 390×844, with these results:

- No console errors.
- A full play → death → results → R-restart cycle works.
- Saves persist across reloads.
- A malformed save is backed up and the game recovers.
- A tampered save (`"games": -5`, `"orbs": "12"`, unknown skin IDs) is sanitized, and its stats grant exactly the unlocks they earn.
- With LocalStorage blocked, the game still plays and shows the "progress lasts until the tab closes" notice.
- A scripted bot survived 120 s at maximum difficulty, which shows the spawn rules never create an impossible situation.

## `index.html`

```html
