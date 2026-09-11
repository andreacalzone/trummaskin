# CLAUDE.md

## Project

This is a React Native + Expo mobile drum sequencer.

The application lets users quickly create rhythmic ideas by programming one drum at a time on a tactile 4×4 step grid and playing the resulting pattern in a continuous loop.

The main priorities are:

1. Excellent touch interaction
2. Tactile, satisfying sequencer UI
3. Reliable audio timing
4. Simple architecture
5. Fast creative workflow
6. Polished mobile UX

---

# Product requirements

The primary workflow is:

Open app → select drum → place hits → select next drum → place hits → Play → adjust rhythm

The app should work primarily from one main screen.

Initial drum choices:

- Kick
- Snare
- Closed Hi-Hat
- Open Hi-Hat
- Tom
- Clap

The user edits one drum at a time through a dropdown/select control.

Each drum has its own independent 16-step pattern.

Core controls:

- Drum selector
- 4×4 step grid
- BPM
- Play
- Stop
- Reset

Reset clears ONLY the currently selected drum.

Default BPM: 120.

---

# GRID — IMPORTANT

The 16-step sequencer is presented as a 4×4 grid.

The supplied visual reference is the design direction.

The exact colors and text in the reference are NOT requirements.

The tactile visual character IS a requirement.

The grid should feel like physical hardware:

- chunky individual tiles
- visible gaps between tiles
- slight visual depth
- raised/pressed appearance
- clear active state
- clear inactive state
- clear playback state
- large touch targets
- satisfying interaction feedback

Do not turn the sequencer into a flat table.

Do not replace the 4×4 presentation with a conventional 16-column DAW grid.

The grid is the primary visual and interactive focus.

The final visual design should be original rather than a literal copy of the reference image.

---

# Technology

Use:

- React Native
- Expo
- TypeScript
- Current project versions

Prefer official Expo/React Native APIs.

Use the current Expo audio solution where appropriate.

Check current API compatibility before using older examples.

---

# Dependencies

Do not add dependencies casually.

Before installing a dependency:

1. Check whether Expo/React Native already provides the functionality.
2. Check native compatibility.
3. Explain why it is needed.
4. Prefer maintained libraries compatible with the current Expo architecture.

---

# Architecture

Keep these concerns separate:

- UI
- Pattern/state
- Sequencer timing
- Audio
- Persistence

The UI must not be responsible for accurate audio timing.

The audio engine must not depend on React rendering.

---

# AUDIO — CRITICAL

This is a real drum sequencer.

Timing consistency and low perceived latency matter.

Never:

- use React rendering as the audio clock
- use React state updates as the source of truth for audio timing
- use a naive `setInterval` directly to trigger drum samples
- use a naive timeout chain to schedule individual hits
- reload audio samples every time a step triggers

Preload/reuse audio resources where appropriate.

The audio scheduler is authoritative.

The visual playhead is only a representation of playback position.

If the current Expo audio solution cannot provide sufficiently reliable low-latency rhythmic playback:

STOP and explain the limitation.

Do not hide the limitation with a fragile workaround.

If native audio or a different architecture is actually required, explain why before implementing it.

---

# Audio development order

Do not build the full audio engine first.

Build in this order:

1. Static UI
2. Interactive 4×4 grid
3. Pattern state
4. Drum selection
5. Individual sample loading
6. Manual sample triggering
7. Sequencer timing engine
8. Pattern playback
9. Visual playhead

Audio timing must be validated independently from the UI.

---

# Sequencer

Default:

- 16 steps
- 4×4 presentation
- sixteenth-note subdivision
- 120 BPM

BPM should be adjustable.

Suggested range:

40–240 BPM

Changing BPM during playback should not restart the pattern.

Timing must be calculated from BPM, not from a hard-coded interval.

---

# State

Separate:

Pattern:
- drum patterns
- BPM
- step count
- metadata

Playback:
- playing/stopped
- current step
- scheduler state

UI:
- selected drum
- dropdown state
- temporary UI state

Audio:
- loaded samples
- audio resources
- playback engine state

Do not put high-frequency playback timing into React state unnecessarily.

Avoid causing the whole grid to re-render on every playback step.

---

# Data model

Each drum owns its own step pattern.

Conceptually:

Instrument:
- id
- name
- sample
- steps
- volume
- muted

Pattern:
- id
- name
- bpm
- stepCount
- instruments

The exact implementation can differ if a simpler robust solution exists.

Patterns must be serializable.

---

# Mobile UX

Design for touch first.

Step tiles must be large and easy to hit.

Provide immediate visual feedback.

The app should be understandable without prior music-production experience.

Avoid:

- tiny controls
- unnecessary menus
- clutter
- generic form-like styling
- excessive animations
- excessive gradients
- excessive rounded cards

Prefer:

- clear hierarchy
- tactile controls
- strong active/inactive states
- subtle interaction feedback
- compact controls
- a playful but purposeful music-tool aesthetic

---

# Persistence

Use local device storage for saved patterns.

MVP eventually supports:

- Save
- Load
- Delete

Do not add:

- backend
- authentication
- accounts
- cloud sync

unless explicitly requested.

---

# Future features

Possible later features:

- velocity
- swing
- per-drum volume
- mute/solo
- multiple patterns
- pattern chaining
- fills
- probability
- triplets
- custom samples
- recording
- audio/loop export
- MIDI export
- sharing

Do not implement future features without explicit instruction.

Do not make the MVP architecture unnecessarily hostile to these features.

---

# Code quality

Use strict TypeScript.

Avoid `any`.

Prefer simple readable code.

Do not over-engineer.

Do not introduce a global state library unless there is a concrete reason.

Do not install dependencies without justification.

Do not modify unrelated files.

Do not rewrite working code just because you prefer another approach.

---

# Bug fixing

When something breaks:

1. Reproduce or inspect the actual problem.
2. Identify the root cause.
3. Explain the root cause briefly.
4. Make the smallest appropriate fix.
5. Test again.

Do not stack speculative workarounds.

If a previous fix failed, acknowledge it and investigate again.

Never claim something works if it has not been tested.

---

# Development workflow

Work in milestones.

After meaningful changes:

- run TypeScript checks
- run lint if configured
- run the app when possible
- test the actual behavior

Before changing more than a few files, say which files you intend to change and why.

For larger tasks, plan first.

Do not implement multiple unrelated features in one change.

---

# Communication

Be technically honest.

If something is uncertain, say so.

If an API has limitations, say so.

If a requested feature requires an architectural decision, explain the tradeoff before implementing it.

Keep explanations concise unless deeper reasoning is useful.
