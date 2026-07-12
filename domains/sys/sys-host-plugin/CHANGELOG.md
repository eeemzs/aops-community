# @aopslab/domain-host-plugin-sys

## 0.0.6

### Patch Changes

- Updated dependencies
  - @aopslab/domain-kit-sys@0.0.5

## 0.0.5

### Patch Changes

- Cascade release changeset.

  Roots: @aopslab/domain-kit-sys, @aopslab/domain-host-plugin-sys
  Dependents: @aopslab/domain-cli-sys, @aopslab/domain-ops-sys, @aopslab/domain-tests-sys, @aopslab/domain-tooling-sys

- Updated dependencies
  - @aopslab/domain-kit-sys@0.0.4

## 0.0.4

### Patch Changes

- Align sys packages with the current AOPS Hexagen and release baseline.

  - add the canonical CLI and tooling workspace structure
  - normalize rate limiter and event store adapter errors to the domain service contract
  - wire sys repository configuration to the shared /dev database fallback chain

- Updated dependencies
  - @aopslab/domain-kit-sys@0.0.3

## 0.0.3

### Patch Changes

- Clean the host-plugin build output before packing so stale `dist/src` artifacts do not leak into published tarballs.

## 0.0.2

### Patch Changes

- Cascade release changeset.

  Roots: @aopslab/domain-tests-sys, @aopslab/domain-dm-sys, @aopslab/domain-kit-sys, @aopslab/domain-core-sys, @aopslab/domain-ops-sys, @aopslab/domain-host-plugin-sys
  Dependents: (yok)

- Updated dependencies
  - @aopslab/domain-kit-sys@0.0.2
