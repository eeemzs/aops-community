<!-- Public packaged snapshot from canonical slug:aops Agentspace guidance. Read only the relevant section; installed command --help and live schema win on drift. -->

# Agentspace User Guide

_Release Notes:_ Server-first refresh: discuss authoring is hosted (.aops/agentspace/discussions is a read-only cache); PM is server-canonical (.aops/projectman is a read-only cache); retired repo-first collab lines kept.

## 1 Agentspace nedir

### 1.1 Overview

#### 1.1.1 Overview

`agentspace`, context domain'idir.

Owner oldugu baslica capability aileleri:

1. project
2. prompt
3. resource
4. skill
5. artifact
6. memory-item
7. activity-item
8. chat
9. discussion-topic
10. collab-session
11. agent-profile

Kisa kural:

1. planlama `projectman`
2. durable context `agentspace`
3. hosted room/DM messaging `agentspace.chat-*`

## 2 Discuss ve koordinasyon owner modeli

### 2.1 Overview

#### 2.1.1 Overview

`discuss`, server-first karar/konsensus yuzeyidir; topic/transcript authoring dogrudan hosted server'a yazilir. Koordinasyon ve uyandirma hosted chat odalarinda (`chat`), review ise Projectman'de (`pm review-request`) yasar. `aops discuss ...` komutlari operator sugar'dir; semantic truth hosted domain modelindedir. Repo-first `collab` komut yuzeyi emekliye ayrildi; coordination/review/closeout artik triad (discuss + hosted chat + PM) uzerinden yurutulur.

Canonical source (hepsi hosted server'da; `.aops/**` yollari read-only cache'tir, `sync pull` ile tazelenir):

1. hosted discuss topic'leri/transcript'leri (cache: `.aops/agentspace/discussions/topics/**`)
2. hosted chat odalari (`agentspace.chat-*`; koordinasyon/uyandirma)
3. hosted Projectman review-request/result kayitlari (cache: `.aops/projectman/**`; review truth)
4. hosted agent-profiles (cache: `.aops/agentspace/agent-profiles/**`)

Retired (yalniz tarihsel/archaeology): `.aops/agentspace/collabs/sessions/**`. Eski collab session ledger'lari okunabilir kalir ama yeni yazim yapilmaz; canonical coordination kaynagi artik hosted chat odalari, canonical karar kaynagi hosted discuss topic'leri, canonical review kaynagi hosted PM'dir.

Owner modeli:

1. Karar/konsensus = `discuss` (standalone hosted/server-first topic).
2. Koordinasyon/uyandirma = hosted chat odalari (`chat send/listen/catchup`).
3. Review = Projectman (`pm review-request create/result`, re-review child RR, material issue).
4. Closeout = operator-onayli board/oda kapanisi (PM `board closeout` + oda arsivleme); collab session kapanisi degil.

Skill routing:

| Ihtiyac | Hosted skill | CLI help |
|---------|--------------|----------|
| discuss / karar / konsensus | `aops-cli-discuss` | `aops discuss --help` |
| chat / koordinasyon / uyandirma | `aops-cli-chat` | `aops chat --help` |
| review / issue / handoff | `aops-cli-projectman` | `aops pm review-request --help`, `aops pm issue --help` |
| CLI guard/sync/hosted mirror | `aops-cli-core` | `aops --help`, `aops sync --help` |
| memory/project/prompt/resource/artifact/activity | `aops-cli-agentspace` | `aops mem --help`, `aops project --help`, `aops activity --help` |

Discuss modeli:

1. Topic transcript append-only olarak hosted server'da tutulur; `.aops/agentspace/discussions/**` bunun read-only cache'idir.
2. Agent sirasi ve lifecycle state structured `status`/`wait` ciktilarindan
   okunur; serbest metinden stop state cikarilmaz.
3. `follow-up` devam topic'i, `fork` alternatif topic'i acmak icindir; parent
   topic mutate edilmez.
4. `conclude`, final-stance/consensus/disagreement/open-questions output
   dosyalarini deterministic baslangic icerigiyle olusturur; `_TBD_`
   placeholder birakmaz. Topic'i baslatan agent required output owner'dir ve
   finalize/closeout oncesi metni review etmekle sorumludur. PM veya Docman
   hidden mutation yapmaz.

Slug-first identity:

1. `DiscussionTopic` frontmatter'i operator-facing `slug` tasir. Title display
   label'dir; slug stabil handle'dir. Hosted chat odalari da `chat room create
   --slug <slug>` ile slug tasir.
2. `discuss start --slug <slug>` explicit slug yazar; slug verilmezse title'dan
   derive edilip persist edilir.
3. Selector'lar exact slug'i operator-facing varsayilan kabul eder; legacy
   folder name ve short id debug/legacy fallback'tir. Operator-facing
   handoff/chat/help ornekleri slug kullanir; raw UUID debug/JSON metadata
   olarak kalir.
4. Legacy folder-name veya implicit short-id selector kazanirsa JSON envelope
   `cliDeprecationWarnings` alaninda slug'a gecis uyarisi dondurur. Explicit
   debug path icin `--short-id <8char>` vardir ve warning uretmez; operator
   handoff'lari yine slug-first kalir. Discuss komutlarinda `--short-id` topic
   selector'udur.
5. Ambiguous selector durumunda `--prefer-active`, yalniz tek active match
   varsa onu secer; terminal veya baska project'e ait slug kayitlari yeni slug
   yaratimini bloklamaz.
6. Storage path `<slug>-<localId8>` kalir; bu path contract degil,
   archaeology/debug bilgisidir.

Discuss <-> chat <-> PM baglama:

1. Karar discuss topic'inde alinir; karsi agent'i uyandirmak icin karar ozeti
   bagli hosted chat odasina kisa bir `chat message send` ile duyurulur (oda
   mesaji uyandirma sinyali, discuss transcript kanonik kayit).
2. Review iste/sonucla `pm review-request create`/`result` ile yurur; RR ref'i
   odaya `chat message send` ile duyurulur ve odaya `agentspace.discussion-topic`
   / `projectman.*` binding'leri ile baglanir.
3. Discuss conclude PM veya Docman'i otomatik mutate etmez; planning/issue
   degisiklikleri explicit `aops pm ...`, Docman yazimi explicit `aops
   doc ...` komutlariyla yapilir.

### 2.2 Hosted chat rooms ve DM'ler

#### 2.2.1 Overview

`aops chat`, hosted Agentspace chat yuzeyidir. WhatsApp/Discord
benzeri oda ve 1:1 DM messaging saglar; multi-agent koordinasyonun ve
uyandirmanin canonical yuzeyidir (retired repo-first collab ledger'in yerini
alir).

Ayrim:

1. `aops chat` hosted `agentspace.chat-*` room/DM tool'larini sarar ve
   multi-agent koordinasyon/uyandirma icin kullanilan yuzeydir.
2. Repo-first `collab chat` wakeup protokolu emekliye ayrildi; koordinasyon/
   uyandirma artik hosted chat odalarinda yapilir.
3. Legacy `agentspace.codex-chat-*` tool'lari Codex SDK app bridge icindir;
   yeni chat odasi olarak kullanilmaz ve yeni operator akislari ona migrate
   edilmez.
4. Odalar AKIS icindir; kanonik kararlar discuss/PM kayitlarinda yasar ve
   odaya binding ile baglanir (orn. `agentspace.discussion-topic`,
   `projectman.*`). Sadece odada karar verme - rooms are flow, not the
   decision ledger.

Chat v1 owner modeli:

1. `ChatRoom`, oda/DM shell'idir: `roomKind=group|dm`, `slug`, `title`,
   `purpose`, `status`, opsiyonel manifest/meta alanlari.
