import type { Difficulty, Region } from './taxonomy.js';

export interface CountrySeed {
  name: string;
  capital: string;
  region: Region;
  /** ISO 3166-1 alpha-2, lowercased at render time for flag-icons. */
  isoCode: string;
  difficulty: Difficulty;
  /**
   * Hand-seeded obvious aliases only (1–3 per country where one exists).
   * Typos and unlisted variants are handled by the pg_trgm fallback, so this
   * list deliberately isn't exhaustive.
   */
  aliases: string[];
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
 *   canonical value is the one standard quiz references use, and the other
 *   city is an alias so both are accepted on type-in answers (South Africa,
 *   Bolivia, Sri Lanka, Palestine, Eswatini, Côte d'Ivoire, Benin, Tanzania).
 * - Names carry their diacritics; matching is accent-insensitive at answer time.
 */
export const COUNTRIES: readonly CountrySeed[] = [
  // ---------------------------------------------------------------- Africa (54)
  { name: 'Algeria', capital: 'Algiers', region: 'Africa', isoCode: 'DZ', difficulty: 'Easy', aliases: [] },
  { name: 'Angola', capital: 'Luanda', region: 'Africa', isoCode: 'AO', difficulty: 'Medium', aliases: [] },
  { name: 'Benin', capital: 'Porto-Novo', region: 'Africa', isoCode: 'BJ', difficulty: 'Hard', aliases: ['Cotonou'] },
  { name: 'Botswana', capital: 'Gaborone', region: 'Africa', isoCode: 'BW', difficulty: 'Medium', aliases: [] },
  { name: 'Burkina Faso', capital: 'Ouagadougou', region: 'Africa', isoCode: 'BF', difficulty: 'Hard', aliases: [] },
  { name: 'Burundi', capital: 'Gitega', region: 'Africa', isoCode: 'BI', difficulty: 'Hard', aliases: ['Bujumbura'] },
  { name: 'Cabo Verde', capital: 'Praia', region: 'Africa', isoCode: 'CV', difficulty: 'Hard', aliases: ['Cape Verde'] },
  { name: 'Cameroon', capital: 'Yaoundé', region: 'Africa', isoCode: 'CM', difficulty: 'Medium', aliases: ['Yaounde'] },
  { name: 'Central African Republic', capital: 'Bangui', region: 'Africa', isoCode: 'CF', difficulty: 'Hard', aliases: ['CAR'] },
  { name: 'Chad', capital: "N'Djamena", region: 'Africa', isoCode: 'TD', difficulty: 'Hard', aliases: ['Ndjamena'] },
  { name: 'Comoros', capital: 'Moroni', region: 'Africa', isoCode: 'KM', difficulty: 'Hard', aliases: [] },
  { name: 'Republic of the Congo', capital: 'Brazzaville', region: 'Africa', isoCode: 'CG', difficulty: 'Hard', aliases: ['Congo', 'Congo-Brazzaville'] },
  { name: 'Democratic Republic of the Congo', capital: 'Kinshasa', region: 'Africa', isoCode: 'CD', difficulty: 'Medium', aliases: ['DRC', 'DR Congo', 'Congo-Kinshasa'] },
  { name: "Côte d'Ivoire", capital: 'Yamoussoukro', region: 'Africa', isoCode: 'CI', difficulty: 'Medium', aliases: ['Ivory Coast', 'Cote d Ivoire', 'Abidjan'] },
  { name: 'Djibouti', capital: 'Djibouti', region: 'Africa', isoCode: 'DJ', difficulty: 'Hard', aliases: ['Djibouti City'] },
  { name: 'Egypt', capital: 'Cairo', region: 'Africa', isoCode: 'EG', difficulty: 'Easy', aliases: [] },
  { name: 'Equatorial Guinea', capital: 'Malabo', region: 'Africa', isoCode: 'GQ', difficulty: 'Hard', aliases: [] },
  { name: 'Eritrea', capital: 'Asmara', region: 'Africa', isoCode: 'ER', difficulty: 'Hard', aliases: [] },
  { name: 'Eswatini', capital: 'Mbabane', region: 'Africa', isoCode: 'SZ', difficulty: 'Hard', aliases: ['Swaziland', 'Lobamba'] },
  { name: 'Ethiopia', capital: 'Addis Ababa', region: 'Africa', isoCode: 'ET', difficulty: 'Medium', aliases: [] },
  { name: 'Gabon', capital: 'Libreville', region: 'Africa', isoCode: 'GA', difficulty: 'Hard', aliases: [] },
  { name: 'Gambia', capital: 'Banjul', region: 'Africa', isoCode: 'GM', difficulty: 'Hard', aliases: ['The Gambia'] },
  { name: 'Ghana', capital: 'Accra', region: 'Africa', isoCode: 'GH', difficulty: 'Medium', aliases: [] },
  { name: 'Guinea', capital: 'Conakry', region: 'Africa', isoCode: 'GN', difficulty: 'Hard', aliases: [] },
  { name: 'Guinea-Bissau', capital: 'Bissau', region: 'Africa', isoCode: 'GW', difficulty: 'Hard', aliases: ['Guinea Bissau'] },
  { name: 'Kenya', capital: 'Nairobi', region: 'Africa', isoCode: 'KE', difficulty: 'Easy', aliases: [] },
  { name: 'Lesotho', capital: 'Maseru', region: 'Africa', isoCode: 'LS', difficulty: 'Hard', aliases: [] },
  { name: 'Liberia', capital: 'Monrovia', region: 'Africa', isoCode: 'LR', difficulty: 'Hard', aliases: [] },
  { name: 'Libya', capital: 'Tripoli', region: 'Africa', isoCode: 'LY', difficulty: 'Medium', aliases: [] },
  { name: 'Madagascar', capital: 'Antananarivo', region: 'Africa', isoCode: 'MG', difficulty: 'Medium', aliases: [] },
  { name: 'Malawi', capital: 'Lilongwe', region: 'Africa', isoCode: 'MW', difficulty: 'Hard', aliases: [] },
  { name: 'Mali', capital: 'Bamako', region: 'Africa', isoCode: 'ML', difficulty: 'Hard', aliases: [] },
  { name: 'Mauritania', capital: 'Nouakchott', region: 'Africa', isoCode: 'MR', difficulty: 'Hard', aliases: [] },
  { name: 'Mauritius', capital: 'Port Louis', region: 'Africa', isoCode: 'MU', difficulty: 'Medium', aliases: [] },
  { name: 'Morocco', capital: 'Rabat', region: 'Africa', isoCode: 'MA', difficulty: 'Easy', aliases: [] },
  { name: 'Mozambique', capital: 'Maputo', region: 'Africa', isoCode: 'MZ', difficulty: 'Medium', aliases: [] },
  { name: 'Namibia', capital: 'Windhoek', region: 'Africa', isoCode: 'NA', difficulty: 'Medium', aliases: [] },
  { name: 'Niger', capital: 'Niamey', region: 'Africa', isoCode: 'NE', difficulty: 'Hard', aliases: [] },
  { name: 'Nigeria', capital: 'Abuja', region: 'Africa', isoCode: 'NG', difficulty: 'Easy', aliases: [] },
  { name: 'Rwanda', capital: 'Kigali', region: 'Africa', isoCode: 'RW', difficulty: 'Medium', aliases: [] },
  { name: 'São Tomé and Príncipe', capital: 'São Tomé', region: 'Africa', isoCode: 'ST', difficulty: 'Hard', aliases: ['Sao Tome and Principe', 'Sao Tome'] },
  { name: 'Senegal', capital: 'Dakar', region: 'Africa', isoCode: 'SN', difficulty: 'Medium', aliases: [] },
  { name: 'Seychelles', capital: 'Victoria', region: 'Africa', isoCode: 'SC', difficulty: 'Hard', aliases: [] },
  { name: 'Sierra Leone', capital: 'Freetown', region: 'Africa', isoCode: 'SL', difficulty: 'Hard', aliases: [] },
  { name: 'Somalia', capital: 'Mogadishu', region: 'Africa', isoCode: 'SO', difficulty: 'Medium', aliases: [] },
  { name: 'South Africa', capital: 'Pretoria', region: 'Africa', isoCode: 'ZA', difficulty: 'Easy', aliases: ['RSA', 'Cape Town', 'Bloemfontein'] },
  { name: 'South Sudan', capital: 'Juba', region: 'Africa', isoCode: 'SS', difficulty: 'Hard', aliases: [] },
  { name: 'Sudan', capital: 'Khartoum', region: 'Africa', isoCode: 'SD', difficulty: 'Medium', aliases: [] },
  { name: 'Tanzania', capital: 'Dodoma', region: 'Africa', isoCode: 'TZ', difficulty: 'Medium', aliases: ['Dar es Salaam'] },
  { name: 'Togo', capital: 'Lomé', region: 'Africa', isoCode: 'TG', difficulty: 'Hard', aliases: ['Lome'] },
  { name: 'Tunisia', capital: 'Tunis', region: 'Africa', isoCode: 'TN', difficulty: 'Medium', aliases: [] },
  { name: 'Uganda', capital: 'Kampala', region: 'Africa', isoCode: 'UG', difficulty: 'Medium', aliases: [] },
  { name: 'Zambia', capital: 'Lusaka', region: 'Africa', isoCode: 'ZM', difficulty: 'Medium', aliases: [] },
  { name: 'Zimbabwe', capital: 'Harare', region: 'Africa', isoCode: 'ZW', difficulty: 'Medium', aliases: [] },

  // ------------------------------------------------------------------ Asia (48)
  { name: 'Afghanistan', capital: 'Kabul', region: 'Asia', isoCode: 'AF', difficulty: 'Easy', aliases: [] },
  { name: 'Armenia', capital: 'Yerevan', region: 'Asia', isoCode: 'AM', difficulty: 'Medium', aliases: [] },
  { name: 'Azerbaijan', capital: 'Baku', region: 'Asia', isoCode: 'AZ', difficulty: 'Medium', aliases: [] },
  { name: 'Bahrain', capital: 'Manama', region: 'Asia', isoCode: 'BH', difficulty: 'Medium', aliases: [] },
  { name: 'Bangladesh', capital: 'Dhaka', region: 'Asia', isoCode: 'BD', difficulty: 'Medium', aliases: [] },
  { name: 'Bhutan', capital: 'Thimphu', region: 'Asia', isoCode: 'BT', difficulty: 'Hard', aliases: [] },
  { name: 'Brunei', capital: 'Bandar Seri Begawan', region: 'Asia', isoCode: 'BN', difficulty: 'Hard', aliases: ['Brunei Darussalam'] },
  { name: 'Cambodia', capital: 'Phnom Penh', region: 'Asia', isoCode: 'KH', difficulty: 'Medium', aliases: [] },
  { name: 'China', capital: 'Beijing', region: 'Asia', isoCode: 'CN', difficulty: 'Easy', aliases: ['PRC', "People's Republic of China", 'Peking'] },
  { name: 'Cyprus', capital: 'Nicosia', region: 'Asia', isoCode: 'CY', difficulty: 'Medium', aliases: [] },
  { name: 'Georgia', capital: 'Tbilisi', region: 'Asia', isoCode: 'GE', difficulty: 'Medium', aliases: [] },
  { name: 'India', capital: 'New Delhi', region: 'Asia', isoCode: 'IN', difficulty: 'Easy', aliases: ['Delhi'] },
  { name: 'Indonesia', capital: 'Jakarta', region: 'Asia', isoCode: 'ID', difficulty: 'Easy', aliases: [] },
  { name: 'Iran', capital: 'Tehran', region: 'Asia', isoCode: 'IR', difficulty: 'Easy', aliases: ['Persia'] },
  { name: 'Iraq', capital: 'Baghdad', region: 'Asia', isoCode: 'IQ', difficulty: 'Easy', aliases: [] },
  { name: 'Israel', capital: 'Jerusalem', region: 'Asia', isoCode: 'IL', difficulty: 'Easy', aliases: ['Tel Aviv'] },
  { name: 'Japan', capital: 'Tokyo', region: 'Asia', isoCode: 'JP', difficulty: 'Easy', aliases: [] },
  { name: 'Jordan', capital: 'Amman', region: 'Asia', isoCode: 'JO', difficulty: 'Easy', aliases: [] },
  { name: 'Kazakhstan', capital: 'Astana', region: 'Asia', isoCode: 'KZ', difficulty: 'Medium', aliases: ['Nur-Sultan', 'Almaty'] },
  { name: 'Kuwait', capital: 'Kuwait City', region: 'Asia', isoCode: 'KW', difficulty: 'Easy', aliases: [] },
  { name: 'Kyrgyzstan', capital: 'Bishkek', region: 'Asia', isoCode: 'KG', difficulty: 'Medium', aliases: ['Kirghizia'] },
  { name: 'Laos', capital: 'Vientiane', region: 'Asia', isoCode: 'LA', difficulty: 'Medium', aliases: ['Lao PDR'] },
  { name: 'Lebanon', capital: 'Beirut', region: 'Asia', isoCode: 'LB', difficulty: 'Easy', aliases: [] },
  { name: 'Malaysia', capital: 'Kuala Lumpur', region: 'Asia', isoCode: 'MY', difficulty: 'Easy', aliases: ['Putrajaya'] },
  { name: 'Maldives', capital: 'Malé', region: 'Asia', isoCode: 'MV', difficulty: 'Hard', aliases: ['Male'] },
  { name: 'Mongolia', capital: 'Ulaanbaatar', region: 'Asia', isoCode: 'MN', difficulty: 'Medium', aliases: ['Ulan Bator'] },
  { name: 'Myanmar', capital: 'Naypyidaw', region: 'Asia', isoCode: 'MM', difficulty: 'Medium', aliases: ['Burma', 'Nay Pyi Taw'] },
  { name: 'Nepal', capital: 'Kathmandu', region: 'Asia', isoCode: 'NP', difficulty: 'Medium', aliases: [] },
  { name: 'North Korea', capital: 'Pyongyang', region: 'Asia', isoCode: 'KP', difficulty: 'Easy', aliases: ['DPRK', "Democratic People's Republic of Korea"] },
  { name: 'Oman', capital: 'Muscat', region: 'Asia', isoCode: 'OM', difficulty: 'Medium', aliases: [] },
  { name: 'Pakistan', capital: 'Islamabad', region: 'Asia', isoCode: 'PK', difficulty: 'Easy', aliases: [] },
  { name: 'Palestine', capital: 'Ramallah', region: 'Asia', isoCode: 'PS', difficulty: 'Easy', aliases: ['State of Palestine', 'East Jerusalem'] },
  { name: 'Philippines', capital: 'Manila', region: 'Asia', isoCode: 'PH', difficulty: 'Easy', aliases: ['The Philippines'] },
  { name: 'Qatar', capital: 'Doha', region: 'Asia', isoCode: 'QA', difficulty: 'Easy', aliases: [] },
  { name: 'Saudi Arabia', capital: 'Riyadh', region: 'Asia', isoCode: 'SA', difficulty: 'Easy', aliases: [] },
  { name: 'Singapore', capital: 'Singapore', region: 'Asia', isoCode: 'SG', difficulty: 'Easy', aliases: ['Singapore City'] },
  { name: 'South Korea', capital: 'Seoul', region: 'Asia', isoCode: 'KR', difficulty: 'Easy', aliases: ['Korea', 'Republic of Korea', 'ROK'] },
  { name: 'Sri Lanka', capital: 'Sri Jayawardenepura Kotte', region: 'Asia', isoCode: 'LK', difficulty: 'Medium', aliases: ['Colombo', 'Ceylon'] },
  { name: 'Syria', capital: 'Damascus', region: 'Asia', isoCode: 'SY', difficulty: 'Easy', aliases: [] },
  { name: 'Tajikistan', capital: 'Dushanbe', region: 'Asia', isoCode: 'TJ', difficulty: 'Hard', aliases: [] },
  { name: 'Thailand', capital: 'Bangkok', region: 'Asia', isoCode: 'TH', difficulty: 'Easy', aliases: ['Siam'] },
  { name: 'Timor-Leste', capital: 'Dili', region: 'Asia', isoCode: 'TL', difficulty: 'Hard', aliases: ['East Timor'] },
  { name: 'Turkey', capital: 'Ankara', region: 'Asia', isoCode: 'TR', difficulty: 'Easy', aliases: ['Türkiye', 'Turkiye', 'Istanbul'] },
  { name: 'Turkmenistan', capital: 'Ashgabat', region: 'Asia', isoCode: 'TM', difficulty: 'Hard', aliases: [] },
  { name: 'United Arab Emirates', capital: 'Abu Dhabi', region: 'Asia', isoCode: 'AE', difficulty: 'Easy', aliases: ['UAE', 'Emirates', 'Dubai'] },
  { name: 'Uzbekistan', capital: 'Tashkent', region: 'Asia', isoCode: 'UZ', difficulty: 'Medium', aliases: [] },
  { name: 'Vietnam', capital: 'Hanoi', region: 'Asia', isoCode: 'VN', difficulty: 'Easy', aliases: ['Viet Nam'] },
  { name: 'Yemen', capital: 'Sanaa', region: 'Asia', isoCode: 'YE', difficulty: 'Easy', aliases: ["Sana'a"] },

  // ---------------------------------------------------------------- Europe (44)
  { name: 'Albania', capital: 'Tirana', region: 'Europe', isoCode: 'AL', difficulty: 'Medium', aliases: ['Tirane'] },
  { name: 'Andorra', capital: 'Andorra la Vella', region: 'Europe', isoCode: 'AD', difficulty: 'Hard', aliases: [] },
  { name: 'Austria', capital: 'Vienna', region: 'Europe', isoCode: 'AT', difficulty: 'Easy', aliases: ['Wien'] },
  { name: 'Belarus', capital: 'Minsk', region: 'Europe', isoCode: 'BY', difficulty: 'Medium', aliases: [] },
  { name: 'Belgium', capital: 'Brussels', region: 'Europe', isoCode: 'BE', difficulty: 'Easy', aliases: ['Bruxelles'] },
  { name: 'Bosnia and Herzegovina', capital: 'Sarajevo', region: 'Europe', isoCode: 'BA', difficulty: 'Medium', aliases: ['Bosnia'] },
  { name: 'Bulgaria', capital: 'Sofia', region: 'Europe', isoCode: 'BG', difficulty: 'Medium', aliases: [] },
  { name: 'Croatia', capital: 'Zagreb', region: 'Europe', isoCode: 'HR', difficulty: 'Medium', aliases: ['Hrvatska'] },
  { name: 'Czechia', capital: 'Prague', region: 'Europe', isoCode: 'CZ', difficulty: 'Medium', aliases: ['Czech Republic', 'Praha'] },
  { name: 'Denmark', capital: 'Copenhagen', region: 'Europe', isoCode: 'DK', difficulty: 'Easy', aliases: ['København'] },
  { name: 'Estonia', capital: 'Tallinn', region: 'Europe', isoCode: 'EE', difficulty: 'Medium', aliases: [] },
  { name: 'Finland', capital: 'Helsinki', region: 'Europe', isoCode: 'FI', difficulty: 'Easy', aliases: [] },
  { name: 'France', capital: 'Paris', region: 'Europe', isoCode: 'FR', difficulty: 'Easy', aliases: [] },
  { name: 'Germany', capital: 'Berlin', region: 'Europe', isoCode: 'DE', difficulty: 'Easy', aliases: ['Deutschland'] },
  { name: 'Greece', capital: 'Athens', region: 'Europe', isoCode: 'GR', difficulty: 'Easy', aliases: ['Hellas', 'Athina'] },
  { name: 'Hungary', capital: 'Budapest', region: 'Europe', isoCode: 'HU', difficulty: 'Medium', aliases: [] },
  { name: 'Iceland', capital: 'Reykjavík', region: 'Europe', isoCode: 'IS', difficulty: 'Easy', aliases: ['Reykjavik'] },
  { name: 'Ireland', capital: 'Dublin', region: 'Europe', isoCode: 'IE', difficulty: 'Easy', aliases: ['Republic of Ireland', 'Eire'] },
  { name: 'Italy', capital: 'Rome', region: 'Europe', isoCode: 'IT', difficulty: 'Easy', aliases: ['Roma', 'Italia'] },
  { name: 'Latvia', capital: 'Riga', region: 'Europe', isoCode: 'LV', difficulty: 'Medium', aliases: [] },
  { name: 'Liechtenstein', capital: 'Vaduz', region: 'Europe', isoCode: 'LI', difficulty: 'Hard', aliases: [] },
  { name: 'Lithuania', capital: 'Vilnius', region: 'Europe', isoCode: 'LT', difficulty: 'Medium', aliases: [] },
  { name: 'Luxembourg', capital: 'Luxembourg', region: 'Europe', isoCode: 'LU', difficulty: 'Hard', aliases: ['Luxembourg City'] },
  { name: 'Malta', capital: 'Valletta', region: 'Europe', isoCode: 'MT', difficulty: 'Hard', aliases: [] },
  { name: 'Moldova', capital: 'Chișinău', region: 'Europe', isoCode: 'MD', difficulty: 'Hard', aliases: ['Chisinau', 'Kishinev'] },
  { name: 'Monaco', capital: 'Monaco', region: 'Europe', isoCode: 'MC', difficulty: 'Hard', aliases: ['Monte Carlo'] },
  { name: 'Montenegro', capital: 'Podgorica', region: 'Europe', isoCode: 'ME', difficulty: 'Hard', aliases: [] },
  { name: 'Netherlands', capital: 'Amsterdam', region: 'Europe', isoCode: 'NL', difficulty: 'Easy', aliases: ['Holland', 'The Hague'] },
  { name: 'North Macedonia', capital: 'Skopje', region: 'Europe', isoCode: 'MK', difficulty: 'Hard', aliases: ['Macedonia'] },
  { name: 'Norway', capital: 'Oslo', region: 'Europe', isoCode: 'NO', difficulty: 'Easy', aliases: ['Norge'] },
  { name: 'Poland', capital: 'Warsaw', region: 'Europe', isoCode: 'PL', difficulty: 'Easy', aliases: ['Warszawa', 'Polska'] },
  { name: 'Portugal', capital: 'Lisbon', region: 'Europe', isoCode: 'PT', difficulty: 'Easy', aliases: ['Lisboa'] },
  { name: 'Romania', capital: 'Bucharest', region: 'Europe', isoCode: 'RO', difficulty: 'Medium', aliases: ['Bucuresti'] },
  { name: 'Russia', capital: 'Moscow', region: 'Europe', isoCode: 'RU', difficulty: 'Easy', aliases: ['Russian Federation', 'Moskva'] },
  { name: 'San Marino', capital: 'San Marino', region: 'Europe', isoCode: 'SM', difficulty: 'Hard', aliases: ['City of San Marino'] },
  { name: 'Serbia', capital: 'Belgrade', region: 'Europe', isoCode: 'RS', difficulty: 'Medium', aliases: ['Beograd'] },
  { name: 'Slovakia', capital: 'Bratislava', region: 'Europe', isoCode: 'SK', difficulty: 'Medium', aliases: ['Slovak Republic'] },
  { name: 'Slovenia', capital: 'Ljubljana', region: 'Europe', isoCode: 'SI', difficulty: 'Medium', aliases: [] },
  { name: 'Spain', capital: 'Madrid', region: 'Europe', isoCode: 'ES', difficulty: 'Easy', aliases: ['España'] },
  { name: 'Sweden', capital: 'Stockholm', region: 'Europe', isoCode: 'SE', difficulty: 'Easy', aliases: ['Sverige'] },
  { name: 'Switzerland', capital: 'Bern', region: 'Europe', isoCode: 'CH', difficulty: 'Easy', aliases: ['Berne', 'Zurich'] },
  { name: 'Ukraine', capital: 'Kyiv', region: 'Europe', isoCode: 'UA', difficulty: 'Easy', aliases: ['Kiev'] },
  { name: 'United Kingdom', capital: 'London', region: 'Europe', isoCode: 'GB', difficulty: 'Easy', aliases: ['UK', 'Great Britain', 'Britain'] },
  { name: 'Vatican City', capital: 'Vatican City', region: 'Europe', isoCode: 'VA', difficulty: 'Medium', aliases: ['Holy See', 'Vatican'] },

  // -------------------------------------------------------------- Americas (35)
  { name: 'Antigua and Barbuda', capital: "Saint John's", region: 'Americas', isoCode: 'AG', difficulty: 'Hard', aliases: ['St Johns'] },
  { name: 'Argentina', capital: 'Buenos Aires', region: 'Americas', isoCode: 'AR', difficulty: 'Easy', aliases: [] },
  { name: 'Bahamas', capital: 'Nassau', region: 'Americas', isoCode: 'BS', difficulty: 'Medium', aliases: ['The Bahamas'] },
  { name: 'Barbados', capital: 'Bridgetown', region: 'Americas', isoCode: 'BB', difficulty: 'Hard', aliases: [] },
  { name: 'Belize', capital: 'Belmopan', region: 'Americas', isoCode: 'BZ', difficulty: 'Hard', aliases: ['Belize City'] },
  { name: 'Bolivia', capital: 'Sucre', region: 'Americas', isoCode: 'BO', difficulty: 'Medium', aliases: ['La Paz'] },
  { name: 'Brazil', capital: 'Brasília', region: 'Americas', isoCode: 'BR', difficulty: 'Easy', aliases: ['Brasil', 'Brasilia'] },
  { name: 'Canada', capital: 'Ottawa', region: 'Americas', isoCode: 'CA', difficulty: 'Easy', aliases: [] },
  { name: 'Chile', capital: 'Santiago', region: 'Americas', isoCode: 'CL', difficulty: 'Medium', aliases: [] },
  { name: 'Colombia', capital: 'Bogotá', region: 'Americas', isoCode: 'CO', difficulty: 'Easy', aliases: ['Bogota'] },
  { name: 'Costa Rica', capital: 'San José', region: 'Americas', isoCode: 'CR', difficulty: 'Medium', aliases: ['San Jose'] },
  { name: 'Cuba', capital: 'Havana', region: 'Americas', isoCode: 'CU', difficulty: 'Easy', aliases: ['La Habana'] },
  { name: 'Dominica', capital: 'Roseau', region: 'Americas', isoCode: 'DM', difficulty: 'Hard', aliases: [] },
  { name: 'Dominican Republic', capital: 'Santo Domingo', region: 'Americas', isoCode: 'DO', difficulty: 'Medium', aliases: ['DR'] },
  { name: 'Ecuador', capital: 'Quito', region: 'Americas', isoCode: 'EC', difficulty: 'Medium', aliases: [] },
  { name: 'El Salvador', capital: 'San Salvador', region: 'Americas', isoCode: 'SV', difficulty: 'Medium', aliases: [] },
  { name: 'Grenada', capital: "Saint George's", region: 'Americas', isoCode: 'GD', difficulty: 'Hard', aliases: ['St Georges'] },
  { name: 'Guatemala', capital: 'Guatemala City', region: 'Americas', isoCode: 'GT', difficulty: 'Medium', aliases: ['Guatemala'] },
  { name: 'Guyana', capital: 'Georgetown', region: 'Americas', isoCode: 'GY', difficulty: 'Hard', aliases: [] },
  { name: 'Haiti', capital: 'Port-au-Prince', region: 'Americas', isoCode: 'HT', difficulty: 'Medium', aliases: ['Port au Prince'] },
  { name: 'Honduras', capital: 'Tegucigalpa', region: 'Americas', isoCode: 'HN', difficulty: 'Medium', aliases: [] },
  { name: 'Jamaica', capital: 'Kingston', region: 'Americas', isoCode: 'JM', difficulty: 'Medium', aliases: [] },
  { name: 'Mexico', capital: 'Mexico City', region: 'Americas', isoCode: 'MX', difficulty: 'Easy', aliases: ['México', 'Ciudad de México', 'CDMX'] },
  { name: 'Nicaragua', capital: 'Managua', region: 'Americas', isoCode: 'NI', difficulty: 'Medium', aliases: [] },
  { name: 'Panama', capital: 'Panama City', region: 'Americas', isoCode: 'PA', difficulty: 'Medium', aliases: ['Panamá'] },
  { name: 'Paraguay', capital: 'Asunción', region: 'Americas', isoCode: 'PY', difficulty: 'Medium', aliases: ['Asuncion'] },
  { name: 'Peru', capital: 'Lima', region: 'Americas', isoCode: 'PE', difficulty: 'Easy', aliases: ['Perú'] },
  { name: 'Saint Kitts and Nevis', capital: 'Basseterre', region: 'Americas', isoCode: 'KN', difficulty: 'Hard', aliases: ['St Kitts and Nevis'] },
  { name: 'Saint Lucia', capital: 'Castries', region: 'Americas', isoCode: 'LC', difficulty: 'Hard', aliases: ['St Lucia'] },
  { name: 'Saint Vincent and the Grenadines', capital: 'Kingstown', region: 'Americas', isoCode: 'VC', difficulty: 'Hard', aliases: ['St Vincent and the Grenadines', 'St Vincent'] },
  { name: 'Suriname', capital: 'Paramaribo', region: 'Americas', isoCode: 'SR', difficulty: 'Hard', aliases: [] },
  { name: 'Trinidad and Tobago', capital: 'Port of Spain', region: 'Americas', isoCode: 'TT', difficulty: 'Hard', aliases: ['Trinidad'] },
  { name: 'United States', capital: 'Washington, D.C.', region: 'Americas', isoCode: 'US', difficulty: 'Easy', aliases: ['USA', 'US', 'U.S.', 'America', 'United States of America', 'Washington DC'] },
  { name: 'Uruguay', capital: 'Montevideo', region: 'Americas', isoCode: 'UY', difficulty: 'Medium', aliases: [] },
  { name: 'Venezuela', capital: 'Caracas', region: 'Americas', isoCode: 'VE', difficulty: 'Easy', aliases: [] },

  // --------------------------------------------------------------- Oceania (14)
  { name: 'Australia', capital: 'Canberra', region: 'Oceania', isoCode: 'AU', difficulty: 'Easy', aliases: ['Oz'] },
  { name: 'Fiji', capital: 'Suva', region: 'Oceania', isoCode: 'FJ', difficulty: 'Medium', aliases: [] },
  { name: 'Kiribati', capital: 'South Tarawa', region: 'Oceania', isoCode: 'KI', difficulty: 'Hard', aliases: ['Tarawa'] },
  { name: 'Marshall Islands', capital: 'Majuro', region: 'Oceania', isoCode: 'MH', difficulty: 'Hard', aliases: [] },
  { name: 'Micronesia', capital: 'Palikir', region: 'Oceania', isoCode: 'FM', difficulty: 'Hard', aliases: ['Federated States of Micronesia', 'FSM'] },
  { name: 'Nauru', capital: 'Yaren', region: 'Oceania', isoCode: 'NR', difficulty: 'Hard', aliases: [] },
  { name: 'New Zealand', capital: 'Wellington', region: 'Oceania', isoCode: 'NZ', difficulty: 'Easy', aliases: ['NZ', 'Aotearoa'] },
  { name: 'Palau', capital: 'Ngerulmud', region: 'Oceania', isoCode: 'PW', difficulty: 'Hard', aliases: [] },
  { name: 'Papua New Guinea', capital: 'Port Moresby', region: 'Oceania', isoCode: 'PG', difficulty: 'Medium', aliases: ['PNG'] },
  { name: 'Samoa', capital: 'Apia', region: 'Oceania', isoCode: 'WS', difficulty: 'Hard', aliases: ['Western Samoa'] },
  { name: 'Solomon Islands', capital: 'Honiara', region: 'Oceania', isoCode: 'SB', difficulty: 'Hard', aliases: [] },
  { name: 'Tonga', capital: "Nuku'alofa", region: 'Oceania', isoCode: 'TO', difficulty: 'Hard', aliases: ['Nukualofa'] },
  { name: 'Tuvalu', capital: 'Funafuti', region: 'Oceania', isoCode: 'TV', difficulty: 'Hard', aliases: [] },
  { name: 'Vanuatu', capital: 'Port Vila', region: 'Oceania', isoCode: 'VU', difficulty: 'Hard', aliases: [] },
];

/** Country counts per region, derived so the recall screens can show a total. */
export const COUNTRY_COUNTS_BY_REGION: Readonly<Record<Region, number>> = COUNTRIES.reduce(
  (acc, c) => ({ ...acc, [c.region]: (acc[c.region] ?? 0) + 1 }),
  {} as Record<Region, number>,
);
