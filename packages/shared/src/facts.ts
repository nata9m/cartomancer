import type { CountrySeed } from './countries.js';

export interface CountryFactSeed {
  /** Canonical country name, matched against `countries.name` at seed time. */
  countryName: CountrySeed['name'] | string;
  fact: string;
}

/**
 * Trivia clues: one country per entry, 143 of the 195 covered.
 *
 * House rules for anything added here, because they are what makes a clue
 * playable:
 *   * never name the country, its capital, its people or its language — the
 *     answer has to be deduced, not read
 *   * be true of exactly one country, so the answer is unambiguous. Watch the
 *     shared facts in particular: two countries share the Victoria Falls, two
 *     share Hispaniola, and two are doubly landlocked, so each of those clues
 *     has to carry something that separates them
 *   * prefer the memorable and checkable over the obscure: superlatives,
 *     firsts, landmarks and quirks, not statistics that drift year to year
 *
 * The remaining 52 countries have no clue yet, and the trivia quiz only draws
 * from countries that do — so it currently offers up to 143 distinct questions,
 * far more than its longest round (30). Adding more is a data-only change: append
 * rows and re-run the seed (facts upsert on (country, fact), so re-running is
 * safe and is how updated content reaches a live database).
 */
export const COUNTRY_FACTS: readonly CountryFactSeed[] = [
  // ─── Europe ────────────────────────────────────────────────────────────────
  {
    countryName: 'Iceland',
    fact: 'It has no mosquitoes, and its parliament — founded in 930 AD — is among the oldest still sitting.',
  },
  {
    countryName: 'Vatican City',
    fact: 'The smallest sovereign state on earth, with a population you could seat in a school assembly hall.',
  },
  {
    countryName: 'Monaco',
    fact: 'The second-smallest state in the world, where a Formula 1 race runs through ordinary streets past a famous casino.',
  },
  {
    countryName: 'San Marino',
    fact: 'Claims to be the world’s oldest surviving republic, founded in 301 AD, and sits entirely inside one larger neighbour.',
  },
  {
    countryName: 'Andorra',
    fact: 'A Pyrenean microstate with no airport and two heads of state, one of whom is the serving president of France.',
  },
  {
    countryName: 'Liechtenstein',
    fact: 'A German-speaking principality wedged between Switzerland and Austria, so landlocked you must cross two countries to reach the sea.',
  },
  {
    countryName: 'Italy',
    fact: 'Two independent states sit entirely within its borders, and it has more UNESCO World Heritage sites than anywhere else.',
  },
  {
    countryName: 'France',
    fact: 'The most-visited country on earth, and the origin of the metric system.',
  },
  {
    countryName: 'Spain',
    fact: 'Home to a festival where tens of thousands throw overripe tomatoes at each other, and to a cathedral still unfinished after 140 years.',
  },
  {
    countryName: 'Portugal',
    fact: 'Produces about half the world’s cork, and its border with its only neighbour is among the oldest unchanged in Europe.',
  },
  {
    countryName: 'Germany',
    fact: 'Some stretches of its motorway network have no speed limit at all, and it claims over 1,500 kinds of sausage.',
  },
  {
    countryName: 'Switzerland',
    fact: 'Neutral in both world wars, it keeps enough nuclear shelter space for its entire population.',
  },
  {
    countryName: 'Austria',
    fact: 'Mozart was born here, the waltz was perfected here, and two thirds of it is covered by the Alps.',
  },
  {
    countryName: 'Netherlands',
    fact: 'About a quarter of its land sits below sea level, reclaimed and held back by dykes.',
  },
  {
    countryName: 'Belgium',
    fact: 'It hosts the European Union’s main institutions, and gave the world Tintin, the Smurfs and 800-odd beers.',
  },
  {
    countryName: 'Norway',
    fact: 'Deep glacial inlets cut its coast into one of the longest shorelines on earth, and its far north sees the sun at midnight.',
  },
  {
    countryName: 'Sweden',
    fact: 'It gave away the patent for the three-point seatbelt to save lives, and exports flat-pack furniture worldwide.',
  },
  {
    countryName: 'Finland',
    fact: 'It has roughly 188,000 lakes and more saunas than cars.',
  },
  {
    countryName: 'Denmark',
    fact: 'The interlocking plastic brick was invented here, and it holds one of the oldest continuous monarchies in the world.',
  },
  {
    countryName: 'Ireland',
    fact: 'An island with no native snakes, where a national holiday turns rivers green around the world.',
  },
  {
    countryName: 'United Kingdom',
    fact: 'Traffic drives on the left, and the famous name of its great clock belongs to the bell, not the tower.',
  },
  {
    countryName: 'Poland',
    fact: 'Marie Curie was born here, and Europe’s last great primeval lowland forest straddles its eastern border.',
  },
  {
    countryName: 'Czechia',
    fact: 'Drinks more beer per person than any other nation, and its capital’s astronomical clock has run since 1410.',
  },
  {
    countryName: 'Hungary',
    fact: 'The twisting cube puzzle that sold hundreds of millions was invented here by an architecture professor.',
  },
  {
    countryName: 'Romania',
    fact: 'Its Transylvanian castles inspired the most famous vampire in fiction, and it holds Europe’s heaviest building.',
  },
  {
    countryName: 'Bulgaria',
    fact: 'Its Valley of the Roses produces much of the world’s rose oil, and nodding the head here can mean "no".',
  },
  {
    countryName: 'Croatia',
    fact: 'The necktie takes its name from this country’s 17th-century soldiers, and its coast has over a thousand islands.',
  },
  {
    countryName: 'Greece',
    fact: 'It gave the world the Olympic Games and democracy, and has thousands of islands of which only about 200 are inhabited.',
  },
  {
    countryName: 'Ukraine',
    fact: 'The largest country lying entirely within Europe, and site of the 1986 reactor disaster.',
  },
  {
    countryName: 'Russia',
    fact: 'It spans eleven time zones and borders fourteen countries.',
  },
  {
    countryName: 'Belarus',
    fact: 'Landlocked and famously flat, it shares Europe’s last primeval forest and its herd of wild bison.',
  },
  {
    countryName: 'Estonia',
    fact: 'It made internet access a social right, pioneered e-residency, and is where Skype was built.',
  },
  {
    countryName: 'Latvia',
    fact: 'Half of it is forest, and its capital holds one of the greatest concentrations of Art Nouveau buildings anywhere.',
  },
  {
    countryName: 'Lithuania',
    fact: 'A hill here is covered with hundreds of thousands of crosses left by pilgrims, and it was the first Soviet republic to declare independence.',
  },
  {
    countryName: 'Luxembourg',
    fact: 'A grand duchy that in 2020 became the first country to make all public transport free.',
  },
  {
    countryName: 'Malta',
    fact: 'The smallest EU member state, an archipelago once ruled by a crusading order of knights.',
  },
  {
    countryName: 'Cyprus',
    fact: 'An island whose capital is the last divided capital in Europe, split by a UN buffer zone.',
  },
  {
    countryName: 'Serbia',
    fact: 'Landlocked in the Balkans, birthplace of the inventor who gave his name to the unit of magnetic flux density.',
  },
  {
    countryName: 'Montenegro',
    fact: 'Its name means "black mountain", and its deep bay is often called Europe’s southernmost fjord.',
  },
  {
    countryName: 'Slovenia',
    fact: 'More than half of it is forest, and a church on an island in a glacial lake is its best-known image.',
  },

  // ─── Asia ──────────────────────────────────────────────────────────────────
  {
    countryName: 'Japan',
    fact: 'It has more than 6,800 islands, and vending machines outnumber people in some city blocks.',
  },
  {
    countryName: 'China',
    fact: 'Despite spanning five geographic time zones, the whole country runs on a single official clock.',
  },
  {
    countryName: 'India',
    fact: 'Chess and the decimal zero were born here, and it holds the largest electorate on earth.',
  },
  {
    countryName: 'Nepal',
    fact: 'The only country whose flag is not a rectangle, and the summit of the world sits on its border.',
  },
  {
    countryName: 'Bhutan',
    fact: 'It measures national success by Gross National Happiness and absorbs more carbon than it emits.',
  },
  {
    countryName: 'Bangladesh',
    fact: 'Built on the largest river delta on earth, where three great rivers meet the sea.',
  },
  {
    countryName: 'Pakistan',
    fact: 'The second-highest mountain on earth stands on its northern border, deadlier to climbers than the highest.',
  },
  {
    countryName: 'Sri Lanka',
    fact: 'An island long famous for its tea, which still carries the country’s former colonial name on the packet.',
  },
  {
    countryName: 'Maldives',
    fact: 'The lowest-lying country on earth, averaging about a metre and a half above the sea that surrounds it.',
  },
  {
    countryName: 'Thailand',
    fact: 'The only country in its region never colonised by a European power, and the world’s biggest exporter of rice for decades.',
  },
  {
    countryName: 'Vietnam',
    fact: 'The world’s second-largest coffee exporter, where the drink is often served with condensed milk over ice.',
  },
  {
    countryName: 'Cambodia',
    fact: 'The largest religious monument on earth stands here, and it is the only national flag to depict a building.',
  },
  {
    countryName: 'Laos',
    fact: 'Landlocked and mountainous, it is the most heavily bombed country per person in history.',
  },
  {
    countryName: 'Myanmar',
    fact: 'It moved its seat of government to a purpose-built inland city in 2005, and a gilded pagoda dominates its largest city.',
  },
  {
    countryName: 'Malaysia',
    fact: 'Its twin towers were the tallest buildings in the world for six years, joined by a skybridge.',
  },
  {
    countryName: 'Singapore',
    fact: 'A city-state so small it has no countryside, where selling chewing gum was banned for decades.',
  },
  {
    countryName: 'Indonesia',
    fact: 'Thousands of islands strung along the equator, with more active volcanoes than any other country.',
  },
  {
    countryName: 'Philippines',
    fact: 'Over 7,000 islands, and brightly painted converted jeeps serve as its buses.',
  },
  {
    countryName: 'South Korea',
    fact: 'Among the fastest internet speeds on earth, and the world’s biggest exporter of pop music videos.',
  },
  {
    countryName: 'North Korea',
    fact: 'It counts years from 1912 on its own calendar, and its night side is famously dark from orbit.',
  },
  {
    countryName: 'Mongolia',
    fact: 'The least densely populated sovereign country, where roughly a quarter of people are nomadic.',
  },
  {
    countryName: 'Kazakhstan',
    fact: 'The largest landlocked country on earth, and every crewed flight to the space station launches from its steppe.',
  },
  {
    countryName: 'Uzbekistan',
    fact: 'A Silk Road crossroads of turquoise-domed cities, and one of only two countries you must cross two borders to leave for the sea.',
  },
  {
    countryName: 'Turkey',
    fact: 'Its largest city straddles two continents, divided by a strait.',
  },
  {
    countryName: 'Israel',
    fact: 'The lowest dry land on earth lies on its border, in water so salty swimmers cannot sink.',
  },
  {
    countryName: 'Jordan',
    fact: 'A rose-red city carved directly into sandstone cliffs, lost to outsiders for centuries, is its most famous site.',
  },
  {
    countryName: 'Saudi Arabia',
    fact: 'It contains the largest continuous sand desert in the world, and women were first allowed to drive here in 2018.',
  },
  {
    countryName: 'United Arab Emirates',
    fact: 'The tallest building in the world rises from its desert, and a federation of seven emirates governs it.',
  },
  {
    countryName: 'Qatar',
    fact: 'A small peninsula of enormous gas reserves, and the first Middle Eastern host of a football World Cup.',
  },
  {
    countryName: 'Iran',
    fact: 'Heir to the Persian Empire, its ruined ceremonial capital Persepolis was burned by Alexander the Great.',
  },
  {
    countryName: 'Iraq',
    fact: 'The land between two great rivers, where writing and the wheel first appear in the record.',
  },
  {
    countryName: 'Afghanistan',
    fact: 'Landlocked and crossed by the Hindu Kush, it is the source of most of the world’s lapis lazuli.',
  },
  {
    countryName: 'Armenia',
    fact: 'The first state in the world to adopt Christianity, in 301 AD, and its symbol is a mountain across the border.',
  },
  {
    countryName: 'Georgia',
    fact: 'Wine has been made here for 8,000 years, in buried clay vessels.',
  },
  {
    countryName: 'Timor-Leste',
    fact: 'It occupies half an island and became the first new sovereign state of the 21st century.',
  },

  // ─── Africa ────────────────────────────────────────────────────────────────
  {
    countryName: 'Egypt',
    fact: 'The only surviving wonder of the ancient world stands here, and almost everyone lives along one river.',
  },
  {
    countryName: 'Sudan',
    fact: 'It has more ancient pyramids than its more famous northern neighbour — around 200 of them.',
  },
  {
    countryName: 'Ethiopia',
    fact: 'It follows a 13-month calendar seven years behind most of the world, and coffee was first cultivated here.',
  },
  {
    countryName: 'Kenya',
    fact: 'The Great Rift Valley runs through it, and its highlands have produced a remarkable share of the world’s distance runners.',
  },
  {
    countryName: 'Tanzania',
    fact: 'Africa’s highest peak rises from its plains, where millions of wildebeest migrate in a yearly circle.',
  },
  {
    countryName: 'Uganda',
    fact: 'The Nile begins its journey here, and roughly half the world’s remaining mountain gorillas live in its forests.',
  },
  {
    countryName: 'Rwanda',
    fact: 'Known as the land of a thousand hills, it banned plastic bags outright and has one of the world’s cleanest capitals.',
  },
  {
    countryName: 'South Africa',
    fact: 'It has three capital cities, one each for government, law and parliament, and hosted the first human heart transplant.',
  },
  {
    countryName: 'Namibia',
    fact: 'The world’s oldest desert runs into the Atlantic along a shore littered with shipwrecks.',
  },
  {
    countryName: 'Botswana',
    fact: 'Home to the largest elephant population on earth, and to a vast inland delta that never reaches the sea.',
  },
  {
    countryName: 'Zimbabwe',
    fact: 'Its great stone ruins gave the country its name, and it once printed a hundred-trillion-dollar banknote.',
  },
  {
    countryName: 'Zambia',
    fact: 'Named after the river that forms its southern border, it depends on copper for most of its exports.',
  },
  {
    countryName: 'Madagascar',
    fact: 'An island where about nine in ten species, lemurs among them, exist nowhere else on earth.',
  },
  {
    countryName: 'Morocco',
    fact: 'Home to the oldest continuously operating university in the world, and to a town painted entirely blue.',
  },
  {
    countryName: 'Algeria',
    fact: 'The largest country in Africa, more than four fifths of it Sahara.',
  },
  {
    countryName: 'Tunisia',
    fact: 'Africa’s northernmost point lies here, and its desert stood in for a distant planet in Star Wars.',
  },
  {
    countryName: 'Libya',
    fact: 'Over 90% desert, it recorded one of the hottest air temperatures ever measured on earth.',
  },
  {
    countryName: 'Nigeria',
    fact: 'The most populous country in Africa, and its film industry releases more titles a year than Hollywood.',
  },
  {
    countryName: 'Ghana',
    fact: 'The first country in sub-Saharan Africa to win independence from colonial rule, in 1957.',
  },
  {
    countryName: 'Senegal',
    fact: 'Mainland Africa’s westernmost point, and its capital named the most famous rally in motorsport.',
  },
  {
    countryName: 'Mali',
    fact: 'Its fabled desert trading city became a byword for the ends of the earth, and its great mosques are built of mud brick.',
  },
  {
    countryName: 'Democratic Republic of the Congo',
    fact: 'The second-largest rainforest on earth lies here, and it supplies most of the world’s cobalt.',
  },
  {
    countryName: 'Cameroon',
    fact: 'Called "Africa in miniature" for packing desert, rainforest, mountains and coast into one country.',
  },
  {
    countryName: 'Seychelles',
    fact: 'The smallest African country by population, and its palms produce the largest seed in the plant kingdom.',
  },
  {
    countryName: 'Mauritius',
    fact: 'The dodo lived — and was wiped out — on this Indian Ocean island.',
  },
  {
    countryName: 'Eswatini',
    fact: 'One of the world’s last absolute monarchies, it dropped its colonial-era name in 2018.',
  },
  {
    countryName: 'Lesotho',
    fact: 'Entirely surrounded by one neighbour, and no part of it sits below 1,400 m above sea level.',
  },

  // ─── Americas ──────────────────────────────────────────────────────────────
  {
    countryName: 'Canada',
    fact: 'It has the longest coastline of any country, and more lakes than the rest of the world combined.',
  },
  {
    countryName: 'United States',
    fact: 'Fifty states, a flag redesigned 27 times, and the only country to have landed people on the Moon.',
  },
  {
    countryName: 'Mexico',
    fact: 'Chocolate, chillies and tomatoes were first cultivated here, and it holds the largest Spanish-speaking population on earth.',
  },
  {
    countryName: 'Brazil',
    fact: 'It covers nearly half of its continent and borders every country on it but two.',
  },
  {
    countryName: 'Argentina',
    fact: 'The highest peak outside Asia stands here, along with the world’s widest avenue and the tango.',
  },
  {
    countryName: 'Chile',
    fact: 'It stretches over 4,300 km north to south but averages only about 180 km wide.',
  },
  {
    countryName: 'Peru',
    fact: 'A lost Inca city sits high on its ridges, and thousands of potato varieties originate in its highlands.',
  },
  {
    countryName: 'Bolivia',
    fact: 'Home to the world’s largest salt flat, which floods into a mirror the size of a small country.',
  },
  {
    countryName: 'Ecuador',
    fact: 'Named for the line it straddles, and its remote islands shaped Darwin’s thinking on evolution.',
  },
  {
    countryName: 'Colombia',
    fact: 'The only South American country with coastline on both the Pacific and the Caribbean, and the source of most of the world’s emeralds.',
  },
  {
    countryName: 'Venezuela',
    fact: 'The world’s highest waterfall drops almost a kilometre from a flat-topped mountain here.',
  },
  {
    countryName: 'Uruguay',
    fact: 'It hosted and won the first football World Cup in 1930, and has more cattle than people.',
  },
  {
    countryName: 'Guyana',
    fact: 'The only South American country with English as its official language, and mostly covered by rainforest.',
  },
  {
    countryName: 'Suriname',
    fact: 'The smallest country in South America, and the most forested country on earth by share of land.',
  },
  {
    countryName: 'Panama',
    fact: 'A canal across it lifts ships over a continental divide, joining two oceans.',
  },
  {
    countryName: 'Costa Rica',
    fact: 'It abolished its army in 1948 and holds around 5% of the world’s known species on 0.03% of its land.',
  },
  {
    countryName: 'Nicaragua',
    fact: 'The largest country in Central America, with a freshwater lake big enough to host its own sharks.',
  },
  {
    countryName: 'El Salvador',
    fact: 'The smallest country in Central America, and the first to make bitcoin legal tender.',
  },
  {
    countryName: 'Guatemala',
    fact: 'Great Mayan pyramids rise above its rainforest canopy, and its currency is named after a bird.',
  },
  {
    countryName: 'Belize',
    fact: 'The only Central American country with English as its official language, and a vast circular sinkhole lies off its coast.',
  },
  {
    countryName: 'Cuba',
    fact: 'The largest island in the Caribbean, where 1950s American cars still work the streets.',
  },
  {
    countryName: 'Jamaica',
    fact: 'Reggae was born here, and its Blue Mountains give their name to some of the world’s priciest coffee.',
  },
  {
    countryName: 'Haiti',
    fact: 'The first nation founded by a successful revolt of enslaved people, and the first Black republic.',
  },
  {
    countryName: 'Dominican Republic',
    fact: 'Baseball is the national obsession, and it shares its island with a French- and Creole-speaking neighbour.',
  },
  {
    countryName: 'Bahamas',
    fact: 'An archipelago of some 700 islands, with swimming pigs on one of them and the world’s deepest blue hole offshore.',
  },
  {
    countryName: 'Trinidad and Tobago',
    fact: 'The steelpan was invented on these islands, the only acoustic instrument created in the 20th century.',
  },
  {
    countryName: 'Barbados',
    fact: 'Rum was first distilled on this coral island, which became a republic in 2021.',
  },

  // ─── Oceania ───────────────────────────────────────────────────────────────
  {
    countryName: 'Australia',
    fact: 'A country that is also a continent, with more kangaroos than people and a reef visible from orbit.',
  },
  {
    countryName: 'New Zealand',
    fact: 'The first country to give women the vote, in 1893, and home to several sheep for every person.',
  },
  {
    countryName: 'Papua New Guinea',
    fact: 'More than 800 languages are spoken here, more than in any other country.',
  },
  {
    countryName: 'Fiji',
    fact: 'An archipelago of over 300 islands where a pepper-root drink is served in ceremonial half-coconut bowls.',
  },
  {
    countryName: 'Samoa',
    fact: 'It skipped a day entirely in 2011, jumping across the date line to trade with its neighbours.',
  },
  {
    countryName: 'Tonga',
    fact: 'A Polynesian kingdom that was never formally colonised, and among the first places on earth to see the new day.',
  },
  {
    countryName: 'Tuvalu',
    fact: 'One of the smallest countries on earth, it earns a large share of its national income from leasing its internet domain.',
  },
  {
    countryName: 'Kiribati',
    fact: 'It straddles both the equator and the date line, making it the first country to greet each new year.',
  },
  {
    countryName: 'Palau',
    fact: 'It created the world’s first shark sanctuary, and a lake here is filled with stingless jellyfish.',
  },
  {
    countryName: 'Marshall Islands',
    fact: 'Nuclear tests at one of its atolls in the 1940s and 50s lent their name to a two-piece swimsuit.',
  },
  {
    countryName: 'Micronesia',
    fact: 'One of its islands uses giant carved stone discs, some taller than a person, as traditional money.',
  },
  {
    countryName: 'Vanuatu',
    fact: 'Land diving from wooden towers with vines tied to the ankles here inspired bungee jumping.',
  },
  {
    countryName: 'Nauru',
    fact: 'A single raised coral island, once the richest place per person on earth thanks to bird droppings.',
  },
  {
    countryName: 'Solomon Islands',
    fact: 'A Pacific archipelago where some people are born with strikingly blond hair, from a gene found almost nowhere else.',
  },
];
