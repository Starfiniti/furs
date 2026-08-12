import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalInvoiceDateTime, SlovenianTaxNumber, Zoi } from '@starfiniti/furs-core';
import {
  assertValidReceiptCodeData, buildReceiptCode, renderReceiptCode128Png,
  renderReceiptPdf417Png, renderReceiptQrPng, renderReceiptQrSvg,
  segmentReceiptCodeForCode128
} from '../dist/index.js';

test('FURS-CODE-001: official documentation example 1 is reproduced exactly', () => {
  const code = buildReceiptCode({
    zoi: Zoi.parse('a7e5f55e1dbb48b799268e1a6d8618a3'),
    taxNumber: SlovenianTaxNumber.parse('12345678'),
    issueDateTime: LocalInvoiceDateTime.parse('2015-08-15T10:13:32')
  });
  assert.equal(code.zoiDecimal, '223175087923687075112234402528973166755');
  assert.equal(code.checkDigit, '1');
  assert.equal(code.data, '223175087923687075112234402528973166755123456781508151013321');
  assertValidReceiptCodeData(code.data);
});

test('FURS-CODE-001: leading zeroes preserve the fixed 60-digit layout', () => {
  const code = buildReceiptCode({
    zoi: Zoi.parse('00000000000000000000000000000001'),
    taxNumber: SlovenianTaxNumber.parse('12345678'),
    issueDateTime: LocalInvoiceDateTime.parse('2026-01-02T03:04:05')
  });
  assert.equal(code.zoiDecimal, `${'0'.repeat(38)}1`);
  assert.match(code.data, /^\d{60}$/);
  assertValidReceiptCodeData(code.data);
  assert.throws(() => assertValidReceiptCodeData(`${code.data.slice(0, -1)}${(Number(code.checkDigit) + 1) % 10}`), /checksum/);
});

test('FURS-CODE-001: QR renderers accept only checksum-verified data', async () => {
  const data = '223175087923687075112234402528973166755123456781508151013321';
  const svg = await renderReceiptQrSvg(data);
  const png = await renderReceiptQrPng(data, { width: 256 });
  assert.match(svg, /^<svg/);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  await assert.rejects(renderReceiptQrSvg(`${data.slice(0, -1)}2`), /checksum/);
});

test('FURS-CODE-001: official Code 128 three- and four-segment examples are exact', () => {
  const data = '223175087923687075112234402528973166755123456781508151013321';
  assert.deepEqual(segmentReceiptCodeForCode128(data, 3), [
    '4122317508792368707511', '4222344025289731667551', '4323456781508151013321'
  ]);
  assert.deepEqual(segmentReceiptCodeForCode128(data, 4), [
    '441223175087923687', '442075112234402528', '443973166755123456', '444781508151013321'
  ]);
  for (const count of [2, 3, 4, 5, 6]) {
    assert.equal(segmentReceiptCodeForCode128(data, count).every((part) => part.length % 2 === 0), true);
  }
});

test('FURS-CODE-001: PDF417 and Code 128 render with prescribed control parameters', async () => {
  const data = '223175087923687075112234402528973166755123456781508151013321';
  const pdf417 = await renderReceiptPdf417Png(data, 5);
  const code128 = await renderReceiptCode128Png(data, 3);
  assert.equal(pdf417.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(code128.length, 3);
  assert.equal(code128.every((image) => image.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'), true);
  await assert.rejects(renderReceiptPdf417Png(data, 4), /5 to 33/);
});
