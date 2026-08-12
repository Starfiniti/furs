# Certificate rotation

1. Obtain the replacement through the official process and verify its fingerprint,
   subject, issuer, validity and RSA key match offline.
2. Mount it under a new protected path; do not overwrite the active file in place.
3. Start an isolated test instance and run strict mTLS echo plus signed-response tests.
4. Pause workers, allow current attempts to commit, switch the mounted secret, and restart.
5. Verify readiness, certificate-days metric and a controlled test submission.
6. Retain only approved metadata/evidence for the old certificate; securely remove
   exportable key material according to retention policy.
7. Rehearse trust-anchor rotation separately; never pin a rotating leaf certificate.

Production and test certificates must never share paths or passphrase files.

## Machine-checkable rehearsal

Set `FURS_ENVIRONMENT=test` and provide `OLD` and `NEW` variants of:

```text
FURS_ROTATION_OLD_P12_PATH
FURS_ROTATION_OLD_PASSPHRASE_FILE
FURS_ROTATION_OLD_SERVER_CA_PATH
FURS_ROTATION_NEW_P12_PATH
FURS_ROTATION_NEW_PASSPHRASE_FILE
FURS_ROTATION_NEW_SERVER_CA_PATH
```

Run `corepack pnpm evidence:rotation`. Both certificates must independently
pass strict FURS test echo, fingerprints must differ, and the replacement must
extend validity. The report contains only fingerprint suffixes, dates and an
evidence hash. Run the controlled test submission separately with
`evidence:furs` after mounting the replacement in the service.
