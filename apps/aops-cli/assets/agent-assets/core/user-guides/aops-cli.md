<!-- Public packaged snapshot from canonical slug:aops CLI guidance. Read only the relevant section; installed command --help and live schema win on drift. -->

# AOPS CLI User Guide

## 1 Temel model

### 1.1 Overview

## 2 En kisa kurulum akisi

### 2.1 Guided npm installation

#### 2.1.1 Overview

```bash
aops setup init
aops
aops server status --json
aops host health
```

`setup init` can connect to an existing local/remote PostgreSQL, provision an
AOPS-owned PostgreSQL container, or create a dedicated AOPS role/database in a
supported local PostgreSQL. It verifies migrations, starts the npm server,
loads the starter seed by default, and installs the verified global agent
assets. Use masked prompts for database credentials.

On a setup-complete local machine, parameterless `aops` starts the installed
npm server when its verified runtime state is stopped or crashed, then opens
the compact operator home. It does not restart ambiguous or unsafe process
states; use `aops server status` and `aops doctor` for those cases.

### 2.2 Interactive auth

#### 2.2.1 Overview

```bash
aops setup server-env --auth-provider interactive
aops setup init
aops setup first-admin
aops auth login
```

## 3 `init`

### 3.1 Overview

## 4 `setup server-env`

### 4.1 Overview

## 5 `setup first-admin`

### 5.1 Overview

## 6 User yonetimi

### 6.1 Overview

## 7 Login ve tokenlar

### 7.1 Overview

## 8 Diagnostik

### 8.1 Overview

## 9 Owner modeli ve domain secimi

### 9.1 Overview

## 10 Projectman sugar komutlari

### 10.1 Overview

## 12 `.aops` local cache & sync

### 12.1 Overview

#### 12.1.1 Project registry, `authoringMode`, and `localRoot`

Multi-project repos use `.aops/aops.config.json` as a project registry. The
hosted server is the source of truth for project identity and for all
Projectman/Agentspace records; the repo registry only records which local
directory mirrors a hosted project as a read-only cache:

```bash
aops project link --slug aops --mode local --local-root .aops/projects/aops --apply --json
aops project link --slug demo --mode hosted-only --apply --json
aops project links list --json
aops project migrate-local-root --project-slug aops --local-root .aops/projects/aops --dry-run --json
aops project migrate-local-root --project-slug aops --local-root .aops/projects/aops --apply --confirm --json
```

Contract:

1. `project link/links` manages only the repo project registry after verifying
   the hosted project exists and is not archived/deleted.
2. `authoringMode: local` means a local cache directory is materialized under
   `localRoot` (normally `.aops/projects/<slug>`). Create/write/read still go to
   the hosted server; `localRoot` is a read-only mirror refreshed by
   `aops sync pull` (and `aops doc mirror pull` for docs), not a
   repo-first source tree.
3. `authoringMode: hosted-only` means no local cache directory is materialized.
   Reads and writes both use the hosted gateway directly.
4. `migrate-local-root` is repo-local cache relocation. Always run `--dry-run`;
   the real move requires `--apply --confirm` because old flat roots are
   archived.
5. hosted-only-vs-local is only a cache-presence decision: local mode keeps a
   refreshable read-only mirror on disk, hosted-only mode reads straight from
   the server. Neither makes the repo the source of truth.

#### 12.1.2 Partitioned sync

Project-partitioned `sync pull` refreshes the local cache using the same
project registry selector contract. There is no `sync push`: the hosted server
is canonical, so the cache is only ever pulled, never pushed back.

```bash
aops sync status --project-slug aops --json
aops sync pull --project-slug aops --apply --json
aops sync status --all-projects --json
aops sync pull --all-projects --apply --json
```

Rules:

1. `sync --project-slug/--all-projects` refreshes the read-only cache of hosted
   Projectman and Agentspace records. It is separate from
   `--hosted-project-slug`, which refreshes the read-only hosted prompt/skill
   mirrors.
2. `--project-slug` resolves the linked project, then refreshes that project's
   `localRoot` cache when `authoringMode` is `local`.
3. `--all-projects` runs once per repo-config local project and reports
   project-level results without fail-fast. Hosted-only links have no cache to
   refresh on this path; local links without a usable `localRoot` are
   reported/skipped rather than treated as another project's cache.
4. Because the server is canonical, conflict/drift resolution is not part of the
   pull: a refresh simply overwrites the local cache with current server state.

#### 12.1.3 Archive lifecycle

`aops archive` prepares hosted Projectman graph cleanup from a local bundle.
It is deliberately a CLI composition over existing hosted Projectman surfaces,
not a new hosted archive domain.

```bash
aops archive create --project-slug aops --apply --json
aops archive verify --manifest .aops/archive/aops/<ts>/manifest.json --apply --json
aops archive delete --manifest .aops/archive/aops/<ts>/manifest.json --json
aops archive delete --manifest .aops/archive/aops/<ts>/manifest.json --apply --confirm --json
aops archive decommission-check --manifest .aops/archive/aops/<ts>/manifest.json --json
```

Rules:

1. `archive create` downloads the hosted PM graph into
   `.aops/archive/<slug>/<timestamp>` and records `pendingDomains`; it does not
   delete anything.
2. `archive verify --apply` re-fetches hosted PM data, compares counts and
   checksums, then persists `verification.status: passed` into the manifest.
3. `archive delete` without `--apply` is a preview. Destructive delete requires
   a verified manifest plus `--apply --confirm`.
4. Delete order is children-before-parents so review requests, feedback,
   issues, microtasks, sprints, tasks, columns, and boards are removed in a
   dependency-safe sequence. The manifest records per-action deletion state for
   resumability.
5. `archive decommission-check` permits full project/scope decommission only
   when the manifest is verification-passed, `decommissionSafe` is true, and
   `pendingDomains` is empty. Current bundles can still list Agentspace memory,
   discussions, chat, and hosted prompt/skill/resource/artifact domains as
   pending until those owners have their own archive coverage.

#### 12.1.4 Agent-tool catalog verification

No new hosted `archive.*` tool is expected for this slice. The CLI verifies or
composes existing hosted surfaces:

