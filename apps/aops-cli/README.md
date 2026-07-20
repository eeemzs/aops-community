# @aopslab/aops-cli

AOPS Community operator CLI. The global CLI controls the local AOPS server,
including setup, start, stop, status, health, authentication, and agent-facing
operations.

```sh
npm install --global @aopslab/aops-cli
aops-cli --help
aops-cli setup server-env
aops-cli server setup --runtime native --postgres external --apply
```

The npm installation includes the matching `@aopslab/aops-server` runtime, so
the default setup path does not require Git or a source checkout. Advanced
users can still run an explicit AOPS Community checkout with `--source-root`.

Server data, configuration, credentials, logs, and lifecycle state are stored
outside npm's package directory. PostgreSQL remains operator-owned.
