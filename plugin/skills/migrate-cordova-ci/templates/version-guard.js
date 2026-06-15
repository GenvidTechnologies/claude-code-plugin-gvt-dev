// Template lifted from genvid-holdings/cordova-plugin-marketplace@9b6721bba942b10f95c5ca0ab02f5728b9b1c308 (scripts/version-guard.js). Diff against @main before use; see SKILL.md.
#!/usr/bin/env node
'use strict';

// Guards the version lockstep that `npm run setup:demo` depends on.
//
// `npm run package` produces `<PLUGIN_TGZ_STEM><version>.tgz`
// and `<TESTS_TGZ_STEM><version>.tgz`. `demo/config.xml` pins
// those exact filenames (and a widget version). If `package.json` /
// `tests/package.json` are bumped without updating `demo/config.xml`, the CI
// jobs fail late and opaquely inside `cordova platform add`. This check fails
// fast and explains why.
//
// Marketplace originals:
//   PLUGIN_TGZ_STEM: "genvid-cordova-plugin-marketplace-"
//   TESTS_TGZ_STEM:  "cordova-plugin-marketplace-tests-"

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function versionOf (jsonPath) {
    return JSON.parse(fs.readFileSync(path.join(root, jsonPath), 'utf8')).version;
}

function firstMatch (text, re, label) {
    const m = text.match(re);
    if (!m) {
        console.error(`version-guard: could not find ${label} in demo/config.xml`);
        process.exit(1);
    }
    return m[1];
}

const pkgVersion = versionOf('package.json');
const testsVersion = versionOf('tests/package.json');

const configXml = fs.readFileSync(path.join(root, 'demo', 'config.xml'), 'utf8');
const widgetVersion = firstMatch(configXml, /<widget[^>]*\sversion="([^"]+)"/, 'widget version');
const pluginPin = firstMatch(configXml, /<PLUGIN_TGZ_STEM>([\d.]+)\.tgz/, 'plugin .tgz pin');
// marketplace regex was: /genvid-cordova-plugin-marketplace-([\d.]+)\.tgz/
const testsPin = firstMatch(configXml, /<TESTS_TGZ_STEM>([\d.]+)\.tgz/, 'tests .tgz pin');
// marketplace regex was: /cordova-plugin-marketplace-tests-([\d.]+)\.tgz/

const checks = [
    ['package.json', pkgVersion],
    ['tests/package.json', testsVersion],
    ['demo/config.xml widget version', widgetVersion],
    ['demo/config.xml plugin .tgz pin', pluginPin],
    ['demo/config.xml tests .tgz pin', testsPin]
];

const mismatch =
    pkgVersion !== testsVersion ||
    pkgVersion !== widgetVersion ||
    pkgVersion !== pluginPin ||
    testsVersion !== testsPin;

if (mismatch) {
    console.error('version-guard: version mismatch across sources:');
    for (const [name, value] of checks) {
        console.error(`  ${name}: ${value}`);
    }
    console.error('All must match so `npm run setup:demo` can resolve the packed .tgz files.');
    process.exit(1);
}

console.log(`version-guard: OK — all sources at ${pkgVersion}`);
