# Orbit Snap: a one-button arcade game in a single HTML file

**Orbit Snap** is a one-button arcade game. Your core circles a pulsing singularity on one of two orbits. Tap, click or press Space to snap to the other orbit. Grab gold shards to build a combo multiplier (up to x8), dodge red mines, and leave a mine's orbit at the last moment for **Close Call** bonuses. The game speeds up every 18 seconds. One hit ends the run. A retry takes under a second.

**To run it:** save the file below as `index.html` and open it in any current browser. It needs no build step, no server, no dependencies and no network access. It works with a mouse, a keyboard or a touchscreen.

## Controls

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Switch orbit | Tap / click anywhere | `Space`, `Enter`, `↑`, `↓`, `W`, `S` (letter keys work with Caps Lock or Shift too) |
| Retry after death | Tap anywhere on the result card | `Space`, `Enter`, `R` |
| Restart mid-run | Pause → Restart | `R` |
| Pause / resume | Pause button | `Esc`, `P` (the game also pauses automatically when the tab loses focus) |
| Mute | Speaker button | `M` (the setting is saved) |
| Menus | Click / tap | `Tab` moves between buttons; `Space` / `Enter` press the focused button; `Esc` closes the Hangar |

On the menu and the result card, `Space` / `Enter` start a run only when no other button has focus. If you Tab to *Hangar* or *Menu*, those keys press that button instead. The result card focuses *Play again* when it opens, so a single `Space` still retries.

## How the four requirements are met

1. **Self-contained, with instant restart.** Everything is in one file: inline CSS, inline JS, and system fonts. After a death, the result card appears about 1 second later, and a tap or a key press starts a new run at once. A 0.35 s guard stops a panicked tap from skipping the card by accident. `R` restarts at any time during play, and the run you leave still banks its score and shards.
2. **Juice.** The game uses trauma-based screen shake (shake grows with the square of trauma, and includes rotation). It also has:
   - hit-stop on death, shield breaks and close calls;
   - a slow-motion death sequence;
   - additive glow particles (up to 700 at once, using cached glow sprites);
   - shockwave rings, a full-screen flash, and floating score text;
   - squash and stretch when the core snaps between orbits;
   - a skin-coloured motion trail and a core that pulses with the music's kick drum;
   - a "SPEED UP" phase banner that pops inside the singularity, and a background colour that changes with each phase;
   - a starfield that drifts as you orbit;
   - pop animations on the score and the multiplier, and achievement toasts;
   - phone vibration when you die.
3. **Sound (Web Audio, fully synthesized).** No audio files are used. Collecting a shard plays a note on a rising pentatonic scale, so a long combo plays a melody. Other sounds:
   - an arpeggio when the multiplier goes up;
   - a filtered-noise whoosh for close calls;
   - shield up and shield break sounds;
   - a layered noise and sub-bass death sound;
   - a phase-up fanfare;
   - UI, purchase and denied blips.

   A procedural music loop (kick, hi-hat and pentatonic bass) runs on a look-ahead scheduler, and its tempo rises with the phase (112 to 150 BPM). Everything passes through a compressor, so stacked sounds don't clip.
4. **Save system (LocalStorage).** The save stores your best score, best combo, shard bank, number of runs, lifetime shards, owned cores, equipped core, unlocked achievements and the mute setting. It lives under one versioned key (`orbitsnap.save.v1`). Values are checked when loaded, and a corrupt save falls back to defaults. The save is built so progress is not lost without you knowing:
   - **Saved at the moment of death.** The run is written to storage in the same frame you are hit, before the ~1 s slow-motion sequence. Closing the tab during the death animation loses nothing. A run you abandon with `R`, *Restart*, *Menu*, or by closing the page mid-run also banks its score and shards.
   - **Blocked storage is reported.** At startup the game test-writes to storage. If storage is blocked (some private windows, or site data disabled), or a later write fails (quota full), the menu and the result card show a red notice: *"Saving is blocked in this browser… your progress lasts until this tab closes"*. A one-time toast also appears if saving fails mid-session. The game stays fully playable in memory.
   - **Safe with two tabs open.** Every change (end of run, purchase, achievement, mute) re-reads the save before writing it. The `storage` event also pulls in changes from other tabs right away, including into an open Hangar. A core bought in one tab is never undone by a run that ends in another.
   - **Can't be farmed by quitting.** The *Runs* total (and the "Gravity Habit" achievement for 25 runs) counts every death, but an abandoned run counts only if it lasted at least 5 seconds. Pressing `R` 25 times in a row adds nothing to *Runs*. The shards and score of a short abandoned run are still banked, because you did earn them.

   **Progression:** each shard you collect also goes into your bank. You spend the bank in the **Hangar** on 6 cores (Ion is free; Ember 120, Toxin 300, Orchid 650, Aurora 1,200 with a rainbow trail, and Void 2,500). There are also **9 achievements** that pay bonus shards (Overdrive for reaching x8, Daredevil for 10 close calls, Singularity for 3,000 points, and others).

