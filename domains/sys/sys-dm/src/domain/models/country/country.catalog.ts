import { type IbmCountry, type IbmCountryInsert } from './IbmCountry.js'
import { countryZodSchema } from './zod.schema.js'

export type CountryCatalogQuery = {
  query?: string
  excludeIso2Codes?: readonly string[]
  limit?: number
  suggestedFirst?: boolean
}

// Domain-owned reference seed for shared country catalog.
// App shells should consume hosted sys.country operations instead of keeping local copies.
const COUNTRY_CATALOG_RAW = [
  {"iso2Code":"AD","name":"Andorra","phoneCode":"376"},
  {"iso2Code":"AE","name":"United Arab Emirates","phoneCode":"971"},
  {"iso2Code":"AF","name":"Afghanistan","phoneCode":"93"},
  {"iso2Code":"AG","name":"Antigua and Barbuda","phoneCode":"1-268"},
  {"iso2Code":"AI","name":"Anguilla","phoneCode":"1-264"},
  {"iso2Code":"AL","name":"Albania","phoneCode":"355"},
  {"iso2Code":"AM","name":"Armenia","phoneCode":"374"},
  {"iso2Code":"AO","name":"Angola","phoneCode":"244"},
  {"iso2Code":"AQ","name":"Antarctica","phoneCode":"672"},
  {"iso2Code":"AR","name":"Argentina","phoneCode":"54"},
  {"iso2Code":"AS","name":"American Samoa","phoneCode":"1-684"},
  {"iso2Code":"AT","name":"Austria","phoneCode":"43"},
  {"iso2Code":"AU","name":"Australia","phoneCode":"61","suggested":true},
  {"iso2Code":"AW","name":"Aruba","phoneCode":"297"},
  {"iso2Code":"AX","name":"Alland Islands","phoneCode":"358"},
  {"iso2Code":"AZ","name":"Azerbaijan","phoneCode":"994"},
  {"iso2Code":"BA","name":"Bosnia and Herzegovina","phoneCode":"387"},
  {"iso2Code":"BB","name":"Barbados","phoneCode":"1-246"},
  {"iso2Code":"BD","name":"Bangladesh","phoneCode":"880"},
  {"iso2Code":"BE","name":"Belgium","phoneCode":"32"},
  {"iso2Code":"BF","name":"Burkina Faso","phoneCode":"226"},
  {"iso2Code":"BG","name":"Bulgaria","phoneCode":"359"},
  {"iso2Code":"BH","name":"Bahrain","phoneCode":"973"},
  {"iso2Code":"BI","name":"Burundi","phoneCode":"257"},
  {"iso2Code":"BJ","name":"Benin","phoneCode":"229"},
  {"iso2Code":"BL","name":"Saint Barthelemy","phoneCode":"590"},
  {"iso2Code":"BM","name":"Bermuda","phoneCode":"1-441"},
  {"iso2Code":"BN","name":"Brunei Darussalam","phoneCode":"673"},
  {"iso2Code":"BO","name":"Bolivia","phoneCode":"591"},
  {"iso2Code":"BR","name":"Brazil","phoneCode":"55"},
  {"iso2Code":"BS","name":"Bahamas","phoneCode":"1-242"},
  {"iso2Code":"BT","name":"Bhutan","phoneCode":"975"},
  {"iso2Code":"BV","name":"Bouvet Island","phoneCode":"47"},
  {"iso2Code":"BW","name":"Botswana","phoneCode":"267"},
  {"iso2Code":"BY","name":"Belarus","phoneCode":"375"},
  {"iso2Code":"BZ","name":"Belize","phoneCode":"501"},
  {"iso2Code":"CA","name":"Canada","phoneCode":"1","suggested":true},
  {"iso2Code":"CC","name":"Cocos (Keeling) Islands","phoneCode":"61"},
  {"iso2Code":"CD","name":"Congo, Democratic Republic of the","phoneCode":"243"},
  {"iso2Code":"CF","name":"Central African Republic","phoneCode":"236"},
  {"iso2Code":"CG","name":"Congo, Republic of the","phoneCode":"242"},
  {"iso2Code":"CH","name":"Switzerland","phoneCode":"41"},
  {"iso2Code":"CI","name":"Cote d'Ivoire","phoneCode":"225"},
  {"iso2Code":"CK","name":"Cook Islands","phoneCode":"682"},
  {"iso2Code":"CL","name":"Chile","phoneCode":"56"},
  {"iso2Code":"CM","name":"Cameroon","phoneCode":"237"},
  {"iso2Code":"CN","name":"China","phoneCode":"86"},
  {"iso2Code":"CO","name":"Colombia","phoneCode":"57"},
  {"iso2Code":"CR","name":"Costa Rica","phoneCode":"506"},
  {"iso2Code":"CU","name":"Cuba","phoneCode":"53"},
  {"iso2Code":"CV","name":"Cape Verde","phoneCode":"238"},
  {"iso2Code":"CW","name":"Curacao","phoneCode":"599"},
  {"iso2Code":"CX","name":"Christmas Island","phoneCode":"61"},
  {"iso2Code":"CY","name":"Cyprus","phoneCode":"357"},
  {"iso2Code":"CZ","name":"Czech Republic","phoneCode":"420"},
  {"iso2Code":"DE","name":"Germany","phoneCode":"49","suggested":true},
  {"iso2Code":"DJ","name":"Djibouti","phoneCode":"253"},
  {"iso2Code":"DK","name":"Denmark","phoneCode":"45"},
  {"iso2Code":"DM","name":"Dominica","phoneCode":"1-767"},
  {"iso2Code":"DO","name":"Dominican Republic","phoneCode":"1-809"},
  {"iso2Code":"DZ","name":"Algeria","phoneCode":"213"},
  {"iso2Code":"EC","name":"Ecuador","phoneCode":"593"},
  {"iso2Code":"EE","name":"Estonia","phoneCode":"372"},
  {"iso2Code":"EG","name":"Egypt","phoneCode":"20"},
  {"iso2Code":"EH","name":"Western Sahara","phoneCode":"212"},
  {"iso2Code":"ER","name":"Eritrea","phoneCode":"291"},
  {"iso2Code":"ES","name":"Spain","phoneCode":"34"},
  {"iso2Code":"ET","name":"Ethiopia","phoneCode":"251"},
  {"iso2Code":"FI","name":"Finland","phoneCode":"358"},
  {"iso2Code":"FJ","name":"Fiji","phoneCode":"679"},
  {"iso2Code":"FK","name":"Falkland Islands (Malvinas)","phoneCode":"500"},
  {"iso2Code":"FM","name":"Micronesia, Federated States of","phoneCode":"691"},
  {"iso2Code":"FO","name":"Faroe Islands","phoneCode":"298"},
  {"iso2Code":"FR","name":"France","phoneCode":"33","suggested":true},
  {"iso2Code":"GA","name":"Gabon","phoneCode":"241"},
  {"iso2Code":"GB","name":"United Kingdom","phoneCode":"44","suggested":true},
  {"iso2Code":"GD","name":"Grenada","phoneCode":"1-473"},
  {"iso2Code":"GE","name":"Georgia","phoneCode":"995"},
  {"iso2Code":"GF","name":"French Guiana","phoneCode":"594"},
  {"iso2Code":"GG","name":"Guernsey","phoneCode":"44"},
  {"iso2Code":"GH","name":"Ghana","phoneCode":"233"},
  {"iso2Code":"GI","name":"Gibraltar","phoneCode":"350"},
  {"iso2Code":"GL","name":"Greenland","phoneCode":"299"},
  {"iso2Code":"GM","name":"Gambia","phoneCode":"220"},
  {"iso2Code":"GN","name":"Guinea","phoneCode":"224"},
  {"iso2Code":"GP","name":"Guadeloupe","phoneCode":"590"},
  {"iso2Code":"GQ","name":"Equatorial Guinea","phoneCode":"240"},
  {"iso2Code":"GR","name":"Greece","phoneCode":"30"},
  {"iso2Code":"GS","name":"South Georgia and the South Sandwich Islands","phoneCode":"500"},
  {"iso2Code":"GT","name":"Guatemala","phoneCode":"502"},
  {"iso2Code":"GU","name":"Guam","phoneCode":"1-671"},
  {"iso2Code":"GW","name":"Guinea-Bissau","phoneCode":"245"},
  {"iso2Code":"GY","name":"Guyana","phoneCode":"592"},
  {"iso2Code":"HK","name":"Hong Kong","phoneCode":"852"},
  {"iso2Code":"HM","name":"Heard Island and McDonald Islands","phoneCode":"672"},
  {"iso2Code":"HN","name":"Honduras","phoneCode":"504"},
  {"iso2Code":"HR","name":"Croatia","phoneCode":"385"},
  {"iso2Code":"HT","name":"Haiti","phoneCode":"509"},
  {"iso2Code":"HU","name":"Hungary","phoneCode":"36"},
  {"iso2Code":"ID","name":"Indonesia","phoneCode":"62"},
  {"iso2Code":"IE","name":"Ireland","phoneCode":"353"},
  {"iso2Code":"IL","name":"Israel","phoneCode":"972"},
  {"iso2Code":"IM","name":"Isle of Man","phoneCode":"44"},
  {"iso2Code":"IN","name":"India","phoneCode":"91"},
  {"iso2Code":"IO","name":"British Indian Ocean Territory","phoneCode":"246"},
  {"iso2Code":"IQ","name":"Iraq","phoneCode":"964"},
  {"iso2Code":"IR","name":"Iran, Islamic Republic of","phoneCode":"98"},
  {"iso2Code":"IS","name":"Iceland","phoneCode":"354"},
  {"iso2Code":"IT","name":"Italy","phoneCode":"39"},
  {"iso2Code":"JE","name":"Jersey","phoneCode":"44"},
  {"iso2Code":"JM","name":"Jamaica","phoneCode":"1-876"},
  {"iso2Code":"JO","name":"Jordan","phoneCode":"962"},
  {"iso2Code":"JP","name":"Japan","phoneCode":"81","suggested":true},
  {"iso2Code":"KE","name":"Kenya","phoneCode":"254"},
  {"iso2Code":"KG","name":"Kyrgyzstan","phoneCode":"996"},
  {"iso2Code":"KH","name":"Cambodia","phoneCode":"855"},
  {"iso2Code":"KI","name":"Kiribati","phoneCode":"686"},
  {"iso2Code":"KM","name":"Comoros","phoneCode":"269"},
  {"iso2Code":"KN","name":"Saint Kitts and Nevis","phoneCode":"1-869"},
  {"iso2Code":"KP","name":"Korea, Democratic People's Republic of","phoneCode":"850"},
  {"iso2Code":"KR","name":"Korea, Republic of","phoneCode":"82"},
  {"iso2Code":"KW","name":"Kuwait","phoneCode":"965"},
  {"iso2Code":"KY","name":"Cayman Islands","phoneCode":"1-345"},
  {"iso2Code":"KZ","name":"Kazakhstan","phoneCode":"7"},
  {"iso2Code":"LA","name":"Lao People's Democratic Republic","phoneCode":"856"},
  {"iso2Code":"LB","name":"Lebanon","phoneCode":"961"},
  {"iso2Code":"LC","name":"Saint Lucia","phoneCode":"1-758"},
  {"iso2Code":"LI","name":"Liechtenstein","phoneCode":"423"},
  {"iso2Code":"LK","name":"Sri Lanka","phoneCode":"94"},
  {"iso2Code":"LR","name":"Liberia","phoneCode":"231"},
  {"iso2Code":"LS","name":"Lesotho","phoneCode":"266"},
  {"iso2Code":"LT","name":"Lithuania","phoneCode":"370"},
  {"iso2Code":"LU","name":"Luxembourg","phoneCode":"352"},
  {"iso2Code":"LV","name":"Latvia","phoneCode":"371"},
  {"iso2Code":"LY","name":"Libya","phoneCode":"218"},
  {"iso2Code":"MA","name":"Morocco","phoneCode":"212"},
  {"iso2Code":"MC","name":"Monaco","phoneCode":"377"},
  {"iso2Code":"MD","name":"Moldova, Republic of","phoneCode":"373"},
  {"iso2Code":"ME","name":"Montenegro","phoneCode":"382"},
  {"iso2Code":"MF","name":"Saint Martin (French part)","phoneCode":"590"},
  {"iso2Code":"MG","name":"Madagascar","phoneCode":"261"},
  {"iso2Code":"MH","name":"Marshall Islands","phoneCode":"692"},
  {"iso2Code":"MK","name":"North Macedonia","phoneCode":"389"},
  {"iso2Code":"ML","name":"Mali","phoneCode":"223"},
  {"iso2Code":"MM","name":"Myanmar","phoneCode":"95"},
  {"iso2Code":"MN","name":"Mongolia","phoneCode":"976"},
  {"iso2Code":"MO","name":"Macao","phoneCode":"853"},
  {"iso2Code":"MP","name":"Northern Mariana Islands","phoneCode":"1-670"},
  {"iso2Code":"MQ","name":"Martinique","phoneCode":"596"},
  {"iso2Code":"MR","name":"Mauritania","phoneCode":"222"},
  {"iso2Code":"MS","name":"Montserrat","phoneCode":"1-664"},
  {"iso2Code":"MT","name":"Malta","phoneCode":"356"},
  {"iso2Code":"MU","name":"Mauritius","phoneCode":"230"},
  {"iso2Code":"MV","name":"Maldives","phoneCode":"960"},
  {"iso2Code":"MW","name":"Malawi","phoneCode":"265"},
  {"iso2Code":"MX","name":"Mexico","phoneCode":"52"},
  {"iso2Code":"MY","name":"Malaysia","phoneCode":"60"},
  {"iso2Code":"MZ","name":"Mozambique","phoneCode":"258"},
  {"iso2Code":"NA","name":"Namibia","phoneCode":"264"},
  {"iso2Code":"NC","name":"New Caledonia","phoneCode":"687"},
  {"iso2Code":"NE","name":"Niger","phoneCode":"227"},
  {"iso2Code":"NF","name":"Norfolk Island","phoneCode":"672"},
  {"iso2Code":"NG","name":"Nigeria","phoneCode":"234"},
  {"iso2Code":"NI","name":"Nicaragua","phoneCode":"505"},
  {"iso2Code":"NL","name":"Netherlands","phoneCode":"31","suggested":true},
  {"iso2Code":"NO","name":"Norway","phoneCode":"47"},
  {"iso2Code":"NP","name":"Nepal","phoneCode":"977"},
  {"iso2Code":"NR","name":"Nauru","phoneCode":"674"},
  {"iso2Code":"NU","name":"Niue","phoneCode":"683"},
  {"iso2Code":"NZ","name":"New Zealand","phoneCode":"64"},
  {"iso2Code":"OM","name":"Oman","phoneCode":"968"},
  {"iso2Code":"PA","name":"Panama","phoneCode":"507"},
  {"iso2Code":"PE","name":"Peru","phoneCode":"51"},
  {"iso2Code":"PF","name":"French Polynesia","phoneCode":"689"},
  {"iso2Code":"PG","name":"Papua New Guinea","phoneCode":"675"},
  {"iso2Code":"PH","name":"Philippines","phoneCode":"63"},
  {"iso2Code":"PK","name":"Pakistan","phoneCode":"92"},
  {"iso2Code":"PL","name":"Poland","phoneCode":"48"},
  {"iso2Code":"PM","name":"Saint Pierre and Miquelon","phoneCode":"508"},
  {"iso2Code":"PN","name":"Pitcairn","phoneCode":"870"},
  {"iso2Code":"PR","name":"Puerto Rico","phoneCode":"1-787"},
  {"iso2Code":"PS","name":"Palestine, State of","phoneCode":"970"},
  {"iso2Code":"PT","name":"Portugal","phoneCode":"351"},
  {"iso2Code":"PW","name":"Palau","phoneCode":"680"},
  {"iso2Code":"PY","name":"Paraguay","phoneCode":"595"},
  {"iso2Code":"QA","name":"Qatar","phoneCode":"974"},
  {"iso2Code":"RE","name":"Reunion","phoneCode":"262"},
  {"iso2Code":"RO","name":"Romania","phoneCode":"40"},
  {"iso2Code":"RS","name":"Serbia","phoneCode":"381"},
  {"iso2Code":"RU","name":"Russian Federation","phoneCode":"7"},
  {"iso2Code":"RW","name":"Rwanda","phoneCode":"250"},
  {"iso2Code":"SA","name":"Saudi Arabia","phoneCode":"966"},
  {"iso2Code":"SB","name":"Solomon Islands","phoneCode":"677"},
  {"iso2Code":"SC","name":"Seychelles","phoneCode":"248"},
  {"iso2Code":"SD","name":"Sudan","phoneCode":"249"},
  {"iso2Code":"SE","name":"Sweden","phoneCode":"46"},
  {"iso2Code":"SG","name":"Singapore","phoneCode":"65","suggested":true},
  {"iso2Code":"SH","name":"Saint Helena","phoneCode":"290"},
  {"iso2Code":"SI","name":"Slovenia","phoneCode":"386"},
  {"iso2Code":"SJ","name":"Svalbard and Jan Mayen","phoneCode":"47"},
  {"iso2Code":"SK","name":"Slovakia","phoneCode":"421"},
  {"iso2Code":"SL","name":"Sierra Leone","phoneCode":"232"},
  {"iso2Code":"SM","name":"San Marino","phoneCode":"378"},
  {"iso2Code":"SN","name":"Senegal","phoneCode":"221"},
  {"iso2Code":"SO","name":"Somalia","phoneCode":"252"},
  {"iso2Code":"SR","name":"Suriname","phoneCode":"597"},
  {"iso2Code":"SS","name":"South Sudan","phoneCode":"211"},
  {"iso2Code":"ST","name":"Sao Tome and Principe","phoneCode":"239"},
  {"iso2Code":"SV","name":"El Salvador","phoneCode":"503"},
  {"iso2Code":"SX","name":"Sint Maarten (Dutch part)","phoneCode":"1-721"},
  {"iso2Code":"SY","name":"Syrian Arab Republic","phoneCode":"963"},
  {"iso2Code":"SZ","name":"Swaziland","phoneCode":"268"},
  {"iso2Code":"TC","name":"Turks and Caicos Islands","phoneCode":"1-649"},
  {"iso2Code":"TD","name":"Chad","phoneCode":"235"},
  {"iso2Code":"TF","name":"French Southern Territories","phoneCode":"262"},
  {"iso2Code":"TG","name":"Togo","phoneCode":"228"},
  {"iso2Code":"TH","name":"Thailand","phoneCode":"66"},
  {"iso2Code":"TJ","name":"Tajikistan","phoneCode":"992"},
  {"iso2Code":"TK","name":"Tokelau","phoneCode":"690"},
  {"iso2Code":"TL","name":"Timor-Leste","phoneCode":"670"},
  {"iso2Code":"TM","name":"Turkmenistan","phoneCode":"993"},
  {"iso2Code":"TN","name":"Tunisia","phoneCode":"216"},
  {"iso2Code":"TO","name":"Tonga","phoneCode":"676"},
  {"iso2Code":"TR","name":"Turkey","phoneCode":"90","suggested":true},
  {"iso2Code":"TT","name":"Trinidad and Tobago","phoneCode":"1-868"},
  {"iso2Code":"TV","name":"Tuvalu","phoneCode":"688"},
  {"iso2Code":"TW","name":"Taiwan","phoneCode":"886"},
  {"iso2Code":"TZ","name":"United Republic of Tanzania","phoneCode":"255"},
  {"iso2Code":"UA","name":"Ukraine","phoneCode":"380"},
  {"iso2Code":"UG","name":"Uganda","phoneCode":"256"},
  {"iso2Code":"US","name":"United States","phoneCode":"1","suggested":true},
  {"iso2Code":"UY","name":"Uruguay","phoneCode":"598"},
  {"iso2Code":"UZ","name":"Uzbekistan","phoneCode":"998"},
  {"iso2Code":"VA","name":"Holy See (Vatican City State)","phoneCode":"379"},
  {"iso2Code":"VC","name":"Saint Vincent and the Grenadines","phoneCode":"1-784"},
  {"iso2Code":"VE","name":"Venezuela","phoneCode":"58"},
  {"iso2Code":"VG","name":"British Virgin Islands","phoneCode":"1-284"},
  {"iso2Code":"VI","name":"US Virgin Islands","phoneCode":"1-340"},
  {"iso2Code":"VN","name":"Vietnam","phoneCode":"84"},
  {"iso2Code":"VU","name":"Vanuatu","phoneCode":"678"},
  {"iso2Code":"WF","name":"Wallis and Futuna","phoneCode":"681"},
  {"iso2Code":"WS","name":"Samoa","phoneCode":"685"},
  {"iso2Code":"YE","name":"Yemen","phoneCode":"967"},
  {"iso2Code":"YT","name":"Mayotte","phoneCode":"262"},
  {"iso2Code":"ZA","name":"South Africa","phoneCode":"27"},
  {"iso2Code":"ZM","name":"Zambia","phoneCode":"260"},
  {"iso2Code":"ZW","name":"Zimbabwe","phoneCode":"263"},
 ] as const satisfies readonly IbmCountryInsert[]

