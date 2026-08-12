# Contributing

Contributions are welcome, but fiscalization changes must preserve the controls
in `AGENTS.md`, `COMPLIANCE_MATRIX.md`, and `TEST_PLAN.md`.

## Contribution terms

The project uses the Developer Certificate of Origin 1.1 instead of a separate
contributor license agreement. By adding a `Signed-off-by` line to a commit, a
contributor certifies that they have the right to submit the contribution under
the repository's Apache-2.0 license. See <https://developercertificate.org/>.

Use `git commit --signoff` for contributed commits. Mark material supplied under
different terms as `Not a Contribution` before submitting it; do not mix
incompatible licensed code into this repository.

## Compliance-sensitive changes

Every compliance-sensitive pull request must identify requirement IDs, official
source versions reviewed, exact checks run, persistence/security/privacy impact,
migration and rollback effects, and official FURS test evidence where protocol
behavior changed. Release paths remain blocked when authoritative sources
conflict or required human review is missing.
