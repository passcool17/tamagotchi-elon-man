import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIMS, heightMM, headBottomZ, ROBOT } from '../src/ui/robot.js';

test('v2.2 robot is drawn to the print-v2 dimensions (338.6 mm tall, head 130 mm wide)', () => {
  assert.ok(Math.abs(heightMM() - 338.6) < 0.01);
  assert.equal(DIMS.head.w, 130);
  assert.equal(DIMS.base.h + DIMS.body.h, 216);
  assert.ok(Math.abs(headBottomZ() - 256.6) < 0.01, 'head flat 82 mm under its top');
  assert.equal(DIMS.plate.w, 105.5); assert.equal(DIMS.plate.h, 68.85);
});

test('one scale for every part, and the whole robot fits between the HUD and the buttons', () => {
  assert.ok(Math.abs(ROBOT.rx * 2 / ROBOT.mm - 130) < 1e-9);
  assert.ok(Math.abs(ROBOT.bodyWTop / ROBOT.mm - 120) < 1e-9 && Math.abs(ROBOT.bodyH / ROBOT.mm - 180) < 1e-9);
  assert.ok(Math.abs((ROBOT.floor - ROBOT.headTop) / ROBOT.mm - 338.6) < 1e-9);
  assert.ok(ROBOT.headTop > 400, 'below the stat bars');
  assert.ok(ROBOT.floor < 1240, 'above the buttons');
});
