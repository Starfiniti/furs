const EDAVKI_HIDDEN_FIELD_PATTERN = /(<input\b[^>]*\bname="__(?:VIEWSTATE|EVENTVALIDATION)"[^>]*\bvalue=")[^"]*("[^>]*>)/gi;
const EDAVKI_FOOTER_PATTERN = /(<div\b[^>]*\bid="DursLegalFooterText"[^>]*>\s*eDavki portal v\.\s*[^[]+\[)[^\]]+(\]\s*<\/div>)/gi;

export function getDigestBytes(source, bytes) {
  if (!source.digestTransform) {
    return bytes;
  }

  if (source.digestTransform === 'edavki-page-v1') {
    const html = bytes
      .toString('utf8')
      .replace(EDAVKI_HIDDEN_FIELD_PATTERN, '$1[volatile]$2')
      .replace(EDAVKI_FOOTER_PATTERN, '$1volatile-runtime$2');

    return Buffer.from(html, 'utf8');
  }

  throw new Error(`Unsupported digest transform: ${source.digestTransform}`);
}

export function assertExpectedContent(source, contentType, bytes) {
  if (typeof source.expectedContentType === 'string') {
    const actualContentType = contentType?.split(';', 1)[0].trim().toLowerCase() ?? '';
    const expectedContentType = source.expectedContentType.toLowerCase();

    if (actualContentType !== expectedContentType) {
      throw new Error(
        `Unexpected content type for ${source.id}: ${actualContentType || 'missing'} (expected ${expectedContentType})`
      );
    }
  }

  if (source.kind === 'pdf' || source.kind === 'law' || source.kind === 'regulation') {
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new Error(`Source ${source.id} did not return a PDF document`);
    }
  }

  if (source.kind === 'json-schema') {
    let document;
    try {
      document = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new Error(`Source ${source.id} did not return valid JSON`);
    }

    if (typeof document !== 'object' || document === null || Array.isArray(document)) {
      throw new Error(`Source ${source.id} did not return a JSON object`);
    }
  }
}