1. `project link` verifies hosted projects through existing
   `agentspace.project.*` tools, then writes the repo registry.
2. hosted-only PM direct commands use existing `projectman.*` tools.
3. archive cleanup composes existing Projectman read/delete tools and records a
   local manifest.

Spot-check the catalog before writing raw hosted payloads:

```bash
aops agent tools --domain agentspace --q project --summary --json
aops agent tools --domain projectman --q delete --summary --json
```

### 12.2 AOPS markdown view sugar

#### 12.2.1 Overview

`view` komut ailesi read-only presentation layer'dir. Varsayilan komutlar
read-only local cache `.aops/**` dosyalarini okur (canonical truth hosted
server'dadir; cache `sync pull` ile tazelenir). Explicit hosted komutlar
(`hosted-projects`, `hosted-inventory`) hosted list API'larini sadece okuma
amaciyla cagirir; sync yapmaz, cache/index yazmaz ve domain mutation
calistirmaz. Varsayilan cikti agent/TUI uyumlu Markdown'dir; `--json` ayni
read-model'i stabil envelope olarak dondurur.

Komut seti:

```bash
aops view dashboard --style agent
aops view projects
aops view hosted-projects --style compact
aops view hosted-inventory --hosted-project aops --style compact
aops view boards
aops view board <selector>
aops view tasks
aops view task <selector>
aops view sprints
aops view sprint <selector> --max-items 20
aops view issues
aops view feedback
aops view memory
aops view resume
aops view discussions
aops view discussion <selector>
aops view experience
aops view skills
aops view prompts
aops view docs
aops view doc <selector>
aops view doc-page <doc-selector>#<heading-selector>
aops view digest --task <selector> --depth deep --max-bytes 32768
```

Selector cozumu (`<selector>` argumanini bekleyen tum komutlar):

```bash
# full UUID
aops view task 0ea46e18-d717-454d-8244-90ad388c4a80

# 8+ karakter id prefix (uuid'nin ilk 8 karakteri veya dosya adindaki -<8>.md kismi)
aops view task 0ea46e18

# slug
aops view board ops

# exact title/name
aops view sprint "AOPS CLI view follow-up"

# doc-page composite selector (document#heading)
aops view doc-page tooling-cli-host-plugin-system#runtime-config
```

Ambiguous selector fail eder ve aday tablo/JSON dondurur. `<selector>`
yoksa veya birden fazla esleserse aday listesinden dogru hedefi se cebilirsin.

Tum view komutlarinda kullanilabilen ortak flagler:

| Flag | Anlam | Default |
|------|-------|---------|
| `--json` | Stabil envelope JSON dondurur (markdown yerine) | false |
| `--style agent\|compact\|wide` | Markdown yogunluk/format profili | `agent` (ASCII, emoji-free, link-mode none) |
| `--link-mode none\|relative\|absolute` | Path linki davranisi | `none` |
| `--max-items <n>` | Liste/tablo basina maksimum satir | 25 |
| `--max-bytes <n>` | Toplam markdown budget; 32768 hard cap | 32768 |
| `--project-id\|--project-name\|--project-slug <v>` | Repo config'inde aktif olmayan baska bir projeyi sec | aktif proje |

Hosted view komutlari icin ek flagler:

| Flag | Anlam | Default |
|------|-------|---------|
| `--api-base-url <url>` | Hosted API base URL | env/default host |
| `--access-token <token>` | Hosted API access token | auth config/env |
| `--refresh-token <token>` | Hosted API refresh token | auth config/env |
| `--timeout-ms <ms>` | Hosted request timeout | client default |
| `--tenant-id <id>` | Agent gateway tenant header | - |
| `--locale`, `--fallback-locale` | Agent gateway locale header'lari | - |
| `--scope-id <id>` | Hosted scope override | repo/project context |
| `--scope-resolution explicit\|cascade` | Hosted asset scope cozumu | `explicit` for inventory |
| `view hosted-inventory --hosted-project <selector>` | Hosted project id, slug, name veya 8+ char prefix ile daralt | tum fetched projects |

Footer kontrati (her view ciktisinin altinda):

```text
- source: <relative-path-or-directory>
- local-state: local|dirty|synced|conflict|deleted|-
- updatedAt: <iso>
- lastPushedAt: <iso?>
- lastPulledAt: <iso?>
- truncated: true|false
```

`local-state` semantigi `effectiveLocalState` ile hesaplanir: `synced`
sayilan bir kayit `baseHash` ile mevcut icerik arasinda drift tespit
edilirse `dirty` olarak isaretlenir. Ham `syncState` field'ina degil bu
hesaplanan degere guvenmek gerekir.

`view digest` icin pratik kararlar:

1. shallow default `--depth shallow` agent context icin yeterli ozetdir
2. detayli inspection icin `--depth deep`, ama `--max-bytes` budget'ini
   asagi cek: ornekteki gibi tek sprint deep digest ~8KB civarinda kalir
3. truncation footer `truncated: true` raporlarsa `--max-items` veya daha
   dar bir selector ile yeniden cek

Tipik kullanim senaryolari:

```bash
# Agent kickoff: tek komutla aktif pencereyi oku
aops view dashboard --style agent

# Sprint resume: phase/microtask + linked memory + discussions
aops view sprint <sprint-id>

# Codex/Claude desktop'a context pack pipe et
aops view digest --sprint <sprint-id> --depth deep | pbcopy

# Terminal'de mdcat/glow ile renderli okuma
aops view board <board-slug> | glow -p

# JSON ile script/automation
aops view tasks --json | jq '.result.data[] | select(.localState == "dirty") | .label'

# Hosted project inventory: ustte proje tablosu, altta docs/skills/prompts/resources gruplari
aops view hosted-inventory --hosted-project aops --style compact

# Selector ambiguity'sini debug et
aops view task Duplicate --json | jq '.error.candidates'
```

Session-state nudge:

1. `view dashboard --style agent` read-only olarak `.aops/agentspace/session-state/**` dosyalarini tarayip `Session State Nudges` bolumu gosterebilir.
2. Bu bolum memory yazmaz; agent'a sadece "checkpoint gecikti", "summary dus" veya benzeri runtime hijyen sinyali verir.
3. Nudge'a cevap yazmak gerekiyorsa owner command `aops mem checkpoint` veya `aops mem summary` olmalidir.

Filter flag'leri (her listeleme komutu icin):

```bash
# Memory: durability/kind/subject/id
aops view memory --durability sticky --kind rule
aops view memory --subject sprint --id <sprint-id>
aops view memory --subject task --id <task-id-prefix>
aops view resume --subject project

# Projectman tasks: board + status (column adi cozulur)
aops view tasks --board ops --status Done
aops view tasks --board engineering --status Doing

# Projectman issues: status + severity + board/sprint/task
aops view issues --status open
aops view issues --severity high --status resolved
aops view issues --board ops --sprint <sprint-id>

# Projectman feedback: status + board/sprint/task
aops view feedback --status open --board ops

# Projectman sprints: board + status
aops view sprints --board ops --status doing

# Discussions: status + participant
aops view discussions --status concluding
aops view discussions --agent claude

# Experience: type + area
aops view experience --type technique
aops view experience --area memory
```

Filter sozlesmesi:

| Komut | Filter flag'leri | Anlam |
|-------|------------------|-------|
| `view memory`, `view resume` | `--durability`, `--kind`, `--subject`, `--id` | durability=short\|durable\|sticky; kind=kickoff\|resume\|closeout\|note\|rule\|...; subject=project\|board\|sprint\|task\|ktask\|utask\|issue\|feedback; id=full UUID veya 8+ char prefix |
| `view tasks` | `--board`, `--status` | board=slug/name/id; status=column adi veya slug (Done, Todo, Doing, Backlog) |
| `view issues`, `view feedback` | `--status`, `--severity`, `--board`, `--sprint`, `--task` | status=frontmatter status; severity=low\|medium\|high\|critical; board/sprint/task=ilgili subject relation |
| `view sprints` | `--board`, `--status` | board=slug/name; status=todo\|doing\|completed\|paused\|... |
| `view discussions` | `--status`, `--agent` | status=active\|concluding\|concluded\|abandoned; agent=participants icindeki agent id |
| `view experience` | `--type`, `--area` | type=technique\|tool\|script\|problem-solution\|idea; area=areas[] tag |

Birden fazla filter AND mantigi ile uygulanir. Sonuc bos ise empty table fallback (`No matching records.`) gosterilir.

Owner boundary kurallari (`view` icin):

1. Cache-reading view komutlari (`dashboard`, `boards`, `tasks`, `issues`,
   `feedback`, `memory`, `skills`, `prompts`, `docs`, `digest`, ...) sadece
   read-only local cache `.aops/**/*.md` dosyalarini okur; hosted tool, sync,
   cache write, mutation veya `~/.aops` yazimi yapmaz.
2. Hosted view komutlari (`hosted-projects`, `hosted-inventory`) sadece
   hosted read/list tool'larini cagirir: `agentspace.project.list-projects`,
   `docman.document.list`, `agentspace.skill.list-skills`,
   `agentspace.prompt.list-prompts`, `agentspace.resource.list-resources`.
   Mutation, sync, mirror refresh veya cache write yapmaz.
3. Cross-domain join'ler mevcut frontmatter/API alanlarini (`subjectType`,
   `subjectId`, `boardId`, `sprintLocalId`, `pmContext.taskId` vs.) takip
   eder; yeni domain semantigi icat etmez.
