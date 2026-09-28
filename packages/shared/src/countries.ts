import type { Difficulty, Region } from './taxonomy.js';

export interface CountrySeed {
  name: string;
  capital: string;
  region: Region;
  /** ISO 3166-1 alpha-2, lowercased at render time for flag-icons. */
  isoCode: string;
  difficulty: Difficulty;
  /**
   * Other names for the COUNTRY: accepted when the answer is a country, and
   * true enough to print as "also known as" (`Holland`, `Burma`, `Deutschland`,
   * `UK`).
   *
   * Hand-seeded obvious ones only (1–3 per country where one exists). Typos and
   * unlisted variants are handled by the pg_trgm fallback, so this list
   * deliberately isn't exhaustive.
   */
  nameAliases?: string[];
  /**
   * Other names for the CAPITAL: a second capital or seat of government
   * (`Cape Town`, `La Paz`, `The Hague`), the city's name in another language
   * or spelling (`Praha`, `Wien`, `Kiev`), or a former name of the same city
   * (`Nur-Sultan`). Accepted when the answer is a capital, and true enough to
   * print after the canonical one.
   *
   * What is NOT in here is the city that is merely famous: Istanbul, Tel Aviv,
   * Dubai, Zurich, Almaty, Dar es Salaam, Belize City and Monte Carlo were all
   * accepted as capitals before #35 split this column, which is a geography
   * trainer teaching the opposite of its job. They are `searchAliases` now:
   * findable in the register, accepted nowhere.
   */
  capitalAliases?: string[];
  /**
   * Strings that name neither: a former capital, the largest city, the one
   * everybody thinks is the capital (`Istanbul`, `Tel Aviv`, `Dubai`, `Zurich`,
   * `Almaty`, `Dar es Salaam`, `Belize City`, `Monte Carlo`).
   *
   * NEVER an accepted answer and never printed — a trainer that ticks "the
   * capital of Turkey is Istanbul" teaches the opposite of its job. They are
   * kept because the register's lookup box is a different question from a quiz:
   * typing `Istanbul` there should still find Turkey, and finding a country
   * asserts nothing about it (#35).
   */
  searchAliases?: string[];
}

/**
 * Difficulty tiers are the approved hand-drafted split by general-knowledge
 * prominence: 63 Easy, 69 Medium, 63 Hard. They are data, not logic — nothing
 * in the app branches on a specific tier — so revising them means editing the
 * `difficulty` values below and re-running
 * `pnpm --filter @cartomancer/db seed`, which upserts and so updates rows in
 * place without touching anyone's progress.
 *
 * Notes on the factual fields, which are NOT placeholders:
 * - Regions use the app's five-way split (Africa/Asia/Europe/Americas/Oceania).
 *   Transcontinental and ambiguous cases follow the UN geoscheme: Turkey,
 *   Cyprus, Georgia, Armenia, Azerbaijan and Kazakhstan sit in Asia; Russia
 *   sits in Europe.
 * - Where a state has more than one capital or a split seat of government, the
 *   canonical value is the one standard quiz references use, and the other city
 *   is a `capitalAliases` entry so both are accepted on type-in answers (South
 *   Africa, Bolivia, Sri Lanka, Palestine, Eswatini, Côte d'Ivoire, Benin,
 *   Malaysia, Netherlands, Burundi). Tanzania is not one of them: Dodoma is the
 *   capital and Dar es Salaam is the former one, so it is not accepted (#35).
 * - Names carry their diacritics; matching is accent-insensitive at answer time.
 */
