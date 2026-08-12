# Official-source baseline review

Requirement: `FURS-SRC-001`
Phase: Phase 0
Gate: P0

The checker fails closed until every official source has a pinned SHA-256 digest and human review provenance.

## Review procedure

1. Run `node scripts/check-official-sources.mjs`.
2. Open `compliance/source-snapshot.generated.json` and verify every requested URL, final URL, media type, version marker, and digest.
3. Review the retrieved official documents and schemas against `SOURCE_REGISTER.md` and the mandatory review questions there.
4. Resolve every `REVIEW` or `ERROR` result. Do not accept a baseline merely to make CI green.
5. After review, run:

   ```bash
   node scripts/check-official-sources.mjs --accept-baseline --reviewer "Full Name"
   ```

6. Run the checker again without flags. It must report `OK` for every source.
7. Commit `sources.json`; do not commit the generated snapshot.

The reviewer name and date are stored beside each accepted digest. A later digest or expected-marker change blocks the compliance job until reviewed again.