4. `view skills` ve `view prompts` `.aops/hosted/**` mirror dosyalarindan
   okur; canonical truth hosted Docman/server'da kalir, view onu
   yenilemez.
5. `view docs` ve `view doc-page` `.aops/docman/**` mirror'undan okur;
   read-only mirror banner'i ve `pulledAt` footer'da gozukur.
6. Projectman planning view'lari cache uzerinden okur; PM tablo ihtiyaci
   icin `view boards`, `view tasks`, `view sprints`, `view issues` ve
   `view feedback` kullanilir.

V2'ye birakilan yuzeyler:

1. `view relations <selector>` cross-domain RelationResolver
2. `view skill/prompt/experience <selector>` detail inspect (V1 list-only)
3. `aops ls`, `aops show` aliaslari
4. `--out <path>` generated artifact writer (V1 stdout default)
5. hosted relation graph icin daha derin cross-domain edge resolver
6. performans gerekirse cache/index

Kritik kurallar:
- Server wins: hosted server canonical'dir; `sync pull` server state'ini read-only local cache'e yansitir. `sync push` yoktur (S4'te kaldirildi) -- repo source-of-truth degildir.
- UI/server tarafinda yapilan degisiklikler bir sonraki `sync pull` ile cache'e gelir; cache uzerinde yapilan elle degisiklikler canonical degildir ve tazelemede ezilir.
- Derived view'lar cache uzerinden hesaplanir; cache'i guncel tutmak icin `sync pull` calistirilir.
- Reusable `prompt` ve hosted `skill` shell/version truth'u server/DB tarafinda kalir; `sync pull` bunlari sadece `.aops/hosted/**` altina read-only mirror olarak ceker.
- Ayni repo isterse baska bir projenin hosted prompt/skill mirror'unu da `--hosted-project-id|name|slug` ile cekebilir.
- `sync pull` project-level bir server -> cache refresh komutudur; hosted prompt/skill mirror refresh icin `--hosted-project-id|name|slug` kullan.

Baslangic akisi:

1. Yeni repo icin `aops init`
2. Hosted state'in read-only cache'ini tazelemek icin `aops sync pull --project-slug aops --apply --json`
3. Cache context'i icin `.aops/projectman/views/index.md` ve `.aops/agentspace/memory/index.md` oku
4. Reusable prompt/skill context gerekiyorsa `.aops/hosted/index.md`, `.aops/hosted/skills/index.md`, ve `.aops/hosted/prompts/index.md` oku
5. PM authoring icin `aops pm ...`, memory icin `aops mem ...`, agent tecrubesi icin `aops exp ...`, agent tartisma workspace'i icin `aops discuss ...` kullan (hepsi dogrudan hosted server'a yazar)

Kapanis akisi:

1. PM/memory kayitlarini owner komutlariyla (`aops pm ...`, `aops mem ...`) hosted server uzerinde guncelle
2. Cache'i guncel gormek istersen `aops sync pull --apply --json` calistir

