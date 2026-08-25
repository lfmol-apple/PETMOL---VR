# Security Rotation Required

date=2026-08-25

credential_type=PostgreSQL production
status=ROTATE_REQUIRED
reason=public exposure / hardcoded production backup credential reference

## Scope

The exposed value must be treated as compromised. It has been redacted from the content intended for merge, but removal from Git does not make the credential safe again.

## Consumers To Update

- Production API database connection.
- Production backup scripts.
- Cron/systemd jobs that call PostgreSQL.
- Any environment files containing the affected PostgreSQL role password.
- Any operational scripts using the same role.

## Rotation Gate

Rotate only after identifying the exact PostgreSQL role and every consumer that uses it. Do not commit the new value. Prefer a protected `.pgpass` file with `chmod 600` or the existing protected environment-file mechanism used by the deployment.

## Verification Steps

- Confirm the API connects with the rotated credential.
- Confirm backup creation succeeds.
- Confirm scheduled backup/cron path uses the protected secret source.
- Confirm the old credential no longer authenticates.
- Confirm no new credential value appears in Git, logs, docs, or command output.