## A worked example: what happens in one run, and why it stays fair

These are real numbers on a 390×844 phone. The orbit radii are 0.22 and 0.37 of the play-field unit (here 390 px, the screen width), so the inner orbit is 86 px and the outer is 144 px. Phase 1 speed is 1.9 rad/s, so one lap takes about 3.3 s.

- **0–1.3 s:** The first pattern appears ahead of you. A hazard pops in at least 2.4 rad ahead, which at phase 1 is **1.26 s** before you reach it. Later pieces of a pattern appear together with its first piece, so they give you even longer. For example, a *pair* pattern puts three shards on the outer orbit and one mine on the inner orbit, opposite the middle shard.
- **Tap:** Your core moves between orbits over 0.09 s. Each object is checked once, in the frame your angle passes it. Collision uses your *actual* tweened radius: you count as "on" an orbit once you are past the halfway radius. A mid-snap hit or miss therefore always matches what you see on screen.
- **Shard 1–7:** Each shard is worth 10 points and adds 1 to the combo. At 8 combo the multiplier becomes x2, then x3 at 16, and so on up to x8. If you pass a shard on the other orbit, the combo resets. That is the greed hook: shards often sit next to mines.
- **Close call:** You get 25 × multiplier points, a small hit-stop and a whoosh when your core *actually leaves a mine's orbit* (crosses the halfway radius) less than 0.22 s before reaching that mine. The game records the last orbit you left and when you left it. Pressing two keys at once, or tapping with two fingers, flips the lane and flips it back before the core moves, so it earns nothing. A mine on the orbit you were never on earns nothing either. Only a late dodge, which really risks a hit, pays.
- **18 s:** Phase 2 starts. Speed rises by 0.17 rad/s. The singularity shows "SPEED UP" with the new phase number popping. The colours change, the tempo rises, and harder patterns join the pool (*wall*, *zigzag*).

The main thing this example showed: if patterns were spaced by angle, higher speeds would squeeze a slalom into gaps no human can hit. So **every gap is measured in seconds of travel**, not radians. Gaps start at 0.42 s and shrink to a minimum of 0.25 s. Reading time works the same way. Hazards appear `max(2.4 rad, 1.15 s × speed)` ahead, capped at 4.3 rad. The cap is needed because the orbit is only 2π around: a hazard 4.3 rad ahead is drawn 2 rad *behind* you, clear of the trail and of the 0.6 rad zone where passed objects fade out. At the top speed of 3.7 rad/s (phase 12+) the look-ahead is 4.26 rad, still under the cap. **Reading time never drops below 1.15 s:**

| Phase | Speed (rad/s) | Look-ahead (rad) | Reading time |
|---|---|---|---|
| 1 | 1.90 | 2.40 (floor) | 1.26 s |
| 3 | 2.24 | 2.58 | 1.15 s |
| 6 | 2.75 | 3.16 | 1.15 s |
| 12+ | 3.70 (max) | 4.26 | 1.15 s |

So the game gets harder through faster rhythm and tighter gaps, never through an impossible layout or less than 1.15 s to read one. I checked this with an automated bot that only dodges mines (its code is in "What I tested" below). It survived 100 s from a fresh start (it reached phase 6). It also survived 40 s with the game forced straight to phase 12 at full speed. The bot also logged the shortest time between a hazard appearing and the player reaching it: 1.13 s. That is the 1.15 s floor minus up to one frame of measurement lag.