const COUNTRY_CATALOG_TIMESTAMP = new Date('2026-03-29T00:00:00.000Z')
const COUNTRY_CATALOG_TENANT_ID = 'sys-reference'

const COUNTRY_CATALOG = COUNTRY_CATALOG_RAW.map((entry) =>
  countryZodSchema.parse({
    ...entry,
    id: `country:${entry.iso2Code.toLowerCase()}`,
    tenantId: COUNTRY_CATALOG_TENANT_ID,
    createdAt: COUNTRY_CATALOG_TIMESTAMP,
    updatedAt: COUNTRY_CATALOG_TIMESTAMP,
  }),
)

const COUNTRY_BY_ISO2 = new Map(
  COUNTRY_CATALOG.map((entry) => [entry.iso2Code.toUpperCase(), entry] as const),
)

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeIso2Code(value: unknown): string {
  return normalizeText(value).toUpperCase()
}

function normalizeCountryCodeSet(values: readonly string[] | undefined): Set<string> {
  return new Set(
    (values ?? [])
      .map((value) => normalizeIso2Code(value))
      .filter(Boolean),
  )
}

function sortCountries(entries: readonly IbmCountry[], suggestedFirst: boolean): IbmCountry[] {
  return [...entries].sort((left, right) => {
    if (suggestedFirst && Boolean(left.suggested) !== Boolean(right.suggested)) {
      return left.suggested ? -1 : 1
    }
    return left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })
  })
}