Memory/handoff ayrimi:
- `--write-memory`: ana PM mutation basarili olduktan sonra opt-in memory side-effect yazar; AI varsayilani short memory olarak kalmalidir
- `pm handoff write`: mutation disinda kickoff/resume/decision/blocker/closeout/rule memory kaydi yazar
- `pm handoff resume`: mevcut tracked PM subject icin curated resume pack okur; subject record yaratmaz
- durable `note` ve sticky `rule` operator/human kontrolundedir; agent calisirken default olarak yazilmaz, yalnizca acikca istendiginde yazilir

Phase notu:
- `phase` Projectman icinde first-class planning kavramidir ama bugun standalone `phase.*` CRUD operation ailesi yoktur
- `phase` sprint planinin nested grouping/status katmanidir
- bu yuzden AOPS sugar tarafinda `pm phase ...` yerine mevcut `pm sprint` + `pm utask` surface'i korunur

## 14 Prompt sugar

### 14.1 Overview

## 15 Project sugar

### 15.1 Overview

## 16 Durable memory ve synopsis sugar

### 16.1 Overview

#### 16.1.1 Overview

Recommended agent memory path:

```bash
aops mem brief --subject project --json
aops mem checkpoint --content "Slice devam ediyor." --task-id <task-id> --sprint-id <sprint-id> --apply --json
aops mem summary --content "Session summary." --apply --json
```

Kural:

1. `mem brief` session basinda/resume'da kullanilan read-only startup pack'tir; PM state'in yerine gecmez ve memory yazmaz.
2. `mem checkpoint` anlamli milestone, decision, blocker veya handoff noktasinda short rolling status yazar; her chat satiri veya kucuk edit icin kullanilmaz.
3. `mem summary` session sonu veya operator summary istegi icindir; ordinary summary short kalir. Durable closeout ancak `--closeout --durability durable --confirm` ile yazilir.
4. Memory evidence pack olmalidir: request/purpose, board/task/sprint/issue refs, concrete outcome, validation/review evidence, open risks ve next action.

### 16.2 Hangi koordinasyon yuzeyini ne zaman kullan

#### 16.2.1 Overview

`discuss`, `chat` ve `pm review-request` ayri koordinasyon yuzeyleridir: karar/konsensus `discuss`, koordinasyon/uyandirma hosted chat odalari (`chat`), review ise Projectman (`pm review-request`). Yanlis yazici/dinleyici eslesmesi sessiz trafik kaybinin en sik sebebi; koordinasyon mesaji ile dinleyici ayni hosted chat odasinda olmali (`aops-cli-chat` skill'ine bak).

| Ihtiyac                                                | Komut                          | Skill            |
|--------------------------------------------------------|--------------------------------|------------------|
| Yapilandirilmis karar transcript'i + sonuc kararlari   | `aops discuss start`        | `aops-cli-discuss` |
| Agent sirasi/lifecycle icin karar dongusu              | `aops discuss wait`, `aops discuss turn`, `aops discuss conclude` | `aops-cli-discuss` |
| Multi-agent koordinasyon/uyandirma odasi               | `aops chat room create`, `aops chat message send` | `aops-cli-chat` |
| Agent'in bekleyen oda/mesaj islerini kesfetmesi        | `aops chat inbox --for <agent>` | `aops-cli-chat` |
| Oda trafigini dinleme / unread okuma                   | `aops chat listen`, `aops chat catchup` | `aops-cli-chat` |
| Review iste / sonucla / re-review                      | `aops pm review-request create`, `aops pm review-request result` | `aops-cli-projectman` |

Koordinasyon (uyandirma, oda mesajlasmasi, listener) hosted chat odalarinda yasar; karar ritueli `discuss` tarafindadir. Yapilandirilmis bir karar/stance `discuss turn`/`conclude` ile transcript'e yazilir; karsi agent'i uyandirmak icin ayni isi bagli hosted chat odasina kisa bir `chat message send` ile duyur (oda mesaji uyandirma sinyali, discuss transcript kanonik kayit). Davet/dinleyici beklentisini de chat odasinda netlestir. Detaylar icin `aops-cli-chat` (oda lifecycle, members, `chat send/listen/catchup`) ve `aops-cli-discuss` (karar ritueli, `discuss wait` exit kodlari) skillerine bak. Review akisi (RR/RRR, re-review, material issue) `aops-cli-projectman` tarafindadir.

Slug-first operator contract:

1. `discuss start --slug <slug>` topic frontmatter'ina canonical slug yazar. Slug verilmezse title'dan derive edilir ve JSON'da `topicSlug` olarak doner. Hosted chat odalari da `chat room create --slug <slug>` ile slug tasir.
2. Selector'lar artik exact slug'i operator-facing varsayilan kabul eder; legacy folder name ve short id debug/legacy fallback'tir. Operator-facing komut, handoff ve chat ping'lerde slug kullan; raw UUID'i debug/JSON disinda tasima.
3. Legacy folder-name veya implicit short-id match kazanirsa JSON envelope `cliDeprecationWarnings` dondurur. Debug ihtiyaci disinda bu uyarilar "slug'a gec" sinyali sayilir.
4. Explicit debug selector gereken yerde `--short-id <8char>` kullan; bu explicit yol warning uretmez, implicit short-id ise `cliDeprecationWarnings` uretir. Ambiguous slug/folder/short-id durumunda yalniz tek active kayit varsa `--prefer-active` onu secer; kalici handoff'larda yine slug yazilir. Discuss komutlarinda `--short-id` topic selector'udur.
5. Yeni agent bootstrap'i: once `aops chat inbox --for <agent> --json`, sonra bagli odadaki unread'i `chat catchup --for <agent> --apply --json` ile oku; aktif uyandirma icin `chat listen --for <agent> --max-loops 1 --json`. Bekleyen review icin `aops pm review-request list --json`.
6. `discuss conclude`, `consensus.md`, agent final stance, `disagreement.md` ve `open-questions.md` dosyalarini `_TBD_` placeholder olarak birakmaz. Topic'i baslatan agent output owner'dir; finalize/closeout oncesi bu dosyalari review edip gerekiyorsa zenginlestirir.

### 16.3 PM window + chat-room baglama ve active window

#### 16.3.1 Overview

Iki ajanli execution pencerelerinde Projectman window'u tek olsun. Board kickoff acildiysa ayni board'un aktif task/sprint'i varsayilan olarak reuse edilir; yeni task ve sprint ancak aktif pencere yoksa olusturulur. (Repo-first `collab pm-bind` komutu emekliye ayrildi; PM penceresi dogrudan `pm` ile yonetilir, koordinasyon ise board'a bagli hosted chat odasinda yapilir.)