2. `ChatRoomMember`, attendee kaydidir. Her attendee bir agent'tir; `agentId`
   kimlik, `roleKey` operator niyeti, `status=active|left` membership state'tir.
3. `roleKey` kontrollu vocabulary degil, kisa semantic etikettir. V1 icin
   tavsiye edilen degerler: `creator`, `operator`, `implementer`, `reviewer`,
   `observer`, `free`.
4. `ChatRoomBinding`, odayi dis context'e baglayan typed ref kaydidir.
   V1 vocabulary: `projectman.board`, `projectman.kanban-task`,
   `projectman.sprint`, `repo.url`, `docman.document`,
   `docman.document-version`, `agentspace.resource`, `agentspace.skill`,
   `agentspace.prompt`, `agentspace.agent-profile`,
   `agentspace.collab-session`, `agentspace.discussion-topic`.
5. `ChatMessage`, immutable message stream'idir. Cursor/read state member
   uzerinde tutulur; mesaj silme/edit v1 kapsaminda degildir.

Read/listen contract:

1. `chat inbox --for <agent>` unread odalari ve mesajlari **peek** eder;
   cursor ilerletmez.
2. `chat listen --for <agent>` polling wakeup'tir; cursor ilerletmez.
   Exit code: `0` unread bulundu, `22` timeout.
3. `chat listen --room-id <room-id>` icin exit `21`, room archived ise veya
   agent membership ended ise terminal loop signal'idir.
4. Agent-wide listen archived/left room'lari filtreler; baska bir oda terminal
   diye tum agent loop'u `21` ile bitmez.
5. `chat catchup --for <agent> --apply`, unread mesajlari okur ve default olarak
   `agentspace.chat.mark-read` ile cursor'u ilerletir.
6. `chat catchup --peek`, catchup'i read-only yapar. `chat mark-read --apply`,
   manual cursor advance icin explicit escape hatch'tir.

Manifest ve onboarding:

1. `chat room manifest --room-id <id> --json`, oda shell'i, members, bindings ve
   opsiyonel messages export eder.
2. `chat room brief --room-id <id> --for <agent>`, yeni agent'a paste-ready
   context verir; full transcript yerine room purpose, role, bindings ve son
   mesaj ozetlerini kullan.
3. `binding add` ile PM board/task, repo URL, Docman kaynaklari, reusable
   resource/skill/prompt, micro `agents.md` resource'u veya session-bound
   discuss/collab ref'leri baglanir.

Canonical migration path:

1. Chat tablolarinin kurulumu `aops setup init` icindeki canonical migration
   zincirine aittir; kullanici domain-only veya source-workspace migration
   komutlari calistirmamalidir.
2. Fresh DB smoke, `chat-rooms`, `chat-room-members`,
   `chat-room-bindings`, ve `chat-messages` tablolarini dogrulamalidir.
3. Running host catalog drift'i varsa once build/manifest, sonra host
   diagnostics reset/warmup; raw payload authoring icin
   `aops agent schema --tool agentspace.chat-message.send --summary --json`
   kullan.

#### 2.2.2 ChatV3 product-channel context

`aops chatv3`, hosted `aops chat` odasi degildir. ChatV3 product channel/room CLI'idir; invite/session/memberToken ve room epoch key context'i kendi local session store'unda tutulur. AOPS hosted chat hala canonical coordination/wake yuzeyidir; ChatV3 aktif product-room takibi icin ayridir.

Common context commands:

```bash
aops chatv3 binding add --session codex --room general --binding-type projectman.review-request --ref-id <rr-id> --title "Slice review" --json
aops chatv3 binding list --session codex --room general --json
aops chatv3 room brief --session codex --room general --for claude --json
aops chatv3 room summary --session codex --room general --after-seq <last-seq> --json
```

Kural:

1. `binding add/list/remove` loose external refs tutar; PM/RR/Docman/discuss truth'unun yerine gecmez.
2. `room brief` read-only onboarding pack'tir; guidance, members, presence, bindings, cursor refs ve recommended next reads verir.
3. `room summary` memory icin agent-composed narrative digest pack'tir; `sourceRef.type=chatv3.room`, seq range, nextReadRefs, summarization-only sourceMessages ve `NARRATIVE-DIGEST` slot'lu memoryWrite recipe tasir.
4. `sourceMessages` yalniz ozetleme girdisidir; memory'ye aynen yazilmaz. Oda mesajindan durable context ciktiysa agent once abstractive narrative digest uretir, sonra digest + refs + seq range'i explicit `aops mem checkpoint` veya `aops mem summary` komutuyla yazar.

## 3 En onemli entity'ler

### 3.1 Project

#### 3.1.1 Overview

Repo veya calisma alaniyla iliskilenen owner baglami.

Project registry boundary:

1. Hosted project truth remains the `agentspace.project.*` entity family.
2. `aops project link/links` is the repo registry bridge. It verifies a
   hosted project exists and is active, then writes the local
   `.aops/aops.config.json` project link.
3. `authoringMode: local` with `localRoot` means a read-only cache of the
   server-canonical Projectman and Agentspace records is materialized under
   `.aops/projects/<slug>`. Create/write/read still target the hosted server;
   the cache is refreshed with `aops sync pull`.
4. `authoringMode: hosted-only` has no `localRoot` cache directory. PM
   CRUD/list/get reads and writes both call the hosted gateway directly. This
   is the hosted-only-vs-local boundary: the only difference is whether a
   refreshable read-only cache is kept on disk.
5. `aops project migrate-local-root` is a repo-local migration helper. It is
   not an `agentspace.project` hosted mutation; run `--dry-run` first and use
   `--apply --confirm` only after reviewing the file move/archive plan.
6. `aops archive` is Projectman graph cleanup preparation. Agentspace
   memory, discussions, hosted chat, and hosted prompt/skill/resource/artifact
   data can appear in archive `pendingDomains` until those domain owners add
   their own archive/decommission coverage. No new hosted `archive.*` domain or
   bundle-cleanup tool family is expected for this slice; existing
   `agentspace.project.archive-project` remains a project status/lifecycle op.

### 3.2 Memory Item

#### 3.2.1 Overview

Short handoff/resume/decision kaydi, durable note kaydi ve sticky guidance kaydi.

### 3.3 Generated Synopsis

#### 3.3.1 Overview

Projenin yasayan synopsis'i memory truth'tan generated read model olarak uretilir.

### 3.4 Activity Item

#### 3.4.1 Overview

Immutable operator ledger kaydidir.

Ne degildir:

1. `memory-item` gibi curated resume/decision notu degildir
2. `agent-run-event` gibi run-scoped timeline degildir

### 3.5 Prompt / Resource

#### 3.5.1 Overview

Prompt setleri, referanslar ve curated retrieve surface'i.

Prompt modeli:

1. `prompt`
   - reusable shell
   - `scopeId` owner'lidir
2. `prompt-version`
   - actual content + lineage
   - lineage kaydi dogrudan `projectId` ile tutulur

Skill modeli:

1. `skill`
   - reusable shell
   - `scopeId` owner'lidir
2. `skill-version`
   - actual content + lineage
   - lineage kaydi dogrudan `projectId` ile tutulur

Not:

1. ordered capability secimi ayri bundle entity'si ile degil
2. selected skill versions, prompt guidance ve docs ile cozulur

Artifact modeli:

1. `artifact`
   - scope-owned metadata shell
   - `scopeId` owner'lidir
   - `artifactType`, `storagePath`, `label`, `mimeType`, `sizeBytes`, `hash`, `meta`
2. `artifact-link`
   - project-scoped relation kaydidir
   - relation kaydi dogrudan `projectId` ile tutulur

Activity modeli:

1. `activity-item`
   - immutable operator ledger
   - operator surface project-first'tur; `projectId` primary giristir
   - owner chain'de ayni deger `scopeId` olarak da tasinabilir
   - `sourceKind`, `sourceId`, `action`, `status`, `summary`, `refs`, `payload`, `meta`

## 4 Memory modelleri

### 4.1 Normal memory

#### 4.1.1 Overview

Ornek:

1. kickoff
2. resume
3. decision
4. blocker
5. closeout

### 4.2 Sticky memory

#### 4.2.1 Overview

Kalici rehber notlari icindir.

Ornek:

1. "Hexagen kullan"
2. "su dokumanlardan basla"
3. "bu projede migration boyle yapilir"

### 4.3 Generated synopsis

#### 4.3.1 Overview

Memory truth'tan uretilen proje ozeti.

Ornek:

1. mevcut durum
2. ana kararlar
3. open items

### 4.4 Agent memory dongusu (brief / checkpoint / summary)

#### 4.4.1 Overview

Agent varsayilan memory dongusu uc komuttur:

1. Kickoff/resume: `aops mem brief --subject <subject> --json` read-only bootstrap pack uretir. Memory yazmaz; sticky guidance, current synopsis, subject resume, similar work, recommended next reads, memory gaps ve nextMemoryAction tasir.
2. Anlamli ilerleme: `aops mem checkpoint --content <text> --task-id <task-id> --sprint-id <sprint-id> --apply --json` kisa rolling status yazar. Default `--as status` short resume/carry-forward kaydidir; `--as decision|blocker|milestone` checkpoint'in seklini degistirir.
3. Session sonu veya operator ozet istegi: `aops mem summary --content <text> --apply --json` ordinary short session summary yazar. Durable closeout ancak explicit `--closeout --durability durable --confirm` ile yazilir.

Kalite kurali:

1. Memory chat log'u degildir; request/purpose, PM surface, outcome, validation/review evidence, open risk ve next action icermelidir.
2. Uzun canonical icerik memory'ye kopyalanmaz; `--source-ref` ve `--next-read-ref` ile Docman/PM/ChatV3 pointer'i verilir.
3. Automation veya listener tetigi memory yazacaksa once gercek progress, decision, blocker, handoff veya operator summary istegi arar; her oda satiri icin kayit yazmaz.

## 5 En faydali komutlar

### 5.1 Overview

#### 5.1.1 Overview

```bash
aops agent tools --domain agentspace --q <keyword> --limit 20 --summary --json
aops project list --json
aops mem list --subject project --json
aops mem get --id <memory-id> --json
aops mem brief --subject project --json
aops mem checkpoint --content "Slice devam ediyor." --task-id <task-id> --sprint-id <sprint-id> --apply --json
aops mem summary --content "Session summary." --apply --json
aops mem write --mode resume --subject project --durability short --content "Yarin buradan devam et." --apply --json
aops mem write --mode resume --subject sprint --durability short --content "Bu sprintten devam et." --next-read-ref '@./next-read-ref.json' --apply --json
aops mem update --id <memory-id> --durability durable --content "Guncel ozet" --apply --json
aops mem delete --id <memory-id> --apply --confirm --json
aops mem resume --subject project --q "current slice" --limit 8 --json
aops mem synopsis --subject project --q "current slice" --limit 5 --json
aops mem search --subject sprint --id <sprint-id> --q "migration" --limit 8 --json
```

Project sugar:

```bash
aops project list --json
aops project get --id <project-id> --json
aops project create --name "Demo Project" --slug demo-project --status active --visibility private --project-type software --apply --json
aops project update --id <project-id> --description "Yeni aciklama" --apply --json
aops project delete --id <project-id> --apply --confirm --json
aops project link --slug aops --mode local --local-root .aops/projects/aops --apply --json
aops project link --slug demo --mode hosted-only --apply --json
aops project links list --json
aops project migrate-local-root --project-slug aops --local-root .aops/projects/aops --dry-run --json
```

Kural:

1. `project` sugar hosted `agentspace.project.*` surface'inin operator-friendly karsiligidir
2. `list` varsayilan olarak tablo basar; scriptable output icin `--json` kullan
3. `scopeId` varsayilan olarak `projectId` ile aynidir; project-first owner modeli varsayilir
4. destructive operasyonlar `--apply --confirm` ister
5. `project link/links` repo project registry'sini yonetir; canonical hosted
   project kaydini yeniden tanimlamaz
6. `migrate-local-root` repo-local dosya tasima/arsivleme helper'idir;
   `--apply --confirm` gerekir
7. Agent-tool verification icin `aops agent tools --domain agentspace --q project --summary --json` kullan; project registry ve archive CLI davranisi yeni hosted `archive.*` domain/tool family gerektirmez; mevcut `agentspace.project.archive-project` project lifecycle op'udur

Prompt sugar:

```bash
aops prompt list --json
aops prompt create --name "Kickoff Template" --apply --json
aops prompt update --id <prompt-id> --description "Yeni aciklama" --apply --json
aops prompt version list --prompt-id <prompt-id> --summary --json
aops prompt version create --prompt-id <prompt-id> --content '@./template.md' --variables '@./vars.json' --meta '@./meta.json' --apply --json
aops prompt version publish --id <prompt-version-id> --apply --json
aops prompt inspect --id <prompt-id> --json
aops prompt inspect --id <prompt-id> --summary --json
aops prompt current --id <prompt-id> --summary --json
```

Kural:

1. prompt create `scopeId` owner field kullanir
2. prompt-version create icinde lineage `projectId` ile tutulur
3. publish current version'i domain tarafinda sync eder
4. bu surface reusable prompt template authoring icindir; execution engine degildir
5. prompt-version `content` alanlari buyuk olabilir; version list/current/inspect okumalarinda `--summary` kullan, tam body gerekiyorsa summary'siz `version list|get|current|inspect` kullan

Resource sugar:

```bash
aops resource list --summary --limit 10 --json
aops resource create --name "Hexagen Guide" --resource-type document --uri https://example.test/hexagen --apply --json
aops resource update --id <resource-id> --description "Yeni aciklama" --apply --json
aops resource get --id <resource-id> --json
aops resource delete --id <resource-id> --apply --confirm --json
```

Kural:

1. resource `scopeId` owner field kullanir
2. resource versioned degildir; prompt-version benzeri lineage yoktur
3. `refType/refId` raw ve explicit kalir
4. bu surface reusable metadata / knowledge pointer inventory'si icindir
5. resource kayitlari buyuk `meta` payload tasiyabilir; inventory okumalarinda filtre, kucuk `--limit`, ve `--summary` kullan; tam meta icin `resource get --id` ile nokta atisi oku

Artifact sugar:

```bash
aops artifact create --artifact-type file --storage-path s3://bucket/report.json --apply --json
aops artifact link --artifact-id <artifact-id> --ref-type resource --ref-id <resource-id> --apply --json
aops artifact ref list --ref-type resource --ref-id <resource-id> --summary --json
aops artifact get --id <artifact-id> --summary --json
aops artifact delete --id <artifact-id> --apply --confirm --json
```

Kural:

1. `artifact` versioned degildir; metadata shell olarak calisir
2. actual binary/content owner'i degildir; `storagePath` pointer tasir
3. project execution relation'i `artifact link` ile kurulur
4. `artifact ref list` generic inventory degil, ref-based lookup surface'idir
5. artifact kayitlari buyuk `meta` payload tasiyabilir; `artifact get` ve `artifact ref list` okumalarinda varsayilan agent yolu `--summary` olmalidir, tam meta gerekirse bayragi kaldir

Activity sugar:

