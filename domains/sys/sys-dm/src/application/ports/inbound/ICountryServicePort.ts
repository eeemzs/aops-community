import { Effect } from 'effect'
import { CountryServiceError } from '../../errors/CountryServiceError.js'
import { CountryCatalogQuery, IbmCountry } from '../../../domain/models/index.js'

export interface ICountryServicePort {
  listCountries(input?: CountryCatalogQuery): Effect.Effect<IbmCountry[], CountryServiceError>
  getCountryByIso2Code(iso2Code: string): Effect.Effect<IbmCountry | null, CountryServiceError>
}