## Trade-offs I chose, and what each one costs

| Decision | Why | What it costs |
|---|---|---|
| **Plain Canvas 2D + plain JS in one file** (no Phaser, Three.js or React) | You get exactly what you asked for: open the file and play. No CDN to break, no build, about 70 KB. A one-button 2D game doesn't need a physics engine or a scene graph. | No engine tools (tilemaps, a physics engine, an asset loader). Adding a big new system means writing it yourself. React best practices don't apply because React isn't used. |
| **Menus and HUD are HTML on top of the canvas** | Real buttons give keyboard focus, screen-reader labels, crisp text and CSS transitions for free. Global shortcuts step aside when a button has focus, so `Space`/`Enter` always do what the focused button says. | The game is drawn in two layers, so the canvas layout has to measure the HTML HUD (below). |
| **Play field laid out below the measured HUD** | `resize()` reads where the score and combo line end and fits the orbits, with hazard glow, into the space below. At 844×390, 667×375, 1024×600, 1280×720, 1366×768, 390×844 and 1440×900, no hazard can pass under the HUD or below the screen. Short landscape screens also get a smaller score (40 px). | On short landscape screens the field is smaller than the full height would allow, and the orbits sit a little below the centre of the screen. |
| **Phase banner and first-run hint moved off the field** | The "SPEED UP" banner is drawn inside the singularity, where no hazard ever passes. The first-run hint uses the combo line. Neither can cover play or fall off-screen at any size. | The banner is smaller than a full-width title card would be. It reads as a pop of the core, not as a separate screen. |
| **Fake glow from cached sprites with additive blending** (not `shadowBlur`) | `shadowBlur` drops frame rate badly on phones. Sprites keep hundreds of particles at 60 fps. | The glow is a fixed radial falloff, so it can't bloom based on the scene. |
| **Two orbits and one input** | Easy to learn in 2 seconds, playable one-handed on a phone, and tight for "one more run". | Fewer verbs. The game gets its depth from rhythm, greed (combo vs. safety) and close-call risk, not from extra controls. |
| **Spacing and reading time measured in seconds, not angle** | Stays fair at every speed (see the table above). | At top speed a new hazard pops in about a third of a lap behind your core, coming round the loop. You see it earlier, but it is placed less obviously "ahead". Patterns also look more spread out on screen at high speed. |
| **Close calls based on the orbit you actually left** (not on when you last pressed) | Risk-free input chords can't farm points or the Daredevil achievement. | Quickly going onto a mine's orbit and back off it, just before the mine, does count. That is deliberate: for those frames you really were on the mine's orbit. |
| **LocalStorage only** | No backend and works offline, as required. | Progress is per browser and per device. Clearing site data wipes it, and there are no online leaderboards. Where the browser blocks storage, nothing can persist; the game can only tell you so, which it does. |
| **Re-read the save before every write** (not a merge of two divergent copies) | Simple and correct, because every change is written the moment it happens. No tab ever holds unsaved progress for long. | If two tabs finish a run in the same millisecond, one run's shards could be counted from a slightly stale read. In practice this cannot happen by hand. |
| **Abandoned runs bank their score and shards, but count toward *Runs* only after 5 s** | You never lose a new best or shards you collected because you quit, and spamming `R` can't farm the 25-run achievement. | A real but very short run that you quit (under 5 s) is not counted in *Runs*. Deaths always count, however short. |
| **System font stack** | No network requests, and nothing shifts while a web font loads. | The type looks slightly different on each OS. |

## Assumptions

- The skills you named aren't available here. I applied what their names describe directly: a deliberate visual system, accessible UI, and complete production code with no TODOs.
- "Self-contained" means one file you open directly. Phaser, Three.js and React were allowed but not required, so I left them out (see the trade-offs).
- Browsers block audio until you interact with the page. The sound engine starts on your first tap, click or key press, and music begins once the audio context is running. If the browser refuses to create audio at all (privacy settings, too many audio contexts), the error is caught and the game runs silently. A tap always starts the run.
- `prefers-reduced-motion` is respected: screen shake drops to 25%, flashes are dimmed, and CSS animations are turned off.

## What I tested

