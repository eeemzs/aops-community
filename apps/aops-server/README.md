# @aopslab/aops-server

The ready-to-run AOPS Community server package. It contains the AOPS server,
the AOPS Cockpit web application, and the reviewed PostgreSQL migration assets.

Install the operator CLI globally; the CLI installs and controls the matching
server package:

```sh
npm install --global @aopslab/aops-cli
aops-cli setup server-env
aops-cli server setup --runtime native --postgres external --apply
```

The PostgreSQL server is operator-owned. AOPS does not silently create or
change a database connection, and it listens on the loopback interface by
default. Use `aops-cli server status`, `aops-cli server health`, and
`aops-cli server stop` for lifecycle control.

For source-checkout development, see the root README in the
[AOPS Community repository](https://github.com/eeemzs/aops-community).
