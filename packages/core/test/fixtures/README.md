# Non-secret cryptographic test fixtures

Every key and certificate in this directory is generated solely for public repository tests. They are not FURS credentials and must never be used outside automated/local tests.

- `test-ca-*`: local test trust anchor;
- `test-server-*`: localhost TLS server identity;
- `test-client-*`: fiscal client signing and mTLS identity;
- `test-response-*`: simulated FURS response signer.

Production and FURS test credentials remain forbidden from this directory and from source control.
