// Plot data and Glasgow crop calendar. Windows are [month, day] and are guidelines,
// tuned for ~56°N: last frost usually late April to mid May, first frost late October.
const LOCATION = { name: 'Glasgow', lat: 55.8642, lon: -4.2518 };
const BASE_YEAR = 2026;

const GROUPS = {
  brassica: 'Brassicas', potato: 'Potatoes', allium: 'Alliums', root: 'Roots',
  legume: 'Legumes', cucurbit: 'Squash family', flower: 'Flowers',
  perennial: 'Perennial', glasshouse: 'Greenhouse',
};

// carry:false = not moved on when the rotation advances a year
const CROPS = {
  'nero-kale':    { name: 'Nero kale',            short: 'Nero kale',   group: 'brassica' },
  'rutabaga':     { name: 'Rutabaga',             short: 'Rutabaga',    group: 'brassica' },
  'red-cabbage':  { name: 'Red cabbage',          short: 'Red cabbage', group: 'brassica' },
  'borecole':     { name: 'Borecole',             short: 'Borecole',    group: 'brassica' },
  'first-early':  { name: 'First early potatoes', short: '1st earlies', group: 'potato' },
  'second-early': { name: 'Second early potatoes',short: '2nd earlies', group: 'potato' },
  'leek':         { name: 'Leeks',                short: 'Leeks',       group: 'allium' },
  'garlic':       { name: 'Garlic',               short: 'Garlic',      group: 'allium', carry: false },
  'beetroot':     { name: 'Beetroot',             short: 'Beetroot',    group: 'root' },
  'celeriac':     { name: 'Celeriac',             short: 'Celeriac',    group: 'root' },
  'runner-bean':  { name: 'Runner beans',         short: 'Runner beans',group: 'legume' },
  'courgette':    { name: 'Courgette',            short: 'Courgette',   group: 'cucurbit' },
  'squash':       { name: 'Squash',               short: 'Squash',      group: 'cucurbit' },
  'sunflower':    { name: 'Sunflowers',           short: 'Sunflowers',  group: 'flower' },
  'flowers':      { name: 'Flowers',              short: 'Flowers',     group: 'flower' },
  'asparagus':    { name: 'Asparagus',            short: 'Asparagus',   group: 'perennial' },
  'chilli':       { name: 'Chillies',             short: 'Chillies',    group: 'glasshouse' },
};

// 2026 layout. Quarters: 1 top-left, 2 top-right, 3 bottom-left, 4 bottom-right.
const BASE_LAYOUT = {
  '1a': ['nero-kale', 'rutabaga'],
  '1b': ['red-cabbage', 'borecole'],
  '2a': ['courgette'],
  '2b': ['squash'],
  '3a': ['first-early'],
  '3b': ['second-early', 'leek'],
  '4a': ['beetroot', 'celeriac'],
  '4b': ['runner-bean'],
  '5':  ['flowers'],
  '6':  ['asparagus'],
  'gh': ['chilli'],
};

// Clockwise through the three rotating quarters, skipping the fixed squash quarter (2).
const ROTATION = { 1: 4, 4: 3, 3: 1 };

// Geometry in cm (approximate; 890 wide x 660 deep for the main plot). North is up.
const BED_RECTS = {
  'gh': { x: 250, y: 0,   w: 360, h: 120, label: 'Greenhouse' },
  '5':  { x: 50,  y: 140, w: 165, h: 100, label: 'Flowers' },
  '6':  { x: 225, y: 140, w: 595, h: 100, label: 'Asparagus' },
  '1a': { x: 0,   y: 280, w: 215, h: 315 }, '1b': { x: 215, y: 280, w: 215, h: 315 },
  '2a': { x: 460, y: 280, w: 215, h: 315 }, '2b': { x: 675, y: 280, w: 215, h: 315 },
  '3a': { x: 0,   y: 625, w: 215, h: 315 }, '3b': { x: 215, y: 625, w: 215, h: 315 },
  '4a': { x: 460, y: 625, w: 215, h: 315 }, '4b': { x: 675, y: 625, w: 215, h: 315 },
};

