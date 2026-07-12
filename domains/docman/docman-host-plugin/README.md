# @aopslab/domain-host-plugin-docman

Docman domainini `xf-host` uyumlu host uygulamalarina plugin olarak baglamak icin kullanilir.

## Export

- `createDocmanPlugin(options?)`

## Host config ornegi

```json
{
  "plugins": [
    {
      "domain": "docman",
      "enabled": true,
      "module": "@aopslab/domain-host-plugin-docman",
      "factory": "createDocmanPlugin",
      "options": {
        "defaultScopeId": "00000000-0000-4000-8000-000000000000"
      }
    }
  ]
}
```

## Build

```bash
npx nx build docman-host-plugin
```
