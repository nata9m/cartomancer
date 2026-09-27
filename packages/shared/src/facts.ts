import type { CountrySeed } from './countries.js';
import type { Difficulty } from './taxonomy.js';

export interface CountryFactSeed {
  /** Canonical country name, matched against `countries.name` at seed time. */
  countryName: CountrySeed['name'] | string;
  fact: string;
  /** The clue's own difficulty, independent of the country's recognisability. */
  difficulty: Difficulty;
}

/**
 * Trivia clues: 300 unique entries covering all 195 UN-recognised countries.
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
 * Difficulty is per clue, not per country:
 *   * Easy — the clue mentions well-known landmarks, superlatives, or cultural
 *     touchstones most people would associate with the answer
 *   * Medium — requires geography knowledge or less-famous features
 *   * Hard — niche knowledge, lesser-known countries, or an obscure angle
 *
 * Each filter combination (5 regions × 3 difficulties) targets ~20 clues.
 * Adding more is a data-only change: append rows and re-run the seed (facts
 * upsert on (country, fact), so re-running is safe and is how updated content
 * reaches a live database).
 */
export const COUNTRY_FACTS: readonly CountryFactSeed[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Europe (60 clues) ─────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  // Easy (20)
  { countryName: 'France', fact: 'The most-visited country on earth, and the origin of the metric system.', difficulty: 'Easy' },
  { countryName: 'Italy', fact: 'Two independent states sit entirely within its borders, and it has more UNESCO World Heritage sites than anywhere else.', difficulty: 'Easy' },
  { countryName: 'Spain', fact: 'Home to a festival where tens of thousands throw overripe tomatoes at each other, and to a cathedral still unfinished after 140 years.', difficulty: 'Easy' },
  { countryName: 'Germany', fact: 'Some stretches of its motorway network have no speed limit at all, and it claims over 1,500 kinds of sausage.', difficulty: 'Easy' },
  { countryName: 'United Kingdom', fact: 'Traffic drives on the left, and the famous name of its great clock belongs to the bell, not the tower.', difficulty: 'Easy' },
  { countryName: 'Greece', fact: 'It gave the world the Olympic Games and democracy, and has thousands of islands of which only about 200 are inhabited.', difficulty: 'Easy' },
  { countryName: 'Netherlands', fact: 'About a quarter of its land sits below sea level, reclaimed and held back by dykes.', difficulty: 'Easy' },
  { countryName: 'Switzerland', fact: 'Neutral in both world wars, it keeps enough nuclear shelter space for its entire population.', difficulty: 'Easy' },
  { countryName: 'Russia', fact: 'It spans eleven time zones and borders fourteen countries.', difficulty: 'Easy' },
  { countryName: 'Ireland', fact: 'An island with no native snakes, where a national holiday turns rivers green around the world.', difficulty: 'Easy' },
  { countryName: 'Norway', fact: 'Deep glacial inlets cut its coast into one of the longest shorelines on earth, and its far north sees the sun at midnight.', difficulty: 'Easy' },
  { countryName: 'Sweden', fact: 'It gave away the patent for the three-point seatbelt to save lives, and exports flat-pack furniture worldwide.', difficulty: 'Easy' },
  { countryName: 'Austria', fact: 'Mozart was born here, and two thirds of it is covered by the Alps.', difficulty: 'Easy' },
  { countryName: 'Iceland', fact: 'It has no mosquitoes, and its parliament, founded in 930 AD, is among the oldest still sitting.', difficulty: 'Easy' },
  { countryName: 'Portugal', fact: 'Produces about half the world\'s cork, and its border with its only neighbour is among the oldest unchanged in Europe.', difficulty: 'Easy' },
  { countryName: 'Belgium', fact: 'It hosts the European Union\'s main institutions, and gave the world Tintin, the Smurfs and 800-odd beers.', difficulty: 'Easy' },
  { countryName: 'Denmark', fact: 'The interlocking plastic brick was invented here, and it holds one of the oldest continuous monarchies in the world.', difficulty: 'Easy' },
  { countryName: 'Finland', fact: 'It has roughly 188,000 lakes and more saunas than cars.', difficulty: 'Easy' },
  { countryName: 'Poland', fact: 'Marie Curie was born here, and Europe\'s last great primeval lowland forest straddles its eastern border.', difficulty: 'Easy' },
  { countryName: 'Ukraine', fact: 'The largest country lying entirely within Europe, and site of the 1986 reactor disaster.', difficulty: 'Easy' },

  // Medium (20)
  { countryName: 'Hungary', fact: 'The twisting cube puzzle that sold hundreds of millions was invented here by an architecture professor.', difficulty: 'Medium' },
  { countryName: 'Romania', fact: 'Its Transylvanian castles inspired the most famous vampire in fiction, and it holds Europe\'s heaviest building.', difficulty: 'Medium' },
  { countryName: 'Czechia', fact: 'Drinks more beer per person than any other nation, and its capital\'s astronomical clock has run since 1410.', difficulty: 'Medium' },
  { countryName: 'Croatia', fact: 'The necktie takes its name from this country\'s 17th-century soldiers, and its coast has over a thousand islands.', difficulty: 'Medium' },
  { countryName: 'Bulgaria', fact: 'Its Valley of the Roses produces much of the world\'s rose oil, and nodding the head here can mean "no".', difficulty: 'Medium' },
  { countryName: 'Serbia', fact: 'Landlocked in the Balkans, birthplace of the inventor who gave his name to the unit of magnetic flux density.', difficulty: 'Medium' },
  { countryName: 'Belarus', fact: 'Landlocked and famously flat, it shares Europe\'s last primeval forest and its herd of wild bison.', difficulty: 'Medium' },
  { countryName: 'Estonia', fact: 'It made internet access a social right, pioneered e-residency, and is where Skype was built.', difficulty: 'Medium' },
  { countryName: 'Latvia', fact: 'Half of it is forest, and its capital holds one of the greatest concentrations of Art Nouveau buildings anywhere.', difficulty: 'Medium' },
  { countryName: 'Lithuania', fact: 'A hill here is covered with hundreds of thousands of crosses left by pilgrims, and it was the first Soviet republic to declare independence.', difficulty: 'Medium' },
  { countryName: 'Vatican City', fact: 'The smallest sovereign state on earth, with a population you could seat in a school assembly hall.', difficulty: 'Medium' },
  { countryName: 'Slovenia', fact: 'More than half of it is forest, and a church on an island in a glacial lake is its best-known image.', difficulty: 'Medium' },
  { countryName: 'Cyprus', fact: 'An island whose capital is the last divided capital in Europe, split by a UN buffer zone.', difficulty: 'Medium' },
  { countryName: 'Malta', fact: 'The smallest EU member state, an archipelago once ruled by a crusading order of knights.', difficulty: 'Medium' },
  { countryName: 'Albania', fact: 'Its coastline faces a boot-shaped neighbour across the strait, and thousands of concrete bunkers dot its countryside.', difficulty: 'Medium' },
  { countryName: 'Slovakia', fact: 'It has more castles per head than almost anywhere else, and the upper half of its landscape is Carpathian mountains.', difficulty: 'Medium' },
  { countryName: 'Bosnia and Herzegovina', fact: 'A rebuilt Ottoman bridge in its south is a UNESCO icon, and it hosted the Winter Olympics in 1984.', difficulty: 'Medium' },
  { countryName: 'North Macedonia', fact: 'Named after an ancient kingdom, it added a compass direction to its name in 2019 to settle a decades-long dispute with a neighbour.', difficulty: 'Medium' },
  { countryName: 'France', fact: 'Its territory spans twelve time zones, more than any other country, thanks to overseas departments scattered from the Caribbean to the Pacific.', difficulty: 'Medium' },
  { countryName: 'Italy', fact: 'It eats more pasta per person than any other country and has a volcano that buried an entire Roman city in ash.', difficulty: 'Medium' },

  // Hard (20)
  { countryName: 'Monaco', fact: 'The second-smallest state in the world, where a Formula 1 race runs through ordinary streets past a famous casino.', difficulty: 'Hard' },
  { countryName: 'San Marino', fact: 'Claims to be the world\'s oldest surviving republic, founded in 301 AD, and sits entirely inside one larger neighbour.', difficulty: 'Hard' },
  { countryName: 'Andorra', fact: 'A Pyrenean microstate with no airport and two heads of state, one of whom is the serving president of a neighbouring republic.', difficulty: 'Hard' },
  { countryName: 'Liechtenstein', fact: 'A German-speaking principality wedged between two neighbours, so landlocked you must cross two countries to reach the sea.', difficulty: 'Hard' },
  { countryName: 'Luxembourg', fact: 'A grand duchy that in 2020 became the first country to make all public transport free.', difficulty: 'Hard' },
  { countryName: 'Montenegro', fact: 'Its name means "black mountain", and its deep bay is often called Europe\'s southernmost fjord.', difficulty: 'Hard' },
  { countryName: 'Moldova', fact: 'Landlocked between two larger neighbours, it contains a breakaway strip along one river that prints its own money.', difficulty: 'Hard' },
  { countryName: 'Germany', fact: 'Its capital was split by a wall for 28 years, and its beer purity law from 1516 is one of the oldest food regulations still in force.', difficulty: 'Hard' },
  { countryName: 'Spain', fact: 'Its calendar includes a festival where people run ahead of bulls through narrow streets, and one of its regions operates its own police and parliament.', difficulty: 'Hard' },
  { countryName: 'Greece', fact: 'Its national cheese, aged in brine, is protected by EU law so only the local version may carry its name.', difficulty: 'Hard' },
  { countryName: 'Netherlands', fact: 'Its King\'s Day celebration paints every city orange, and the tulip market crash here in the 1630s is considered the first speculative bubble.', difficulty: 'Hard' },
  { countryName: 'Switzerland', fact: 'It has four official languages and a direct-democracy system that puts dozens of referendums to the public each year.', difficulty: 'Hard' },
  { countryName: 'United Kingdom', fact: 'The sport of football was codified here in 1863, and its postal system issued the world\'s first adhesive stamp.', difficulty: 'Hard' },
  { countryName: 'Russia', fact: 'Its deepest lake holds about 20% of all unfrozen surface freshwater on earth, and its railway crosses nine time zones in one journey.', difficulty: 'Hard' },
  { countryName: 'Norway', fact: 'It manages the world\'s largest sovereign-wealth fund, built on oil, and awards four of the five original Nobel prizes\' ceremonies to a different country.', difficulty: 'Hard' },
  { countryName: 'Sweden', fact: 'The Nobel Prizes were established by an inventor born here who held over 350 patents, including one for dynamite.', difficulty: 'Hard' },
  { countryName: 'Iceland', fact: 'Its mid-Atlantic ridge makes it one of the most volcanically active places on earth, and it heats most of its homes with geothermal water.', difficulty: 'Hard' },
  { countryName: 'Ireland', fact: 'The harp, not the shamrock, is its official state symbol, and it is the only country whose national symbol is a musical instrument.', difficulty: 'Hard' },
  { countryName: 'Denmark', fact: 'Its autonomous territory in the Arctic is the world\'s largest island, and its flag may be the oldest continuously used national flag.', difficulty: 'Hard' },
  { countryName: 'Poland', fact: 'Its post-war capital was rebuilt almost entirely from paintings and photographs, and it has the tallest statue of a religious figure in the world.', difficulty: 'Hard' },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Asia (60 clues) ───────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  // Easy (20)
  { countryName: 'Japan', fact: 'It has more than 6,800 islands, and vending machines outnumber people in some city blocks.', difficulty: 'Easy' },
  { countryName: 'China', fact: 'Despite spanning five geographic time zones, the whole country runs on a single official clock.', difficulty: 'Easy' },
  { countryName: 'India', fact: 'Chess and the decimal zero were born here, and it holds the largest electorate on earth.', difficulty: 'Easy' },
  { countryName: 'South Korea', fact: 'Among the fastest internet speeds on earth, and the world\'s biggest exporter of pop music videos.', difficulty: 'Easy' },
  { countryName: 'Thailand', fact: 'The only country in its region never colonised by a European power, and the world\'s biggest exporter of rice for decades.', difficulty: 'Easy' },
  { countryName: 'Turkey', fact: 'Its largest city straddles two continents, divided by a strait.', difficulty: 'Easy' },
  { countryName: 'Saudi Arabia', fact: 'It contains the largest continuous sand desert in the world, and women were first allowed to drive here in 2018.', difficulty: 'Easy' },
  { countryName: 'United Arab Emirates', fact: 'The tallest building in the world rises from its desert, and a federation of seven emirates governs it.', difficulty: 'Easy' },
  { countryName: 'Indonesia', fact: 'Thousands of islands strung along the equator, with more active volcanoes than any other country.', difficulty: 'Easy' },
  { countryName: 'Israel', fact: 'The lowest dry land on earth lies on its border, in water so salty swimmers cannot sink.', difficulty: 'Easy' },
  { countryName: 'Nepal', fact: 'The only country whose flag is not a rectangle, and the summit of the world sits on its border.', difficulty: 'Easy' },
  { countryName: 'Vietnam', fact: 'The world\'s second-largest coffee exporter, where the drink is often served with condensed milk over ice.', difficulty: 'Easy' },
  { countryName: 'Philippines', fact: 'Over 7,000 islands, and brightly painted converted jeeps serve as its buses.', difficulty: 'Easy' },
  { countryName: 'North Korea', fact: 'It counts years from 1912 on its own calendar, and its night side is famously dark from orbit.', difficulty: 'Easy' },
  { countryName: 'Iran', fact: 'Heir to the Persian Empire, its ruined ceremonial capital was burned by Alexander the Great.', difficulty: 'Easy' },
  { countryName: 'Iraq', fact: 'The land between two great rivers, where writing and the wheel first appear in the record.', difficulty: 'Easy' },
  { countryName: 'Pakistan', fact: 'The second-highest mountain on earth stands on its northern border, deadlier to climbers than the highest.', difficulty: 'Easy' },
  { countryName: 'Singapore', fact: 'A city-state so small it has no countryside, where selling chewing gum was banned for decades.', difficulty: 'Easy' },
  { countryName: 'Malaysia', fact: 'Its twin towers were the tallest buildings in the world for six years, joined by a skybridge.', difficulty: 'Easy' },
  { countryName: 'Qatar', fact: 'A small peninsula of enormous gas reserves, and the first Middle Eastern host of a football World Cup.', difficulty: 'Easy' },

  // Medium (20)
  { countryName: 'Cambodia', fact: 'The largest religious monument on earth stands here, and it is the only national flag to depict a building.', difficulty: 'Medium' },
  { countryName: 'Mongolia', fact: 'The least densely populated sovereign country, where roughly a quarter of people are nomadic.', difficulty: 'Medium' },
  { countryName: 'Kazakhstan', fact: 'The largest landlocked country on earth, and every crewed flight to the space station launches from its steppe.', difficulty: 'Medium' },
  { countryName: 'Bangladesh', fact: 'Built on the largest river delta on earth, where three great rivers meet the sea.', difficulty: 'Medium' },
  { countryName: 'Sri Lanka', fact: 'An island long famous for its tea, which still carries the country\'s former colonial name on the packet.', difficulty: 'Medium' },
  { countryName: 'Jordan', fact: 'A rose-red city carved directly into sandstone cliffs, lost to outsiders for centuries, is its most famous site.', difficulty: 'Medium' },
  { countryName: 'Myanmar', fact: 'It moved its seat of government to a purpose-built inland city in 2005, and a gilded pagoda dominates its largest city.', difficulty: 'Medium' },
  { countryName: 'Laos', fact: 'Landlocked and mountainous, it is the most heavily bombed country per person in history.', difficulty: 'Medium' },
  { countryName: 'Armenia', fact: 'The first state in the world to adopt Christianity, in 301 AD, and its symbol is a mountain across the border.', difficulty: 'Medium' },
  { countryName: 'Georgia', fact: 'Wine has been made here for 8,000 years, in buried clay vessels.', difficulty: 'Medium' },
  { countryName: 'Afghanistan', fact: 'Landlocked and crossed by the Hindu Kush, it is the source of most of the world\'s lapis lazuli.', difficulty: 'Medium' },
  { countryName: 'Lebanon', fact: 'An ancient cedar tree is the centrepiece of its flag, and it packs ski slopes and warm beaches into a country smaller than most provinces.', difficulty: 'Medium' },
  { countryName: 'Uzbekistan', fact: 'A Silk Road crossroads of turquoise-domed cities, and one of only two countries you must cross two borders to leave for the sea.', difficulty: 'Medium' },
  { countryName: 'Bhutan', fact: 'It measures national success by Gross National Happiness and absorbs more carbon than it emits.', difficulty: 'Medium' },
  { countryName: 'Maldives', fact: 'The lowest-lying country on earth, averaging about a metre and a half above the sea that surrounds it.', difficulty: 'Medium' },
  { countryName: 'Japan', fact: 'Its bullet trains have had a cumulative average delay of less than one minute per year over half a century.', difficulty: 'Medium' },
  { countryName: 'China', fact: 'Its Great Wall stretches over 20,000 km across its north, and its terracotta army of 8,000 soldiers guarded a tomb for two millennia.', difficulty: 'Medium' },
  { countryName: 'India', fact: 'Its film industry produces more movies annually than any other country, and its postal network is the largest in the world.', difficulty: 'Medium' },
  { countryName: 'Kuwait', fact: 'A tiny oil-rich emirate at the head of a gulf, whose invasion in 1990 triggered a multinational liberation war.', difficulty: 'Medium' },
  { countryName: 'Oman', fact: 'A sultanate on the southeastern tip of the Arabian Peninsula, known for frankincense traded from its coast for millennia.', difficulty: 'Medium' },

  // Hard (20)
  { countryName: 'Timor-Leste', fact: 'It occupies half an island and became the first new sovereign state of the 21st century.', difficulty: 'Hard' },
  { countryName: 'Turkmenistan', fact: 'A vast desert covers most of it, and a gas crater in its interior has burned continuously since the 1970s.', difficulty: 'Hard' },
  { countryName: 'Tajikistan', fact: 'More than 90% mountainous, it holds the longest glacier outside the polar regions.', difficulty: 'Hard' },
  { countryName: 'Kyrgyzstan', fact: 'A landlocked Central Asian country whose alpine lake is the second-largest mountain lake on earth.', difficulty: 'Hard' },
  { countryName: 'Azerbaijan', fact: 'Known as the "Land of Fire" for natural gas vents that have burned on its hillsides for centuries.', difficulty: 'Hard' },
  { countryName: 'Bahrain', fact: 'An island kingdom in a gulf, linked to the mainland by one of the world\'s longest causeways and home to the Formula 1 desert circuit.', difficulty: 'Hard' },
  { countryName: 'Brunei', fact: 'A tiny oil-rich sultanate on the north coast of a large tropical island, split into two parts by a neighbouring state.', difficulty: 'Hard' },
  { countryName: 'Syria', fact: 'Its capital is one of the oldest continuously inhabited cities, and a Roman-era colonnade still stands in its desert.', difficulty: 'Hard' },
  { countryName: 'Yemen', fact: 'Its island in the Indian Ocean has trees shaped like umbrellas found nowhere else, and its old multi-storey mud towers are often called the first skyscrapers.', difficulty: 'Hard' },
  { countryName: 'Palestine', fact: 'Its territories include an ancient walled old city sacred to three faiths and a below-sea-level shore on a hypersaline lake.', difficulty: 'Hard' },
  { countryName: 'Turkey', fact: 'The ancient city of Troy stood on its western coast, and a vast underground city once sheltered thousands beneath its central plateau.', difficulty: 'Hard' },
  { countryName: 'South Korea', fact: 'A demilitarised strip across the peninsula is one of the most heavily guarded borders on earth, and its beauty industry exports more skincare than any country its size.', difficulty: 'Hard' },
  { countryName: 'Thailand', fact: 'Its calendar runs roughly 543 years ahead of the Gregorian, and the country changed its name from a colonial-era one in 1939.', difficulty: 'Hard' },
  { countryName: 'Indonesia', fact: 'Its Komodo dragon is the world\'s largest living lizard, and it recently moved its planned capital to a different island.', difficulty: 'Hard' },
  { countryName: 'Vietnam', fact: 'Its massive cave passage, discovered in 2009, is the largest known by cross-section and could hold a 40-storey building.', difficulty: 'Hard' },
  { countryName: 'Philippines', fact: 'A river on one of its islands flows underground for over 8 km through a limestone cave into the sea.', difficulty: 'Hard' },
  { countryName: 'Saudi Arabia', fact: 'It is building a 170-km straight-line city in its desert, and its empty quarter is the largest contiguous sand desert on earth.', difficulty: 'Hard' },
  { countryName: 'Iran', fact: 'Its 2,500-year-old qanat irrigation tunnels are a UNESCO heritage, and its carpet-weaving tradition has one of the densest knot counts in the world.', difficulty: 'Hard' },
  { countryName: 'Pakistan', fact: 'The ruins of one of the world\'s earliest urban civilizations lie along its great river, and it is the world\'s fifth-most-populous country.', difficulty: 'Hard' },
  { countryName: 'Israel', fact: 'Its kibbutzim pioneered communal living in the early 20th century, and it has more startups per person than any other country.', difficulty: 'Hard' },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Africa (60 clues) ─────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  // Easy (20)
  { countryName: 'Egypt', fact: 'The only surviving wonder of the ancient world stands here, and almost everyone lives along one river.', difficulty: 'Easy' },
  { countryName: 'South Africa', fact: 'It has three capital cities, one each for government, law and parliament, and hosted the first human heart transplant.', difficulty: 'Easy' },
  { countryName: 'Nigeria', fact: 'The most populous country in Africa, and its film industry releases more titles a year than Hollywood.', difficulty: 'Easy' },
  { countryName: 'Kenya', fact: 'The Great Rift Valley runs through it, and its highlands have produced a remarkable share of the world\'s distance runners.', difficulty: 'Easy' },
  { countryName: 'Tanzania', fact: 'Africa\'s highest peak rises from its plains, where millions of wildebeest migrate in a yearly circle.', difficulty: 'Easy' },
  { countryName: 'Ethiopia', fact: 'It follows a 13-month calendar seven years behind most of the world, and coffee was first cultivated here.', difficulty: 'Easy' },
  { countryName: 'Morocco', fact: 'Home to the oldest continuously operating university in the world, and to a town painted entirely blue.', difficulty: 'Easy' },
  { countryName: 'Algeria', fact: 'The largest country in Africa, more than four fifths of it Sahara.', difficulty: 'Easy' },
  { countryName: 'Madagascar', fact: 'An island where about nine in ten species, lemurs among them, exist nowhere else on earth.', difficulty: 'Easy' },
  { countryName: 'Ghana', fact: 'The first country in sub-Saharan Africa to win independence from colonial rule, in 1957.', difficulty: 'Easy' },
  { countryName: 'Egypt', fact: 'A canal running through its desert connects two seas and carries about 12% of global trade each day.', difficulty: 'Easy' },
  { countryName: 'South Africa', fact: 'Two oceans meet at its southern tip, and it is the only country to have voluntarily dismantled its own nuclear weapons.', difficulty: 'Easy' },
  { countryName: 'Nigeria', fact: 'Its largest city is one of the fastest-growing urban areas on earth, and its internet comedy scene is watched globally.', difficulty: 'Easy' },
  { countryName: 'Kenya', fact: 'Its national parks host one of the "big five" safaris, and a mobile money system invented here transformed financial access.', difficulty: 'Easy' },
  { countryName: 'Tanzania', fact: 'It contains the largest lake in Africa by surface area, shared with two neighbours, and the continent\'s deepest lake on another border.', difficulty: 'Easy' },
  { countryName: 'Ethiopia', fact: 'It is the only African country never formally colonised by a European power, and it uses its own unique script.', difficulty: 'Easy' },
  { countryName: 'Morocco', fact: 'A narrow strait separates it from Europe, and its traditional open-air markets are some of the most filmed in cinema.', difficulty: 'Easy' },
  { countryName: 'Uganda', fact: 'The Nile begins its journey here, and roughly half the world\'s remaining mountain gorillas live in its forests.', difficulty: 'Easy' },
  { countryName: 'Rwanda', fact: 'Known as the land of a thousand hills, it banned plastic bags outright and has one of the world\'s cleanest capitals.', difficulty: 'Easy' },
  { countryName: 'Senegal', fact: 'Mainland Africa\'s westernmost point, and its capital named the most famous rally in motorsport.', difficulty: 'Easy' },

  // Medium (20)
  { countryName: 'Sudan', fact: 'It has more ancient pyramids than its more famous northern neighbour, around 200 of them.', difficulty: 'Medium' },
  { countryName: 'Tunisia', fact: 'Africa\'s northernmost point lies here, and its desert stood in for a distant planet in Star Wars.', difficulty: 'Medium' },
  { countryName: 'Botswana', fact: 'Home to the largest elephant population on earth, and to a vast inland delta that never reaches the sea.', difficulty: 'Medium' },
  { countryName: 'Namibia', fact: 'The world\'s oldest desert runs into the Atlantic along a shore littered with shipwrecks.', difficulty: 'Medium' },
  { countryName: 'Zambia', fact: 'Named after the river that forms its southern border, it depends on copper for most of its exports.', difficulty: 'Medium' },
  { countryName: 'Zimbabwe', fact: 'Its great stone ruins gave the country its name, and it once printed a hundred-trillion-dollar banknote.', difficulty: 'Medium' },
  { countryName: 'Cameroon', fact: 'Called "Africa in miniature" for packing desert, rainforest, mountains and coast into one country.', difficulty: 'Medium' },
  { countryName: 'Democratic Republic of the Congo', fact: 'The second-largest rainforest on earth lies here, and it supplies most of the world\'s cobalt.', difficulty: 'Medium' },
  { countryName: 'Côte d\'Ivoire', fact: 'The world\'s largest producer of cocoa beans, supplying roughly 40% of the global chocolate supply.', difficulty: 'Medium' },
  { countryName: 'Libya', fact: 'Over 90% desert, it recorded one of the hottest air temperatures ever measured on earth.', difficulty: 'Medium' },
  { countryName: 'Mali', fact: 'Its fabled desert trading city became a byword for the ends of the earth, and its great mosques are built of mud brick.', difficulty: 'Medium' },
  { countryName: 'Angola', fact: 'Africa\'s second-largest oil producer, whose giant waterfall on a southern plateau is nearly twice as wide as Niagara.', difficulty: 'Medium' },
  { countryName: 'Mozambique', fact: 'Its flag features an AK-47 rifle, the only national flag to depict a modern firearm.', difficulty: 'Medium' },
  { countryName: 'Somalia', fact: 'It has the longest coastline in mainland Africa, and its nomadic herders tend more camels than almost any other nation.', difficulty: 'Medium' },
  { countryName: 'Niger', fact: 'Named after the great river that curves through its southwest, it is one of the hottest countries on earth.', difficulty: 'Medium' },
  { countryName: 'Mauritius', fact: 'The dodo lived and was wiped out on this Indian Ocean island.', difficulty: 'Medium' },
  { countryName: 'Lesotho', fact: 'Entirely surrounded by one neighbour, and no part of it sits below 1,400 m above sea level.', difficulty: 'Medium' },
  { countryName: 'Eswatini', fact: 'One of the world\'s last absolute monarchies, it dropped its colonial-era name in 2018.', difficulty: 'Medium' },
  { countryName: 'Seychelles', fact: 'The smallest African country by population, and its palms produce the largest seed in the plant kingdom.', difficulty: 'Medium' },
  { countryName: 'Liberia', fact: 'Founded by freed enslaved people from across the Atlantic, its capital is named after a president of that sending country.', difficulty: 'Medium' },

  // Hard (20)
  { countryName: 'Burkina Faso', fact: 'Its name means "land of upright people" in two local languages, and it hosts Africa\'s largest film festival.', difficulty: 'Hard' },
  { countryName: 'Burundi', fact: 'Landlocked and one of the smallest countries in Africa, it is one of the few places where the source of the Nile can be traced.', difficulty: 'Hard' },
  { countryName: 'Cabo Verde', fact: 'A volcanic archipelago 600 km off the west coast of Africa, its music genre fuses longing with Portuguese guitar.', difficulty: 'Hard' },
  { countryName: 'Central African Republic', fact: 'Roughly the size of France, it is one of the least densely populated countries on earth, and diamonds lie in its river gravels.', difficulty: 'Hard' },
  { countryName: 'Chad', fact: 'Its eponymous lake has shrunk by more than 90% since the 1960s, and the Sahara\'s tallest peak stands in its north.', difficulty: 'Hard' },
  { countryName: 'Comoros', fact: 'A small volcanic archipelago in the Indian Ocean between Africa and an island famous for lemurs.', difficulty: 'Hard' },
  { countryName: 'Republic of the Congo', fact: 'It sits across the river from a much larger namesake, and its dense equatorial forest shelters lowland gorillas.', difficulty: 'Hard' },
  { countryName: 'Djibouti', fact: 'Smaller than a small European province, its salt lake is one of the lowest points in Africa, and foreign military bases dot its coast.', difficulty: 'Hard' },
  { countryName: 'Equatorial Guinea', fact: 'The only African country where a Romance language from the Iberian Peninsula is the sole official tongue, and oil made it one of the continent\'s richest per capita.', difficulty: 'Hard' },
  { countryName: 'Eritrea', fact: 'Its capital sits at 2,300 m on a plateau, and a railway built by colonial engineers climbs from the Red Sea coast through dramatic switchbacks.', difficulty: 'Hard' },
  { countryName: 'Gabon', fact: 'Over 80% rainforest, it protects more of its land than almost any other country, and mandrills roam its interior.', difficulty: 'Hard' },
  { countryName: 'Gambia', fact: 'Africa\'s smallest mainland country, a narrow strip hugging a river on three sides, entirely enclosed by one larger neighbour.', difficulty: 'Hard' },
  { countryName: 'Guinea', fact: 'The headwaters of the Niger, Senegal and Gambia rivers all rise in its highlands, earning it the nickname "the water tower of West Africa".', difficulty: 'Hard' },
  { countryName: 'Guinea-Bissau', fact: 'One of the first colonies in Africa to win independence by armed struggle, its Bijagós archipelago is a UNESCO biosphere reserve.', difficulty: 'Hard' },
  { countryName: 'Malawi', fact: 'A narrow country dominated by a rift-valley lake so large it is called "the lake of stars" for the lanterns of its fishing boats at night.', difficulty: 'Hard' },
  { countryName: 'Mauritania', fact: 'One of the last countries to criminalise slavery (in 1981), and a massive circular geological formation in its desert is visible from orbit.', difficulty: 'Hard' },
  { countryName: 'São Tomé and Príncipe', fact: 'A tiny two-island nation on the equator in the Gulf of Guinea, once the world\'s largest producer of cocoa.', difficulty: 'Hard' },
  { countryName: 'Sierra Leone', fact: 'Its name means "lion mountains", and its capital was founded as a settlement for freed enslaved people.', difficulty: 'Hard' },
  { countryName: 'South Sudan', fact: 'The world\'s newest widely recognised country (2011), landlocked and crossed by the White Nile\'s vast swampland.', difficulty: 'Hard' },
  { countryName: 'Togo', fact: 'One of the narrowest countries in Africa, barely 115 km wide, stretching from a short coast inland to a savanna border.', difficulty: 'Hard' },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Americas (60 clues) ───────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  // Easy (20)
  { countryName: 'United States', fact: 'Fifty states, a flag redesigned 27 times, and the only country to have landed people on the Moon.', difficulty: 'Easy' },
  { countryName: 'Canada', fact: 'It has the longest coastline of any country, and more lakes than the rest of the world combined.', difficulty: 'Easy' },
  { countryName: 'Mexico', fact: 'Chocolate, chillies and tomatoes were first cultivated here, and it holds the largest population of speakers of a certain Romance language after one other country.', difficulty: 'Easy' },
  { countryName: 'Brazil', fact: 'It covers nearly half of its continent and borders every country on it but two.', difficulty: 'Easy' },
  { countryName: 'Argentina', fact: 'The highest peak outside Asia stands here, along with the world\'s widest avenue and the tango.', difficulty: 'Easy' },
  { countryName: 'Cuba', fact: 'The largest island in the Caribbean, where 1950s American cars still work the streets.', difficulty: 'Easy' },
  { countryName: 'Jamaica', fact: 'Reggae was born here, and its Blue Mountains give their name to some of the world\'s priciest coffee.', difficulty: 'Easy' },
  { countryName: 'Peru', fact: 'A lost Inca city sits high on its ridges, and thousands of potato varieties originate in its highlands.', difficulty: 'Easy' },
  { countryName: 'Colombia', fact: 'The only South American country with coastline on both the Pacific and the Caribbean, and the source of most of the world\'s emeralds.', difficulty: 'Easy' },
  { countryName: 'Chile', fact: 'It stretches over 4,300 km north to south but averages only about 180 km wide.', difficulty: 'Easy' },
  { countryName: 'Venezuela', fact: 'The world\'s highest waterfall drops almost a kilometre from a flat-topped mountain here.', difficulty: 'Easy' },
  { countryName: 'Ecuador', fact: 'Named for the line it straddles, and its remote islands shaped Darwin\'s thinking on evolution.', difficulty: 'Easy' },
  { countryName: 'Panama', fact: 'A canal across it lifts ships over a continental divide, joining two oceans.', difficulty: 'Easy' },
  { countryName: 'Costa Rica', fact: 'It abolished its army in 1948 and holds around 5% of the world\'s known species on 0.03% of its land.', difficulty: 'Easy' },
  { countryName: 'United States', fact: 'Its largest national park is bigger than some European countries, and a giant carved cliff face depicts four of its former leaders.', difficulty: 'Easy' },
  { countryName: 'Canada', fact: 'The world\'s longest land border runs entirely along its south, and maple syrup production here dwarfs every other country combined.', difficulty: 'Easy' },
  { countryName: 'Brazil', fact: 'Its carnival is the world\'s largest by attendance, and its Amazon rainforest produces roughly 20% of the world\'s oxygen.', difficulty: 'Easy' },
  { countryName: 'Mexico', fact: 'Its ancient pyramid rivals the Great Pyramid in base area, and its Day of the Dead celebration honours the departed with marigolds and sugar skulls.', difficulty: 'Easy' },
  { countryName: 'Argentina', fact: 'Its southern tip is the closest inhabited land to Antarctica, and its grasslands support one of the world\'s great cattle industries.', difficulty: 'Easy' },
  { countryName: 'Haiti', fact: 'The first nation founded by a successful revolt of enslaved people, and the first Black republic.', difficulty: 'Easy' },

  // Medium (20)
  { countryName: 'Bolivia', fact: 'Home to the world\'s largest salt flat, which floods into a mirror the size of a small country.', difficulty: 'Medium' },
  { countryName: 'Uruguay', fact: 'It hosted and won the first football World Cup in 1930, and has more cattle than people.', difficulty: 'Medium' },
  { countryName: 'Dominican Republic', fact: 'Baseball is the national obsession, and it shares its island with a French- and Creole-speaking neighbour.', difficulty: 'Medium' },
  { countryName: 'Guatemala', fact: 'Great Mayan pyramids rise above its rainforest canopy, and its currency is named after a bird.', difficulty: 'Medium' },
  { countryName: 'El Salvador', fact: 'The smallest country in Central America, and the first to make bitcoin legal tender.', difficulty: 'Medium' },
  { countryName: 'Nicaragua', fact: 'The largest country in Central America, with a freshwater lake big enough to host its own sharks.', difficulty: 'Medium' },
  { countryName: 'Bahamas', fact: 'An archipelago of some 700 islands, with swimming pigs on one of them and the world\'s deepest blue hole offshore.', difficulty: 'Medium' },
  { countryName: 'Belize', fact: 'The only Central American country with English as its official language, and a vast circular sinkhole lies off its coast.', difficulty: 'Medium' },
  { countryName: 'Honduras', fact: 'Ancient Mayan ruins in its western valley are considered the artistic capital of that civilization, and its Bay Islands sit on the world\'s second-largest barrier reef.', difficulty: 'Medium' },
  { countryName: 'Paraguay', fact: 'One of only two landlocked countries in South America, and its dam on the border with a neighbour is one of the world\'s largest hydroelectric plants.', difficulty: 'Medium' },
  { countryName: 'Chile', fact: 'Its Atacama Desert is the driest non-polar place on earth, and some of the world\'s most powerful telescopes sit on its peaks.', difficulty: 'Medium' },
  { countryName: 'Colombia', fact: 'Its Caño Cristales river turns red, yellow and green each year, and its coffee region is a UNESCO landscape.', difficulty: 'Medium' },
  { countryName: 'Peru', fact: 'Mysterious giant line drawings etched into its desert plateau are best seen from the air and have puzzled scholars for decades.', difficulty: 'Medium' },
  { countryName: 'Venezuela', fact: 'It sits atop one of the world\'s largest proven oil reserves, and its tabletop mountains inspired a famous adventure novel.', difficulty: 'Medium' },
  { countryName: 'Ecuador', fact: 'Its capital, at 2,850 m, was the first city inscribed as a UNESCO World Heritage Site, and its rose exports rank among the world\'s largest.', difficulty: 'Medium' },
  { countryName: 'Cuba', fact: 'Its cigar-rolling tradition is UNESCO-recognised, and its 1950s cars have been kept alive by decades of mechanics\' ingenuity.', difficulty: 'Medium' },
  { countryName: 'Costa Rica', fact: 'It runs almost entirely on renewable electricity, and mysterious pre-Columbian stone spheres dot its landscape.', difficulty: 'Medium' },
  { countryName: 'Panama', fact: 'A narrow land bridge here connects two continents, and its canal expansion opened in 2016 to handle ships three times wider.', difficulty: 'Medium' },
  { countryName: 'Trinidad and Tobago', fact: 'The steelpan was invented on these islands, the only acoustic instrument created in the 20th century.', difficulty: 'Medium' },
  { countryName: 'Barbados', fact: 'Rum was first distilled on this coral island, which became a republic in 2021.', difficulty: 'Medium' },

  // Hard (20)
  { countryName: 'Guyana', fact: 'The only South American country with English as its official language, and mostly covered by rainforest.', difficulty: 'Hard' },
  { countryName: 'Suriname', fact: 'The smallest country in South America, and the most forested country on earth by share of land.', difficulty: 'Hard' },
  { countryName: 'Bolivia', fact: 'It lost its coastline in a 19th-century war yet still maintains a navy on a high-altitude lake, and its salt flats are so flat they calibrate satellites.', difficulty: 'Hard' },
  { countryName: 'Uruguay', fact: 'It generates nearly all its electricity from renewables, and its beef per-capita consumption is among the highest on earth.', difficulty: 'Hard' },
  { countryName: 'Dominican Republic', fact: 'It has the highest peak and the lowest point in the Caribbean, both within its borders.', difficulty: 'Hard' },
  { countryName: 'Guatemala', fact: 'Its jade was prized by the Maya above gold, and its national bird cannot survive in captivity.', difficulty: 'Hard' },
  { countryName: 'Nicaragua', fact: 'Its two largest lakes contain the only freshwater sharks in the Americas, and its volcanic island in one of them still smokes.', difficulty: 'Hard' },
  { countryName: 'Antigua and Barbuda', fact: 'A twin-island Caribbean nation whose main island has 365 beaches, one for every day of the year, or so the tourism board claims.', difficulty: 'Hard' },
  { countryName: 'Dominica', fact: 'Not to be confused with its larger namesake republic, this mountainous Caribbean island has more hot springs per square kilometre than almost anywhere.', difficulty: 'Hard' },
  { countryName: 'Grenada', fact: 'Known as the Spice Isle for its nutmeg, which appears on its flag, this small Caribbean country is the world\'s second-largest nutmeg exporter.', difficulty: 'Hard' },
  { countryName: 'Saint Kitts and Nevis', fact: 'The smallest sovereign state in the Americas by both area and population, a two-island federation in the Caribbean.', difficulty: 'Hard' },
  { countryName: 'Saint Lucia', fact: 'Its twin volcanic peaks are a UNESCO site, and it has produced two Nobel laureates from a population smaller than many towns.', difficulty: 'Hard' },
  { countryName: 'Saint Vincent and the Grenadines', fact: 'A chain of 32 islands and cays in the eastern Caribbean, where one of the most famous pirate film franchises was shot.', difficulty: 'Hard' },
  { countryName: 'Brazil', fact: 'Its planned modernist capital was built from scratch in the interior in just 41 months and inaugurated in 1960.', difficulty: 'Hard' },
  { countryName: 'Mexico', fact: 'An asteroid impact crater off its coast is linked to the mass extinction that ended the age of dinosaurs.', difficulty: 'Hard' },
  { countryName: 'Haiti', fact: 'It shares an island with another republic, and a massive earthquake in 2010 struck near its capital, one of the deadliest in Western Hemisphere history.', difficulty: 'Hard' },
  { countryName: 'Jamaica', fact: 'It won its first Winter Olympics bobsled fame despite having no snow, and its Blue Mountain coffee commands one of the highest prices per pound.', difficulty: 'Hard' },
  { countryName: 'El Salvador', fact: 'Its currency was replaced entirely by one from across the continent in 2001, and volcanic lakes fill many of its craters.', difficulty: 'Hard' },
  { countryName: 'Honduras', fact: 'Its Mosquito Coast shares its name with a novel and film, and its remote La Mosquitia is one of Central America\'s last great wildernesses.', difficulty: 'Hard' },
  { countryName: 'Belize', fact: 'The only Central American country that was a colony of a European island nation rather than of a continental one, gaining independence in 1981.', difficulty: 'Hard' },

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Oceania (60 clues) ────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════

  // Easy (20)
  { countryName: 'Australia', fact: 'A country that is also a continent, with more kangaroos than people and a reef visible from orbit.', difficulty: 'Easy' },
  { countryName: 'New Zealand', fact: 'The first country to give women the vote, in 1893, and home to several sheep for every person.', difficulty: 'Easy' },
  { countryName: 'Australia', fact: 'Its interior is so flat and dry it is called the Outback, and it has more species of venomous snakes than any other continent.', difficulty: 'Easy' },
  { countryName: 'New Zealand', fact: 'Its film industry turned a volcanic plateau into Middle-earth, and a flightless bird with whiskers is its national emblem.', difficulty: 'Easy' },
  { countryName: 'Australia', fact: 'A vast sandstone monolith sacred to its Indigenous people rises from the red desert, and its opera house is one of the most recognisable buildings on earth.', difficulty: 'Easy' },
  { countryName: 'New Zealand', fact: 'Its indigenous people\'s war dance is performed by its national rugby team before every match, and it sits on the boundary of two tectonic plates.', difficulty: 'Easy' },
  { countryName: 'Fiji', fact: 'An archipelago of over 300 islands where a pepper-root drink is served in ceremonial half-coconut bowls.', difficulty: 'Easy' },
  { countryName: 'Papua New Guinea', fact: 'More than 800 languages are spoken here, more than in any other country.', difficulty: 'Easy' },
  { countryName: 'Australia', fact: 'Its unique animals include egg-laying mammals and a bear-like marsupial that sleeps 20 hours a day.', difficulty: 'Easy' },
  { countryName: 'New Zealand', fact: 'It was the last large habitable landmass to be settled by humans, and giant flightless birds roamed it until around 600 years ago.', difficulty: 'Easy' },
  { countryName: 'Fiji', fact: 'Its national sport is rugby sevens, and it became the first Pacific island nation to win an Olympic gold medal in that event.', difficulty: 'Easy' },
  { countryName: 'Papua New Guinea', fact: 'Its highland tribes were unknown to the outside world until the 1930s, and birds of paradise display extraordinary plumage in its forests.', difficulty: 'Easy' },
  { countryName: 'Australia', fact: 'Its Great Barrier Reef stretches over 2,300 km and is the largest living structure on earth.', difficulty: 'Easy' },
  { countryName: 'New Zealand', fact: 'Its geothermal zone shoots boiling mud and geysers into the air, and it has no native land mammals other than bats.', difficulty: 'Easy' },
  { countryName: 'Australia', fact: 'It is the driest inhabited continent, and a fence longer than the distance from London to New York keeps its dingoes from its sheep.', difficulty: 'Easy' },
  { countryName: 'Fiji', fact: 'Its warm waters are a hotspot for soft-coral diving, and its 180th meridian means sunrise here greets some of the first places on earth each day.', difficulty: 'Easy' },
  { countryName: 'Papua New Guinea', fact: 'It shares its main island with a province of a Southeast Asian neighbour, and trekkers cross its jungle-clad mountain trails to retrace wartime paths.', difficulty: 'Easy' },
  { countryName: 'New Zealand', fact: 'Its southern fiords were carved by glaciers, and Milford Sound is regularly called one of the most beautiful places on earth.', difficulty: 'Easy' },
  { countryName: 'Benin', fact: 'Once the seat of a powerful pre-colonial kingdom famous for its bronze sculptures, it officially practises Voodoo as a national religion.', difficulty: 'Hard' },
  { countryName: 'Samoa', fact: 'It skipped a day entirely in 2011, jumping across the date line to trade with its neighbours.', difficulty: 'Easy' },

  // Medium (20)
  { countryName: 'Tonga', fact: 'A Polynesian kingdom that was never formally colonised, and among the first places on earth to see the new day.', difficulty: 'Medium' },
  { countryName: 'Vanuatu', fact: 'Land diving from wooden towers with vines tied to the ankles here inspired bungee jumping.', difficulty: 'Medium' },
  { countryName: 'Solomon Islands', fact: 'A Pacific archipelago where some people are born with strikingly blond hair, from a gene found almost nowhere else.', difficulty: 'Medium' },
  { countryName: 'Palau', fact: 'It created the world\'s first shark sanctuary, and a lake here is filled with stingless jellyfish.', difficulty: 'Medium' },
  { countryName: 'Kiribati', fact: 'It straddles both the equator and the date line, making it the first country to greet each new year.', difficulty: 'Medium' },
  { countryName: 'Tuvalu', fact: 'One of the smallest countries on earth, it earns a large share of its national income from leasing its internet domain.', difficulty: 'Medium' },
  { countryName: 'Marshall Islands', fact: 'Nuclear tests at one of its atolls in the 1940s and 50s lent their name to a two-piece swimsuit.', difficulty: 'Medium' },
  { countryName: 'Micronesia', fact: 'One of its islands uses giant carved stone discs, some taller than a person, as traditional money.', difficulty: 'Medium' },
  { countryName: 'Nauru', fact: 'A single raised coral island, once the richest place per person on earth thanks to bird droppings.', difficulty: 'Medium' },
  { countryName: 'Tonga', fact: 'Its underwater volcano erupted in 2022 with one of the largest atmospheric blasts ever recorded by instruments.', difficulty: 'Medium' },
  { countryName: 'Vanuatu', fact: 'It tops many "happiest country" indexes, and an active volcano on one of its islands has glowed for centuries, earning the nickname "lighthouse of the Pacific".', difficulty: 'Medium' },
  { countryName: 'Solomon Islands', fact: 'The site of fierce World War II battles, its Guadalcanal gave its name to one of the most famous Pacific campaigns.', difficulty: 'Medium' },
  { countryName: 'Samoa', fact: 'Its traditional tattooing, covering the body from waist to knee, is one of the oldest continuous tattoo traditions in the world.', difficulty: 'Medium' },
  { countryName: 'Palau', fact: 'Its Rock Islands, hundreds of mushroom-shaped limestone islets covered in jungle, are a UNESCO World Heritage Site.', difficulty: 'Medium' },
  { countryName: 'Fiji', fact: 'Its traditional firewalking ceremony involves walking barefoot across white-hot stones, a practice passed down for generations.', difficulty: 'Medium' },
  { countryName: 'Papua New Guinea', fact: 'Its Sepik River art tradition produces carvings and masks considered among the most complex in the Pacific.', difficulty: 'Medium' },
  { countryName: 'Australia', fact: 'Its Indigenous people\'s continuous cultural history stretches back over 65,000 years, making it the oldest living civilization on earth.', difficulty: 'Medium' },
  { countryName: 'New Zealand', fact: 'Its Maori name means "land of the long white cloud," and it has more golf courses per person than almost any other country.', difficulty: 'Medium' },
  { countryName: 'Kiribati', fact: 'Its land averages less than 2 metres above sea level, and it was the first country to declare an entire marine area a protected sanctuary.', difficulty: 'Medium' },
  { countryName: 'Tuvalu', fact: 'Its total land area is only about 26 square kilometres, making it the fourth-smallest country in the world.', difficulty: 'Medium' },

  // Hard (20)
  { countryName: 'Marshall Islands', fact: 'Its traditional stick charts, made of palm ribs and shells, were used to navigate ocean swells between atolls, centuries before GPS.', difficulty: 'Hard' },
  { countryName: 'Micronesia', fact: 'Its Nan Madol ruins, a series of stone islets and canals, are sometimes called the "Venice of the Pacific" and are a UNESCO heritage site.', difficulty: 'Hard' },
  { countryName: 'Nauru', fact: 'After its phosphate ran out it became one of the poorest countries in the Pacific, having once had one of the highest per-capita incomes in the world.', difficulty: 'Hard' },
  { countryName: 'Tonga', fact: 'The only Pacific island nation that was never colonised by a European power, its monarchy traces an unbroken line back over a thousand years.', difficulty: 'Hard' },
  { countryName: 'Vanuatu', fact: 'It has the highest density of languages per capita in the world, with over 100 languages spoken by roughly 300,000 people.', difficulty: 'Hard' },
  { countryName: 'Solomon Islands', fact: 'Its people in some areas use dolphin teeth as currency, and its forests still shelter species unknown to science.', difficulty: 'Hard' },
  { countryName: 'Samoa', fact: 'Robert Louis Stevenson spent his final years here and is buried on a mountaintop; locals called him "the storyteller".', difficulty: 'Hard' },
  { countryName: 'Palau', fact: 'It banned reef-toxic sunscreen to protect its corals, making it the first country in the world to do so.', difficulty: 'Hard' },
  { countryName: 'Kiribati', fact: 'It purchased land in another Pacific nation as a potential refuge for its people if rising seas submerge its atolls.', difficulty: 'Hard' },
  { countryName: 'Tuvalu', fact: 'It became a member of the United Nations in 2000, and its highest natural point is only about 4.6 metres above sea level.', difficulty: 'Hard' },
  { countryName: 'Marshall Islands', fact: 'Its Bikini Atoll, site of 23 nuclear tests, gave its name to the swimsuit because of the "explosive" impact both were expected to have.', difficulty: 'Hard' },
  { countryName: 'Micronesia', fact: 'Chuuk Lagoon in its waters holds dozens of sunken World War II warships, making it one of the top wreck-diving sites on earth.', difficulty: 'Hard' },
  { countryName: 'Nauru', fact: 'It is the only country in the world with no official capital city, and its entire land mass is a single coral island.', difficulty: 'Hard' },
  { countryName: 'Fiji', fact: 'Its traditional meke dance tells stories of ancestors and warriors, and its cannibal past is openly discussed in its village museums.', difficulty: 'Hard' },
  { countryName: 'Papua New Guinea', fact: 'Its Mount Tavurvur erupted so dramatically in 1994 that it buried a city in ash, yet the population was evacuated in time.', difficulty: 'Hard' },
  { countryName: 'Australia', fact: 'It fought and lost a "war" against emus in 1932 when the birds proved too fast and dispersed for soldiers with machine guns.', difficulty: 'Hard' },
  { countryName: 'New Zealand', fact: 'Its Chatham Islands observe a 45-minute time zone offset, one of only a few places in the world with a non-standard time zone.', difficulty: 'Hard' },
  { countryName: 'Vanuatu', fact: 'A cargo cult on one of its islands worshipped a foreign figure, hoping the rituals would bring material wealth, and the movement persisted for decades.', difficulty: 'Hard' },
  { countryName: 'Solomon Islands', fact: 'Its island of Rennell holds the largest raised coral atoll in the world, with a brackish lake that is a UNESCO site.', difficulty: 'Hard' },
  { countryName: 'Tonga', fact: 'Its Ha\'amonga \'a Maui trilithon, a coral-stone archway, is sometimes called the "Stonehenge of the Pacific" and may have been used as a seasonal calendar.', difficulty: 'Hard' },
];
