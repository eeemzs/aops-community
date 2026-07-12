# @aopslab/domain-kit-sys

## 0.0.5

### Patch Changes

- Add escalating rate limiter rules with persisted violation streak state and operation-boundary parsing for backoff multiplier and max block duration.
- Updated dependencies
  - @aopslab/domain-dm-sys@0.1.86

## 0.0.4

### Patch Changes

- Cascade release changeset.

  Roots: @aopslab/domain-kit-sys, @aopslab/domain-host-plugin-sys
  Dependents: @aopslab/domain-cli-sys, @aopslab/domain-ops-sys, @aopslab/domain-tests-sys, @aopslab/domain-tooling-sys

## 0.0.3

### Patch Changes

- Align sys packages with the current AOPS Hexagen and release baseline.

  - add the canonical CLI and tooling workspace structure
  - normalize rate limiter and event store adapter errors to the domain service contract
  - wire sys repository configuration to the shared /dev database fallback chain

- Updated dependencies
  - @aopslab/domain-dm-sys@0.1.85

## 0.0.2

### Patch Changes

- Cascade release changeset.

  Roots: @aopslab/domain-tests-sys, @aopslab/domain-dm-sys, @aopslab/domain-kit-sys, @aopslab/domain-core-sys, @aopslab/domain-ops-sys, @aopslab/domain-host-plugin-sys
  Dependents: (yok)