```bash
aops pm board kickoff --board ops --title "AOPS PM tooling triage" --goal "..." --apply --json
# Koordinasyon odasini board'a bagla (uyandirma/akis hosted chat'te):
aops chat room create --slug ops-room --title "Ops" --created-by <agent> --apply --json
aops chat binding add --room-id <room-id> --binding-type projectman.board --binding-id <board-id> --label "Active board" --created-by <agent> --apply --json
```

Explicit task/sprint secimi gerektiğinde ilgili `pm sprint`/`pm utask` komutlarini
kullan. Operator bilincli olarak yeni pencere acacaksa yeni bir `pm board
kickoff`/sprint acar; aksi halde duplicate kickoff window olusturmak yerine
aktif board referanslari tercih edilir.

### 16.4 Iki ajanli arastirma ve istisare akisi

#### 16.4.1 Overview

Operator "tartisin", "Claude ile konusup plan koyun", "beraber arastirin" gibi bir istek verdiginde ana ajan tek basina plan yazip sonradan review istemez. Varsayilan akis iki tarafin da bagimsiz context uretmesi, sonra discuss topic'i (karar) + hosted chat odasi (uyandirma) uzerinden yakinsamasidir. Review tarafi Projectman'dedir.

Ana ajan akisi:

1. `aops discuss start --slug <slug>` ile hedefi/agent'lari tasiyan bir karar topic'i ac; koordinasyon icin `aops chat room create` ile bagli bir oda ac.
2. Operator istegini, repo root'larini, kisitlari ve beklenen deliverable'lari topic'in ilk turn'une (veya odaya context mesaji olarak) yaz.
3. Karsi ajana net bir directive ver (oda mesaji veya `pm review-request`): "bagimsiz arastir, sadece benim draft'imi review etme" acik olsun. Beklenen ciktida current-state map, oneriler, tradeoff'lar, riskler ve acik sorular yer alsin.
4. Directive'i odaya `chat message send` ile duyur; karsi ajan manuel baslatilacaksa hangi odayi/topic'i dinleyecegini operator'e bildir.
5. Ana ajan kendi arastirmasini paralel yapar ve kendi stance'ini `discuss turn` ile topic'e yazar.
6. Karar turn'unu odaya kisa bir `chat message send` ile duyur; topic id/turn ve karsi ajandan istenen review sorulari yazilsin.
7. Cevap icin karar dongusunu `aops discuss wait --id <topic> --for <agent> --timeout-sec 540 --interval-sec 5 --json`, koordinasyon uyandirmasini `aops chat listen --for <agent> --max-loops 1 --json` ile bekle.
8. Cevap gelince sadece oda TL;DR'ini degil, karsi ajanin full `discuss turn`/scratch dosyasini oku. Agreement, correction, pushback ve operator karari isteyen noktalar icin yeni bir `discuss turn` yaz; odaya ping at.
9. Ciddi ayrilik varsa bir bounded loop daha ver. Mimari/yuksek etki konularda tek oda cevabindan sonra final plan yazma.
10. Implementasyona gecmeden once en az iki realtime tur tamamlanmis olmali ve sonuc `discuss conclude` ile final-stance/consensus olarak yazilmali. Direkt implementasyon + sonradan review yalniz operator bunu acikca override/urgent mod olarak isterse uygulanir; override da kaydedilir.
11. Sonuc: kilitlenen kararlar (discuss conclude), acik operator sorulari, POC sirasi ve owner/domain sinirlari. Projectman veya Docman kaydi yalniz explicit komutla yapilir.

Karsi ajan akisi:

1. Directive'i ele al ve odaya "arastiriyorum, sonuc donecegim" notu yaz; `chat catchup --apply` ile read cursor'u ilerlet.
2. Istenen kaynaklardan bagimsiz arastirma yap; ana ajanin draft'ini tek truth sayma.
3. Kendi research/stance'ini `discuss turn` ile yaz ve oda cevabinda topic id/turn ile kisa ozet ver.
4. Ana ajan kanitli pushback verirse yeni bir `discuss turn` ile hangi noktalari kabul ettigini, hangilerini surdurdugunu ve hangilerini operator'e biraktigini belirt.

Minimum kalite kapisi: iki ajanin da en az bir bagimsiz context/research turn'u olur; ya da ana ajan bounded timeout'u ve "karsi cevap beklenmeden ilerleniyor" notunu operator'e acikca yazar.

### 16.5 ChatV3 product-channel room context

#### 16.5.1 Overview

`aops chatv3`, hosted `aops chat` odasi degildir; encrypted product-channel/session CLI'idir. Invite/session/member token ve room epoch key context'i local ChatV3 session store uzerinden calisir. Hosted AOPS coordination icin `aops chat`, aktif product-room takibi icin `aops chatv3` kullanilir.

Common commands:

```bash
aops chatv3 listen --session codex --room general --after-seq <last-seq> --timeout-sec 60 --json
aops chatv3 binding add --session codex --room general --binding-type projectman.review-request --ref-id <rr-id> --title "Slice review" --json
aops chatv3 binding list --session codex --room general --json
aops chatv3 room brief --session codex --room general --for claude --json
aops chatv3 room summary --session codex --room general --after-seq <last-seq> --json
```

Kural:

