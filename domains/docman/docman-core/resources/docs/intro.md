# Docman Domain Overview

Docman, dokumanlarin (document, section, page, snippet) ve versiyonlarin yonetildigi bir domain'dir.
Temel iliskiler: Document -> Section -> Page, her biri versiyonlanabilir.

## Temel Noktalar
- DocumentGroup hiyerarsik (recursive) olabilir.
- Document bir gruba bagli olabilir, grup opsiyoneldir.
- Link entity'leri (document-section, section-page, page-snippet/page-embed) versiyon baglantilarini tutar.

## Tooling
Tool ids `docman-*` formatinda tanimlidir ve host/tooling adapterlari uzerinden calistirilir.
