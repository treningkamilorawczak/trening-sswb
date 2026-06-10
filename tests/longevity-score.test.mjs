import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeResult } from '../js/longevity-score.js';

const base = { age: 42, sex: 'm', heightCm: 182, weightKg: 88, rhr: 62, activity: 2, issue: 'none' };

test('zwraca wszystkie pola wyniku', () => {
  const r = computeResult(base);
  for (const k of ['score', 'vo2', 'norm', 'bmi', 'rec', 'verdict']) {
    assert.ok(k in r, `brak pola ${k}`);
  }
});

test('BMI liczone poprawnie', () => {
  const r = computeResult(base);
  assert.equal(r.bmi, +(88 / 1.82 ** 2).toFixed(1)); // 26.6
});

test('brak RHR -> domyślne 62 - 3*aktywność', () => {
  const withRhr = computeResult({ ...base, rhr: 62 - 3 * 2 });
  const without = computeResult({ ...base, rhr: null });
  assert.equal(without.score, withRhr.score);
});

test('score w zakresie 0-100 dla skrajności', () => {
  const low = computeResult({ age: 70, sex: 'f', heightCm: 160, weightKg: 110, rhr: 95, activity: 0, issue: 'fatigue' });
  const high = computeResult({ age: 25, sex: 'm', heightCm: 183, weightKg: 76, rhr: 45, activity: 3, issue: 'none' });
  assert.ok(low.score >= 0 && low.score <= 100);
  assert.ok(high.score >= 0 && high.score <= 100);
  assert.ok(high.score > low.score);
});

test('progi werdyktów', () => {
  const high = computeResult({ age: 25, sex: 'm', heightCm: 183, weightKg: 76, rhr: 45, activity: 3, issue: 'none' });
  assert.equal(high.verdict, 'ZDOLNY');
  const low = computeResult({ age: 70, sex: 'f', heightCm: 160, weightKg: 115, rhr: 95, activity: 0, issue: 'fatigue' });
  assert.ok(['WYMAGA PRZYGOTOWANIA', 'ODBUDOWA BAZY'].includes(low.verdict));
});

test('dolegliwości obniżają indeks regeneracji', () => {
  const none = computeResult(base);
  const stress = computeResult({ ...base, issue: 'stress' });
  const fatigue = computeResult({ ...base, issue: 'fatigue' });
  assert.ok(stress.rec < none.rec);
  assert.ok(fatigue.rec < stress.rec);
});