1. `listen` exit `0` yeni mesaj, exit `22` timeout anlamindadir; read/listen output'u `latestSeq` ve `caughtUp` tasir.
2. `binding add/list/remove` loose refs tutar; PM/RR/Docman/discuss truth'unu degistirmez.
3. `room brief` guidance, members, presence, bindings, cursor refs ve recommended next reads iceren read-only onboarding pack'tir.
4. `room summary` agent-composed narrative digest pack'tir; `sourceRef.type=chatv3.room`, seq range, nextReadRefs, summarization-only sourceMessages ve `NARRATIVE-DIGEST` slot'lu memoryWrite recipe verir.
5. `sourceMessages` yalniz ozetleme girdisidir; memory'ye aynen yazilmaz. Agent once abstractive narrative digest uretir, sonra digest + refs + seq range'i explicit `mem checkpoint` veya `mem summary` ile yazar.

## 17 Resource sugar

### 17.1 Overview

#### 17.1.1 Overview

`aops resource` is the hosted Agentspace surface for durable knowledge pointers. A resource describes where knowledge lives; it does not own the document body, snapshot bytes, or planning state.

Use it when an agent needs a reusable pointer such as a guide, rule, spec, link, reference, template, dataset, code note, or skill-related reference:

```bash
aops resource create --name "Hexagen Guide" --resource-type document --uri "docman:aops/hexagen" --apply --json
aops resource list --resource-type document --json
aops resource get --id <resource-id> --json
aops resource update --id <resource-id> --uri "https://example.test/spec" --apply --json
aops resource delete --id <resource-id> --apply --confirm --json
```

Before raw hosted writes, check the live schema:

```bash
aops agent schema --tool agentspace.resource.create --timeout-ms 120000 --json
```

If `agent schema` ever returns only a flexible `data` envelope for an Agentspace operation, fall back to the matching sugar help (`aops resource create --help`) and inspect an existing list/get record before composing payloads. Do not guess nested field names from memory.

## 18 Artifact sugar

### 18.1 Overview

#### 18.1.1 Overview

`aops artifact` is hosted metadata for generated or external artifacts. It stores the artifact shell and links to project-scoped refs; it is not the byte store. Use artifact records for pointers such as storage paths, report paths, exported archives, screenshots, or generated JSON; keep file bytes in an operator-owned storage system.

Core flow:

```bash
aops artifact create --artifact-type file --storage-path "s3://bucket/report.json" --apply --json
aops artifact link --artifact-id <artifact-id> --ref-type resource --ref-id <resource-id> --apply --json
aops artifact ref list --ref-type resource --ref-id <resource-id> --json
aops artifact get --id <artifact-id> --json
aops artifact delete --id <artifact-id> --apply --confirm --json
```

Keep artifact content small and pointer-shaped. If the artifact is a repo file, include the path and validation context in memory or PM; do not paste large file bodies into artifact metadata.

## 19 Skill sugar

### 19.1 Overview

#### 19.1.1 Overview

`aops skill` owns hosted reusable skill shells and skill versions. `.aops/hosted/skills/**` is only the read-only mirror; never edit it as canonical truth.

Authoring loop:

```bash
aops skill list --hosted-project-slug aops --name "aops-working-disciplines" --json
aops skill inspect --id <skill-id> --json
aops skill version list --skill-id <skill-id> --json
aops skill version create --hosted-project-slug aops --skill-id <skill-id> --content '@./SKILL.md' --entry-file SKILL.md --skill-standard aops-skill-v1 --meta '@./meta.json' --apply --json
aops skill version publish --hosted-project-slug aops --id <skill-version-id> --apply --json
aops sync pull --apply --hosted-project-slug aops --json
aops assets install --target all --apply --json
```

When `--version` is omitted, the CLI resolves the next version from hosted versions. If a publish or create reports a version conflict, use `skill version list`; mirror frontmatter can lag by one version immediately after publish.

## 20 Durable activity logs

### 20.1 Overview

#### 20.1.1 Overview

Durable activity logs are audit/readback evidence for hosted operations. Many hosted write sugars append best-effort activity records or structured server logs. Treat these logs as verification context, not planning truth.

Current operator rules:

1. Planning and execution state still belongs in Projectman.
2. Durable handoff and decisions still belong in Agentspace memory.
3. Activity logs are useful when proving that a hosted write, invoke, or flow ran with a concrete request/response.
4. If a dedicated `aops activity ...` command is not present in your runtime, discover the hosted activity surfaces with `aops agent tools --domain agentspace --json` or use the domain guide. Do not invent an activity command from old docs.

## 22 Docman sugar

### 22.1 Overview

#### 22.1.1 Overview

`aops doc` is the hosted Docman surface for document groups, documents, versions, sections, pages, page versions, retrieval rows, publish output, and mirror pull.

Common flows:

```bash
aops doc list --project-slug aops --json
aops doc version list --document-id <doc-id> --json
aops doc outline get --document-version-id <docver-id> --titles-only --depth 2 --json
aops doc page draft-save --page-version-id <pagever-id> --document-link-id <section-page-link-id> --content '@./page.md' --apply --json
aops doc set-current-version --document-id <doc-id> --version-id <docver-id> --publish-now --apply --json
aops doc mirror pull --project-slug aops --group-uid aops-guides --document-slug aops-cli-user-guide --out-dir ./.aops/docman --apply --json
```

For a known page edit, use clone_all + targeted page/section CRUD. For a whole markdown refresh, use `doc import --from-markdown` with `--baseline`, `--guard-target`, and a `--dry-run` first.

Retrieval notes:

1. `doc scope search --local` searches the local mirror and can rank source or architecture files above the guide you expected.
2. `doc search --local` is document-granular and confirms presence; do not assume it returned a full section body.
3. To read a mirror section, use `aops view doc-page <document>#<number-prefixed-slug>`, for example `aops view doc-page aops-cli-user-guide#27-guard-flag-konvansiyonu`.
4. `doc outline get --titles-only --depth <n>` is the cheapest structure probe for a known hosted version.

## 23 Sık görülen operator notlari

### 23.1 Overview

#### 23.1.1 Overview

High-signal operator notes:

1. First cold hosted calls can take around 20 seconds; use `--timeout-ms 120000` for schema, doc, skill, or file smoke commands.
2. `--yes` means non-interactive/fail-fast. It is not a magic fix for validation errors.
3. In PowerShell, quote file pointers for multiline or quote-heavy content: `--content '@file'` or `--input '@file.json'`.
4. If sugar returns validation errors, stop retrying guessed flags. Read `<command> --help`; for raw invokes, read `agent schema`.
5. If command help and skill text disagree, command help wins.
6. If a user guide and skill text disagree, the user guide wins.