// place: 'indoors' | 'greenhouse' | 'bed' | 'anywhere'
// rules: minNight (°C, lowest forecast night over `days`, default 5), minSoil (°C, 6cm), dry (avoid wet days)
// offset: 1 = the crop lives in next year's layout (autumn-planted garlic)
const T = (crop, verb, place, from, to, extra = {}) => ({ crop, verb, place, from, to, ...extra });
const TASKS = [
  T('garlic', 'Plant', 'bed', [10, 15], [11, 30], { offset: 1, rules: { dry: true },
    tip: 'Cloves pointy end up, 2.5cm deep, 15cm apart, rows 30cm. Pick a bed that has had no leeks or onions for 3+ years (white rot).' }),
  T('garlic', 'Harvest', 'bed', [7, 1], [7, 31], { tip: 'Lift when the lower leaves yellow. Cure in an airy spot.' }),

  T('first-early', 'Chit', 'indoors', [2, 1], [3, 15], { tip: 'Eyes up in egg boxes somewhere cool and bright.' }),
  T('first-early', 'Plant', 'bed', [3, 20], [4, 20], { rules: { minSoil: 7 }, tip: '10–15cm deep, 30cm apart. Earth up or fleece if frost is forecast after shoots show.' }),
  T('first-early', 'Earth up', 'bed', [4, 25], [6, 15], { tip: 'Draw soil over the shoots when 20cm tall.' }),
  T('first-early', 'Harvest', 'bed', [6, 20], [7, 31]),
  T('second-early', 'Chit', 'indoors', [2, 15], [3, 31]),
  T('second-early', 'Plant', 'bed', [4, 1], [4, 30], { rules: { minSoil: 8 } }),
  T('second-early', 'Harvest', 'bed', [7, 15], [8, 31]),

  T('leek', 'Sow indoors', 'indoors', [2, 15], [4, 15], { tip: 'Modules or a seed tray, 5 seeds per cell.' }),
  T('leek', 'Plant out', 'bed', [6, 1], [7, 15], { tip: 'Pencil thick. Drop into 15cm dibber holes and water in.' }),
  T('leek', 'Harvest', 'bed', [10, 1], [3, 31]),

  T('celeriac', 'Sow indoors', 'indoors', [3, 1], [4, 10], { tip: 'Needs warmth and light. Surface sow, do not cover.' }),
  T('celeriac', 'Plant out', 'bed', [5, 25], [6, 15], { rules: { minNight: 4 }, tip: 'A cold snap can make it bolt. Keep it watered.' }),
  T('celeriac', 'Harvest', 'bed', [10, 1], [1, 31]),

  T('red-cabbage', 'Sow indoors', 'indoors', [3, 15], [5, 1]),
  T('red-cabbage', 'Plant out', 'bed', [5, 10], [6, 30], { tip: 'Firm the soil and net against pigeons and butterflies.' }),
  T('red-cabbage', 'Harvest', 'bed', [9, 15], [11, 30]),
  T('borecole', 'Sow indoors', 'indoors', [4, 1], [5, 31]),
  T('borecole', 'Plant out', 'bed', [6, 1], [7, 15], { tip: 'Net against pigeons and butterflies.' }),
  T('borecole', 'Harvest', 'bed', [11, 1], [3, 31]),
  T('nero-kale', 'Sow indoors', 'indoors', [4, 1], [5, 31]),
  T('nero-kale', 'Plant out', 'bed', [6, 1], [7, 15], { tip: 'Net against pigeons and butterflies.' }),
  T('nero-kale', 'Harvest', 'bed', [10, 15], [3, 31]),

  T('rutabaga', 'Sow outdoors', 'bed', [5, 15], [6, 30], { rules: { minSoil: 8 }, tip: 'Sow thinly 1cm deep, thin to 23cm.' }),
  T('rutabaga', 'Harvest', 'bed', [10, 1], [2, 28]),

  T('beetroot', 'Sow indoors', 'indoors', [3, 25], [4, 30], { tip: 'Modules, 3 seeds per cell. A head start for early roots.' }),
  T('beetroot', 'Sow outdoors', 'bed', [4, 20], [7, 15], { rules: { minSoil: 7 }, tip: 'Sow every 3 weeks for a longer cropping season.' }),
  T('beetroot', 'Harvest', 'bed', [7, 15], [10, 31]),

  T('runner-bean', 'Sow indoors', 'indoors', [4, 20], [5, 20], { tip: 'Deep pots or loo rolls, one seed each.' }),
  T('runner-bean', 'Plant out', 'bed', [5, 25], [6, 12], { rules: { minNight: 5, days: 5 }, tip: 'Put the canes in first. Harden off for a week before planting.' }),
  T('runner-bean', 'Sow outdoors', 'bed', [5, 28], [6, 20], { rules: { minNight: 6, minSoil: 10, days: 5 }, tip: 'Two seeds per cane, 5cm deep.' }),
  T('runner-bean', 'Harvest', 'bed', [7, 25], [10, 15], { tip: 'Pick often to keep them cropping.' }),

  T('courgette', 'Sow indoors', 'indoors', [4, 15], [5, 15]),
  T('courgette', 'Plant out', 'bed', [6, 1], [6, 25], { rules: { minNight: 8, days: 5 }, tip: 'Harden off first. Cold nights stunt them.' }),
  T('courgette', 'Harvest', 'bed', [7, 10], [10, 10]),
  T('squash', 'Sow indoors', 'indoors', [4, 25], [5, 20]),
  T('squash', 'Plant out', 'bed', [6, 1], [6, 25], { rules: { minNight: 8, days: 5 }, tip: 'Harden off first.' }),
  T('squash', 'Harvest', 'bed', [9, 15], [10, 20], { tip: 'Cut before the first frost and cure in the sun.' }),

  T('sunflower', 'Sow indoors', 'indoors', [4, 10], [5, 10]),
  T('sunflower', 'Sow outdoors', 'anywhere', [5, 10], [6, 10], { rules: { minSoil: 10 }, tip: 'Sow into any gap.' }),
  T('sunflower', 'Plant out', 'anywhere', [5, 25], [6, 15], { rules: { minNight: 4 }, tip: 'Stake the tall ones.' }),
  T('sunflower', 'Harvest', 'anywhere', [9, 1], [10, 15], { tip: 'Seed heads: cut when the back turns yellow-brown.' }),

  T('chilli', 'Sow indoors', 'indoors', [2, 1], [3, 20], { tip: 'Heated propagator, 20–25°C. A long season needs an early start.' }),
  T('chilli', 'Pot on', 'greenhouse', [4, 1], [5, 15]),
  T('chilli', 'Plant out', 'greenhouse', [5, 15], [6, 15], { rules: { minNight: 8, days: 3 }, tip: 'Greenhouse nights can still be cold. Fleece or bring in if needed.' }),
  T('chilli', 'Harvest', 'greenhouse', [8, 1], [10, 31]),

  T('asparagus', 'Mulch and weed', 'bed', [2, 15], [3, 31], { tip: 'Compost mulch, hand-weed. No salt.' }),
  T('asparagus', 'Harvest', 'bed', [4, 20], [6, 21], { tip: 'Cut spears at ground level. Stop by midsummer.' }),
  T('asparagus', 'Cut back', 'bed', [10, 15], [11, 30], { tip: 'Cut the ferns to 5cm once yellow.' }),

  T('flowers', 'Sow outdoors', 'bed', [4, 1], [5, 15], { rules: { minSoil: 7 }, tip: 'Hardy annuals.' }),
];

const __crops = { LOCATION, BASE_YEAR, GROUPS, CROPS, BASE_LAYOUT, ROTATION, BED_RECTS, TASKS };
if (typeof module !== 'undefined') module.exports = __crops;
else window.__crops = __crops;
