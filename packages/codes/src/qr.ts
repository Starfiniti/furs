import QRCode from 'qrcode';

import { assertValidReceiptCodeData } from './receipt-code.js';

export interface QrRenderOptions {
  readonly errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  readonly margin?: number;
  readonly width?: number;
}

export const FURS_QR_LAYOUT = Object.freeze({
  version: 2,
  modules: 25,
  errorCorrectionLevel: 'M' as const,
  minimumPixelsPerModule: 4,
  quietZoneModules: 4,
  minimumPrintedSizeMm: 12,
  minimumQuietZoneMm: 2
});

export async function renderReceiptQrSvg(data: string, options: QrRenderOptions = {}): Promise<string> {
  assertValidReceiptCodeData(data);
  return QRCode.toString(data, {
    type: 'svg',
    version: FURS_QR_LAYOUT.version,
    errorCorrectionLevel: options.errorCorrectionLevel ?? FURS_QR_LAYOUT.errorCorrectionLevel,
    margin: options.margin ?? 4,
    ...(options.width === undefined ? {} : { width: options.width })
  });
}

export async function renderReceiptQrPng(data: string, options: QrRenderOptions = {}): Promise<Buffer> {
  assertValidReceiptCodeData(data);
  return QRCode.toBuffer(data, {
    type: 'png',
    version: FURS_QR_LAYOUT.version,
    errorCorrectionLevel: options.errorCorrectionLevel ?? FURS_QR_LAYOUT.errorCorrectionLevel,
    margin: options.margin ?? 4,
    scale: FURS_QR_LAYOUT.minimumPixelsPerModule,
    ...(options.width === undefined ? {} : { width: options.width })
  });
}
