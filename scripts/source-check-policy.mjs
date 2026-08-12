const SHA_256_PATTERN = /^[a-f0-9]{64}$/i;

export function evaluateSourceObservation(source, sha256, markerFound) {
  const configuredBaseline = source.baselineSha256;
  const hasBaseline = typeof configuredBaseline === 'string' && configuredBaseline.length > 0;
  const baselineIsValid = hasBaseline && SHA_256_PATTERN.test(configuredBaseline);
  const baselineSha256 = baselineIsValid ? configuredBaseline.toLowerCase() : null;
  const baselineMatches = baselineIsValid ? baselineSha256 === sha256.toLowerCase() : null;
  const markerChecked = typeof source.expectedMarker === 'string';
  const normalizedMarkerFound = markerChecked ? markerFound === true : null;
  const reviewReasons = [];

  if (!hasBaseline) {
    reviewReasons.push('missing-baseline');
  } else if (!baselineIsValid) {
    reviewReasons.push('invalid-baseline');
  } else if (!baselineMatches) {
    reviewReasons.push('digest-changed');
  }

  if (baselineIsValid && (typeof source.baselineReviewedBy !== 'string' || !source.baselineReviewedBy.trim())) {
    reviewReasons.push('baseline-reviewer-missing');
  }

  if (baselineIsValid && !/^\d{4}-\d{2}-\d{2}$/.test(source.baselineReviewedAt ?? '')) {
    reviewReasons.push('baseline-review-date-missing');
  }

  if (markerChecked && !normalizedMarkerFound) {
    reviewReasons.push('expected-marker-missing');
  }

  return {
    baselineSha256,
    baselineMatches,
    markerChecked,
    markerFound: normalizedMarkerFound,
    reviewRequired: reviewReasons.length > 0,
    reviewReasons
  };
}

export function summarizeCheckResults(results) {
  return {
    changed: results.some((result) => result.reviewRequired),
    failed: results.some((result) => result.error && result.required)
  };
}