## 24 Onerilen gunluk akış

### 24.1 Overview

#### 24.1.1 Overview

For a normal agent session:

```bash
aops mem resume --subject project --json
aops view dashboard --style agent
aops <family> --help
# do the scoped work
aops mem write --mode resume --subject project --durability short --content '@./checkpoint.md' --apply --json
```

Use `view` for read-only context, then mutate through the owner family: `pm` for planning, `mem` for durable context, `doc` for documents, and `skill`/`prompt` for hosted reusable assets.

Do not run closeout commands unless the operator explicitly approves closeout. Ordinary stop points should write resume/handoff memory.

## 25 Installer mantigi

### 25.1 Overview

#### 25.1.1 Overview

Runtime skills are loaded through the verified user-level AOPS gateway, not
directly from repository mirrors. Setup installs or repairs one managed gateway
for every agent runtime registered by this CLI.

Typical refresh:

```bash
aops assets install --target all --apply --json
aops assets status --verify full --json
aops assets resolve --gateway aops --json
```

Restart an agent runtime if it caches skill discovery. Hosted optional packages
remain server-owned and inert until explicitly discovered and installed; the
offline Community core is immutable and signed independently.

## 26 Help-first model

### 26.1 Overview

#### 26.1.1 Overview

AOPS command discovery is help-first:

```bash
aops --help
aops <family> --help
aops <family> <subcommand> --help
```

Decision chain:

1. Use sugar help for routine CLI work.
2. Use `aops agent tools --domain <domain> --json` to find hosted operations when sugar is missing.
3. Use `aops agent schema --tool <domain>.<operation> --json` before raw payload authoring.
4. Use `aops agent invoke --tool <id> --input '@payload.json' --apply --json` only when sugar is absent or broken.
5. Use `aops api call` only as an explicit low-level escape hatch.

## 27 Guard flag konvansiyonu

### 27.1 Overview

#### 27.1.1 Overview

Guard flags are consistent across AOPS sugar:

| Flag | Meaning |
|---|---|
| `--preview` | Validate and describe the operation without mutation. |
| `--apply` | Execute a guarded write. |
| `--confirm` | Confirm destructive actions such as delete, restore overwrite, cleanup, or reset. |
| `--idempotency-key <key>` | Make write retries deterministic when the command supports it. |
| `--json` | Return scriptable structured output. |
| `--yes` | Non-interactive/fail-fast mode for prompts and missing choices. |

Read commands need no guard. Normal writes require `--apply`. Destructive writes require `--apply --confirm`. `--preview` without `--apply` should not mutate; if a command mutates during preview, file an issue.

## 28 Hosted source of truth ve mirror cache

### 28.1 Overview

#### 28.1.1 Overview

The hosted server is the source of truth. The `.aops/**` tree is a read-only
local cache; do not treat it as canonical or hand-edit it as truth.

Server-canonical, mirrored as read-only caches:

1. `.aops/projectman/**` caches Projectman boards, tasks, sprints, issues, feedback, and views. Refresh with `aops sync pull --project-slug aops --apply --json`.
2. `.aops/agentspace/memory/items/**` caches Agentspace memory. Refresh with `aops sync pull ...`.
3. `.aops/agentspace/discussions/**` caches discuss topics/transcripts (discuss authoring is hosted). Refresh with `aops sync pull ...`.
4. `.aops/hosted/prompts/**` and `.aops/hosted/skills/**` mirror hosted Agentspace prompt/skill current versions. Refresh with `aops sync pull --apply --hosted-project-slug aops --json`.
5. `.aops/docman/**` mirrors hosted Docman documents. Refresh with `aops doc mirror pull ...`.

To change content, write through the owner surface (`aops pm ...`, `aops mem ...`, `aops discuss ...`, `aops doc ...`), then refresh the cache.

## 29 Hosted guide mirror bootstrap

### 29.1 Overview

#### 29.1.1 Overview

Guide mirrors are Docman-owned, not `sync pull`-owned. Refresh AOPS operator guides with:

```bash
aops doc mirror pull --project-slug aops --group-uid aops-guides --document-slug aops-cli-user-guide --document-slug aops-agent-assets-bootstrap --out-dir ./.aops/docman --apply --json
aops doc mirror pull --project-slug aops --group-uid domain-guides --document-slug agentspace-user-guide --out-dir ./.aops/docman --apply --json
```

Use `sync pull` for hosted prompts/skills, and `doc mirror pull` for guides/documents.

## 30 Cross-cutting anti-patterns

### 30.1 Overview

#### 30.1.1 Overview

Avoid these:

1. Guessing flags after a validation error instead of reading `--help`.
2. Writing raw `agent invoke` payloads without `agent schema`.
3. Treating `aops` as semantic owner for planning, memory, docs, files, or domain business state.
4. Hand-editing `.aops/hosted/**` or `.aops/docman/**` mirrors.
5. Assuming `sync pull` refreshes Docman guides.
6. Running full Docman import for a one-page edit when CRUD ids are known.
7. Writing closeout memory for an ordinary checkpoint.
8. Treating a capability mentioned in old guidance as mounted without confirming it through `aops agent tools --summary --json`.

## 31 Skill ve user guide arama disiplini

### 31.1 Overview

#### 31.1.1 Overview

Use the smallest useful read:

```bash
aops <family> --help
aops doc scope search --project-slug aops --q "<keywords>" --local --json
aops doc outline get --document-version-id <docver-id> --titles-only --depth 2 --json
aops view doc-page aops-cli-user-guide#27-guard-flag-konvansiyonu
```

Search rules:

1. Search by document title + section name + keywords, not bare section numbers.
2. `doc scope search` is broad; verify the `documentSlug` and `mirrorPath` before trusting a hit.
3. `doc search --local` is not a section body reader by itself.
4. `view doc-page <document>#<number-prefixed-slug>` is the ergonomic local section reader.
5. If a skill is thin, follow its canonical guide pointer rather than expecting full mechanics in the skill body.

## 32 AGENTS.md prompt-template bootstrap

### 32.1 Overview

#### 32.1.1 Overview