All tests ran in headless Chromium (Playwright) against a test copy of the file. The copy differs by one line, added just before `resize();` near the end of the script, which exposes internals for the scripts:

```js
window.__t = { G, get mode(){return mode}, snapLane, Save, CFG, view, startRun, get time(){return time} };
```

**Core flows** (390×844 touch and 1440×900): no console errors; menu → play → death → result card → tap or Space to retry; pause and resume, and returning to the menu; mute is saved; achievements unlock and show a toast during a run; buying and equipping a core in the Hangar updates the save; the save survives a page reload.

**Exploit and input checks**, with results:
- **Close-call chord:** a mine is placed 0.15 rad ahead on the other orbit, then `snapLane()` is called twice in one frame. Result: 0 close calls, 0 points. The same test with `W` then `S` pressed back to back gives 0 close calls. A real single dodge off the mine's own orbit gives 1 close call, and the player survives.
- **Caps Lock / Shift:** `Shift+W` during play switches orbit.
- **`R` spam:** 26 presses of `R` mid-run leave *Runs* at 0, and no achievement unlocks. A run that lasted 6 s and was then quit with `R` adds 1 to *Runs*.
- **Keyboard on the result card:** after a death, focus is on *Play again*. `Tab` moves to *Hangar*, and `Enter` opens the Hangar (the game stays on the result screen and no run starts). `Esc` returns. `Space` on a focused *Menu* goes to the menu. On the main menu, `Space` on a focused *Hangar & Achievements* opens the Hangar. With no button focused, `Space` starts a run.
- **Layout:** at the 7 viewports listed in the trade-offs, the top of the outer orbit, glow included, is below the bottom of the HUD's combo line, and the bottom of the orbit is inside the screen. For example, at 844×390 the HUD ends at y = 73 and the field starts at y = 82. At 1366×768 the field ends at y = 753, inside the 768 px screen. Screenshots of the phase-2 banner at 844×390 and 1366×768 show "SPEED UP 2" inside the singularity.

**Fairness bot.** The bot below is injected after pressing Play. At phase 1 it survived 100 s and reached phase 6. Forced to phase 12, it survived 40 s at 3.7 rad/s. The shortest reading time it measured after the first 3 s was 1.13 s:

```js
const t = window.__t, G = t.G; window.__minRead = 99; const seen = new WeakSet();
setInterval(() => {
  if (t.mode !== 1) return;
  for (const e of G.entities) if (!seen.has(e)) { seen.add(e); window.__minRead = Math.min(window.__minRead, (e.at - G.angle) / G.speed); }
  const ahead = G.entities.filter(e => !e.resolved && e.at > G.angle);
  const nm = l => { const m = ahead.filter(e => e.type === "mine" && e.lane === l).map(e => e.at - G.angle); return m.length ? Math.min(...m) : 99; };
  const cur = nm(G.lane), oth = nm(1 - G.lane);
  if (cur < 0.25 && oth > cur + 0.05) t.snapLane(); // dodge only when the next mine on this orbit is close
}, 8);
```

**Failure cases:**
- **Death-time save:** the save shows the finished run about 880 ms *before* the result card appears.
- **Two tabs:** another tab changed the bank to 999 and added a core. The open Hangar in this tab updated to "999 shards" at once. A run then ended in the first tab, and the core was still owned.
- **Storage blocked** (`getItem`/`setItem` throw `SecurityError`): the red notice shows on the menu, and Play still works.
- **`AudioContext` constructor throws:** Play starts the run, and taps and `M` cause no errors.
- **Forced render crash** (`arc()` made to throw for 100 ms mid-run): the game saved the run, went back to the menu, showed a "Something went wrong" toast, and was playable again right away.

Across all of these there were no uncaught errors.

**How a failing frame is handled.** Testing found one crash and I fixed it. The pop-in easing curve could return a tiny negative number, and `arc()` throws an error on a negative radius, so the easing is now clamped at 0. As a general safeguard, each frame's update and render run inside a `try/catch`. When a frame fails, the game resets the canvas state, skips that frame and logs the error. If three frames in a row fail, the state itself is assumed to be broken: the current run is saved, the game resets to the menu, and a one-time notice appears. A repeated error therefore cannot leave a frozen screen.

## The complete source: `index.html`

