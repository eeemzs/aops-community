# @aopslab/domain-dm-docman

## 0.1.2

### Patch Changes

- Harden docman runtime validation for custom route inputs and duplicate document version creation.

## 0.1.1

### Patch Changes

- Rebuild docman DM, kit, and host plugin from clean dist outputs so removed section-version artifacts cannot leak into published packages.

## 0.1.0

### Minor Changes

- Remove legacy section-version and page-alias surfaces from docman, make sections container-only, keep pages as the only content unit, and align docs/tests/manifests with the cleaned model.

## 0.0.13

### Patch Changes

- Align docman packages to the shared @aopslab/domain-{layer}-{domain} naming semantic.

## 0.0.12

### Patch Changes

- a3bf539: Simplify section/version flow and document composition behavior.

  - remove section versioning from active backend flow
  - support mixed document ordering semantics with pages and sections
  - align operations, tooling manifests, and host plugin contracts with the new model

## 0.0.11

### Patch Changes

- Cascade release changeset.

  Roots: @aopslab/domain-core-docman, @aopslab/domain-dm-docman, @aopslab/domain-kit-docman, @aopslab/domain-ops-docman, @aopslab/domain-tooling-docman, @aopslab/domain-cli-docman, @aopslab/domain-host-plugin-docman
  Dependents: @aopslab/domain-tests-docman

## 0.0.9

### Patch Changes

- Cascade release changeset.

  Roots: @aopslab/domain-tests-docman, @aopslab/domain-dm-docman, @aopslab/domain-kit-docman, @aopslab/domain-core-docman, @aopslab/domain-ops-docman, @aopslab/domain-host-plugin-docman
  Dependents: (yok)