`aops agents-md` manages generated AGENTS.md prompt-template blocks. Keep project-specific rules outside the managed block.

```bash
aops agents-md preview --collab
aops agents-md update --collab --apply
aops agents-md reset --apply --confirm
```

Use this when a repo needs the standard AOPS task execution or collaborative work protocol reminders. Do not manually edit the managed block unless recovering from a broken generated state.

## 33 Agent runtime prompt/skill bootstrap

### 33.1 Overview

#### 33.1.1 Overview

Before asking a supported terminal agent to use AOPS, install and verify the
global gateway for all registered runtimes:

```bash
aops assets install --target all --apply --json
aops assets status --verify quick --json
aops assets resolve --gateway aops --json
```

`--target all` expands to the CLI's registered runtimes. A comma-separated or
repeated `--target` selects a subset. Runtime gateways point to the verified
user-level asset store and never require a repository checkout. If resolution
fails, inspect `aops assets status --verify full --json`; repair never
overwrites unknown user-owned files.

## 34 `start` kickoff composer

### 34.1 Overview

#### 34.1.1 Overview

`aops start`, hosted "AOPS Collaborative Startup" starter promptunu kickoff cevaplarindan derler. Komutun canli yardimi kanoniktir:

```bash
aops start --help
```

Iki kullanim modu:

1. Operator TTY: `aops start` sorulari interaktif sorar ve promptu stdout'a veya `--out <file>` ile dosyaya yazar.
2. Agent interview: `aops start --json` `result.missing` sorularini `askOperator` isaretiyle dondurur. Agent bildigi cevaplari flag olarak verir; yalniz `askOperator` kalemlerini operatore sorar. Roller operator-only'dir.

Varsayilan `--json` cikti compact'tir. Prompt govdesi inline gelmek yerine `result.promptRef` ile isaretlenir; `--out tmp/start.md` kullanmak uzun promptu dosyada tutar. Inline prompt sadece gercekten gerekiyorsa `--full-output` ile istenir.

Sik kullanilan komutlar:

```bash
aops start --mode solo --board <board> --task "<task>" --json --out tmp/start.md
aops start --mode chat-room --board <board> --discipline build-review-chat --json
aops start --resume <mission-id> --mode solo --board <board> --json
aops start --reminder --task "<current task>" --area <area> --limit 3 --json
```

Ready sonucunda onemli alanlar:

1. `result.promptRef.path` / `result.promptRef.sha256` - prompt dosyasi ve hash'i.
2. `result.memoryBrief` - read-only local-cache memory startup pack; `--no-memory-brief` bunu atlar.
3. `result.sessionGuidance` - layered runtime rules, discipline guardrails, accepted playbooks, ranked experience briefs.
4. `result.mission.policyJson` - mission create/update icin free-form policy seed.

`start --reminder` full kickoff degildir: soru sormaz, full starter prompt serialize etmez, PM/memory/hosted state yazmaz. Session ortasinda "neredeydik, hangi kurallar/playbook/experience gecerlidir?" sorusuna bounded read-only cevap verir.

## 35 Mission and implementation plan

### 35.1 Overview

#### 35.1.1 Overview

Mission Agentspace-owned session anchor'dir; Projectman task/sprint/RR truth'un yerine gecmez. Implementation-plan ise Projectman sprint facade'idir; plan id sprint id'dir.

```bash
aops mission create --objective "<objective>" --policy-json '<json>' --apply --json
aops mission list --summary --json
aops mission get --id <mission-id> --json
aops mission update --id <mission-id> --active-plan <sprint-id> --apply --json
aops mission resume --id <mission-id> --depth light --limit 8 --json

aops plan create --task <task-id> --name "<plan name>" --goal "<goal>" --apply --json
aops plan get --id <sprint-id> --json
aops plan update --id <sprint-id> --phases-json '@tmp/phases.json' --apply --json
```

Kurallar:

1. Mission intent, status, policy ve active plan ref tutar.
2. Task, sprint phase/microtask, issue, feedback, RR/RRR Projectman'dedir.
3. Mission resume compact ve token-bounded'dir; raw skeleton icin `mission resume --full` yalniz gerekliyse kullanilir.
4. `start --resume <mission-id>` starter prompt ile ayni compact mission pack'i birlestirir.
5. Tek maddelik microtask editleri icin `aops pm utask ...` kullan; plan facade ikinci tablo degildir.

## 36 Playbook and experience consult

### 36.1 Overview

#### 36.1.1 Overview

Playbook ve experience startup'ta bulk-load edilmez. Once bounded pack okunur:

```bash
aops start --reminder --task "<current task>" --area <area> --limit 3 --json
aops view experience --area <area>
aops skill current --id <skill-id> --summary --json
```

`result.sessionGuidance` uc katmanli okunur:

1. L1 runtime pointers: AGENTS.md, ChatV3/channel rules, command refs.
2. L2 discipline guardrails: id/title/phase/enforcement/evidence summary.
3. L3 accepted playbook briefs + ranked experience briefs.

Default experience limit 3, hard max 5'tir. Brief ilgisizse full body okunmaz; ilgiliyse skill/prompt/current summary, memory/experience detail veya doc ladder ile hedefli okunur.

## 37 Checkpoint cadence

### 37.1 Overview

#### 37.1.1 Overview

Checkpoint memory transcript degil, resume evidence pack'tir. Her chat satiri veya kucuk edit icin yazilmaz; anlamli milestone, decision, blocker, RR/RRR sonucu, import/publish slice'i veya session handoff noktasinda yazilir.

```bash
aops mem checkpoint --subject sprint --id <sprint-id> \
  --content '@tmp/checkpoint.md' \
  --task-id <task-id> --sprint-id <sprint-id> \
  --source-ref "projectman.review-request:<rr-id>" \
  --validation-state "PASS: tests/typecheck/smoke" \
  --next-action "<next action>" \
  --apply --json
```

Iyi checkpoint su bilgileri tasir:

1. Request/purpose ve PM surface refs.
2. Concrete outcome ve current status.
3. Validation/review evidence.
4. Open risks/blockers.
5. Next action ve next-read refs.

Durable closeout memory operator onayi gerektirir; ordinary checkpoint short resume/carry-forward kalir.