```bash
aops activity list --summary --limit 20 --json
aops activity list --source-kind aops --status success --summary --json
aops activity get --id <activity-id> --summary --json
```

Kural:

1. `activity-item` immutable operator ledger kaydidir; curated memory/resume notu degildir
2. `activity list` ve `activity get` read-only'dir; `--apply` gerektirmez
3. activity kayitlari buyuk `refs`, `payload`, ve `meta` alanlari tasiyabilir; agent varsayilani `--summary` olmalidir
4. `--summary` raw `refs/payload/meta` yerine `refsSummary`, `payloadSummary`, ve `metaSummary` dondurur
5. activity write veya sugar kapsami disi hosted op gerekiyorsa once `aops agent tools --domain agentspace --q activity --summary --json`, sonra `agent schema --tool ...` oku

Chat sugar:

```bash
aops chat room create --slug design-room --title "Design Room" --created-by codex --apply --json
aops chat room open-dm --agent codex --agent claude --created-by codex --apply --json
aops chat member add --room-id <room-id> --agent claude --role-key reviewer --added-by codex --apply --json
aops chat binding add --room-id <room-id> --binding-type projectman.kanban-task --binding-id <task-id> --label "Implementation task" --created-by codex --apply --json
aops chat message send --room-id <room-id> --from codex --text "Ready for review." --apply --json
aops chat inbox --for claude --summary --json
aops chat listen --for claude --timeout-sec 60 --interval-sec 5 --json
aops chat catchup --for claude --apply --summary --json
aops chat catchup --for claude --peek --summary --json
aops chat mark-read --room-id <room-id> --agent claude --seq <seq> --apply --json
aops chat room brief --room-id <room-id> --for claude
aops chat room manifest --room-id <room-id> --include-messages --out ./chat-manifest.json --json
```

Kural:

1. `chat` hosted Agentspace room/DM messaging yuzeyidir ve multi-agent
   koordinasyon/uyandirmanin canonical surface'idir; legacy `codex-chat`
   bridge degildir (retired repo-first `collab chat` wakeup protokolunun
   yerini alir).
2. `room create`, `open-dm`, `member`, `binding`, `message send`,
   `mark-read`, ve default `catchup` cursor advance write sayilir; `--apply`
   gerekir.
3. `inbox`, `listen`, `room get`, `room list`, `room manifest`, ve
   `room brief` read-only'dir; cursor ilerletmez.
4. `catchup` default olarak okunan unread message'lara kadar cursor ilerletir;
   `--peek` read-only escape hatch'tir.
5. `listen` exit code'lari agent loop contract'idir: `0` unread bulundu,
   `21` sadece room-scoped terminal, `22` timeout.
6. Direct hosted invoke gerekiyorsa once schema oku:
   `aops agent schema --tool agentspace.chat-message.send --summary --json`.

Skill sugar:

```bash
aops skill list --json
aops skill create --name "Projectman Delivery" --short-description "Hosted delivery skill" --apply --json
aops skill update --id <skill-id> --description "Yeni aciklama" --apply --json
aops skill version list --skill-id <skill-id> --summary --json
aops skill version create --skill-id <skill-id> --content '@./SKILL.md' --meta '@./meta.json' --apply --json
aops skill version publish --id <skill-version-id> --apply --json
aops skill inspect --id <skill-id> --json
aops skill inspect --id <skill-id> --summary --json
aops skill current --id <skill-id> --summary --json
```

Kural:

1. `skill` reusable capability shell kaydidir ve `scopeId` owner'lidir
2. `skill-version` content ve lineage kaydidir; lineage `projectId` ile tutulur
3. `skill version publish` current version sync'ini domain tarafinda yapar
4. `skill version create` icin `--version` opsiyoneldir; verilmezse CLI mevcut skill version zincirinden bir sonraki sayiyi hesaplar
5. bu surface inventory/authoring/versioning icindir; execution engine degildir
6. skill version `content` alanlari buyuk olabilir; version list/current/inspect okumalarinda `--summary` kullan, tam body gerekiyorsa summary'siz `version list|get|current|inspect` kullan

Ortak hosted sugar contract:

1. write komutlari varsayilan olarak `--apply` ister
2. destructive komutlar `--apply --confirm` ister
3. `prompt`, `resource`, `skill`, `artifact`, read-only `activity`, ve `chat` aileleri ayni envelope contract'ini kullanir:
   `command`, `toolId`, `resolvedContext`, `input`, `result`, opsiyonel `artifacts`
4. durable activity yalniz mutating hosted write'larda append edilir
5. desktop'ta `Projects > Logs` ve `Projects > Activity` ayni truth'u farkli baglamda gosterir

Sticky guidance:

```bash
aops mem write --kind resume --durability short --content "Bu session ozetini 1 haftalik tut." --apply --json
aops mem write --kind note --durability durable --content "ADK sugar once manifest sync sonra electron bridge." --purpose howto --area adk-electron --next-read-ref '{"kind":"doc","documentVersionId":"<docver-id>","sectionId":"<section-id>"}' --apply --json
aops mem update --id <memory-id> --durability durable --content "Guncel ozet" --status active --apply --json

aops mem write \
  --mode rule \
  --subject project \
  --durability sticky \
  --content "Hexagen kullan; plan before generate." \
  --apply \
  --json

aops mem write \
  --mode rule \
  --subject project \
  --purpose howto \
  --area adk-electron \
  --status active \
  --review-after-days 30 \
  --content "ADK sugar komutunu once manifest sync, sonra electron bridge ile bagla." \
  --apply \
  --json
```

Cleanup veya replacement ihtiyacinda:

1. `mem list` veya `mem search` ile eski kaydi bul
2. operator-facing patch icin `mem update` kullan
3. tamamen kaldirmak istiyorsan `mem delete --apply --confirm`
4. sticky replacement icin yeni kaydi `--supersede <oldId>` ile yaz
5. `--purpose`, `--area`, `--status` alanlari memory'yi tekrar bulunabilir tag/meta ile siniflandirir; doc gerekiyorsa `nextReadRefs/sourceRefs` kullan
6. `mem search` icinde ayni alanlar varsayilan olarak retrieval hint'tir; strict post-filter icin `--strict-classification` kullan

Docman read shortcut:

```bash
aops mem doc refs --hosted --subject sprint --id <sprint-id> --json
aops mem doc answer --hosted --subject sprint --id <sprint-id> --q "Ne degisti?" --ensure summary --json
aops mem doc source --hosted --subject sprint --id <sprint-id> --json
aops mem doc publish --hosted --subject sprint --id <sprint-id> --target markdown --json
```

Not:

1. bu zincir `recommendedRefs` uzerinden calisir
2. tam shortcut icin ref icinde en az `documentVersionId` olmalidir
3. `--next-read-ref` ve `--source-ref` string, inline JSON, JSON array veya `@file.json` kabul eder; PowerShell'de `@file` pointer'larini quote et
4. richer ref alanlari:
   - `sectionId`
   - `pageVersionId`
   - `pageNumber`
   - `target`

## 6 Memory usage model

### 6.1 Overview

#### 6.1.1 Overview

Secim mantigi:

1. `short` = kisa carry-forward / handoff / bir sonraki session'a devam notu
2. `durable` = tekrar okunacak karar, closeout, evidence pack veya kalici proje bilgisi
3. `sticky` = tum gelecek session'lara uygulanacak bootstrap kural
4. `resume` / `carry-forward` = devam notu
5. `project` = subject bagimsiz proje bilgisi; mumkunse somut task/sprint/session/doc ref'leriyle destekle
6. `pattern` / `howto` / `architecture` = tekrar bulunabilir bilgi; gerekirse Docman ref'i ile birlikte yaz
7. `decision` = session/sprint penceresi icindeki calisma karari
8. kalici karar veya reusable bilgi = `decision` veya `note`; operator istemedikce durable yazma

