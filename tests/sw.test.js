import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const VERSION = src.match(/const VERSION = '([^']+)'/)[1];
const OWN_OLD = new Function('VERSION', `${src.match(/const OWN_OLD = [^\n]+/)[0]}; return OWN_OLD;`)(VERSION);

test('v2 service worker only deletes its own old caches, never the v1 archive', () => {
  assert.equal(VERSION, 'tem-2.2');
  for (const k of ['tem-v1', 'tem-v2', 'tem-2.0', 'tem-2.0.1', 'tem-2.1', 'tem-2.0-old']) assert.equal(OWN_OLD(k), true, k);
  for (const k of ['tem-2.2', 'tem-v21-proto-1', 'tem-v1-proto-1', 'tem-v1-proto-2', 'tem-v2-proto-1', 'tem-v2-proto-2', 'entite-v3', 'other']) assert.equal(OWN_OLD(k), false, k);
});

test('every file the worker precaches exists', () => {
  const list = [...src.matchAll(/'([^']+\.(?:js|html|woff2|png|ogg|mp3|webmanifest))'/g)].map((m) => m[1]).filter((f) => f !== 'sw.js');
  for (const f of list) assert.doesNotThrow(() => readFileSync(new URL(`../${f}`, import.meta.url)), f);
});