export const COUNTRIES: readonly CountrySeed[] = [
  // ---------------------------------------------------------------- Africa (54)
  { name: 'Algeria', capital: 'Algiers', region: 'Africa', isoCode: 'DZ', difficulty: 'Easy' },
  { name: 'Angola', capital: 'Luanda', region: 'Africa', isoCode: 'AO', difficulty: 'Medium' },
  { name: 'Benin', capital: 'Porto-Novo', region: 'Africa', isoCode: 'BJ', difficulty: 'Hard', capitalAliases: ['Cotonou'] },
  { name: 'Botswana', capital: 'Gaborone', region: 'Africa', isoCode: 'BW', difficulty: 'Medium' },
  { name: 'Burkina Faso', capital: 'Ouagadougou', region: 'Africa', isoCode: 'BF', difficulty: 'Hard' },
  { name: 'Burundi', capital: 'Gitega', region: 'Africa', isoCode: 'BI', difficulty: 'Hard', capitalAliases: ['Bujumbura'] },
  { name: 'Cabo Verde', capital: 'Praia', region: 'Africa', isoCode: 'CV', difficulty: 'Hard', nameAliases: ['Cape Verde'] },
  { name: 'Cameroon', capital: 'Yaoundé', region: 'Africa', isoCode: 'CM', difficulty: 'Medium', capitalAliases: ['Yaounde'] },
  { name: 'Central African Republic', capital: 'Bangui', region: 'Africa', isoCode: 'CF', difficulty: 'Hard', nameAliases: ['CAR'] },
  { name: 'Chad', capital: "N'Djamena", region: 'Africa', isoCode: 'TD', difficulty: 'Hard', capitalAliases: ['Ndjamena'] },
  { name: 'Comoros', capital: 'Moroni', region: 'Africa', isoCode: 'KM', difficulty: 'Hard' },
  { name: 'Republic of the Congo', capital: 'Brazzaville', region: 'Africa', isoCode: 'CG', difficulty: 'Hard', nameAliases: ['Congo', 'Congo-Brazzaville'] },
  { name: 'Democratic Republic of the Congo', capital: 'Kinshasa', region: 'Africa', isoCode: 'CD', difficulty: 'Medium', nameAliases: ['DRC', 'DR Congo', 'Congo-Kinshasa'] },
  { name: "Côte d'Ivoire", capital: 'Yamoussoukro', region: 'Africa', isoCode: 'CI', difficulty: 'Medium', nameAliases: ['Ivory Coast', 'Cote d Ivoire'], capitalAliases: ['Abidjan'] },
  { name: 'Djibouti', capital: 'Djibouti', region: 'Africa', isoCode: 'DJ', difficulty: 'Hard', capitalAliases: ['Djibouti City'] },
  { name: 'Egypt', capital: 'Cairo', region: 'Africa', isoCode: 'EG', difficulty: 'Easy' },
  { name: 'Equatorial Guinea', capital: 'Malabo', region: 'Africa', isoCode: 'GQ', difficulty: 'Hard' },
  { name: 'Eritrea', capital: 'Asmara', region: 'Africa', isoCode: 'ER', difficulty: 'Hard' },
  { name: 'Eswatini', capital: 'Mbabane', region: 'Africa', isoCode: 'SZ', difficulty: 'Hard', nameAliases: ['Swaziland'], capitalAliases: ['Lobamba'] },
  { name: 'Ethiopia', capital: 'Addis Ababa', region: 'Africa', isoCode: 'ET', difficulty: 'Medium' },
  { name: 'Gabon', capital: 'Libreville', region: 'Africa', isoCode: 'GA', difficulty: 'Hard' },
  { name: 'Gambia', capital: 'Banjul', region: 'Africa', isoCode: 'GM', difficulty: 'Hard', nameAliases: ['The Gambia'] },
  { name: 'Ghana', capital: 'Accra', region: 'Africa', isoCode: 'GH', difficulty: 'Medium' },
  { name: 'Guinea', capital: 'Conakry', region: 'Africa', isoCode: 'GN', difficulty: 'Hard' },
  { name: 'Guinea-Bissau', capital: 'Bissau', region: 'Africa', isoCode: 'GW', difficulty: 'Hard', nameAliases: ['Guinea Bissau'] },
  { name: 'Kenya', capital: 'Nairobi', region: 'Africa', isoCode: 'KE', difficulty: 'Easy' },
  { name: 'Lesotho', capital: 'Maseru', region: 'Africa', isoCode: 'LS', difficulty: 'Hard' },
  { name: 'Liberia', capital: 'Monrovia', region: 'Africa', isoCode: 'LR', difficulty: 'Hard' },
  { name: 'Libya', capital: 'Tripoli', region: 'Africa', isoCode: 'LY', difficulty: 'Medium' },
  { name: 'Madagascar', capital: 'Antananarivo', region: 'Africa', isoCode: 'MG', difficulty: 'Medium' },
  { name: 'Malawi', capital: 'Lilongwe', region: 'Africa', isoCode: 'MW', difficulty: 'Hard' },
  { name: 'Mali', capital: 'Bamako', region: 'Africa', isoCode: 'ML', difficulty: 'Hard' },
  { name: 'Mauritania', capital: 'Nouakchott', region: 'Africa', isoCode: 'MR', difficulty: 'Hard' },
  { name: 'Mauritius', capital: 'Port Louis', region: 'Africa', isoCode: 'MU', difficulty: 'Medium' },
  { name: 'Morocco', capital: 'Rabat', region: 'Africa', isoCode: 'MA', difficulty: 'Easy' },
  { name: 'Mozambique', capital: 'Maputo', region: 'Africa', isoCode: 'MZ', difficulty: 'Medium' },
  { name: 'Namibia', capital: 'Windhoek', region: 'Africa', isoCode: 'NA', difficulty: 'Medium' },
  { name: 'Niger', capital: 'Niamey', region: 'Africa', isoCode: 'NE', difficulty: 'Hard' },
  { name: 'Nigeria', capital: 'Abuja', region: 'Africa', isoCode: 'NG', difficulty: 'Easy' },
  { name: 'Rwanda', capital: 'Kigali', region: 'Africa', isoCode: 'RW', difficulty: 'Medium' },
  { name: 'São Tomé and Príncipe', capital: 'São Tomé', region: 'Africa', isoCode: 'ST', difficulty: 'Hard', nameAliases: ['Sao Tome and Principe'], capitalAliases: ['Sao Tome'] },
  { name: 'Senegal', capital: 'Dakar', region: 'Africa', isoCode: 'SN', difficulty: 'Medium' },
  { name: 'Seychelles', capital: 'Victoria', region: 'Africa', isoCode: 'SC', difficulty: 'Hard' },
  { name: 'Sierra Leone', capital: 'Freetown', region: 'Africa', isoCode: 'SL', difficulty: 'Hard' },
  { name: 'Somalia', capital: 'Mogadishu', region: 'Africa', isoCode: 'SO', difficulty: 'Medium' },
  { name: 'South Africa', capital: 'Pretoria', region: 'Africa', isoCode: 'ZA', difficulty: 'Easy', nameAliases: ['RSA'], capitalAliases: ['Cape Town', 'Bloemfontein'] },
  { name: 'South Sudan', capital: 'Juba', region: 'Africa', isoCode: 'SS', difficulty: 'Hard' },
  { name: 'Sudan', capital: 'Khartoum', region: 'Africa', isoCode: 'SD', difficulty: 'Medium' },
  { name: 'Tanzania', capital: 'Dodoma', region: 'Africa', isoCode: 'TZ', difficulty: 'Medium', searchAliases: ['Dar es Salaam'] },
  { name: 'Togo', capital: 'Lomé', region: 'Africa', isoCode: 'TG', difficulty: 'Hard', capitalAliases: ['Lome'] },
  { name: 'Tunisia', capital: 'Tunis', region: 'Africa', isoCode: 'TN', difficulty: 'Medium' },
  { name: 'Uganda', capital: 'Kampala', region: 'Africa', isoCode: 'UG', difficulty: 'Medium' },
  { name: 'Zambia', capital: 'Lusaka', region: 'Africa', isoCode: 'ZM', difficulty: 'Medium' },
  { name: 'Zimbabwe', capital: 'Harare', region: 'Africa', isoCode: 'ZW', difficulty: 'Medium' },

  // ------------------------------------------------------------------ Asia (48)
  { name: 'Afghanistan', capital: 'Kabul', region: 'Asia', isoCode: 'AF', difficulty: 'Easy' },
  { name: 'Armenia', capital: 'Yerevan', region: 'Asia', isoCode: 'AM', difficulty: 'Medium' },
  { name: 'Azerbaijan', capital: 'Baku', region: 'Asia', isoCode: 'AZ', difficulty: 'Medium' },
  { name: 'Bahrain', capital: 'Manama', region: 'Asia', isoCode: 'BH', difficulty: 'Medium' },
  { name: 'Bangladesh', capital: 'Dhaka', region: 'Asia', isoCode: 'BD', difficulty: 'Medium' },
  { name: 'Bhutan', capital: 'Thimphu', region: 'Asia', isoCode: 'BT', difficulty: 'Hard' },
  { name: 'Brunei', capital: 'Bandar Seri Begawan', region: 'Asia', isoCode: 'BN', difficulty: 'Hard', nameAliases: ['Brunei Darussalam'] },
  { name: 'Cambodia', capital: 'Phnom Penh', region: 'Asia', isoCode: 'KH', difficulty: 'Medium' },
  { name: 'China', capital: 'Beijing', region: 'Asia', isoCode: 'CN', difficulty: 'Easy', nameAliases: ['PRC', "People's Republic of China"], capitalAliases: ['Peking'] },
  { name: 'Cyprus', capital: 'Nicosia', region: 'Asia', isoCode: 'CY', difficulty: 'Medium' },
  { name: 'Georgia', capital: 'Tbilisi', region: 'Asia', isoCode: 'GE', difficulty: 'Medium' },
  { name: 'India', capital: 'New Delhi', region: 'Asia', isoCode: 'IN', difficulty: 'Easy', capitalAliases: ['Delhi'] },
  { name: 'Indonesia', capital: 'Jakarta', region: 'Asia', isoCode: 'ID', difficulty: 'Easy' },
  { name: 'Iran', capital: 'Tehran', region: 'Asia', isoCode: 'IR', difficulty: 'Easy', nameAliases: ['Persia'] },
  { name: 'Iraq', capital: 'Baghdad', region: 'Asia', isoCode: 'IQ', difficulty: 'Easy' },
  { name: 'Israel', capital: 'Jerusalem', region: 'Asia', isoCode: 'IL', difficulty: 'Easy', searchAliases: ['Tel Aviv'] },
  { name: 'Japan', capital: 'Tokyo', region: 'Asia', isoCode: 'JP', difficulty: 'Easy' },
  { name: 'Jordan', capital: 'Amman', region: 'Asia', isoCode: 'JO', difficulty: 'Easy' },
  { name: 'Kazakhstan', capital: 'Astana', region: 'Asia', isoCode: 'KZ', difficulty: 'Medium', capitalAliases: ['Nur-Sultan'], searchAliases: ['Almaty'] },
  { name: 'Kuwait', capital: 'Kuwait City', region: 'Asia', isoCode: 'KW', difficulty: 'Easy' },
  { name: 'Kyrgyzstan', capital: 'Bishkek', region: 'Asia', isoCode: 'KG', difficulty: 'Medium', nameAliases: ['Kirghizia'] },
  { name: 'Laos', capital: 'Vientiane', region: 'Asia', isoCode: 'LA', difficulty: 'Medium', nameAliases: ['Lao PDR'] },
  { name: 'Lebanon', capital: 'Beirut', region: 'Asia', isoCode: 'LB', difficulty: 'Easy' },
  { name: 'Malaysia', capital: 'Kuala Lumpur', region: 'Asia', isoCode: 'MY', difficulty: 'Easy', capitalAliases: ['Putrajaya'] },
  { name: 'Maldives', capital: 'Malé', region: 'Asia', isoCode: 'MV', difficulty: 'Hard', capitalAliases: ['Male'] },
  { name: 'Mongolia', capital: 'Ulaanbaatar', region: 'Asia', isoCode: 'MN', difficulty: 'Medium', capitalAliases: ['Ulan Bator'] },
  { name: 'Myanmar', capital: 'Naypyidaw', region: 'Asia', isoCode: 'MM', difficulty: 'Medium', nameAliases: ['Burma'], capitalAliases: ['Nay Pyi Taw'] },
  { name: 'Nepal', capital: 'Kathmandu', region: 'Asia', isoCode: 'NP', difficulty: 'Medium' },
  { name: 'North Korea', capital: 'Pyongyang', region: 'Asia', isoCode: 'KP', difficulty: 'Easy', nameAliases: ['DPRK', "Democratic People's Republic of Korea"] },
  { name: 'Oman', capital: 'Muscat', region: 'Asia', isoCode: 'OM', difficulty: 'Medium' },
  { name: 'Pakistan', capital: 'Islamabad', region: 'Asia', isoCode: 'PK', difficulty: 'Easy' },
  { name: 'Palestine', capital: 'Ramallah', region: 'Asia', isoCode: 'PS', difficulty: 'Easy', nameAliases: ['State of Palestine'], capitalAliases: ['East Jerusalem'] },
  { name: 'Philippines', capital: 'Manila', region: 'Asia', isoCode: 'PH', difficulty: 'Easy', nameAliases: ['The Philippines'] },
  { name: 'Qatar', capital: 'Doha', region: 'Asia', isoCode: 'QA', difficulty: 'Easy' },
  { name: 'Saudi Arabia', capital: 'Riyadh', region: 'Asia', isoCode: 'SA', difficulty: 'Easy' },
  { name: 'Singapore', capital: 'Singapore', region: 'Asia', isoCode: 'SG', difficulty: 'Easy', capitalAliases: ['Singapore City'] },
  { name: 'South Korea', capital: 'Seoul', region: 'Asia', isoCode: 'KR', difficulty: 'Easy', nameAliases: ['Korea', 'Republic of Korea', 'ROK'] },
  { name: 'Sri Lanka', capital: 'Sri Jayawardenepura Kotte', region: 'Asia', isoCode: 'LK', difficulty: 'Medium', nameAliases: ['Ceylon'], capitalAliases: ['Colombo'] },
  { name: 'Syria', capital: 'Damascus', region: 'Asia', isoCode: 'SY', difficulty: 'Easy' },
  { name: 'Tajikistan', capital: 'Dushanbe', region: 'Asia', isoCode: 'TJ', difficulty: 'Hard' },
  { name: 'Thailand', capital: 'Bangkok', region: 'Asia', isoCode: 'TH', difficulty: 'Easy', nameAliases: ['Siam'] },
  { name: 'Timor-Leste', capital: 'Dili', region: 'Asia', isoCode: 'TL', difficulty: 'Hard', nameAliases: ['East Timor'] },
  { name: 'Turkey', capital: 'Ankara', region: 'Asia', isoCode: 'TR', difficulty: 'Easy', nameAliases: ['Türkiye', 'Turkiye'], searchAliases: ['Istanbul'] },
  { name: 'Turkmenistan', capital: 'Ashgabat', region: 'Asia', isoCode: 'TM', difficulty: 'Hard' },
  { name: 'United Arab Emirates', capital: 'Abu Dhabi', region: 'Asia', isoCode: 'AE', difficulty: 'Easy', nameAliases: ['UAE', 'Emirates'], searchAliases: ['Dubai'] },
  { name: 'Uzbekistan', capital: 'Tashkent', region: 'Asia', isoCode: 'UZ', difficulty: 'Medium' },
  { name: 'Vietnam', capital: 'Hanoi', region: 'Asia', isoCode: 'VN', difficulty: 'Easy', nameAliases: ['Viet Nam'] },
  { name: 'Yemen', capital: 'Sanaa', region: 'Asia', isoCode: 'YE', difficulty: 'Easy', capitalAliases: ["Sana'a"] },

  // ---------------------------------------------------------------- Europe (44)
  { name: 'Albania', capital: 'Tirana', region: 'Europe', isoCode: 'AL', difficulty: 'Medium', capitalAliases: ['Tirane'] },
  { name: 'Andorra', capital: 'Andorra la Vella', region: 'Europe', isoCode: 'AD', difficulty: 'Hard' },
  { name: 'Austria', capital: 'Vienna', region: 'Europe', isoCode: 'AT', difficulty: 'Easy', capitalAliases: ['Wien'] },
  { name: 'Belarus', capital: 'Minsk', region: 'Europe', isoCode: 'BY', difficulty: 'Medium' },
  { name: 'Belgium', capital: 'Brussels', region: 'Europe', isoCode: 'BE', difficulty: 'Easy', capitalAliases: ['Bruxelles'] },
  { name: 'Bosnia and Herzegovina', capital: 'Sarajevo', region: 'Europe', isoCode: 'BA', difficulty: 'Medium', nameAliases: ['Bosnia'] },
  { name: 'Bulgaria', capital: 'Sofia', region: 'Europe', isoCode: 'BG', difficulty: 'Medium' },
  { name: 'Croatia', capital: 'Zagreb', region: 'Europe', isoCode: 'HR', difficulty: 'Medium', nameAliases: ['Hrvatska'] },
  { name: 'Czechia', capital: 'Prague', region: 'Europe', isoCode: 'CZ', difficulty: 'Medium', nameAliases: ['Czech Republic'], capitalAliases: ['Praha'] },
  { name: 'Denmark', capital: 'Copenhagen', region: 'Europe', isoCode: 'DK', difficulty: 'Easy', capitalAliases: ['København'] },
  { name: 'Estonia', capital: 'Tallinn', region: 'Europe', isoCode: 'EE', difficulty: 'Medium' },
  { name: 'Finland', capital: 'Helsinki', region: 'Europe', isoCode: 'FI', difficulty: 'Easy' },
  { name: 'France', capital: 'Paris', region: 'Europe', isoCode: 'FR', difficulty: 'Easy' },
  { name: 'Germany', capital: 'Berlin', region: 'Europe', isoCode: 'DE', difficulty: 'Easy', nameAliases: ['Deutschland'] },
  { name: 'Greece', capital: 'Athens', region: 'Europe', isoCode: 'GR', difficulty: 'Easy', nameAliases: ['Hellas'], capitalAliases: ['Athina'] },
  { name: 'Hungary', capital: 'Budapest', region: 'Europe', isoCode: 'HU', difficulty: 'Medium' },
  { name: 'Iceland', capital: 'Reykjavík', region: 'Europe', isoCode: 'IS', difficulty: 'Easy', capitalAliases: ['Reykjavik'] },
  { name: 'Ireland', capital: 'Dublin', region: 'Europe', isoCode: 'IE', difficulty: 'Easy', nameAliases: ['Republic of Ireland', 'Eire'] },
  { name: 'Italy', capital: 'Rome', region: 'Europe', isoCode: 'IT', difficulty: 'Easy', nameAliases: ['Italia'], capitalAliases: ['Roma'] },
  { name: 'Latvia', capital: 'Riga', region: 'Europe', isoCode: 'LV', difficulty: 'Medium' },
  { name: 'Liechtenstein', capital: 'Vaduz', region: 'Europe', isoCode: 'LI', difficulty: 'Hard' },
  { name: 'Lithuania', capital: 'Vilnius', region: 'Europe', isoCode: 'LT', difficulty: 'Medium' },
  { name: 'Luxembourg', capital: 'Luxembourg', region: 'Europe', isoCode: 'LU', difficulty: 'Hard', capitalAliases: ['Luxembourg City'] },
  { name: 'Malta', capital: 'Valletta', region: 'Europe', isoCode: 'MT', difficulty: 'Hard' },
  { name: 'Moldova', capital: 'Chișinău', region: 'Europe', isoCode: 'MD', difficulty: 'Hard', capitalAliases: ['Chisinau', 'Kishinev'] },
  { name: 'Monaco', capital: 'Monaco', region: 'Europe', isoCode: 'MC', difficulty: 'Hard', searchAliases: ['Monte Carlo'] },
  { name: 'Montenegro', capital: 'Podgorica', region: 'Europe', isoCode: 'ME', difficulty: 'Hard' },
  { name: 'Netherlands', capital: 'Amsterdam', region: 'Europe', isoCode: 'NL', difficulty: 'Easy', nameAliases: ['Holland'], capitalAliases: ['The Hague'] },
  { name: 'North Macedonia', capital: 'Skopje', region: 'Europe', isoCode: 'MK', difficulty: 'Hard', nameAliases: ['Macedonia'] },
  { name: 'Norway', capital: 'Oslo', region: 'Europe', isoCode: 'NO', difficulty: 'Easy', nameAliases: ['Norge'] },
  { name: 'Poland', capital: 'Warsaw', region: 'Europe', isoCode: 'PL', difficulty: 'Easy', nameAliases: ['Polska'], capitalAliases: ['Warszawa'] },
  { name: 'Portugal', capital: 'Lisbon', region: 'Europe', isoCode: 'PT', difficulty: 'Easy', capitalAliases: ['Lisboa'] },
  { name: 'Romania', capital: 'Bucharest', region: 'Europe', isoCode: 'RO', difficulty: 'Medium', capitalAliases: ['Bucuresti'] },
  { name: 'Russia', capital: 'Moscow', region: 'Europe', isoCode: 'RU', difficulty: 'Easy', nameAliases: ['Russian Federation'], capitalAliases: ['Moskva'] },
  { name: 'San Marino', capital: 'San Marino', region: 'Europe', isoCode: 'SM', difficulty: 'Hard', capitalAliases: ['City of San Marino'] },
  { name: 'Serbia', capital: 'Belgrade', region: 'Europe', isoCode: 'RS', difficulty: 'Medium', capitalAliases: ['Beograd'] },
  { name: 'Slovakia', capital: 'Bratislava', region: 'Europe', isoCode: 'SK', difficulty: 'Medium', nameAliases: ['Slovak Republic'] },
  { name: 'Slovenia', capital: 'Ljubljana', region: 'Europe', isoCode: 'SI', difficulty: 'Medium' },
  { name: 'Spain', capital: 'Madrid', region: 'Europe', isoCode: 'ES', difficulty: 'Easy', nameAliases: ['España'] },
  { name: 'Sweden', capital: 'Stockholm', region: 'Europe', isoCode: 'SE', difficulty: 'Easy', nameAliases: ['Sverige'] },
  { name: 'Switzerland', capital: 'Bern', region: 'Europe', isoCode: 'CH', difficulty: 'Easy', capitalAliases: ['Berne'], searchAliases: ['Zurich'] },
  { name: 'Ukraine', capital: 'Kyiv', region: 'Europe', isoCode: 'UA', difficulty: 'Easy', capitalAliases: ['Kiev'] },
  { name: 'United Kingdom', capital: 'London', region: 'Europe', isoCode: 'GB', difficulty: 'Easy', nameAliases: ['UK', 'Great Britain', 'Britain'] },
  { name: 'Vatican City', capital: 'Vatican City', region: 'Europe', isoCode: 'VA', difficulty: 'Medium', nameAliases: ['Holy See', 'Vatican'], capitalAliases: ['Vatican'] },

  // -------------------------------------------------------------- Americas (35)
  { name: 'Antigua and Barbuda', capital: "Saint John's", region: 'Americas', isoCode: 'AG', difficulty: 'Hard', capitalAliases: ['St Johns'] },
  { name: 'Argentina', capital: 'Buenos Aires', region: 'Americas', isoCode: 'AR', difficulty: 'Easy' },
  { name: 'Bahamas', capital: 'Nassau', region: 'Americas', isoCode: 'BS', difficulty: 'Medium', nameAliases: ['The Bahamas'] },
  { name: 'Barbados', capital: 'Bridgetown', region: 'Americas', isoCode: 'BB', difficulty: 'Hard' },
  { name: 'Belize', capital: 'Belmopan', region: 'Americas', isoCode: 'BZ', difficulty: 'Hard', searchAliases: ['Belize City'] },
  { name: 'Bolivia', capital: 'Sucre', region: 'Americas', isoCode: 'BO', difficulty: 'Medium', capitalAliases: ['La Paz'] },
  { name: 'Brazil', capital: 'Brasília', region: 'Americas', isoCode: 'BR', difficulty: 'Easy', nameAliases: ['Brasil'], capitalAliases: ['Brasilia'] },
  { name: 'Canada', capital: 'Ottawa', region: 'Americas', isoCode: 'CA', difficulty: 'Easy' },
  { name: 'Chile', capital: 'Santiago', region: 'Americas', isoCode: 'CL', difficulty: 'Medium' },
  { name: 'Colombia', capital: 'Bogotá', region: 'Americas', isoCode: 'CO', difficulty: 'Easy', capitalAliases: ['Bogota'] },
  { name: 'Costa Rica', capital: 'San José', region: 'Americas', isoCode: 'CR', difficulty: 'Medium', capitalAliases: ['San Jose'] },
  { name: 'Cuba', capital: 'Havana', region: 'Americas', isoCode: 'CU', difficulty: 'Easy', capitalAliases: ['La Habana'] },
  { name: 'Dominica', capital: 'Roseau', region: 'Americas', isoCode: 'DM', difficulty: 'Hard' },
  { name: 'Dominican Republic', capital: 'Santo Domingo', region: 'Americas', isoCode: 'DO', difficulty: 'Medium', nameAliases: ['DR'] },
  { name: 'Ecuador', capital: 'Quito', region: 'Americas', isoCode: 'EC', difficulty: 'Medium' },
  { name: 'El Salvador', capital: 'San Salvador', region: 'Americas', isoCode: 'SV', difficulty: 'Medium' },
  { name: 'Grenada', capital: "Saint George's", region: 'Americas', isoCode: 'GD', difficulty: 'Hard', capitalAliases: ['St Georges'] },
  { name: 'Guatemala', capital: 'Guatemala City', region: 'Americas', isoCode: 'GT', difficulty: 'Medium', capitalAliases: ['Guatemala'] },
  { name: 'Guyana', capital: 'Georgetown', region: 'Americas', isoCode: 'GY', difficulty: 'Hard' },
  { name: 'Haiti', capital: 'Port-au-Prince', region: 'Americas', isoCode: 'HT', difficulty: 'Medium', capitalAliases: ['Port au Prince'] },
  { name: 'Honduras', capital: 'Tegucigalpa', region: 'Americas', isoCode: 'HN', difficulty: 'Medium' },
  { name: 'Jamaica', capital: 'Kingston', region: 'Americas', isoCode: 'JM', difficulty: 'Medium' },
  { name: 'Mexico', capital: 'Mexico City', region: 'Americas', isoCode: 'MX', difficulty: 'Easy', nameAliases: ['México'], capitalAliases: ['Ciudad de México', 'CDMX'] },
  { name: 'Nicaragua', capital: 'Managua', region: 'Americas', isoCode: 'NI', difficulty: 'Medium' },
  { name: 'Panama', capital: 'Panama City', region: 'Americas', isoCode: 'PA', difficulty: 'Medium', nameAliases: ['Panamá'] },
  { name: 'Paraguay', capital: 'Asunción', region: 'Americas', isoCode: 'PY', difficulty: 'Medium', capitalAliases: ['Asuncion'] },
  { name: 'Peru', capital: 'Lima', region: 'Americas', isoCode: 'PE', difficulty: 'Easy', nameAliases: ['Perú'] },
  { name: 'Saint Kitts and Nevis', capital: 'Basseterre', region: 'Americas', isoCode: 'KN', difficulty: 'Hard', nameAliases: ['St Kitts and Nevis'] },
  { name: 'Saint Lucia', capital: 'Castries', region: 'Americas', isoCode: 'LC', difficulty: 'Hard', nameAliases: ['St Lucia'] },
  { name: 'Saint Vincent and the Grenadines', capital: 'Kingstown', region: 'Americas', isoCode: 'VC', difficulty: 'Hard', nameAliases: ['St Vincent and the Grenadines', 'St Vincent'] },
  { name: 'Suriname', capital: 'Paramaribo', region: 'Americas', isoCode: 'SR', difficulty: 'Hard' },
  { name: 'Trinidad and Tobago', capital: 'Port of Spain', region: 'Americas', isoCode: 'TT', difficulty: 'Hard', nameAliases: ['Trinidad'] },
  { name: 'United States', capital: 'Washington, D.C.', region: 'Americas', isoCode: 'US', difficulty: 'Easy', nameAliases: ['USA', 'US', 'U.S.', 'America', 'United States of America'], capitalAliases: ['Washington DC'] },
  { name: 'Uruguay', capital: 'Montevideo', region: 'Americas', isoCode: 'UY', difficulty: 'Medium' },
  { name: 'Venezuela', capital: 'Caracas', region: 'Americas', isoCode: 'VE', difficulty: 'Easy' },

  // --------------------------------------------------------------- Oceania (14)
  { name: 'Australia', capital: 'Canberra', region: 'Oceania', isoCode: 'AU', difficulty: 'Easy', nameAliases: ['Oz'] },
  { name: 'Fiji', capital: 'Suva', region: 'Oceania', isoCode: 'FJ', difficulty: 'Medium' },
  { name: 'Kiribati', capital: 'South Tarawa', region: 'Oceania', isoCode: 'KI', difficulty: 'Hard', capitalAliases: ['Tarawa'] },
  { name: 'Marshall Islands', capital: 'Majuro', region: 'Oceania', isoCode: 'MH', difficulty: 'Hard' },
  { name: 'Micronesia', capital: 'Palikir', region: 'Oceania', isoCode: 'FM', difficulty: 'Hard', nameAliases: ['Federated States of Micronesia', 'FSM'] },
  { name: 'Nauru', capital: 'Yaren', region: 'Oceania', isoCode: 'NR', difficulty: 'Hard' },
  { name: 'New Zealand', capital: 'Wellington', region: 'Oceania', isoCode: 'NZ', difficulty: 'Easy', nameAliases: ['NZ', 'Aotearoa'] },
  { name: 'Palau', capital: 'Ngerulmud', region: 'Oceania', isoCode: 'PW', difficulty: 'Hard' },
  { name: 'Papua New Guinea', capital: 'Port Moresby', region: 'Oceania', isoCode: 'PG', difficulty: 'Medium', nameAliases: ['PNG'] },
  { name: 'Samoa', capital: 'Apia', region: 'Oceania', isoCode: 'WS', difficulty: 'Hard', nameAliases: ['Western Samoa'] },
  { name: 'Solomon Islands', capital: 'Honiara', region: 'Oceania', isoCode: 'SB', difficulty: 'Hard' },
  { name: 'Tonga', capital: "Nuku'alofa", region: 'Oceania', isoCode: 'TO', difficulty: 'Hard', capitalAliases: ['Nukualofa'] },
  { name: 'Tuvalu', capital: 'Funafuti', region: 'Oceania', isoCode: 'TV', difficulty: 'Hard' },
  { name: 'Vanuatu', capital: 'Port Vila', region: 'Oceania', isoCode: 'VU', difficulty: 'Hard' },
];

/** Country counts per region, derived so the recall screens can show a total. */
export const COUNTRY_COUNTS_BY_REGION: Readonly<Record<Region, number>> = COUNTRIES.reduce(
  (acc, c) => ({ ...acc, [c.region]: (acc[c.region] ?? 0) + 1 }),
  {} as Record<Region, number>,
);