export function listCountryCatalog(query: CountryCatalogQuery = {}): IbmCountry[] {
  const normalizedQuery = normalizeText(query.query).toLowerCase()
  const excludedCodes = normalizeCountryCodeSet(query.excludeIso2Codes)
  const suggestedFirst = query.suggestedFirst !== false
  const positiveLimit =
    typeof query.limit === 'number' && Number.isInteger(query.limit) && query.limit > 0
      ? query.limit
      : undefined

  const filtered = COUNTRY_CATALOG.filter((entry) => {
    const iso2Code = entry.iso2Code.toUpperCase()
    if (excludedCodes.has(iso2Code)) return false
    if (!normalizedQuery) return true
    return (
      iso2Code.toLowerCase().includes(normalizedQuery) ||
      entry.name.toLowerCase().includes(normalizedQuery) ||
      entry.phoneCode.toLowerCase().includes(normalizedQuery)
    )
  })

  const sorted = sortCountries(filtered, suggestedFirst)
  const limited = positiveLimit ? sorted.slice(0, positiveLimit) : sorted
  return limited.map((entry) => ({ ...entry }))
}

export function getCountryCatalogByIso2Code(iso2Code: string): IbmCountry | null {
  const normalizedCode = normalizeIso2Code(iso2Code)
  if (!normalizedCode) return null
  const entry = COUNTRY_BY_ISO2.get(normalizedCode)
  return entry ? { ...entry } : null
}
