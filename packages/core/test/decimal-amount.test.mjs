import assert from 'node:assert/strict';
import test from 'node:test';

import { DecimalAmount, FursDomainError } from '../dist/index.js';

test('FURS-MONEY-001: canonical amounts round-trip without floating point', () => {
  for (const value of ['0.00', '0.01', '1.10', '1245.56', '-1.00', '99999999999999.99']) {
    const amount = DecimalAmount.parse(value);
    assert.equal(amount.toString(), value);
    assert.equal(amount.toJsonNumberToken(), value);
    assert.equal(typeof amount.toMinorUnits(), 'bigint');
  }
});

test('FURS-MONEY-001: minor units produce exact canonical values', () => {
  assert.equal(DecimalAmount.fromMinorUnits(110n).toString(), '1.10');
  assert.equal(DecimalAmount.fromMinorUnits(-1n).toString(), '-0.01');
});

test('FURS-MONEY-001: non-canonical decimal input is rejected', () => {
  for (const value of [
    '1',
    '1.1',
    '1.001',
    '01.00',
    '+1.00',
    '1,00',
    '1e2',
    ' 1.00',
    '1.00 ',
    '-0.00'
  ]) {
    assert.throws(() => DecimalAmount.parse(value), FursDomainError, value);
  }
});

test('FURS-MONEY-001: official schema exclusive amount bounds are enforced exactly', () => {
  assert.throws(() => DecimalAmount.parse('100000000000000.00'), /less than 100000000000000/);
  assert.throws(() => DecimalAmount.parse('-100000000000000.00'), /greater than -100000000000000/);
});
