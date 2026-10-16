/**
 * Era Asset Validator for the MCP server.
 * Self-contained copy — the canonical source is packages/theaters/src/historical/EraAssetValidator.ts.
 *
 * Maps known DCS unit types to real-world introduction years.
 * RULE: introductionYear <= missionYear → allowed.
 */

type AssetCategory = 'aircraft' | 'helicopter' | 'vehicle' | 'ship' | 'static';

interface EraEntry {
  dcsType: string;
  name: string;
  year: number;
  category: AssetCategory;
  nation: string;
}

interface ValidationResult {
  allowed: boolean;
  dcsType: string;
  category: AssetCategory;
  missionYear: number;
  introductionYear?: number;
  reason: string;
  suggestions?: string[];
}

const REGISTRY: EraEntry[] = [
  // ── WWII Aircraft ──
  { dcsType: 'SpitfireLFMkIX',   name: 'Spitfire LF Mk.IX',       year: 1943, category: 'aircraft', nation: 'UK' },
  { dcsType: 'SpitfireLFMkIXCW', name: 'Spitfire LF Mk.IX CW',    year: 1943, category: 'aircraft', nation: 'UK' },
  { dcsType: 'Bf-109K-4',        name: 'Bf 109 K-4',               year: 1944, category: 'aircraft', nation: 'DE' },
  { dcsType: 'Fw-190D-9',        name: 'Fw 190 D-9',               year: 1944, category: 'aircraft', nation: 'DE' },
  { dcsType: 'Fw-190A-8',        name: 'Fw 190 A-8',               year: 1943, category: 'aircraft', nation: 'DE' },
  { dcsType: 'P-47D-30',         name: 'P-47D Thunderbolt',        year: 1944, category: 'aircraft', nation: 'US' },
  { dcsType: 'P-47D-30bl1',      name: 'P-47D Thunderbolt',        year: 1944, category: 'aircraft', nation: 'US' },
  { dcsType: 'P-47D-40',         name: 'P-47D-40 Thunderbolt',     year: 1944, category: 'aircraft', nation: 'US' },
  { dcsType: 'P-51D',            name: 'P-51D Mustang',            year: 1944, category: 'aircraft', nation: 'US' },
  { dcsType: 'P-51D-30-NA',      name: 'P-51D-30 Mustang',         year: 1944, category: 'aircraft', nation: 'US' },
  { dcsType: 'TF-51D',           name: 'TF-51D Mustang',           year: 1944, category: 'aircraft', nation: 'US' },
  { dcsType: 'MosquitoFBMkVI',   name: 'Mosquito FB Mk.VI',        year: 1943, category: 'aircraft', nation: 'UK' },
  { dcsType: 'I-16',             name: 'I-16',                      year: 1934, category: 'aircraft', nation: 'SU' },
  { dcsType: 'Ju-88A-4',         name: 'Ju 88 A-4',                year: 1941, category: 'aircraft', nation: 'DE' },
  { dcsType: 'C-47',             name: 'C-47 Skytrain',            year: 1941, category: 'aircraft', nation: 'US' },

  // ── Korean / Early Jet ──
  { dcsType: 'F-86F Sabre',      name: 'F-86F Sabre',              year: 1949, category: 'aircraft', nation: 'US' },
  { dcsType: 'MiG-15bis',        name: 'MiG-15bis',                year: 1949, category: 'aircraft', nation: 'SU' },
  { dcsType: 'MiG-19P',          name: 'MiG-19P Farmer',           year: 1955, category: 'aircraft', nation: 'SU' },
  { dcsType: 'A-4E-C',           name: 'A-4E Skyhawk',             year: 1962, category: 'aircraft', nation: 'US' },

  // ── Vietnam / Cold War ──
  { dcsType: 'F-4E-45MC',        name: 'F-4E Phantom II',          year: 1967, category: 'aircraft', nation: 'US' },
  { dcsType: 'F-5E-3',           name: 'F-5E Tiger II',            year: 1972, category: 'aircraft', nation: 'US' },
  { dcsType: 'MiG-21Bis',        name: 'MiG-21bis',                year: 1972, category: 'aircraft', nation: 'SU' },
  { dcsType: 'AJS37',            name: 'AJS 37 Viggen',            year: 1971, category: 'aircraft', nation: 'SE' },
  { dcsType: 'MiG-23MLD',        name: 'MiG-23MLD',                year: 1978, category: 'aircraft', nation: 'SU' },

  // ── Late Cold War ──
  { dcsType: 'F-14A-135-GR',     name: 'F-14A Tomcat',             year: 1974, category: 'aircraft', nation: 'US' },
  { dcsType: 'F-14B',            name: 'F-14B Tomcat',             year: 1988, category: 'aircraft', nation: 'US' },
  { dcsType: 'F-15C',            name: 'F-15C Eagle',              year: 1979, category: 'aircraft', nation: 'US' },
  { dcsType: 'F-15ESE',          name: 'F-15E Strike Eagle',       year: 1988, category: 'aircraft', nation: 'US' },
  { dcsType: 'F-16C_50',         name: 'F-16C Block 50',           year: 1991, category: 'aircraft', nation: 'US' },
  { dcsType: 'FA-18C_hornet',    name: 'F/A-18C Hornet',           year: 1983, category: 'aircraft', nation: 'US' },
  { dcsType: 'AV8BNA',           name: 'AV-8B Harrier II N/A',     year: 1981, category: 'aircraft', nation: 'US' },
  { dcsType: 'A-10C',            name: 'A-10C Thunderbolt II',     year: 1977, category: 'aircraft', nation: 'US' },
  { dcsType: 'A-10C_2',          name: 'A-10C II Thunderbolt',     year: 1977, category: 'aircraft', nation: 'US' },
  { dcsType: 'A-10A',            name: 'A-10A Thunderbolt II',     year: 1977, category: 'aircraft', nation: 'US' },
  { dcsType: 'Mirage-F1EE',      name: 'Mirage F1 EE',             year: 1973, category: 'aircraft', nation: 'FR' },
  { dcsType: 'Mirage-F1CE',      name: 'Mirage F1 CE',             year: 1973, category: 'aircraft', nation: 'FR' },
  { dcsType: 'Mirage-F1BE',      name: 'Mirage F1 BE',             year: 1973, category: 'aircraft', nation: 'FR' },
  { dcsType: 'Mirage-F1M-EE',    name: 'Mirage F1 M-EE',           year: 1973, category: 'aircraft', nation: 'FR' },
  { dcsType: 'Mirage-F1CT',      name: 'Mirage F1 CT',             year: 1973, category: 'aircraft', nation: 'FR' },
  { dcsType: 'Mirage-F1EQ',      name: 'Mirage F1 EQ',             year: 1973, category: 'aircraft', nation: 'FR' },
  { dcsType: 'Mirage 2000C',     name: 'Mirage 2000C',             year: 1984, category: 'aircraft', nation: 'FR' },
  { dcsType: 'M-2000C',          name: 'Mirage 2000C',             year: 1984, category: 'aircraft', nation: 'FR' },
  { dcsType: 'Su-25',            name: 'Su-25 Frogfoot',           year: 1981, category: 'aircraft', nation: 'SU' },
  { dcsType: 'Su-25T',           name: 'Su-25T',                   year: 1981, category: 'aircraft', nation: 'SU' },
  { dcsType: 'Su-27',            name: 'Su-27 Flanker',            year: 1985, category: 'aircraft', nation: 'SU' },
  { dcsType: 'Su-33',            name: 'Su-33 Flanker-D',          year: 1995, category: 'aircraft', nation: 'RU' },
  { dcsType: 'Su-24M',           name: 'Su-24M Fencer',            year: 1983, category: 'aircraft', nation: 'SU' },
  { dcsType: 'MiG-29A',          name: 'MiG-29A Fulcrum',          year: 1983, category: 'aircraft', nation: 'SU' },
  { dcsType: 'MiG-29S',          name: 'MiG-29S Fulcrum',          year: 1986, category: 'aircraft', nation: 'SU' },
  { dcsType: 'MiG-29G',          name: 'MiG-29G Fulcrum',          year: 1983, category: 'aircraft', nation: 'SU' },
  { dcsType: 'MiG-25PD',         name: 'MiG-25PD Foxbat',          year: 1978, category: 'aircraft', nation: 'SU' },
  { dcsType: 'MiG-31',           name: 'MiG-31 Foxhound',          year: 1981, category: 'aircraft', nation: 'SU' },
  { dcsType: 'Su-17M4',          name: 'Su-17M4 Fitter-K',         year: 1981, category: 'aircraft', nation: 'SU' },
  { dcsType: 'C-101CC',          name: 'C-101CC Aviojet',          year: 1980, category: 'aircraft', nation: 'ES' },
  { dcsType: 'C-101EB',          name: 'C-101EB Aviojet',          year: 1977, category: 'aircraft', nation: 'ES' },
  { dcsType: 'L-39C',            name: 'L-39C Albatros',           year: 1971, category: 'aircraft', nation: 'CZ' },
  { dcsType: 'L-39ZA',           name: 'L-39ZA Albatros',          year: 1971, category: 'aircraft', nation: 'CZ' },
  { dcsType: 'MB-339A',          name: 'MB-339A',                  year: 1976, category: 'aircraft', nation: 'IT' },
  { dcsType: 'C-130',            name: 'C-130 Hercules',           year: 1956, category: 'aircraft', nation: 'US' },
  { dcsType: 'C-130J',           name: 'C-130J Super Hercules',    year: 1999, category: 'aircraft', nation: 'US' },
  { dcsType: 'An-26B',           name: 'An-26B',                   year: 1969, category: 'aircraft', nation: 'SU' },
  { dcsType: 'Il-76MD',          name: 'Il-76MD',                  year: 1974, category: 'aircraft', nation: 'SU' },
  { dcsType: 'E-2C',             name: 'E-2C Hawkeye',             year: 1973, category: 'aircraft', nation: 'US' },
  { dcsType: 'E-3A',             name: 'E-3A Sentry AWACS',        year: 1977, category: 'aircraft', nation: 'US' },
  { dcsType: 'KC-135',           name: 'KC-135 Stratotanker',      year: 1957, category: 'aircraft', nation: 'US' },
  { dcsType: 'KC135MPRS',        name: 'KC-135 MPRS',              year: 1957, category: 'aircraft', nation: 'US' },
  { dcsType: 'S-3B',             name: 'S-3B Viking',              year: 1974, category: 'aircraft', nation: 'US' },
  { dcsType: 'S-3B Tanker',      name: 'S-3B Viking Tanker',       year: 1974, category: 'aircraft', nation: 'US' },
  { dcsType: 'B-52H',            name: 'B-52H Stratofortress',     year: 1961, category: 'aircraft', nation: 'US' },
  { dcsType: 'B-1B',             name: 'B-1B Lancer',              year: 1986, category: 'aircraft', nation: 'US' },
  { dcsType: 'Tornado GR4',      name: 'Tornado GR.4',             year: 1979, category: 'aircraft', nation: 'UK' },
  { dcsType: 'Tornado IDS',      name: 'Tornado IDS',              year: 1979, category: 'aircraft', nation: 'DE' },
  { dcsType: 'Tu-22M3',          name: 'Tu-22M3 Backfire',         year: 1983, category: 'aircraft', nation: 'SU' },
  { dcsType: 'Tu-95MS',          name: 'Tu-95MS Bear',             year: 1984, category: 'aircraft', nation: 'SU' },
  { dcsType: 'Tu-160',           name: 'Tu-160 Blackjack',         year: 1987, category: 'aircraft', nation: 'SU' },
  { dcsType: 'F-16A',            name: 'F-16A',                    year: 1979, category: 'aircraft', nation: 'US' },

  // ── Modern Aircraft ──
  { dcsType: 'JF-17',            name: 'JF-17 Thunder',            year: 2007, category: 'aircraft', nation: 'PK' },
  { dcsType: 'Su-30MKA',         name: 'Su-30MKA',                 year: 2007, category: 'aircraft', nation: 'RU' },
  { dcsType: 'EF-2000',          name: 'Eurofighter Typhoon',      year: 2003, category: 'aircraft', nation: 'EU' },
  { dcsType: 'Rafale_B_01',      name: 'Rafale B',                 year: 2001, category: 'aircraft', nation: 'FR' },
  { dcsType: 'Rafale_M_01',      name: 'Rafale M',                 year: 2001, category: 'aircraft', nation: 'FR' },
  { dcsType: 'MQ-9 Reaper',      name: 'MQ-9 Reaper',             year: 2007, category: 'aircraft', nation: 'US' },

  // ── Helicopters ──
  { dcsType: 'UH-1H',            name: 'UH-1H Huey',              year: 1959, category: 'helicopter', nation: 'US' },
  { dcsType: 'SA342M',           name: 'SA 342M Gazelle',          year: 1973, category: 'helicopter', nation: 'FR' },
  { dcsType: 'SA342L',           name: 'SA 342L Gazelle',          year: 1977, category: 'helicopter', nation: 'FR' },
  { dcsType: 'SA342Minigun',     name: 'SA 342 Minigun',           year: 1973, category: 'helicopter', nation: 'FR' },
  { dcsType: 'SA342Mistral',     name: 'SA 342 Mistral',           year: 1973, category: 'helicopter', nation: 'FR' },
  { dcsType: 'Mi-8MT',           name: 'Mi-8MT Hip',               year: 1975, category: 'helicopter', nation: 'SU' },
  { dcsType: 'Mi-24P',           name: 'Mi-24P Hind',              year: 1981, category: 'helicopter', nation: 'SU' },
  { dcsType: 'Mi-24V',           name: 'Mi-24V Hind',              year: 1976, category: 'helicopter', nation: 'SU' },
  { dcsType: 'Mi-26',            name: 'Mi-26 Halo',               year: 1983, category: 'helicopter', nation: 'SU' },
  { dcsType: 'Mi-28N',           name: 'Mi-28N Havoc',             year: 2006, category: 'helicopter', nation: 'RU' },
  { dcsType: 'Ka-50',            name: 'Ka-50 Black Shark',        year: 1995, category: 'helicopter', nation: 'RU' },
  { dcsType: 'Ka-50_3',          name: 'Ka-50 III',                year: 1995, category: 'helicopter', nation: 'RU' },
  { dcsType: 'Ka-52',            name: 'Ka-52 Alligator',          year: 2011, category: 'helicopter', nation: 'RU' },
  { dcsType: 'OH-58D',           name: 'OH-58D Kiowa',             year: 1985, category: 'helicopter', nation: 'US' },
  { dcsType: 'AH-64D_BLK_II',   name: 'AH-64D Apache',            year: 1995, category: 'helicopter', nation: 'US' },
  { dcsType: 'AH-64A',           name: 'AH-64A Apache',            year: 1986, category: 'helicopter', nation: 'US' },
  { dcsType: 'UH-60L',           name: 'UH-60L Black Hawk',        year: 1989, category: 'helicopter', nation: 'US' },
  { dcsType: 'UH-60A',           name: 'UH-60A Black Hawk',        year: 1979, category: 'helicopter', nation: 'US' },
  { dcsType: 'CH-47F',           name: 'CH-47F Chinook',           year: 2007, category: 'helicopter', nation: 'US' },
  { dcsType: 'CH-53E',           name: 'CH-53E Super Stallion',    year: 1981, category: 'helicopter', nation: 'US' },
  { dcsType: 'AH-1W',            name: 'AH-1W SuperCobra',         year: 1986, category: 'helicopter', nation: 'US' },
  { dcsType: 'SH-60B',           name: 'SH-60B Seahawk',           year: 1984, category: 'helicopter', nation: 'US' },

  // ── WWII Ground ──
  { dcsType: 'Flak_18',          name: '88mm Flak 18',             year: 1936, category: 'vehicle', nation: 'DE' },
  { dcsType: 'Flak_36',          name: '88mm Flak 36',             year: 1937, category: 'vehicle', nation: 'DE' },
  { dcsType: 'Flak_38',          name: '20mm Flak 38',             year: 1938, category: 'vehicle', nation: 'DE' },
  { dcsType: 'Flak30',           name: '20mm Flak 30',             year: 1934, category: 'vehicle', nation: 'DE' },
  { dcsType: 'Pak 40',           name: '75mm PaK 40',              year: 1942, category: 'vehicle', nation: 'DE' },
  { dcsType: 'Tiger I',          name: 'Tiger I',                   year: 1942, category: 'vehicle', nation: 'DE' },
  { dcsType: 'Tiger II H',       name: 'Tiger II',                  year: 1944, category: 'vehicle', nation: 'DE' },
  { dcsType: 'Panzer IV',        name: 'Panzer IV H',              year: 1937, category: 'vehicle', nation: 'DE' },
  { dcsType: 'Panther',          name: 'Panther',                   year: 1943, category: 'vehicle', nation: 'DE' },
  { dcsType: 'StuG III',         name: 'StuG III G',               year: 1940, category: 'vehicle', nation: 'DE' },
  { dcsType: 'SdKfz 251',        name: 'Sd.Kfz.251 Hanomag',      year: 1939, category: 'vehicle', nation: 'DE' },
  { dcsType: 'Blitz 3.6',        name: 'Opel Blitz 3.6t',          year: 1937, category: 'vehicle', nation: 'DE' },
  { dcsType: 'Kubelwagen_82',    name: 'Kübelwagen',               year: 1940, category: 'vehicle', nation: 'DE' },
  { dcsType: 'M4_Sherman',       name: 'M4 Sherman',               year: 1942, category: 'vehicle', nation: 'US' },
  { dcsType: 'M4A4_Sherman_FF',  name: 'M4A4 Sherman Firefly',     year: 1944, category: 'vehicle', nation: 'UK' },
  { dcsType: 'Cromwell_IV',      name: 'Cromwell IV',              year: 1944, category: 'vehicle', nation: 'UK' },
  { dcsType: 'Churchill_VII',    name: 'Churchill VII',             year: 1944, category: 'vehicle', nation: 'UK' },
  { dcsType: 'Willys_MB',        name: 'Willys MB Jeep',           year: 1941, category: 'vehicle', nation: 'US' },
  { dcsType: 'Daimler_AC',       name: 'Daimler Armoured Car',     year: 1941, category: 'vehicle', nation: 'UK' },
  { dcsType: 'Bedford_MWD',      name: 'Bedford MWD',              year: 1939, category: 'vehicle', nation: 'UK' },

  // ── Cold War / Modern Ground ──
  { dcsType: 'T-55',              name: 'T-55',                     year: 1958, category: 'vehicle', nation: 'SU' },
  { dcsType: 'T-62',              name: 'T-62',                     year: 1961, category: 'vehicle', nation: 'SU' },
  { dcsType: 'T-72B',             name: 'T-72B',                    year: 1985, category: 'vehicle', nation: 'SU' },
  { dcsType: 'T-72B3',            name: 'T-72B3',                   year: 2012, category: 'vehicle', nation: 'RU' },
  { dcsType: 'T-80UD',            name: 'T-80UD',                   year: 1987, category: 'vehicle', nation: 'SU' },
  { dcsType: 'T-90',              name: 'T-90',                     year: 1995, category: 'vehicle', nation: 'RU' },
  { dcsType: 'BMP-1',             name: 'BMP-1',                    year: 1966, category: 'vehicle', nation: 'SU' },
  { dcsType: 'BMP-2',             name: 'BMP-2',                    year: 1980, category: 'vehicle', nation: 'SU' },
  { dcsType: 'BMP-3',             name: 'BMP-3',                    year: 1987, category: 'vehicle', nation: 'SU' },
  { dcsType: 'BTR-80',            name: 'BTR-80',                   year: 1984, category: 'vehicle', nation: 'SU' },
  { dcsType: 'BTR-70',            name: 'BTR-70',                   year: 1972, category: 'vehicle', nation: 'SU' },
  { dcsType: 'BRDM-2',            name: 'BRDM-2',                   year: 1962, category: 'vehicle', nation: 'SU' },
  { dcsType: 'M-1 Abrams',        name: 'M1 Abrams',               year: 1980, category: 'vehicle', nation: 'US' },
  { dcsType: 'M-2 Bradley',       name: 'M2 Bradley',              year: 1981, category: 'vehicle', nation: 'US' },
  { dcsType: 'M60',               name: 'M60 Patton',              year: 1960, category: 'vehicle', nation: 'US' },
  { dcsType: 'M113',              name: 'M113 APC',                year: 1960, category: 'vehicle', nation: 'US' },
  { dcsType: 'Leopard-2',         name: 'Leopard 2',               year: 1979, category: 'vehicle', nation: 'DE' },
  { dcsType: 'Leopard1A3',        name: 'Leopard 1A3',             year: 1965, category: 'vehicle', nation: 'DE' },
  { dcsType: 'Marder',            name: 'Marder IFV',              year: 1971, category: 'vehicle', nation: 'DE' },
  { dcsType: 'Warrior',           name: 'Warrior IFV',             year: 1987, category: 'vehicle', nation: 'UK' },
  { dcsType: 'Challenger2',       name: 'Challenger 2',            year: 1998, category: 'vehicle', nation: 'UK' },
  { dcsType: 'Merkava_Mk4',       name: 'Merkava Mk.4',           year: 2004, category: 'vehicle', nation: 'IL' },

  // ── Air Defence ──
  { dcsType: 'ZSU-23-4 Shilka',   name: 'ZSU-23-4 Shilka',        year: 1965, category: 'vehicle', nation: 'SU' },
  { dcsType: 'ZU-23',             name: 'ZU-23-2',                  year: 1960, category: 'vehicle', nation: 'SU' },
  { dcsType: 'Gepard',            name: 'Gepard SPAAG',             year: 1976, category: 'vehicle', nation: 'DE' },
  { dcsType: 'Vulcan',            name: 'M163 Vulcan',              year: 1968, category: 'vehicle', nation: 'US' },
  { dcsType: 'Roland ADS',        name: 'Roland ADS',               year: 1977, category: 'vehicle', nation: 'FR' },
  { dcsType: 'Osa 9A33',          name: 'SA-8 Osa',                 year: 1975, category: 'vehicle', nation: 'SU' },
  { dcsType: 'Kub 2K12',          name: 'SA-6 Kub',                 year: 1967, category: 'vehicle', nation: 'SU' },
  { dcsType: 'S-75 Dvina',        name: 'SA-2 Guideline',           year: 1957, category: 'vehicle', nation: 'SU' },
  { dcsType: 'S-125 Pechora',     name: 'SA-3 Goa',                 year: 1961, category: 'vehicle', nation: 'SU' },
  { dcsType: 'SA-11 Buk LN 9A310M1', name: 'SA-11 Buk',            year: 1979, category: 'vehicle', nation: 'SU' },
  { dcsType: 'SA-18 Igla-S',      name: 'SA-18 Igla-S',             year: 2002, category: 'vehicle', nation: 'RU' },
  { dcsType: 'Hawk ln',           name: 'MIM-23 Hawk',              year: 1960, category: 'vehicle', nation: 'US' },
  { dcsType: 'M48 Chaparral',     name: 'M48 Chaparral',            year: 1969, category: 'vehicle', nation: 'US' },
  { dcsType: 'M6 Linebacker',     name: 'M6 Linebacker',            year: 1997, category: 'vehicle', nation: 'US' },
  { dcsType: 'Patriot ln',        name: 'MIM-104 Patriot',          year: 1984, category: 'vehicle', nation: 'US' },
  { dcsType: 'Tor 9A331',         name: 'SA-15 Tor',                year: 1986, category: 'vehicle', nation: 'SU' },
  { dcsType: '2S6 Tunguska',      name: 'SA-19 Tunguska',           year: 1982, category: 'vehicle', nation: 'SU' },
  { dcsType: 'Strela-1 9P31',     name: 'SA-9 Gaskin',              year: 1968, category: 'vehicle', nation: 'SU' },
  { dcsType: 'Strela-10M3',       name: 'SA-13 Gopher',             year: 1975, category: 'vehicle', nation: 'SU' },
  { dcsType: 'Rapier_FSA_Launcher_LN', name: 'Rapier FSA',          year: 1971, category: 'vehicle', nation: 'UK' },
  { dcsType: 'S-300PS 5P85C ln',  name: 'SA-10 Grumble',            year: 1978, category: 'vehicle', nation: 'SU' },

  // ── Artillery / Misc ──
  { dcsType: 'M109',              name: 'M109 Paladin',             year: 1963, category: 'vehicle', nation: 'US' },
  { dcsType: 'SAU 2S1',           name: '2S1 Gvozdika',             year: 1971, category: 'vehicle', nation: 'SU' },
  { dcsType: 'SAU 2S3',           name: '2S3 Akatsiya',             year: 1971, category: 'vehicle', nation: 'SU' },
  { dcsType: 'SAU 2S19',          name: '2S19 Msta',                year: 1989, category: 'vehicle', nation: 'SU' },
  { dcsType: 'Scud_B',            name: 'Scud-B',                   year: 1962, category: 'vehicle', nation: 'SU' },
  { dcsType: 'Ural-375',          name: 'Ural-375D',                year: 1961, category: 'vehicle', nation: 'SU' },
  { dcsType: 'Ural-4320',         name: 'Ural-4320',                year: 1977, category: 'vehicle', nation: 'SU' },
  { dcsType: 'KAMAZ Truck',       name: 'KAMAZ-4310',               year: 1976, category: 'vehicle', nation: 'SU' },
  { dcsType: 'M818',              name: 'M939 Truck',               year: 1970, category: 'vehicle', nation: 'US' },
  { dcsType: '1L13 EWR',          name: '1L13 EWR',                 year: 1970, category: 'vehicle', nation: 'SU' },
  { dcsType: '55G6 EWR',          name: '55G6 EWR',                 year: 1986, category: 'vehicle', nation: 'SU' },
  { dcsType: 'FPS-117',           name: 'AN/FPS-117',               year: 1980, category: 'vehicle', nation: 'US' },

  // ── Ships ──
  { dcsType: 'CVN_71',            name: 'USS Theodore Roosevelt',   year: 1986, category: 'ship', nation: 'US' },
  { dcsType: 'CVN_72',            name: 'USS Abraham Lincoln',      year: 1989, category: 'ship', nation: 'US' },
  { dcsType: 'CVN_73',            name: 'USS George Washington',    year: 1992, category: 'ship', nation: 'US' },
  { dcsType: 'CVN_74',            name: 'USS John C. Stennis',      year: 1995, category: 'ship', nation: 'US' },
  { dcsType: 'CVN_75',            name: 'USS Harry S. Truman',      year: 1998, category: 'ship', nation: 'US' },
  { dcsType: 'Stennis',           name: 'USS John C. Stennis',      year: 1995, category: 'ship', nation: 'US' },
  { dcsType: 'CV_1143_5',         name: 'Admiral Kuznetsov',        year: 1990, category: 'ship', nation: 'RU' },
  { dcsType: 'VINSON',            name: 'USS Carl Vinson',          year: 1982, category: 'ship', nation: 'US' },
  { dcsType: 'LHA_Tarawa',        name: 'LHA-1 Tarawa',             year: 1976, category: 'ship', nation: 'US' },
  { dcsType: 'PERRY',             name: 'Oliver Hazard Perry',      year: 1977, category: 'ship', nation: 'US' },
  { dcsType: 'Ticonderoga',       name: 'CG-47 Ticonderoga',        year: 1983, category: 'ship', nation: 'US' },
  { dcsType: 'ARLEIGH BURKE IIa', name: 'DDG Arleigh Burke IIA',    year: 2000, category: 'ship', nation: 'US' },
  { dcsType: 'Rezky',             name: 'Krivak Frigate',           year: 1970, category: 'ship', nation: 'SU' },
  { dcsType: 'Molniya',           name: 'Molniya Missile Boat',     year: 1980, category: 'ship', nation: 'SU' },
  { dcsType: 'Moskva',            name: 'Slava-class Cruiser',      year: 1982, category: 'ship', nation: 'SU' },
  { dcsType: 'Albatros',          name: 'Grisha Corvette',          year: 1970, category: 'ship', nation: 'SU' },
  { dcsType: 'Type_052B',         name: 'Type 052B Destroyer',      year: 2004, category: 'ship', nation: 'CN' },
  { dcsType: 'Speedboat',         name: 'Armed Speedboat',          year: 1970, category: 'ship', nation: 'IR' },
  { dcsType: 'Dry-cargo ship-2',  name: 'Dry Cargo Ship',           year: 1960, category: 'ship', nation: 'SU' },
  { dcsType: 'Dry-cargo ship-1',  name: 'Dry Cargo Ship',           year: 1960, category: 'ship', nation: 'SU' },
];

