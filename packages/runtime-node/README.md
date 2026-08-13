# @starfiniti/furs-runtime-node

Node/Linux runtime composition for file-mounted PKCS#12 secrets, pinned schemas,
strict FURS trust anchors, PostgreSQL and quorum-backed SNTP certificate/clock
health. Secret values are read from protected files and are never included in
status snapshots. Both API readiness and worker submission require a recent
clock observation.