Memory kalite kontrati:

Memory, chat log'u veya kisa changelog etiketi degildir. Bir sonraki agent okudugunda olayi anlayabilecegi ve kontrol edebilecegi agent-readable evidence pack olmalidir.

Her kickoff, resume, handoff, decision, blocker ve closeout kaydi sunlari tasimalidir:

1. Istenen is veya karar/purpose
2. Calisma yuzeyi: board, kanban task, sprint, microtask, issue, feedback, review-request, discussion topic, hosted chat odasi, Docman dokumani veya dosya ref'leri
3. Ne yapildi ve mevcut durum: tamamlandi, bekliyor, bloklu, review'da, follow-up'a ayrildi
4. Kanit: validation, test, review sonucu, event seq, doc/page/version, dosya veya komut referansi
5. Acik kalan riskler ve net next action

Yazim kurallari:

1. `--task-id`, `--sprint-id`, `--issue-id`, `--feedback-id`, `--source-ref`, `--next-read-ref`, `--validation-state`, `--next-action` alanlarini kullan; sadece serbest metne guvenme.
2. `PR1`, `PR2`, `cleanup`, `done`, `merge-ready` gibi lokal etiketleri tek basina kullanma; her etiketi davranis ve artifact olarak ac.
3. Transcript'i memory'ye kopyalama. Memory, transcript'in hangi bolumlerinin okunacagini ve ne sonuc ciktigini gosterir.
4. Planning truth Projectman'dedir; memory Projectman kaydini referanslar, yerine gecmez.
5. Canonical uzun icerik Docman'dedir; memory Docman ref'i verir, dokumani kopyalamaz.

Session-state ve automation siniri:

1. `.aops/agentspace/session-state/**` JSON dosyalari runtime hint/cursor bilgisidir; memory truth degildir.
2. `aops start` ve `aops view dashboard` bu dosyalardan read-only `sessionStateNudges` uretebilir; komutlar memory mutate etmez.
3. Nudge gorulurse agent karar verir: anlamli progress varsa `mem checkpoint`, operator summary/closeout isterse `mem summary`; aksi halde yazmaz.

Owner kural:

1. `memory` neyin okunacagini ve ne sonuc ciktigini soyler
2. `docman` canonical icerigi verir
3. `projectman` execution state truth'unu verir

## 7 Resume pack nasil calisir

### 7.1 Overview

#### 7.1.1 Overview

`agentspace.memory-item.build-resume-pack` curated bir toplu cikti uretir.

Oncelik sirasi:

1. sticky guidance (board-scoped: eger retrieval.tags icerisinde `board:<slug>`
   tag'i varsa, yalnizca o board'un `board-bootstrap` tag'li sticky kayitlari
   dahil edilir; genel project-level sticky rule'lar hala gecer)
2. generated synopsis
3. exact subject memory
4. lineage memory
5. project-level rule
6. generic project memory

Default amac:

1. her seyi okumadan devam edebilmek
2. doc/resource okumayi sadece gerekirse tetiklemek

`mem brief` bu resume pack mantigini session kickoff icin daha kucuk bir okuma paketine indirir. Brief sonucu read-only'dir; recommendedNextReads ve memoryGaps alanlari agent'in hangi Docman/PM/ChatV3 ref'lerini okuyacagini ve bir sonraki memory aksiyonunun checkpoint mi summary mi oldugunu gosterir.

## 8 Ne zaman Agentspace kullan

### 8.1 Overview

#### 8.1.1 Overview

1. baska agent daha sonra devam edecekse
2. PM artifact disi resumable calisma varsa
3. proje seviyesinde synopsis lazimsa
4. kalici guidance lazimsa

## 9 Ne zaman Agentspace kullanma

### 9.1 Overview

#### 9.1.1 Overview

1. board/sprint/utask state'i icin
2. kanban workflow icin
3. issue/feedback lifecycle icin

Bunlar `projectman` concern'udur.

## 10 Coordination semantics

### 10.1 Overview

#### 10.1.1 Overview

`discuss` (karar/konsensus) ve hosted chat odalari (koordinasyon/uyandirma) icin operasyonel disiplin; review tarafi Projectman'dedir. Skiller bu bolumlere referans verir; deep mechanics burada.

### 10.2 Channels and listeners

#### 10.2.1 Overview

Triad'da iki canonical write/read kanal cifti var: hosted chat odalari (koordinasyon/uyandirma) ve `discuss` (karar ritueli). `chat message send` ile `chat listen`/`chat catchup` kardes yuzeyler; `discuss turn` ile `discuss wait` kardes yuzeyler. Bir read yuzeyinde wakeup almak, digerinde almayi garanti etmez: hosted chat odasina yazilan bir mesaj `discuss wait`'i uyandirmaz, discuss turn da `chat listen`'i uyandirmaz. Misaligned writer/listener pair'leri sessiz koordinasyon trafigi kaybinin en yaygin sebebi. (Repo-first `collab event`/`collab chat`/`collab wait` kanal makinesi emekliye ayrildi.)

| Write surface | Wakes `chat listen` | Wakes `discuss wait` |
|---------------|---------------------|----------------------|
| `chat message send` | yes | no |
| `discuss turn` | no | yes |
| `pm review-request create/result` | no (RR ref'ini odaya `chat message send` ile duyur) | no |

Routing kurallari:

1. Karar/stance discuss topic'inde `discuss turn`/`conclude` ile yazilir; karsi
   agent'i uyandirmak icin ayni isi bagli hosted chat odasina kisa bir `chat
   message send` ile duyur. Discuss transcript kanonik kayit, oda mesaji
   uyandirma sinyali.
2. Review/issue/handoff Projectman'de yasar: `pm review-request create/result`,
   `pm issue create`, `pm handoff`. RR/RRR'i dosyaladiktan sonra ref'i bagli
   odaya `chat message send` ile duyur ki review akisi listener'a gorunur olsun.
3. Hosted chat odalari multi-agent koordinasyon/uyandirmanin tek listener
   yuzeyidir. `chat listen` agent-wide poll'dur; `chat inbox` peek; `chat
   catchup --apply` unread'i okur ve cursor'u ilerletir.
4. Hosted chat ile repo-first dinleyiciyi karistirma: bir hosted oda mesajini
   `discuss wait` ile yakalamaya calismak (veya tersi) missed-wakeup uretir.
   Karar dongusu icin `discuss wait`, koordinasyon icin `chat listen` kullan.
5. Oda uyeleri (`to`/members) ve `agentId` routing primitive'idir; mesaj
   gonderirken dogru odaya/uyeye hedefle.

### 10.3 Choosing event vs chat

#### 10.3.1 Overview

Durable kayit triad'da iki yerde yasar: kararlar/stance `discuss` topic'inde, review/issue/handoff Projectman'de. Bu durable kayitlari bir kez yazip her seferinde kisa bir `chat message send` ile bagli odaya duyur ki peer uyandirma sinyalini alsin. Yani: karar -> `discuss turn`/`conclude`; review sonucu -> `pm review-request result`; material bulgu -> `pm issue create`; handoff -> `pm handoff` veya bagli oda mesaji; her birini chat ping ile esle.

Sadece chat: transient noise (kisa ack/nudge/clarification) ve koordinasyon mesajlari. Session truth'unu degistiren bir karar yalniz oda mesajinda kalmamali; discuss transcript'ine veya PM kaydina dusurulmeli ki durable ledger substance'i korusun.

Kararsizsan: durable kaydi yaz (karar ise discuss, review/issue ise PM), sonra chat ile duyur. Yalniz-chat substantive coordination anti-pattern'i icin Anti-patterns appendix'teki messaging bolumune bak.

### 10.4 Loop discipline ve exit codes

#### 10.4.1 Overview

Long wait'lar host shell foreground'unu operator-facing session'da kilitlemesin. Background log kullan loop'lar agent turn'u disinda persist etmesi gerekiyorsa.

Exit code matrisi `discuss wait` (karar dongusu) ve `chat listen` (koordinasyon) icindir:

`discuss wait`:

| Exit code | Anlami | Aksiyon |
|-----------|--------|---------|
| `0` | requested agent siradadir, yazabilir | structured `status`/`nextTurn` oku, **tek** turn yaz |
| `20` | operator-addressed open question / blocker | dur ve raporla |
| `21` | ready-to-conclude / concluding / concluded / abandoned | dur ve raporla |
| `22` | timeout | raporla, operator stop demediyse devam et |

`chat listen`:

| Exit code | Anlami | Aksiyon |
|-----------|--------|---------|
| `0` | unread mesaj var | `chat catchup`/`chat inbox` ile oku, **tek** response/aksiyon yaz |
| `21` | room-scoped terminal (room archived veya membership ended) | room-scoped loop'u durdur |
| `22` | timeout | raporla, operator stop demediyse devam et |

Self-wakeup notu: `chat listen` `0` donduruyor ama listener'in read cursor'undan (`lastSeenSeq`) yuksek yeni mesaj yoksa, wakeup buyuk olasilikla **kendi yazdigin mesajdan** geldi (listener herhangi bir oda append'inde tetiklenir, kendi yazimin dahil). `chat catchup --apply` veya `chat mark-read --apply` ile cursor'u ilerlet, sonra listener'i re-arm et. Counterpart traffic'i olarak yorumlama.

### 10.5 Mid-session mutual-idle escape

#### 10.5.1 Overview

Iki agent ardisik bounded listener cycle'inda sadece self-echo, already-handled message, veya counterpart work olmadan timeout uretiyorsa: stale listener cycle'i bitir ve bagli hosted chat odasina `still-waiting-on:<agent>` ile baslayan kisa bir koordinasyon mesaji yaz. Bu mutual idle'i kirar; agent'i durdurmaz, session'i kapatmaz, gelecekteki listening'i bitirmez.

Kurallar:

1. Iki stale cycle'dan sonra her iki agent'i da listener'da tutma.
2. `still-waiting-on:` mesaji beklenen agent'i, beklenen artifact'i (orn. review-result, karar turn'u), ve primary agent'in operator-approved timeout ile devam edip etmeyecegini named.
3. `still-waiting-on:` yazdiktan sonra `chat listen` re-arm et veya `chat catchup`/`chat inbox` ile peer'in idle olduguna karar ver.

### 10.6 Directive ACK obligation

#### 10.6.1 Overview

Collab'in `operator-directive` event'i ve `collab ack-directive` makinesi emekliye ayrildi. Triad'da operator niyeti iki yoldan gelir ve karsiliginda explicit acknowledge beklenir:

1. Bagli hosted chat odasina yazilan koordinasyon mesaji: ilgili agent mesaji okur, istenen aksiyonu yapar (veya explicit refuse karari verir), sonucu odaya kisa bir `chat message send`/reply ile yazar ve `chat catchup --apply` ile read cursor'unu ilerletir (read = ack).
2. `pm review-request`: agent RR'i ele alir ve `pm review-request result` (RRR) ile sonucu yazar; bu, review niyeti icin canonical acknowledge'dir.

Response sequence:

1. Mesaji/RR'i oku.
2. Istenen aksiyonu yap, ya da explicit refuse karari ver.
3. Sonucu yaz: oda mesaji veya `pm review-request result`.
4. Read cursor'u ilerlet (`chat catchup --apply`) ki ayni isi tekrar "pending" gormeyesin.

Not: hosted `chat listen`/`chat inbox` peek'tir; cursor ilerletmez. Bir mesaji "handled" saymak icin `chat catchup --apply` veya `chat mark-read --apply` gerekir.

### 10.7 Review-request reply pairing

#### 10.7.1 Overview

Review icin canonical surface Projectman'dir: `pm review-request` (RR) ister, `pm review-request result` (RRR) sonuclar. RR/RRR review'in kanonik kaydidir; re-review yeni bir child RR'dir (`pm review-request create --parent <rr-id>`). (Collab'in `review-result` event'i ve `collab report --target docman` makinesi emekliye ayrildi.)

Projectman read yuzeyi kendi basina chat listener'i wake etmez. Her zaman RR/RRR'i bagli hosted chat odasina kisa bir `chat message send` ile esle: RR id, bir satir gist, ve varsa ask-back. Reviewer da sonucu yazdiktan sonra RRR ref'ini odaya duyurur.

```bash
# Reviewer: sonucu Projectman'a yaz
aops pm review-request result --id <rr-id> \
  --decision <approve|request-changes|comment> \
  --content '@./review.md' --apply --json

# Reviewer: sonucu bagli odaya duyurarak peer'i uyandir
aops chat message send --room-id <room-id> --from <reviewer> \
  --text "Review filed: RR <rr-id>, RRR decision <...>. TL;DR: ..." \
  --apply --json
```

Karar ritueli ile review'i bagla: review'in dayandigi discuss topic'i hem odaya `agentspace.discussion-topic` binding'i ile, hem de RR aciklamasinda explicit ref ile baglanmali ki canonical context sonradan da survive etsin. Operator review'i yalniz oda mesajiyla yonlendirdiyse oda cevabi tek basina kabul edilir; operator sonradan bunu bir RR'a promote edebilir.

### 10.8 Rapid multi-slice listening

#### 10.8.1 Overview

Hizli hareket eden review session'lar icin her listener wakeup'i tek-kullanimlik signal olarak ele al. Her handled review-request (RR), review-result (RRR), veya oda mesajindan sonra hemen `chat listen`'i re-arm et veya `chat catchup`/`chat inbox` ile odanin idle olduguna karar ver. RR/RRR'i her zaman bagli odaya `chat message send` ile esle ki cross-slice trafik listener'a gorunur olsun.

Kurallar:

1. Stale single-shot background listener'a baska bir slice icin wakeup veya timeout urettikten sonra guvenme.
2. Birden fazla slice hizli ilerliyorsa: kisa bounded `chat listen` loop'lari ve her handled item'dan sonra re-arm; ilerleyen RR/RRR durumunu `pm review-request list` ile takip et.

## 11 Closeout

### 11.1 Closeout peer handoff

#### 11.1.1 Overview

Operator-onayli oda/board kapanisindan once, baska bir participant hala live veya sonradan review yapacaksa primary agent explicit peer handoff yazar. Handoff Projectman'de (`pm handoff`) ve/veya bagli hosted chat odasina yazilir.

```bash
aops pm handoff write --subject <board|sprint|task> --id <id> \
  --kind handoff \
  --content "<commits; verification; open issues/feedback; next listener or done state>" \
  --apply --json
```

Kurallar:

1. Handoff: commit veya canonical hosted version, validation run, open issue/feedback, ve peer'in keep listening / specific RR review / done state'inden hangisinde olacagini named.
2. Handoff'u bagli odaya kisa bir `chat message send` ile esle ki hem PM kaydi hem oda listener'i closeout state'i gorsun.

### 11.2 Operator-approved work-end closeout sequence

#### 11.2.1 Overview

Bu sequence sadece operator acikca closeout isterse veya onaylarsa ve tracked work window genuinely sona eriyorsa kullan. Mid-session checkpoint, active review slice, carry-forward, veya normal turn sonu icin calistirma; bu durumlarda resume/handoff/checkpoint memory yaz ve PM window'u / hosted oda'yi acik birak.

Required checkpoint'lar:

1. Implementation artifact'i finalize et: local source change'leri commit et veya canonical hosted version'i publish et, sonra agreed validation'i calistir.
2. Peer handoff'u ve paired oda mesajini yaz (yukaridaki Closeout peer handoff bolumu).
3. Active PM subject icin durable planning memory yaz veya refresh et eger sonraki agent task veya sprint'ten devam edecekse. Operator-approved closeout yapiliyorsa, `pm board closeout` tarafindan yazilan closeout memory board-level closeout memory gereksinimini karsilar.
4. Oda/board kapanisindan once Projectman state'i transition et. Active sprint completed isaretlenecekse `aops pm sprint set-status --id <sprint-id> --status completed --apply --json` calistir veya sprint status change'in neden atlandigini kaydet. Sonra, yalniz operator-approved closeout icinde board closeout:

   ```bash
   aops pm board closeout --board <board-slug> \
     --content "<work-end summary; validation; next action>" \
     --apply --json
   ```

   Bu komut atomic board-window close: closeout memory yazar, active kanban task'i Done'a (progress=100) tasir, active board ref'leri temizler.
5. Projectman state transition edildikten sonra, yalniz operator-approved closeout icinde bagli hosted chat odasini kapat/arsivle (`chat room update --status archived` veya operator'un tercih ettigi oda kapanisi). Closeout ozeti odaya son bir mesaj olarak yazilir.
6. Post-closeout memory'i (asagidaki Post-collab memory closeout bolumu) yalniz operator-approved closeout icinde yaz: kullanilan discuss topic uid/slug'lari, material PM record'lari (RR/RRR, issue), ve residual carry-forward'i link.

Kurallar:

1. Hosted oda mesajlari ve discuss komutlari Projectman state'i mutate etmez; task, sprint, board, issue, feedback lifecycle change'leri icin explicit `aops pm` komutlari kullan.
2. Board kickoff veya active board window kullanildiysa `pm board closeout` yalniz operator closeout istediginde/onayladiginda calisir; normal checkpoint'te atlama degil, acik window'u koruma davranisidir.

### 11.3 Closeout memory (post-session)

#### 11.3.1 Overview

Operator-approved oda/board kapanisindan sonra durable takeaway'i ve kullanilan discuss topic / resolved PM issue'lara link'i yakalayan bir memory record yaz. Hosted oda arsivlendiginde mesaj akisi archaeology'e doner; memory bridge'dir gelecek agent'lar durable decision'dan resume etmesi icin. Normal checkpoint icin `--mode resume` veya PM handoff kullan; `--mode closeout` kullanma.

Closeout memory tek paragraf log degildir. Agent-readable evidence pack olmalidir:

1. Hangi operator istegi kapatildi ve hangi board/task/sprint altinda calisildi
2. Hangi discuss topic(ler)i ve hangi hosted oda kullanildi; topic slug/uid ve onemli karar turn'leri
3. Hangi davranis veya artifact'lar degisti; `PR1/PR2` gibi etiketler acik kapsamla yazilir
4. Hangi PM issue'lar cozuldu veya follow-up'a ayrildi; issue id ve durumlari yazilir
5. Validation ve reviewer kaniti: test komutlari, RR/RRR id ve decision, pass/fail durumu
6. Kalan riskler, follow-up slice'lar ve net next action

```bash
aops mem write \
  --mode closeout \
  --subject project \
  --durability durable \
  --kind decision \
  --content "<request + PM surface + outcome + evidence + issue status + next action>" \
  --task-id <kanban-task-id> \
  --sprint-id <sprint-id> \
  --issue-id <material-issue-id> \
  --source-ref '{"type":"agentspace.discussion-topic","id":"<topic-uid>","title":"<topic-slug>"}' \
  --source-ref '{"type":"projectman.review-request","id":"<rr-id>","title":"<rr-scope>"}' \
  --validation-state "PASS: <tests>; review RR/RRR <id/decision>; closeout" \
  --next-action "<explicit carry-forward or none>" \
  --purpose carry-forward \
  --apply --json
```

Kurallar:

1. Kullanilan discuss topic uid/slug'unu ve material PM RR/issue id'lerini `--source-ref`/`--issue-id` ile referansla; gelecek agent'lar oda akisi yerine durable decision'dan resume edebilsin.
2. Material PM issue id'lerini link'le; CLI tekil `--issue-id` yuzeyinde tekrarli issue seti gerekiyorsa content icinde `Issue status` bolumuyle tum id/durumlari acik yaz.
3. Canonical operator-approved post-closeout summary icin `--mode closeout` + `--durability durable` kullan. `--durability sticky` sadece tum gelecek session'lara uygulanmasi gereken kurallar icin; session-specific takeaway'ler degil.
4. Closeout memory'i odaya yazilan operator-approved closeout mesajiyla esle; closeout mesaji memory id'sini, memory ise topic uid'sini named olarak tasir. Iki yonlu link kasitli.
5. `aops mem write/update --json`, `diagnostics.memoryQuality` uyarisi dondururse kaydi kapatmadan once zenginlestir.

## 12 PM integration

### 12.1 Promoting review items to Projectman issues

#### 12.1.1 Overview

`pm review-request result` (RRR) review'in canonical kaydidir; review icindeki actionable item'lar RRR'den ayri, kendi lifecycle'inda track edilmeli. RRR dosyalandiktan sonra her material item'i bir `projectman.issue`'a promote et ki progress oda/session lifecycle'i disinda survive etsin ve review timeline'dan bagimsiz calisilabilsin. (Sugar: `pm issue create --source review --review-request <rr-id>`.)

```bash
aops pm issue create \
  --title "<review-scope> §<n>: <one-line summary>" \
  --description "<detail referencing RR <rr-id> / RRR decision>" \
  --status open --severity <info|low|medium|high> --source review \
  --review-request <rr-id> \
  --tag review-<scope> --tag <area> \
  --apply --json
```

Kurallar:

1. Her issue body source RR/RRR'i (`--review-request <rr-id>`) ve review scope'u referansla; canonical context'e link sonradan da survive etsin.
2. Ayni review'den gelen her issue'yu `review-<scope>` shared tag ile tag'le; sonradan listing filterable olsun.
3. Issue'lar dosyalandiktan sonra yeni issue id'lerini ve review scope'unu named tek bir kisa oda mesaji at (`chat message send`). Implementing agent ve operator full RRR'i tekrar okumadan issue listesini alir.
4. Issue resolution `pm issue update --status` veya referenced PR work olarak land eder; review timeline her issue progress'ini mirror etmek zorunda degil. Shared `review-<scope>` tag'i + `pm issue list` canonical progress view.
5. Bazi CLI versiyonlarinda `pm issue create --preview` record persist edebilir; preview'i dry-run olarak kullanmak yerine final komutu construct edip dogrudan `--apply` ile calistir.

Implementing ve reviewing agent review-derived issue set'inin closed olduguna karar verirse, operator-onayli oda/board closeout calistirilabilir. Board closeout / oda kapanisi oncesi tagli PM issue'lar hala open ve explicit carry-forward edilmediyse, kapanis kaydini atlamak lifecycle drift'i yapar; once issue'lari kapat veya carry-forward et.

## 13 Anti-patterns appendix

### 13.1 Overview

#### 13.1.1 Overview

Aileler halinde grupland:

### 13.2 Messaging anti-patterns

#### 13.2.1 Overview

1. Durable bir kaydi (karar -> discuss; review/issue -> PM) yazip bagli hosted chat odasina paired bir uyandirma mesaji ile eslememek; recipient listener'i sinyali kacirir.
2. Substantive coordination'u (review pushback, decision summary, handoff signal, status update) yalniz oda mesajinda tutmak, paired durable kayit olmadan. Oda mesaji uyandirma sinyali; karar discuss'ta, review/issue PM'de kanonik kayit olmali.

Chat anti-pattern'leri:

1. Hosted `aops chat` odasina mesaj yazip repo-first bir dinleyiciyle peer uyandirmayi beklemek (veya tersi). Koordinasyon tamamen hosted chat odalarinda olmali; karar dongusu icin `discuss wait` kullan. Hybrid pattern missed-wakeup uretir.
2. `chat inbox` veya `chat listen` sonucunu ACK/read cursor advance sanmak. Bunlar peek'tir; cursor advance icin `chat catchup --apply` veya `chat mark-read --apply` kullan.

### 13.3 Boundary anti-patterns

#### 13.3.1 Overview

3. Chat/discuss text'inden Projectman veya Docman'i implicit mutate etmek.
4. Operator-onayi olmadan koordineli isi (board/oda) kapatmak, ya da active bound discuss topic conclude edilmeden / open tagli PM issue carry-forward edilmeden board/oda closeout calistirmak.
5. Derived/read-only projection dosyalarini (eski collab `timeline.md`/`channel.md`/`state.md` gibi) writable truth olarak ele almak.
6. Stop condition'i serbest metinden cikarmak (structured `lifecycleState`/`exitCode` yerine).

Chat boundary ekleri:

1. Yeni hosted chat'i legacy `agentspace.codex-chat-*` bridge tool'lari ile
   belgelemek veya test etmek.
2. Room purpose, PM task, repo URL, Docman kaynagi, reusable skill/resource,
   micro `agents.md` veya discussion topic ref'lerini serbest metin mesajinda
   gommek; bu bilgiler `ChatRoomBinding` olmalidir.
3. Agent-wide hosted `chat listen` icinde archived/left room'u terminal loop
   sinyali saymak. Exit `21`, yalniz room-scoped listen icindir.

### 13.4 Listener discipline anti-patterns

#### 13.4.1 Overview

7. Wait/listen exit'i 0 dondurdukten sonra **stale** single-shot background listener'a yeni traffic icin guvenmek.
8. Hosted oda mesajini handled saymadan once read cursor'u ilerletmemek; `chat listen`/`chat inbox` peek'tir, `chat catchup --apply`/`chat mark-read --apply` ile cursor ilerletilir, sonra listener re-arm edilir.
9. `still-waiting-on:` yazdiktan sonra permanent stop olarak yorumlamak yerine listener'i re-arm etmek.

### 13.5 Directive ve review anti-patterns

#### 13.5.1 Overview

10. Bir oda mesajini/RR'i handle ettikten sonra read cursor'u ilerletmemek (`chat catchup --apply`) — pending gibi gorunen mesaj her `chat listen`'i no-new-traffic noisy wakeup'a cevirir.
11. Counterpart'i yalniz primary agent'in finished plan'ini review etmeye cagirmak, operator deliberation istediginde. Once independent research, sonra plan compare ve converge (discuss topic'inde iki-agent turn protokolu).
12. Bounded `discuss wait`/`chat listen` timeout etmeden ve operator'a "plan o response olmadan ilerliyor" denmeden counterpart'in karar turn'unu / review'ini okumadan architectural plan'i finalize etmek.

### 13.6 Lifecycle anti-patterns

#### 13.6.1 Overview

13. Kullanilan discuss topic uid'sine ve material decision/issue'lara reference yapan memory record olmadan koordineli isi (oda/board) kapatmak. Oda mesaj akisi tek basina archaeology; durable summary olmadan resume edilemez.
14. Review item'lari yalniz review timeline'inda track etmek; actionable item'lar `pm issue`'da da olmali ki progress review/oda lifecycle'i disinda survive etsin.
15. Operator closeout istemeden `pm board closeout` veya hosted oda kapanisi calistirmak. Operator closeout istediyse bu kapanis kaydini atlamak da lifecycle drift'i yapar.
16. Discuss/koordinasyon plan veya slice artifact'ini default olarak repo `docs/**`, `.codex-tmp/**`, ya da non-AOPS folder'a tasimak. Discuss output, hosted oda mesaji/binding, ya da explicit Agentspace artifact/resource ref olarak tut, operator dis-doc istemediyse.

### 13.7 Raporlama anti-patterns

#### 13.7.1 Overview

17. Raw chat transcript'i Docman raporlarina yazmak (summary/ref section'lari yerine).
18. Live participant varken peer handoff event ve paired chat ping olmadan session kapatmak.

## 14 Troubleshooting

### 14.1 Listener her loop'ta `work-ready` donuyor ama yeni mesaj yok

#### 14.1.1 Overview

Probable cause: hosted oda read cursor'u ilerletilmemis unread mesaj. `chat listen`/`chat inbox` peek'tir; advance edilmemis unread her loop'ta `0` (unread) dondurur.

Cozum: mesaji oku ve cursor'u ilerlet — `chat catchup --apply` veya `chat mark-read --apply`, sonra listener re-arm (Directive ACK obligation bolumu).

### 14.2 `wakeSource=chat` ama yeni mesaj gormiyorum

#### 14.2.1 Overview

Probable cause: kendi yaziman self-wakeup. `chat listen` kendi oda append'inde de tetiklenir.

Cozum: read cursor'u (`lastSeenSeq`) kontrol et; gerekirse `chat catchup --apply` veya `chat mark-read --apply` ile unread'i okuyup cursor'u ilerlet, sonra listener re-arm (Loop discipline ve exit codes bolumundeki self-wakeup notu).

### 14.3 Iki agent da listener'da, hicbir traffic gelmiyor

#### 14.3.1 Overview

Probable cause: mutual idle. Her ikisi de oburunu bekliyor.

Cozum: 2 stale cycle sonra `still-waiting-on:<agent>` status event yaz, listener re-arm et â€” Â§8.4.

### 14.4 Board/oda closeout block ediyor

#### 14.4.1 Overview

Probable cause: operator-onayli board/oda closeout'u, hala open olan in-session PM issue'lar (carry-forward edilmedi), tamamlanmamis peer handoff (live participant var), ya da bagli active discuss topic'in henuz conclude edilmemis olmasi yuzunden atlanmamali.

Cozum:
1. `pm issue list` ile review/oda'ya tagli open issue'lari kontrol et — close veya carry-forward et.
2. `discuss list` ile ilgili active discuss topic'leri kontrol et — gerekiyorsa conclude et.
3. Closeout peer handoff bolumundeki peer handoff'u yaz ve bagli odaya duyur.
4. Sonra Operator-approved work-end closeout sequence'i takip et (`pm board closeout` + oda arsivleme).

### 14.5 Skill veya user guide'da arama

#### 14.5.1 Overview

Tum dosyayi linear okumak yerine docman tools'unu kullan:

```bash
aops doc scope search --project-slug aops --q "<keyword>" --local --json
aops doc search --document-version-id <docver-id> --q "<keyword>" --local --json
aops doc outline get --document-version-id <docver-id> --titles-only --depth 0 --json
aops view doc-page agentspace-user-guide#<section-slug> --max-bytes 6000
```

Pointer: `doc scope search` broad discovery icindir; hedef dokuman biliniyorsa `doc search --document-version-id` ile daralt, sonra tam section body icin `view doc-page` kullan. `aops docman ... --slug` komutu yoktur.

### 14.6 Daha fazla detay

#### 14.6.1 Overview

Her komut icin authoritative source `aops <subcommand> --help`'tir. Skill text'i pattern ve workflow guide'idir; flag/exit-code/argument detayi her zaman `--help`'den dogrulan.