const typeMap = new Map<string, EraEntry>();
for (const entry of REGISTRY) {
  typeMap.set(entry.dcsType, entry);
}

export class EraAssetValidator {
  static validate(
    dcsType: string,
    missionYear: number,
    category?: AssetCategory
  ): ValidationResult {
    const entry = typeMap.get(dcsType);

    if (!entry) {
      return {
        allowed: true,
        dcsType,
        category: category ?? 'vehicle',
        missionYear,
        reason: `Unknown DCS type "${dcsType}" — not in era registry. Allowing by default.`,
      };
    }

    if (entry.year <= missionYear) {
      return {
        allowed: true,
        dcsType,
        category: entry.category,
        missionYear,
        introductionYear: entry.year,
        reason: `${entry.name} (${entry.year}) is era-appropriate for ${missionYear}.`,
      };
    }

    const suggestions = this.getSuggestionsForEra(missionYear, entry.category);
    return {
      allowed: false,
      dcsType,
      category: entry.category,
      missionYear,
      introductionYear: entry.year,
      reason:
        `HISTORICAL CONSTRAINT VIOLATION: ${entry.name} (introduced ${entry.year}) ` +
        `cannot appear in a ${missionYear} mission. ` +
        `Postdates the scenario by ${entry.year - missionYear} years.`,
      suggestions,
    };
  }

  static getSuggestionsForEra(year: number, category: AssetCategory): string[] {
    const suggestions: string[] = [];
    for (const entry of REGISTRY) {
      if (entry.category === category && entry.year <= year) {
        suggestions.push(entry.dcsType);
      }
    }
    return suggestions.slice(0, 10);
  }

  static listByEra(maxYear: number, category?: AssetCategory): EraEntry[] {
    return REGISTRY
      .filter(e => e.year <= maxYear && (!category || e.category === category))
      .sort((a, b) => a.year - b.year);
  }

  static getEntry(dcsType: string): EraEntry | undefined {
    return typeMap.get(dcsType);
  }
}
