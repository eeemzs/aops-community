# @aopslab/domain-dm-sys

## 0.1.86

### Patch Changes

- Add escalating rate limiter rules with persisted violation streak state and operation-boundary parsing for backoff multiplier and max block duration.

## 0.1.85

### Patch Changes

- Align sys packages with the current AOPS Hexagen and release baseline.

  - add the canonical CLI and tooling workspace structure
  - normalize rate limiter and event store adapter errors to the domain service contract
  - wire sys repository configuration to the shared /dev database fallback chain

## 0.1.84

### Patch Changes

- Cascade release changeset.

  Roots: @aopslab/domain-tests-sys, @aopslab/domain-dm-sys, @aopslab/domain-kit-sys, @aopslab/domain-core-sys, @aopslab/domain-ops-sys, @aopslab/domain-host-plugin-sys
  Dependents: (yok)
