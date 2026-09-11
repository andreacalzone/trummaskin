#!/usr/bin/env node
/**
 * Patches react-native-audio-api's web AudioParam implementation so
 * constructing an AudioContext never crashes on web.
 *
 * Why this exists: this project pins react-native-audio-api to a nightly
 * build chosen specifically to fix a native iOS/CoreAudio bug (see the
 * comment in src/audio/use-drum-audio-engine.ts). That nightly's web-core
 * AudioListener implementation unconditionally does
 * `new AudioParam(context.listener.positionX, context)` (and 8 similar
 * calls) assuming the browser's native AudioContext always exposes
 * positionX/Y/Z, forwardX/Y/Z, upX/Y/Z as AudioParam objects. Some
 * browsers/environments don't, so `param` arrives undefined and the
 * constructor throws reading `param.defaultValue` — crashing the whole app
 * on mount, since AudioContext is created at the app's provider root. This
 * app never uses 3D audio positioning, so making these fields tolerate a
 * missing `param` is always safe.
 *
 * This file exists (instead of relying on manually-edited node_modules)
 * because manual node_modules edits are wiped out by every `npm install`.
 * Running this automatically via the postinstall script below re-applies
 * the same fix every time, with no extra dependency (no patch-package)
 * needed — deliberately, since patch-package itself would need a
 * `npm install` to add.
 *
 * Safe to re-run: skips any file that's already patched or that doesn't
 * match the expected original source (e.g. after a library upgrade changes
 * this file — in that case, check whether the upgrade already fixed the
 * underlying bug before re-patching).
 */
const fs = require('fs');
const path = require('path');

const TARGETS = [
  'node_modules/react-native-audio-api/lib/module/web-core/AudioParam.web.js',
  'node_modules/react-native-audio-api/lib/commonjs/web-core/AudioParam.web.js',
];

const CONSTRUCTOR_OLD = `    this.param = param;
    this.defaultValue = param.defaultValue;
    this.minValue = param.minValue;
    this.maxValue = param.maxValue;
    this.context = context;`;
const CONSTRUCTOR_NEW = `    this.param = param;
    this.defaultValue = param?.defaultValue;
    this.minValue = param?.minValue;
    this.maxValue = param?.maxValue;
    this.context = context;`;

const ACCESSOR_OLD = `  get value() {
    return this.param.value;
  }
  set value(value) {
    this.param.value = value;
  }`;
const ACCESSOR_NEW = `  get value() {
    return this.param?.value;
  }
  set value(value) {
    if (this.param) this.param.value = value;
  }`;

let patchedAny = false;

for (const relativePath of TARGETS) {
  const filePath = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(filePath)) {
    console.warn(`[patch-audio-api-web] Skipping missing file: ${relativePath}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const alreadyPatched = content.includes(CONSTRUCTOR_NEW);
  if (alreadyPatched) {
    console.log(`[patch-audio-api-web] Already patched: ${relativePath}`);
    continue;
  }

  if (!content.includes(CONSTRUCTOR_OLD)) {
    console.warn(
      `[patch-audio-api-web] Expected original code not found in ${relativePath} — ` +
        'the library version may have changed. Skipping this file; please check ' +
        'whether the crash still happens and re-diagnose if so.',
    );
    continue;
  }

  content = content.replace(CONSTRUCTOR_OLD, CONSTRUCTOR_NEW);
  if (content.includes(ACCESSOR_OLD)) {
    content = content.replace(ACCESSOR_OLD, ACCESSOR_NEW);
  }

  fs.writeFileSync(filePath, content);
  console.log(`[patch-audio-api-web] Patched: ${relativePath}`);
  patchedAny = true;
}

if (patchedAny) {
  console.log('[patch-audio-api-web] Done.');
}
