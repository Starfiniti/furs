import assert from 'node:assert/strict';
import test from 'node:test';

import { assertExpectedContent, getDigestBytes } from './source-content.mjs';

const source = { digestTransform: 'edavki-page-v1' };

test('the eDavki transform removes volatile ASP.NET state and runtime identity', () => {
  const first = Buffer.from(`
    <input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="first" />
    <main>Technical Documentation 3.2</main>
    <input type="hidden" name="__EVENTVALIDATION" id="__EVENTVALIDATION" value="one" />
    <div id="DursLegalFooterText">eDavki portal v. 88.5.0.13980 [12. 08. 2026 12:26:40, EDP5-TWG-2/53] </div>
  `);
  const second = Buffer.from(`
    <input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="second" />
    <main>Technical Documentation 3.2</main>
    <input type="hidden" name="__EVENTVALIDATION" id="__EVENTVALIDATION" value="two" />
    <div id="DursLegalFooterText">eDavki portal v. 88.5.0.13980 [12. 08. 2026 12:26:41, EDP5-TWG-2/51] </div>
  `);

  assert.deepEqual(getDigestBytes(source, first), getDigestBytes(source, second));
});

test('the eDavki transform preserves meaningful content changes', () => {
  const first = Buffer.from('<main>Technical Documentation 3.2</main>');
  const second = Buffer.from('<main>Technical Documentation 3.3</main>');

  assert.notDeepEqual(getDigestBytes(source, first), getDigestBytes(source, second));
});

test('unknown digest transforms fail closed', () => {
  assert.throws(
    () => getDigestBytes({ digestTransform: 'unknown' }, Buffer.from('content')),
    /Unsupported digest transform/
  );
});

test('content type mismatches fail closed', () => {
  assert.throws(
    () => assertExpectedContent(
      { id: 'schema', expectedContentType: 'application/json', kind: 'json-schema' },
      'text/html; charset=utf-8',
      Buffer.from('<html></html>')
    ),
    /Unexpected content type/
  );
});

test('PDF sources must have a PDF signature', () => {
  assert.throws(
    () => assertExpectedContent(
      { id: 'law', expectedContentType: 'application/pdf', kind: 'law' },
      'application/pdf',
      Buffer.from('<html></html>')
    ),
    /did not return a PDF document/
  );
});

test('JSON schema sources must contain a JSON object', () => {
  assert.doesNotThrow(() => assertExpectedContent(
    { id: 'schema', expectedContentType: 'application/json', kind: 'json-schema' },
    'application/json; charset=utf-8',
    Buffer.from('{"$schema":"http://json-schema.org/draft-04/schema#"}')
  ));
  assert.throws(
    () => assertExpectedContent(
      { id: 'schema', expectedContentType: 'application/json', kind: 'json-schema' },
      'application/json',
      Buffer.from('[]')
    ),
    /did not return a JSON object/
  );
});
