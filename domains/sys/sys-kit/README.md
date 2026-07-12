# sys-kit

sys-kit kiti, domain servis ve repository'lerini hexagonal prensiplerle uygulamalara baglayan ince bir kopru saglar.
Bu scaffold, `inventory-kit` desenini takip eder ve domain'e ozel kodlari
`//==> custom ... <==//` bloklarinda izole eder.

## Hizli Kullanim (env ile)

```ts
import { createSysKitWithEnv, getSysKitEnvConfig } from '@aopslab/domain-kit-sys'

const { kit } = createSysKitWithEnv({
  envConfig: getSysKitEnvConfig(),
  baseContext: {
    tenantId: 'tenant-1',
    locale: 'tr',
    fallbackLocale: 'en',
    logger,
  },
})

const service = await kit.getSampleService()
```

## Env Degiskenleri

- `TENANT_ID`
- `LOG_LEVEL`
- `SYS_REPO_URL`
- `SAMPLE_REPO_URL`

## Sundugu Yuzey

Services:
- `sampleService`

Repositories:
- `sampleRepository`

## Notlar

- `tenantId` context icinde zorunludur.
- Cache key varsayilan olarak `locale|fallbackLocale` uzerinden hesaplanir.
- Operation contract + DCM + host projection dosyalari `src/operations` altindadir.
