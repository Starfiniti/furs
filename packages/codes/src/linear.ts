import bwipjs from 'bwip-js';

import { FursDomainError } from '@starfiniti/furs-core';

import { assertValidReceiptCodeData } from './receipt-code.js';

export const FURS_PDF417_LAYOUT = Object.freeze({
  minimumRows: 5,
  maximumRows: 33,
  errorCorrectionLevel: 2,
  minimumPixelsPerModuleX: 2,
  minimumPixelsPerModuleY: 10,
  minimumModuleWidthMm: 0.25,
  minimumModuleHeightMm: 1.25,
  quietZoneModulesX: 2
});

export const FURS_CODE128_LAYOUT = Object.freeze({
  allowedSegmentCounts: Object.freeze([2, 3, 4, 5, 6] as const),
  minimumPixelsPerModuleX: 2,
  minimumBarHeightMm: 3.5,
  minimumSegmentGapMm: 1,
  quietZoneModulesX: 10,
  minimumQuietZoneMm: 6
});

export type Code128SegmentCount = 2 | 3 | 4 | 5 | 6;

/** FURS-CODE-001: segment prefixes keep every Code 128-C payload even-length. */
export function segmentReceiptCodeForCode128(data: string, count: Code128SegmentCount): readonly string[] {
  assertValidReceiptCodeData(data);
  if (!(FURS_CODE128_LAYOUT.allowedSegmentCounts as readonly number[]).includes(count)) {
    throw new FursDomainError('FURS_CODE128_SEGMENTS', 'Code 128 receipt output requires 2 to 6 segments');
  }
  const chunkLength = 60 / count;
  const prefixBase = count === 4 ? '44' : '4';
  return Object.freeze(Array.from({ length: count }, (_, index) => {
    const chunk = data.slice(index * chunkLength, (index + 1) * chunkLength);
    const segment = `${prefixBase}${index + 1}${chunk}`;
    if (!/^\d+$/.test(segment) || segment.length % 2 !== 0) {
      throw new FursDomainError('FURS_CODE128_SEGMENT_DATA', 'Code 128-C segment must contain an even number of digits');
    }
    return segment;
  }));
}

export async function renderReceiptPdf417Png(data: string, rows = 5): Promise<Buffer> {
  assertValidReceiptCodeData(data);
  if (!Number.isSafeInteger(rows) || rows < FURS_PDF417_LAYOUT.minimumRows || rows > FURS_PDF417_LAYOUT.maximumRows) {
    throw new FursDomainError('FURS_PDF417_ROWS', 'PDF417 receipt code requires 5 to 33 rows');
  }
  return bwipjs.toBuffer({
    bcid: 'pdf417', text: data,
    eclevel: FURS_PDF417_LAYOUT.errorCorrectionLevel,
    rows,
    scaleX: FURS_PDF417_LAYOUT.minimumPixelsPerModuleX,
    scaleY: FURS_PDF417_LAYOUT.minimumPixelsPerModuleY,
    paddingwidth: 2
  } as bwipjs.RenderOptions & { eclevel: number; rows: number });
}

export async function renderReceiptCode128Png(data: string, count: Code128SegmentCount): Promise<readonly Buffer[]> {
  const segments = segmentReceiptCodeForCode128(data, count);
  return Promise.all(segments.map((text) => bwipjs.toBuffer({
    bcid: 'code128', text,
    scaleX: FURS_CODE128_LAYOUT.minimumPixelsPerModuleX,
    scaleY: FURS_CODE128_LAYOUT.minimumPixelsPerModuleX,
    height: FURS_CODE128_LAYOUT.minimumBarHeightMm,
    paddingwidth: 18
  })));
}
