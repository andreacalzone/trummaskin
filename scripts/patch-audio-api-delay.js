#!/usr/bin/env node
/**
 * Fixes a reversed input/output wiring bug in react-native-audio-api's
 * native DelayNode, which otherwise makes every DelayNode silently pass no
 * audio at all.
 *
 * Why this exists: this project pins react-native-audio-api to a nightly
 * build chosen specifically to fix a native iOS/CoreAudio bug (see the
 * comment in src/audio/use-drum-audio-engine.ts). That nightly's
 * DelayNodeHostObject has `getInput()`/`getOutput()` swapped — `getInput()`
 * returns the delay *reader* (which has zero graph inputs) and `getOutput()`
 * returns the delay *writer* (which produces no audible output of its own).
 * The practical effect: `source.connect(delayNode)` routes into a dead end,
 * so DELAY does nothing audible anywhere it's used — confirmed by direct
 * source reading of
 * node_modules/react-native-audio-api/common/cpp/audioapi/HostObjects/effects/DelayNodeHostObject.cpp.
 * Every other node type (Gain/BiquadFilter/Convolver/WaveShaper) is
 * unaffected.
 *
 * This file exists (instead of relying on manually-edited node_modules,
 * same reasoning as patch-audio-api-web.js) because manual node_modules
 * edits are wiped out by every `npm install`. Running this automatically
 * via the postinstall script re-applies the same fix every time, with no
 * extra dependency (no patch-package) needed.
 *
 * This patches the native C++ source, so it only takes effect after a
 * native rebuild (`npx expo run:ios` / `npx expo run:android`) — not a JS
 * hot reload.
 *
 * Safe to re-run: skips the file if it's already patched or doesn't match
 * the expected original source (e.g. after a library upgrade changes this
 * file — in that case, check whether the upgrade already fixed the
 * underlying bug before re-patching).
 */
const fs = require('fs');
const path = require('path');

const TARGET = 'node_modules/react-native-audio-api/common/cpp/audioapi/HostObjects/effects/DelayNodeHostObject.cpp';

const OLD = `std::shared_ptr<utils::graph::HostNode> DelayNodeHostObject::getInput(int /*outputIndex*/) {
  return delayReaderHostNode_;
}

std::shared_ptr<utils::graph::HostNode> DelayNodeHostObject::getOutput(int /*inputIndex*/) {
  return delayWriterHostNode_;
}`;

const NEW = `std::shared_ptr<utils::graph::HostNode> DelayNodeHostObject::getInput(int /*outputIndex*/) {
  return delayWriterHostNode_;
}

std::shared_ptr<utils::graph::HostNode> DelayNodeHostObject::getOutput(int /*inputIndex*/) {
  return delayReaderHostNode_;
}`;

const filePath = path.join(__dirname, '..', TARGET);

if (!fs.existsSync(filePath)) {
  console.warn(`[patch-audio-api-delay] Skipping missing file: ${TARGET}`);
  process.exit(0);
}

const content = fs.readFileSync(filePath, 'utf8');

if (content.includes(NEW)) {
  console.log(`[patch-audio-api-delay] Already patched: ${TARGET}`);
  process.exit(0);
}

if (!content.includes(OLD)) {
  console.warn(
    `[patch-audio-api-delay] Expected original code not found in ${TARGET} — ` +
      'the library version may have changed. Skipping; please check whether ' +
      'DELAY is audible and re-diagnose if not.',
  );
  process.exit(0);
}

fs.writeFileSync(filePath, content.replace(OLD, NEW));
console.log(`[patch-audio-api-delay] Patched: ${TARGET}`);
