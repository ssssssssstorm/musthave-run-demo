// Code-defined 8-bit pixel art sprites & MUSTHAVE x Vice City palette
window.MH_PALETTE = {
  mango: '#FF9E1B',       // Pantone 1375
  peach: '#FF8066',       // Pantone 170
  pineapple: '#FFD100',   // Pantone 109
  pink: '#FF4A8D',        // Start screen hot pink accent
  pinkLight: '#FF85B3',
  pinkDark: '#C82868',
  ink: '#140C1C',         // Deep plum-black (outlines & silhouettes)
  cream: '#FFF9F2',
};

const SPRITE_COLORS = {
  '.': null,
  'K': '#140C1C',
  'O': '#F78C26',
  'D': '#D46212',
  'L': '#FFB057',
  'W': '#FFF9F2',
  'S': '#E8D6D8',
  'Q': '#FFC2D4', // soft pink cloud underside
  'P': '#FF9BB3',
  'R': '#E62E4D',
  'H': '#A81732',
  'A': '#FF4A8D',
  'M': '#FF9E1B',
  'C': '#FF8066',
  'Y': '#FFD100',
  'G': '#3ED568',
  'E': '#1F8F45',
  'V': '#35224A',
  'I': '#9BA8B8',
  'T': '#DCE4EE',
  'B': '#4A3A5C',
};

function bakeSprite(rows, colorMap = SPRITE_COLORS) {
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const col = colorMap[ch];
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return c;
}

function flipSpriteH(src) {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

// ============================================================
// CORGI HERO (28x24) — Faithful to ref 3_corgi.png!
// Plump ginger body on left w/ stubby tail & 4 white paws,
// smiling symmetrical face looking straight at viewer on right!
// ============================================================
const CORGI_HERO = [
    '............KKK......KKK....',
    '...........KOOOK....KOOOK...',
    '...........KOPOK....KOPOK...',
    '...........KOPPOK..KOPPOK...',
    '...........KOPPOKKKKOPPOK...',
    '...........KOOOOOWWWOOOOK...',
    '...........KOOOOOWWWOOOOK...',
    '...........KOOWKOOWWOKWOK...',
    '...........KOOKKOOWWOKKOK...',
    '...........KOOOOOWKKWOOOOK..',
    '..KKK......KWWWWWWKKWWWWWK..',
    '.KOOKKKKKKKKWWKWWWWWWKWWWK..',
    'KLOOOOOOOOOKWWWKWWPPWKWWWK..',
    'KKOOOOOOOOOOKWWWKKKKKWWWK...',
    '.KOOOOOOOOOOWWWWWWWWWWWOK...',
    '.KOOOOOOOOOOWWWWWWWWWWWOK...',
    '.KOOOOOOOOOOWWWWWWWWWWWOK...',
    '.KDOOOOOOOOOWWWWWWWWWWOK....',
    '..KDOOWWWWOOWWWWWWWWWOK.....',
    '..KWWKWWKWWKWWKWWKKWWK......',
    '..KWWKWWKWWKWWKWWKKWWK......',
    '..KKKKKK.KKKKK.KKKKKK.......',
];

// Front-facing corgi for intro spin (24x24)

// Hero wag frame (tail & rump perked 1px + happy ear/cheek wiggle)
const CORGI_HERO_WAG = [
    '............KKK......KKK....',
    '...........KOOOK....KOOOK...',
    '...........KOPOK....KOPOK...',
    '...........KOPPOK..KOPPOK...',
    '...........KOPPOKKKKOPPOK...',
    '...........KOOOOOWWWOOOOK...',
    '...........KOOOOOWWWOOOOK...',
    '...........KOOWKOOWWOKWOK...',
    '...........KOOKKOOWWOKKOK...',
    '...KKK.....KOOOOOWKKWOOOOK..',
    '..KOOOK....KWWWWWWKKWWWWWK..',
    '..KOOKKKKKKKWWKWWWWWWKWWWK..',
    '.KLOOOOOOOOKWWWKWWPPWKWWWK..',
    '.KKOOOOOOOOOKWWWKKKKKWWWK...',
    '.KOOOOOOOOOOWWWWWWWWWWWOK...',
    '.KOOOOOOOOOOWWWWWWWWWWWOK...',
    '.KOOOOOOOOOOWWWWWWWWWWWOK...',
    '.KDOOOOOOOOOWWWWWWWWWWOK....',
    '..KDOOWWWWOOWWWWWWWWWOK.....',
    '..KWWKWWKWWKWWKWWKKWWK......',
    '..KWWKWWKWWKWWKWWKKWWK......',
    '..KKKKKK.KKKKK.KKKKKK.......',
];



// Tall 1x pixel palm for night menu (no fractional scaling!)
const PALM_MENU_TRUNK = [
  '............GG............',
  '............GG............',
  '...........GGG............',
  '...........GG.............',
  '...........GG.............',
  '..........GGG.............',
  '..........GG..............',
  '..........GG..............',
  '.........GGG..............',
  '.........GG...............',
  '.........GG...............',
  '........GGG...............',
  '........GG................',
  '........GG................',
  '.......GGG................',
  '.......GG.................',
  '.......GG.................',
  '.......GG.................',
  '......GGG.................',
  '......GG..................',
  '......GG..................',
  '.....GGGG.................',
  '....GGGGGG................',
];

const PIXEL_MOON = [
  '...CCCC..',
  '..CYYYY..',
  '.CYYY....',
  'CYYY.....',
  'CYYY.....',
  'CYYY.....',
  '.CYYY....',
  '..CYYYY..',
  '...CCCC..',
];


// 8-bit rooftop cat (2 frames: tail up / tail flick) & sidewalk pixel trash can
const CAT_ROOF_A = [
  '.K...K....',
  '.KK.KK....',
  '.KKKKK..K.',
  '.KYKYK..K.',
  '.KKKKK..K.',
  '..KKKK.KK.',
  '..KKKKKK..',
  '..KKKKK...',
];
const CAT_ROOF_B = [
  '.K...K....',
  '.KK.KK....',
  '.KKKKK....',
  '.KYKYK.KK.',
  '.KKKKK..K.',
  '..KKKKKK..',
  '..KKKKKK..',
  '..KKKKK...',
];
const TRASH_CAN = [
  '..KKKKK..',
  '.KIIIIKK.',
  'KKKKKKKKK',
  'KITITITIK',
  'KIVIVIVIK',
  'KITITITIK',
  'KIVIVIVIK',
  'KITITITIK',
  'KIVIVIVIK',
  '.KKKKKKK.',
];

const NEON_MOTH = [
  ['Y.Y', '.W.', 'Y.Y'],
  ['.Y.', 'YMY', '.Y.'],
];


const CORGI_HERO_BLINK = [
    '............KKK......KKK....',
    '...........KOOOK....KOOOK...',
    '...........KOPOK....KOPOK...',
    '...........KOPPOK..KOPPOK...',
    '...........KOPPOKKKKOPPOK...',
    '...........KOOOOOWWWOOOOK...',
    '...........KOOOOOWWWOOOOK...',
    '...........KOOKKOOWWOKKOK...',
    '...........KOOOOOOWWOOOOOK..',
    '...........KOOOOOWKKWOOOOK..',
    '..KKK......KWWWWWWKKWWWWWK..',
    '.KOOKKKKKKKKWWKWWWWWWKWWWK..',
    'KLOOOOOOOOOKWWWKWWPPWKWWWK..',
    'KKOOOOOOOOOOKWWWKKKKKWWWK...',
    '.KOOOOOOOOOOWWWWWWWWWWWOK...',
    '.KOOOOOOOOOOWWWWWWWWWWWOK...',
    '.KOOOOOOOOOOWWWWWWWWWWWOK...',
    '.KDOOOOOOOOOWWWWWWWWWWOK....',
    '..KDOOWWWWOOWWWWWWWWWOK.....',
    '..KWWKWWKWWKWWKWWKKWWK......',
    '..KWWKWWKWWKWWKWWKKWWK......',
    '..KKKKKK.KKKKK.KKKKKK.......',
];

const CORGI_HERO_YAWN = [
    '............KKK......KKK....',
    '...........KOOOK....KOOOK...',
    '...........KOPOK....KOPOK...',
    '...........KOPPOK..KOPPOK...',
    '...........KOPPOKKKKOPPOK...',
    '...........KOOOOOWWWOOOOK...',
    '...........KOOOOOWWWOOOOK...',
    '...........KOOKKOOWWOKKOK...',
    '...........KOOOOOOWWOOOOOK..',
    '...........KOOOOOWKKWOOOOK..',
    '..KKK......KWWWWWWKKWWWWWK..',
    '.KOOKKKKKKKKWWKWWWWKKKWWWK..',
    'KLOOOOOOOOOKWWWKWWPPPKWWWK..',
    'KKOOOOOOOOOOKWWWKPPPPKWWK...',
    '.KOOOOOOOOOOWWWWWKKKKWWOK...',
    '.KOOOOOOOOOOWWWWWWWWWWWOK...',
    '.KOOOOOOOOOOWWWWWWWWWWWOK...',
    '.KDOOOOOOOOOWWWWWWWWWWOK....',
    '..KDOOWWWWOOWWWWWWWWWOK.....',
    '..KWWKWWKWWKWWKWWKKWWK......',
    '..KWWKWWKWWKWWKWWKKWWK......',
    '..KKKKKK.KKKKK.KKKKKK.......',
];

const CORGI_FRONT = [
  '..KKK..........KKK......',
  '.KOOOK........KOOOK.....',
  '.KOPOK........KOPOK.....',
  '.KOPPOK..KKKK.KOPPOK....',
  '.KOPPOKKKOWWOKOPPOK.....',
  '.KOOOOOOOWWWWOOOOOK.....',
  '..KOOOOOOWWWWOOOOOK.....',
  '..KOOKOOOWWWWOOOKOK.....',
  '..KOOWKOOWWWWOKWOOK.....',
  '..KOOOOOWWKKWWOOOOK.....',
  '..KOOOOWWKKKKWWOOOK.....',
  '..KWWWWWWKWWKWWWWWWK....',
  '...KWWWWKPPPPKWWWWK.....',
  '...KWWWWWWWWWWWWWWK.....',
  '..KOWWWWWWWWWWWWWOK.....',
  '.KOOWWWWWWWWWWWWWOK.....',
  '.KOOWWWWWWWWWWWWWOK.....',
  'KOOOWWWWWWWWWWWWWOK.....',
  'KDDOOWWWWWWWWWWWOK......',
  '.KKOOOWWWWWWWWWOK.......',
  '...KOOOWWWWWWOOOK.......',
  '...KWWKWWKKWWKWWK.......',
  '...KWWKWWKKWWKWWK.......',
  '...KKKKKK..KKKKKK.......',
];

// Back-facing corgi (22x22) — big ears, fluffy butt + wagging stubby tail!
const CORGI_BACK_A = [
  '..KKK..........KKK....',
  '.KOOOK........KOOOK...',
  '.KODOK........KODOK...',
  '.KOODOK.KKKKKKODOK....',
  '.KOOOOOKOOOOOOKOOOK...',
  '.KOOOOOOOOOOOOOOOOK...',
  '..KOOOOOOOOOOOOOOK....',
  '..KOOOOOOOOOOOOOOK....',
  '..KOOOOOOOOOOOOOOK....',
  '...KOOOOOOOOOOOOOK....',
  '..KOOOOOOOKKKOOOOOK...',
  '.KOOOOOOOKOLOKOOOOOK..',
  '.KOOOOOOOKOOOKOOOOOK..',
  '.KOOOOOOOKDDKOOOOOOK..',
  '.KOOOOOOOOKKOOOOOOOK..',
  '.KOOOOOOWWWWWOOOOOOK..',
  '.KDOOOOWWWWWWWOOOODK..',
  '..KDOOWWWWSWWWWOOODK..',
  '..KWWOWWWSSSWWWOWWWK..',
  '...KWWKWWK.KWWKWWK....',
  '...KWWKWWK.KWWKWWK....',
  '...KKKKKK...KKKKKK....',
];

const CORGI_BACK_B = [
  '..KKK..........KKK....',
  '.KOOOK........KOOOK...',
  '.KODOK........KODOK...',
  '.KOODOK.KKKKKKODOK....',
  '.KOOOOOKOOOOOOKOOOK...',
  '.KOOOOOOOOOOOOOOOOK...',
  '..KOOOOOOOOOOOOOOK....',
  '..KOOOOOOOOOOOOOOK....',
  '..KOOOOOOOOOOOOOOK....',
  '...KOOOOOOOOOOOOOK....',
  '..KOOOOOOKKKOOOOOOK...',
  '.KOOOOOOKOLOKOOOOOOK..',
  '.KOOOOOOKOOOKOOOOOOK..',
  '.KOOOOOOKDDKOOOOOOOK..',
  '.KOOOOOOOKKOOOOOOOOK..',
  '.KOOOOOOWWWWWOOOOOOK..',
  '.KDOOOOWWWWWWWOOOODK..',
  '..KDOOWWWWSWWWWOOODK..',
  '..KWWOWWWSSSWWWOWWWK..',
  '...KWWKWWK.KWWKWWK....',
  '...KWWKWWK.KWWKWWK....',
  '...KKKKKK...KKKKKK....',
];

const CORGI_BACK_RIGHT = [
  '......KKK......KKK......',
  '.....KOOOK....KOOOK.....',
  '.....KODOK....KOPOK.....',
  '.....KOODOKKKKOPOOK.....',
  '....KOOOOOOOOWWOOOK.....',
  '....KOOOOOOOOWWOOOK.....',
  '....KOOOOOOOOOWOOOK.....',
  '....KOOOOOOOOOOKWOK.....',
  '...KOOOOOOOOOOOOOOK.....',
  '...KOOOOOOOOOOOOOKK.....',
  '..KOOOOOOOOOOOOOWWK.....',
  '.KKKOOOOOOOOOOOWWWK.....',
  'KOLOKOOOOOOOOOWWWWK.....',
  'KOOOKOOOOOOOOWWWWK......',
  '.KKDOOOOOOOOWWWWK.......',
  '.KOOOOOOOOOOWWWOK.......',
  '.KOOOOOWWWWWWWOK........',
  '.KDOOOWWWWWWWOK.........',
  '.KDOOWWW..KWWOK.........',
  '.KWWKWWK..KWWK..........',
  '.KWWKWWK..KWWK..........',
  '.KKKKKK...KKKK..........',
];

const CORGI_FRONT_RIGHT = [
  '....KKK.......KKK.......',
  '...KOOOK.....KOOOK......',
  '...KOPOK.....KOPOK......',
  '...KOPPOKKKK.KOPOK......',
  '...KOOOOOOOWWKOOOK......',
  '...KOOOOOOWWWWOOOK......',
  '....KOOOOOWWKWOOOK......',
  '....KOWOKOWWWOKOWOK.....',
  '....KOOKKOWWWOKKOOK.....',
  '....KOOOOWWWWWKKKK......',
  '....KOOOOWWWWKKWWK......',
  '...KWWWWWWWWWKKPPWK.....',
  '.KKKWWWWWWWWWWWWWWK.....',
  'KOLOKWWWWWWWWWWWWK......',
  'KOOOKWWWWWWWWWWWK.......',
  'KDOOOWWWWWWWWWWOK.......',
  'KOOOOWWWWWWWWWOK........',
  '.KDOOOWWWWWWWOK.........',
  '.KDOOWWW..KWWOK.........',
  '.KWWKWWK..KWWK..........',
  '.KWWKWWK..KWWK..........',
  '.KKKKKK...KKKK..........',
];

const CORGI_SIDE_RIGHT = [
  '...............KKK....KKK.....',
  '..............KOOOK..KOOOK....',
  '..............KOPOK..KOPOK....',
  '..............KOPPOKKKOOOK....',
  '..KKK.........KOOOWWOOOOOK....',
  '.KOOOKKKKKKKKKKOOOWWKWKOOK....',
  'KLOOOOOOOOOOOOKOOOWWKKKOOKKK..',
  'KOOOOOOOOOOOOOOOWWWWWWWWWWKKK.',
  'KOOOOOOOOOOOOOOOWWWWWWWWWWKKK.',
  'KOOOOOOOOOOOOOOOWWWWWKKKKWWK..',
  'KDOOOOOOWWWOOOOOWWWWKPPWWK....',
  '.KDOOOOWWWWWOOOOWWWWWKKKK.....',
  '.KWWOWWWWWWWWWWWWWWWWK........',
  '..KWWOWWWWWWWWWWWWWWWK........',
  '..KWWKWWKKWWK...KWWKWWK.......',
  '..KWWKWWK.KKK...KWWKWWK.......',
  '..KKKKKKK.......KKKKKKK.......',
];

// 27x19 Run Cycle (at 1x on 195x422 = ~1/7 screen width! Exaggerated cute butt wiggle)
const CORGI_RUN_0 = [  // Gallop stretch: front paws forward, hind paws back, butt UP
    '...............KKK....KKK.....',
    '..............KOOOK..KOOOK....',
    '..............KOPOK..KOPOK....',
    '..............KOPPOKKKOOOK....',
    '..KKK.........KOOOWWOOOOOK....',
    '.KOLOKKKKKKKKKKOOOWWKWKOOK....',
    'KLOOOOOOOOOOOOKOOOWWKKKOOKKK..',
    'KOOOOOOOOOOOOOOOWWWWWWWWWWKKK.',
    'KOOOOOOOOOOOOOOOWWWWWWWWWWKKK.',
    'KOOOOOOOOOOOOOOOWWWWWKKKKWWK..',
    'KWOOOOOWWWWWOOOOWWWWKPPWWK....',
    'KWWOOOWWWWWWWOOOWWWWWKKKK.....',
    '.KWWOWWWWWWWWWWWWWWWWK........',
    '.KDDOWWWWWWWWWWWWWWWK.........',
    '..KDDWWKKKKKK...KWWKWK........',
    '.KWWWK...........KWWKWK.......',
    '.KWWK.............KWWK........',
    '.KKKK.............KKKK........',
    '..............................',
];

const CORGI_RUN_1 = [  // Contact / Squish: butt drops DOWN & puffs out
    '..............................',
    '...............KKK....KKK.....',
    '..............KOOOK..KOOOK....',
    '..............KOPOK..KOPOK....',
    '..............KOPPOKKKOOOK....',
    '..............KOOOWWOOOOOK....',
    '..KKKKKKKKK...KOOOWWKWKOOK....',
    '.KOOOOOOOOOKKKKOOOWWKKKOOKKK..',
    'KLOOOOOOOOOOOOOOWWWWWWWWWWKKK.',
    'KOOOOOOOOOOOOOOOWWWWWWWWWWKKK.',
    'KOOOOOOOOOOOOOOOWWWWWKKKKWWK..',
    'KDOOOOOOWWWOOOOOWWWWKPPWWK....',
    '.KDOOOOWWWWWOOOOWWWWWKKKK.....',
    '..KWWOWWWWWWWWWWWWWWWK........',
    '...KWWKWWKKKKK..KWWKWWK.......',
    '...KWWKWWK......KWWKWWK.......',
    '...KKKKKKK......KKKKKKK.......',
    '..............................',
];

const CORGI_RUN_2 = [  // Wiggle Peak: fluffy butt bounces HIGH w/ white pants & bobtail
    '..KKK.........................',
    '.KOLOK.........KKK....KKK.....',
    'KLOOOOKKKKK...KOOOK..KOOOK....',
    'KOOOOOOOOOOKKKKOPOK..KOPOK....',
    'KOOOOOOOOOOOOOKOPPOKKKOOOK....',
    'KOOOOOOOOOOOOOKOOOWWOOOOOK....',
    'KWOOOOOWWWWOOOKOOOWWKWKOOK....',
    'KWWOOOWWWWWWWOKOOOWWKKKOOKKK..',
    '.KWWOWWWWWWWWWWOWWWWWWWWWWKKK.',
    '..KDDOWWWWWWWWWWWWWWWWWWWWKKK.',
    '...KDDOWWWWWWWWOWWWWWKKKKWWK..',
    '....KKWWKKKKWWWWWWWWKPPWWK....',
    '.....KWWK...KWWKWWWWWKKKK.....',
    '....KWWK....KWWKKWWKWK........',
    '....KKKK....KKKK.KWWK.........',
    '.................KKKK.........',
    '..............................',
    '..............................',
];

const CORGI_RUN_3 = [  // Push-off: hind paws push, butt settles low & tail drops
    '..............................',
    '...............KKK....KKK.....',
    '..............KOOOK..KOOOK....',
    '..............KOPOK..KOPOK....',
    '..............KOPPOKKKOOOK....',
    '..............KOOOWWOOOOOK....',
    '..KKK.........KOOOWWKWKOOK....',
    'KKOOOKKKKKKKKKKOOOWWKKKOOKKK..',
    'KLOOOOOOOOOOOOOOWWWWWWWWWWKKK.',
    'KOOOOOOOOOOOOOOOWWWWWWWWWWKKK.',
    'KOOOOOOOWWWOOOOOWWWWWKKKKWWK..',
    '.KDOOOOWWWWWOOOOWWWWKPPWWK....',
    '.KDOOOWWWWWWWWWWWWWWWKKKK.....',
    '..KWWOWWWWWWWWWWWWWWWK........',
    '..KWWKWWKKKKKKKWWKWWK.........',
    '..KWWK.KK..KWWK.KWWKWK........',
    '..KKKK.....KKKK..KKKK.........',
    '..............................',
];


const CORGI_RUN_4 = [  // Airborne suspension: body 1px up, ears perked, joyful gallop
    '...............KKK....KKK.....',
    '..............KOOOK..KOOOK....',
    '..KKK.........KOPOK..KOPOK....',
    '.KOLOK........KOPPOKKKOOOK....',
    'KLOOOOKKKKKKKKKOOOWWOOOOOK....',
    'KOOOOOOOOOOOOOKOOOWWKWKOOK....',
    'KOOOOOOOOOOOOOKOOOWWKKKOOKKK..',
    'KWOOOOWWWWWOOOOOWWWWWWWWWWKKK.',
    'KWWOOOWWWWWWWOOOWWWWWWWWWWKKK.',
    '.KWWOWWWWWWWWWWWWWWWWKKKKWWK..',
    '..KDDOWWWWWWWWWWWWWWWKPPWK....',
    '...KDDWWKKKKKWWWWWWWWKKKK.....',
    '..KWWWK......KWWKWWKWWK.......',
    '..KWWK.......KKKK.KWWK........',
    '..KKKK............KKKK........',
    '..............................',
    '..............................',
    '..............................',
];

const CORGI_RUN_5 = [  // Landing reach: front legs reach forward, hind legs gather
    '..............................',
    '...............KKK....KKK.....',
    '..............KOOOK..KOOOK....',
    '..............KOPOK..KOPOK....',
    '...KKK........KOPPOKKKOOOK....',
    '.KKOLOKKKKKKK.KOOOWWOOOOOK....',
    'KLOOOOOOOOOOOKKOOOWWKWKOOK....',
    'KOOOOOOOOOOOOOKOOOWWKKKOOKKK..',
    'KOOOOOWWWWWOOOOOWWWWWWWWWWKKK.',
    'KDOOOWWWWWWWWOOOWWWWWWWWWWKKK.',
    '.KDOOWWWWWWWWWWOWWWWWKKKKWWK..',
    '..KWWOWWWWWWWWWWWWWWWKPPWK....',
    '...KWWKWWKKKKKWWWWWWWKKKK.....',
    '...KWWKWWK...KWWKWWKWWK.......',
    '...KKKKKKK...KKKK.KWWK........',
    '..................KKKK........',
    '..............................',
    '..............................',
];

const CORGI_CROUCH = [  // Ready-to-sprint crouch
    '..............................',
    '...............KKK....KKK.....',
    '..............KOOOK..KOOOK....',
    '..KKK.........KOPOK..KOPOK....',
    '.KOLOKKKKKK...KOPPOKKKOOOK....',
    'KLOOOOOOOOOKKKKOOOWWOOOOOK....',
    'KOOOOOOOOOOOOOKOOOWWKWKOOK....',
    'KOOOOOWWWWOOOOKOOOWWKKKOOKKK..',
    'KDOOOWWWWWWWWOOOWWWWWWWWWWKKK.',
    '.KDOOWWWWWWWWWWOWWWWWWWWWWKKK.',
    '..KWWOWWWWWWWWWWWWWWWKKKKWWK..',
    '..KWWKWWKKKKKWWWWWWWKPPWWK....',
    '..KKKKKK.....KWWKWWKWWKK......',
    '.............KKKK.KKKK........',
];

const CORGI_JUMP = [  // Joyful leap
    '...............KKK....KKK.....',
    '..............KOOOK..KOOOK....',
    '..............KOPOK..KOPOK....',
    '..............KOPPOKKKOOOK....',
    '..KKK.........KOOOWWOOOOOK....',
    '.KOLOKKKKKKKKKKOOOWWKWKOOK....',
    'KLOOOOOOOOOOOOKOOOWWKKKOOKKK..',
    'KOOOOOOOOOOOOOOOWWWWWWWWWWKKK.',
    'KOOOOOOOOOOOOOOOWWWWWWWWWWKKK.',
    'KOOOOOWWWWWOOOOOWWWWWKKKKWWK..',
    '.KDOOWWWWWWWWOOOWWWWKPPWWK....',
    '.KWWOWWWKKKKKWWWWWWWWKKKK.....',
    'KWWK.KK......KKWWKWWKWWK......',
    'KKKK...........KKKK.KWWK......',
    '....................KKKK......',
];

const CORGI_SLEEP = [  // Cozy sleeping sploot (36x13)
    '....................................',
    '....KKK................KKK..........',
    '..KKOLOKK.............KOOOK.........',
    '.KLOOOOOOKKKKKK.......KOPOK..KKK....',
    'KOOOOOOOOOOOOOOKKKKKKKKOOOK.KOOOK...',
    'KOOOOOOOOOOOOOOOOOOOOOODODOKKOOOK...',
    'KOOOOOOOOOOOOOOOOOOOOOOOOWWOOOOOK...',
    'KDOOOOOOWWWOOOOOOOOOOOOOOWWKKKOOOKK.',
    '.KDOOOOWWWWWOOOOOOWWWWWWWWWWWWWWWKK.',
    '.KWWOWWWWWWWWWWWWWWWWWWWWWWWWWWWKK..',
    'KWWKWWWWWWWWWWWWWWWWWWWWWWWWWWKKKK..',
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK....',
];

const DOG_BOWL = [
  '..KKKKKKKKKKKK..',
  '.KBBBBBBBBBBBBK.',
  '.KAKBBBBBBBBKAK.',
  'KAAKKKKKKKKKKAAK',
  'KAAWWWWWWWWWWAAK',
  'KAAAAAAAAAAAAAAK',
  'KAAWWWWAAAAAAWWK',
  '.KKKKKKKKKKKKKK.',
  '................',
];

const SANTA_HAT = [
  '...KKKK...',
  '..KRRRRK..',
  '.KRRRRHHKW',
  'KRRRRRHKWW',
  'KWWWWWWKK.',
  '.KKKKKKK..',
];

const PIXEL_Z_BIG = [
  'KKKKKKK',
  'KYYYYYK',
  'KKKKYYK',
  '..KYYK.',
  '.KYYK..',
  'KYYKKKK',
  'KYYYYYK',
  'KKKKKKK',
];

const PIXEL_Z_SMALL = [
  'KKKKKK',
  'KWWWWK',
  'KKKWWK',
  '.KWWK.',
  'KWWKKK',
  'KWWWWK',
  'KKKKKK',
];

// ============================================================
// OBSTACLES (1x clean Chrome-dino proportions)
// ============================================================

const OBSTACLE_COLORS = {
  '.': null,
  'K': '#140C1C',
  'D': '#2E1E45',
  'B': '#4A3A5C',
  'L': '#7A62A0',
  'Y': '#FFD100',
  'M': '#FF9E1B',
  'R': '#E62E4D',
  'T': '#DCE4EE',
  'I': '#9BA8B8',
  'W': '#FFF9F2',
  'A': '#FF4A8D',
  'C': '#2FD6C8',
  'U': '#8FF5EA',
  'N': '#118C92',
  'X': '#0A5A66',
  'P': '#FFB3C6',
  'H': '#A81732',
  'O': '#F78C26',
  'F': '#C9A227',
  'Z': '#1B8F9A',
};

// Small hookah: 19x29 - ink outline, violet body, gold bands, teal glass flask with glare
const OBSTACLE_HOOKAH = [
  '......KKKKKKKKK....',
  '.....KMYMRMYMRMK...',
  '......KDLDDDDDK....',
  '......KDLDDDDDK....',
  '....KKKKDDDDDKKKK..',
  '...KYYYYYYYYYYYYYK.',
  '....KFFFFFFFFFFFK..',
  '.....KKKKLDDKKKK...',
  '........KLDDK......',
  '...KKKKKKLDDK......',
  '..KLLLLLYYYYYK.....',
  '.KLBBBBBFFFFFK.....',
  '.KLBKKKKKLDDK......',
  '.KLBK...KLDDK......',
  '.KLBK..KYYYYYK.....',
  '.KLBK..KKLDDKK.....',
  '.KLBK.KFFFFFFFK....',
  '.KLBK..KYYYYYKK....',
  '.KLBK.KCWCCCCCNK...',
  '.KLBKKCWCCCCCCCNK..',
  '.KLBKCCWCCCCCCCCNK.',
  '.KLBCCCUCCCCCCCCCNK',
  '.KLBZZZZZZZZZZZZZZK',
  '.KLBNNNNNNNNNNNNNNK',
  'KBBBNNNNNNNNUNNNNNK',
  'KYYBKNNNNNNNNNUNNK.',
  'KYYK.KXXXXXXXXXXK..',
  '.KK...KFFFFFFFFK...',
  '.......KKKKKKKK....',
];

// BIG hookah: 37x72 - needs a double jump
const OBSTACLE_HOOKAH_BIG = [
  '..............KKKKKKKKKKKKKKK........',
  '.............KMYMRMYMRMYMRMYMK.......',
  '..............KDLDDDDDDDDDDDK........',
  '..............KDLDBDDBDDBDDDK........',
  '..............KFFFFFFFFFFFFFK........',
  '..............KDLDDDDDDDDDDDK........',
  '..............KDLDDDDDDDDDDDK........',
  '...............KLDDDDDDDDDDK.........',
  '...............KDDDDDDDDDDDK.........',
  '................KDDDDDDDDDK..........',
  '..........KKKKKKKYYYYYYYYYKKKKKKK....',
  '.........KYYYYYYYYYYYYYYYYYYYYYYYK...',
  '..........KFFFFFFFFFFFFFFFFFFFFFK....',
  '...........KKKKDDDDDDDDDDDDDKKKK.....',
  '...............KKKKLDDDBKKKK.........',
  '..................KLDDDBK............',
  '..................KLDDDBK............',
  '.................KKLDDDBKK...........',
  '................KYYYYYYYYYK..........',
  '................KFFFFFFFFFK..........',
  '.................KYYYYYYYK...........',
  '..................KLDDDBK............',
  '..................KLDDDBK............',
  '..................KLDDDBK............',
  '..................KLDDDBK............',
  '.................KKLDDDBKK...........',
  '................KYYYYYYYYYK..........',
  '................KFFFFFFFFFK..........',
  '.................KYYYYYYYK...........',
  '....KKKKKKKKKKKKKKKLDDDBKK...........',
  '...KLLLLLLLLLLLLLLDDDDDDDBK..........',
  '..KLBBBBBBBBBBBBBLDDDDDDDBK..........',
  '..KLBBBBBBBBBBBBBLDDDDDDDBK..........',
  '..KLBBKKKKKKKKKKKLDDDDDDDBKK.........',
  '..KLBBK.......KFFFFFFFFFFFFFK........',
  '..KLBBK........KLDDDDYDDDDBK.........',
  '..KLBBK........KLDDDYDYDDDBK.........',
  '..KLBBK........KLDDDDYDDDDBK.........',
  '..KLBBK........KLDDDDDDDDDBK.........',
  '..KLBBK........KLDDDDDDDDDBK.........',
  '..KLBBK........KLDDDDYDDDDBK.........',
  '..KLBBK........KLDDDYDYDDDBK.........',
  '..KLBBK........KLDDDDYDDDDBK.........',
  '..KLBBK........KLDDDDDDDDDBK.........',
  '..KLBBK........KLDDDDDDDDDBK.........',
  '..KLBBK.......KYYYYYYYYYYYYYK........',
  '..KLBBK......KFFFFFFFFFFFFFFFK.......',
  '..KLBBK.......KKKKKKKCKKKKKKK........',
  '..KLBBK.......KKCCCCCCCCCCNKK........',
  '..KLBBK.....KKCCCCCCCCCCCCCCNKK......',
  '..KLBBK....KCCWCCCCCCCCCCCCCCCNK.....',
  '..KLBBK...KCCWCCCCCCCCCCCCCCCCCNK....',
  '..KLBBK..KCCWCCCCCCCCCCCCCCCCCCCNK...',
  '..KLBBK..KCCWCCCCCCCCCCCCCCCCCCCNK...',
  '..KLBBK.KCCCWCCCCCCCCCCCCCCCCCCCCNK..',
  '..KLBBK.KCCCUCCCCCCCCCCCCCCCCCCCCNK..',
  '..KLBBKKCCCCCCCCCCCCCCCCCCCCCCCCCCNK.',
  '..KLBBKKZZZZZZZZZZZZZZZZZZZZZZZZZZZK.',
  '..KLBBKKNNNNNNNNNNNNNNNNNNNNNNNNNNNK.',
  '..KLBBKKNNNNNNNNNNNNNNNNNNNNNNNNNNNK.',
  '..KLBBKKNNNNNNNNNNNNNNNNNNNNNNUNNNNK.',
  '..KLBBKKNNNNNNNNNNUNNNNNNNNNNNNNNNNK.',
  '..KLBBK.KNNNNNNNNNNNNNNUNNNNNNNNNNK..',
  '.KBBBBK.KNNNNNNNNNNNNNNNNNNNNUNNNNK..',
  '.KWYYBK..KNNNNNNNNNNUNNNNNNNNNNNNK...',
  '.KYYYBK..KXXXXXXXXXXXXXXXXXUXXXXXK...',
  '.KYYYK....KXXXXXXXXXXXXXXXXXXXXXK....',
  '..KKK......KXXXXXXXXXXXXXXXXXXXK.....',
  '............KKXXXXXXXXXXXXXXXKK......',
  '.............KKKXXXXXXXXXXXKKK.......',
  '............KFFFFFFFFFFFFFFFFFK......',
  '.............KKKKKKKKKKKKKKKKK.......',
];

// Shila-vilka: a steel fork with exactly THREE prongs
const OBSTACLE_SHILAVILKI = [
  '.KK....KK....KK.',
  'KWIK..KWIK..KWIK',
  'KTIK..KTIK..KTIK',
  'KTIK..KTIK..KTIK',
  'KTIK..KTIK..KTIK',
  'KTIK..KTIK..KTIK',
  'KTIK..KTIK..KTIK',
  'KTIK..KTIK..KTIK',
  'KTIK..KTIK..KTIK',
  'KTIKKKKTIKKKKTIK',
  'KWWWWWWWWWWWWWWK',
  'KTTTTTTTTTTTTTTK',
  'KIIIIIIIIIIIIIIK',
  '.KKKKTTIIIIKKKK.',
  '....KTTIIIIK....',
  '.....KYMMOK.....',
  '.....KYMMOK.....',
  '.....KAAAAK.....',
  '.....KYMMOK.....',
  '.....KYMMOK.....',
  '.....KYMMOK.....',
  '.....KAAAAK.....',
  '.....KYMMOK.....',
  '.....KYMMOK.....',
  '.....KYMMOK.....',
  '....KKYMMOKK....',
  '...KDDDDDDDDK...',
  '....KKKKKKKK....',
];

const OBSTACLE_COALS_A = [
  '.......KKKKKK...........',
  '......KKVVVVKK..........',
  '.....KKVYYRRVKK..KKKK...',
  '...KKKKKRMYYRKKKKKVVKK..',
  '..KKVVVKKRRRRKVVVKKRRKK.',
  '.KKVRRRVKKKKKKVMRVKKVKK.',
  'KKVMRYYMVVVVVVVRYYMVKVKK',
  'KKVRMMMMRKKKKKKRMMMVKVKK',
  'KKVKKKKKKVRRRVVKKKKVVVKK',
  'KKKKKKKKVRYYMRVKKKKKKKKK',
  'KKKKKKKKKRRRRRKKKKKKKKKK',
  'KKKKKKKKKKKKKKKKKKKKKKKK',
];

const OBSTACLE_COALS_B = [
  '.......KKKKKK...........',
  '......KKVVVVKK..........',
  '.....KKVRRMYYKK..KKKK...',
  '...KKKKKYYMRRKKKKKVVKK..',
  '..KKVVVKKMMRRKVVVKKMMKK.',
  '.KKVMMMVKKKKKKVRYVKKVKK.',
  'KKVRRYMMVVVVVVVMYYMVKVKK',
  'KKVRYYYYRKKKKKKRRRMVKVKK',
  'KKVKKKKKKVMMMVVKKKKVVVKK',
  'KKKKKKKKVMYYRRVKKKKKKKKK',
  'KKKKKKKKKRMMRRKKKKKKKKKK',
  'KKKKKKKKKKKKKKKKKKKKKKKK',
];

// ============================================================
// COLLECTIBLE FRUITS (14x16)
// ============================================================

const FRUIT_PINEAPPLE = [
  '......KK......',
  '...KK.KGK.KK..',
  '..KGGKGEGKGGK.',
  '...KGEGGGEGK..',
  '..KKKEGGGEKKK.',
  '.KGGGGGGGGGGGK',
  '..KKKKYYKKKK..',
  '.KYYYYWWYYYYK.',
  'KYYMYYYYYYMYYK',
  'KYMYYMYYMYYMYK',
  'KYYYYMYYMYYYYK',
  'KYMYYMYYMYYMYK',
  'KYYMYYYYYYMYYK',
  '.KYMYYMMYYMYK.',
  '..KYYMMMMYYK..',
  '...KKKKKKKK...',
];

const FRUIT_PEACH = [
  '.......KKKK...',
  '......KGGGEK..',
  '...KKKKGGEK...',
  '..KCCCCKKEK...',
  '.KCCWWCCKCCK..',
  'KCCWYYCCCCAAK.',
  'KCCYYCCCCAAAK.',
  'KCCCCCCCCAAAK.',
  'KCCCCCCCCAAAK.',
  'KCCCCCCCAAAAK.',
  '.KCCCCCCAAAK..',
  '.KCCCCCCAAAK..',
  '..KCCCCAAAK...',
  '...KCCAAAK....',
  '....KKKKK.....',
];

const FRUIT_MANGO = [
  '.......KKKK...',
  '......KGGGEK..',
  '....KKKGGEK...',
  '...KAAAKKK....',
  '..KAAWWAAK....',
  '.KAAAYYMMMK...',
  '.KAAAMMMMMMK..',
  '.KAMMMMMMMMK..',
  '..KMMMMMMMMYK.',
  '..KMMMMMMYYYK.',
  '...KMMMMYYYYK.',
  '....KMMYYYYK..',
  '.....KYYYYK...',
  '......KKKK....',
];

const ICON_HEART_FULL = [
  '.KKK...KKK.',
  'KAAAK.KAAAK',
  'KAWWAKKAAAK',
  'KAWAAAAAAAK',
  'KAAAAAAAAAK',
  '.KAAAAAAAK.',
  '..KAAAAAK..',
  '...KAAAK...',
  '....KAK....',
  '.....K.....',
];

const ICON_HEART_EMPTY = [
  '.KKK...KKK.',
  'KBBBK.KBBBK',
  'KB.BBKBB.BK',
  'KB..BBB..BK',
  'KB.......BK',
  '.KB.....BK.',
  '..KB...BK..',
  '...KB.BK...',
  '....KBK....',
  '.....K.....',
];

// Puffy, charming 8-bit pixel clouds (matching 1_start_screen.png & 6_scale_reference.png!)
const CLOUD_SMALL = [
  '......KKKKK.......',
  '.....KWWWWWK......',
  '..KKKKWWWWWWKKK...',
  '.KWWWWWWWWWWWWWK..',
  'KWWWWWWWWWWWWWWWK.',
  'KWWWQQQQQQQQQWWWWK',
  '.KKKKKKKKKKKKKKKK.',
];

const CLOUD_LARGE = [
  '..........KKKKKK..........',
  '.........KWWWWWWK.........',
  '....KKKKKWWWWWWWWKKKK.....',
  '..KKWWWWWWWWWWWWWWWWWKK...',
  '.KWWWWWWWWWWWWWWWWWWWWWK..',
  'KWWWWWWWQQQQQQQQQQQQWWWWK.',
  'KQQQQQQQQQQQQQQQQQQQQQQQQK',
  '.KKKKKKKKKKKKKKKKKKKKKKKK.',
];

const AMBIENT_COLORS = {
  '.': null,
  'P': '#FF9CC2',
  'C': '#FFCC99',
  'Y': '#FFF0B8',
  'Q': '#FFC2D4',
  'W': '#FFE4EE',
  'B': '#7D3B72',
  'N': '#5B285C',
  'A': '#FF6AA3',
};

// High-altitude soft wisp cloud (muted pastel, borderless for atmospheric depth)
const CLOUD_WISP = [
  '....PPPPPP......',
  '..PPQQQQQQPP....',
  '.PQQWWWWWWQQPP..',
  'PPQQQQQQQQQQQQP.',
];

// Pixel birds / seagulls at 2 parallax depths (muted dusk plum so foreground pops)
const BIRD_FAR_UP = [
  'B...B',
  '.B.B.',
  '..B..',
];
const BIRD_FAR_DOWN = [
  '..B..',
  '.B.B.',
  'B...B',
];

const BIRD_NEAR_UP = [
  'N.....N',
  '.N...N.',
  '..NNN..',
  '...P...',
];
const BIRD_NEAR_GLIDE = [
  '.NN.NN.',
  'N..N..N',
  '...P...',
];
const BIRD_NEAR_DOWN = [
  '..NNN..',
  '.N...N.',
  'N..P..N',
];

// Distant retro blimp & airplane (low-contrast atmospheric silhouettes)
const DISTANT_BLIMP = [
  '..NNNNNNNNNN......',
  '.NPPPPPPPPPPN...N.',
  'NPAAAPAAAPAAAN.NN.',
  'NPPPPPPPPPPPPNNNN.',
  '.NNNNNNNNNNNNN..N.',
  '....N....N........',
];

const DISTANT_PLANE = [
  '......N....',
  'N....NN....',
  'NNNNNNNNNN.',
  '.N...NN....',
];

// 11x10 pixel music-note icon (beamed pair); the "off" version is greyed with a red slash
const ICON_MUSIC = [
  '...WWWWWWW.',
  '...WWWWWWW.',
  '...W.....W.',
  '...W.....W.',
  '...W.....W.',
  '...W.....W.',
  '...W.....W.',
  '.WWW...WWW.',
  'WWWW..WWWW.',
  '.WW....WW..',
];

function bakeMusicIcon(off) {
  const rows = ICON_MUSIC.map(r => r.split(''));
  if (off) {
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) if (rows[y][x] === 'W') rows[y][x] = 'I';
    }
    for (let i = 0; i < 10; i++) {
      const x = Math.round(i * 10 / 9);
      const y = 9 - i;
      rows[y][x] = 'K';
      rows[y][Math.min(10, x + 1)] = 'R';
      if (x > 0) rows[y][x - 1] = 'K';
    }
  }
  return bakeSprite(rows.map(r => r.join('')));
}


// ---- Feature round 3: bird, slide pose, MUSTHAVE tin trampoline, pickups ----
const CORGI_SLIDE_A = [
  '.................KKKK.KKKK....',
  '..KKK...........KOOOKKOOOOK...',
  '.KOLOKKKKKKKKKKKKOOOOOWWOOOK..',
  'KLOOOOOOOOOOOOOOOOOOWWWWKWOKKK',
  'KOOOOOOOOOOOOOOOOOWWWWWKKKWWKK',
  'KDOOWWWWWWWOOOOOWWWWWWWWWWWKK.',
  '.KDWWWWWWWWWWWWWWWWWWKPPWWK...',
  'KWWKKKKKKKKKKKKKKKKKKKKKKK....',
  'KKK...............KWWKWWK.....',
  '..................KKKKKKKK....',
];
const CORGI_SLIDE_B = [
  '.................KKKK.KKKK....',
  '..KKK...........KOOOKKOOOOK...',
  '.KOLOKKKKKKKKKKKKOOOOOWWOOOK..',
  'KLOOOOOOOOOOOOOOOOOOWWWWKWOKKK',
  'KOOOOOOOOOOOOOOOOOWWWWWKKKWWKK',
  'KDOOWWWWWWWOOOOOWWWWWWWWWWWKK.',
  '.KDWWWWWWWWWWWWWWWWWWKPPWWK...',
  '.KWWKKKKKKKKKKKKKKKKKKKKKK....',
  '..KWWK.............KWWKWWK....',
  '..KKKK.............KKKKKKKK...',
];
const OBSTACLE_BIRD_A = [
  '....KK......KK..',
  '....KWK....KSK..',
  '.....KWK..KSK...',
  '..KKK.KWKKSK....',
  '.KWWWKKWWWWKKK..',
  'KYYKWWWWWWWWWSKK',
  '.KKWWWWWWWWWSKK.',
  '...KKSSSSSKKK...',
  '.....KKKKK......',
];
const OBSTACLE_BIRD_B = [
  '................',
  '................',
  '..KKK...........',
  '.KWWWK..........',
  'KYYKWKKKKKKKKKK.',
  '.KKWWWWWWWWWWSKK',
  '...KWWSWWWWWSKK.',
  '....KSSKKSSSKK..',
  '.....KK..KSK....',
];
// MUSTHAVE tobacco tin used as a trampoline (silver lid, mango label "MH")
const TRAMP_TIN = [
  '..KKKKKKKKKKKKKKKKKKKK..',
  '.KTTWTTTTTTTTTTTTTTTTIK.',
  'KIIIIIIIIIIIIIIIIIIIIIIK',
  'KKKKKKKKKKKKKKKKKKKKKKKK',
  'KMMMMMMMMMMMMMMMMMMMMMMK',
  'KMKMMMKMKMKMMAAAAAAAAMMK',
  'KMKKMKKMKKKMMMMMMMMMMMDK',
  'KMKMKMKMKMKMMAAAAAAAAMDK',
  'KDDDDDDDDDDDDDDDDDDDDDDK',
  '.KKKKKKKKKKKKKKKKKKKKKK.',
];
const PICKUP_COAL = [
  '...KKKKK...',
  '..KVRMRVK..',
  '.KVRYYMRVK.',
  'KVRYWWYMRVK',
  'KVMYYWYYRVK',
  'KVRMYYYMRVK',
  '.KVRRMRRVK.',
  '..KKVVVKK..',
  '....KKK....',
];
const GOLD_COLORS = Object.assign({}, SPRITE_COLORS, {
  'A': '#FFB000', 'M': '#FFD100', 'Y': '#FFF1A0', 'W': '#FFFFFF', 'G': '#FFE45C', 'E': '#C9A227',
});

window.MH_SPRITES = (function () {
  const backRight = bakeSprite(CORGI_BACK_RIGHT);
  const frontRight = bakeSprite(CORGI_FRONT_RIGHT);
  const sideRight = bakeSprite(CORGI_SIDE_RIGHT);
  return {
    corgi: {
      hero: bakeSprite(CORGI_HERO),
      heroWag: bakeSprite(CORGI_HERO_WAG),
      heroBlink: bakeSprite(CORGI_HERO_BLINK),
      heroYawn: bakeSprite(CORGI_HERO_YAWN),
      front: bakeSprite(CORGI_FRONT),
      backA: bakeSprite(CORGI_BACK_A),
      backB: bakeSprite(CORGI_BACK_B),
      backRight,
      frontRight,
      sideRight,
      sideLeft: flipSpriteH(sideRight),
      frontLeft: flipSpriteH(frontRight),
      backLeft: flipSpriteH(backRight),
      run: [
        bakeSprite(CORGI_RUN_0),
        bakeSprite(CORGI_RUN_1),
        bakeSprite(CORGI_RUN_2),
        bakeSprite(CORGI_RUN_3),
        bakeSprite(CORGI_RUN_4),
        bakeSprite(CORGI_RUN_5),
      ],
      crouch: bakeSprite(CORGI_CROUCH),
      jump: bakeSprite(CORGI_JUMP),
      sleep: bakeSprite(CORGI_SLEEP),
      slide: [bakeSprite(CORGI_SLIDE_A), bakeSprite(CORGI_SLIDE_B)],
    },
    bowl: bakeSprite(DOG_BOWL),
    santaHat: bakeSprite(SANTA_HAT),
    zBig: bakeSprite(PIXEL_Z_BIG),
    zSmall: bakeSprite(PIXEL_Z_SMALL),
    obstacles: {
      hookah: bakeSprite(OBSTACLE_HOOKAH, OBSTACLE_COLORS),
      hookahBig: bakeSprite(OBSTACLE_HOOKAH_BIG, OBSTACLE_COLORS),
      shilavilki: bakeSprite(OBSTACLE_SHILAVILKI, OBSTACLE_COLORS),
      coals: [bakeSprite(OBSTACLE_COALS_A), bakeSprite(OBSTACLE_COALS_B)],
      bird: [bakeSprite(OBSTACLE_BIRD_A), bakeSprite(OBSTACLE_BIRD_B)],
      tramp: bakeSprite(TRAMP_TIN, OBSTACLE_COLORS),
      trampSquash: bakeSprite([TRAMP_TIN[0], TRAMP_TIN[1]].concat(TRAMP_TIN.slice(5)), OBSTACLE_COLORS),
    },
    pickups: {
      coal: bakeSprite(PICKUP_COAL),
      hat: bakeSprite(SANTA_HAT),
    },
    fruits: {
      pineapple: bakeSprite(FRUIT_PINEAPPLE),
      peach: bakeSprite(FRUIT_PEACH),
      mango: bakeSprite(FRUIT_MANGO),
      golden: bakeSprite(FRUIT_MANGO, GOLD_COLORS),
    },
    ui: {
      heartFull: bakeSprite(ICON_HEART_FULL),
      heartEmpty: bakeSprite(ICON_HEART_EMPTY),
      noteOn: bakeMusicIcon(false),
      noteOff: bakeMusicIcon(true),
    },
    clouds: {
      small: bakeSprite(CLOUD_SMALL),
      large: bakeSprite(CLOUD_LARGE),
      wisp: bakeSprite(CLOUD_WISP, AMBIENT_COLORS),
    },
    ambient: {
      birdFar: [bakeSprite(BIRD_FAR_UP, AMBIENT_COLORS), bakeSprite(BIRD_FAR_DOWN, AMBIENT_COLORS)],
      birdNear: [
        bakeSprite(BIRD_NEAR_UP, AMBIENT_COLORS),
        bakeSprite(BIRD_NEAR_GLIDE, AMBIENT_COLORS),
        bakeSprite(BIRD_NEAR_DOWN, AMBIENT_COLORS),
        bakeSprite(BIRD_NEAR_GLIDE, AMBIENT_COLORS),
      ],
      blimp: bakeSprite(DISTANT_BLIMP, AMBIENT_COLORS),
      plane: bakeSprite(DISTANT_PLANE, AMBIENT_COLORS),
      moth: NEON_MOTH.map(m => bakeSprite(m)),
      moon: bakeSprite(PIXEL_MOON, AMBIENT_COLORS),
      palmMenuTrunk: bakeSprite(PALM_MENU_TRUNK, { '.': null, 'G': '#471B54' }),
      catRoof: [bakeSprite(CAT_ROOF_A, { '.': null, 'K': '#11051E', 'Y': '#FFD100' }), bakeSprite(CAT_ROOF_B, { '.': null, 'K': '#11051E', 'Y': '#FFD100' })],
      trashCan: bakeSprite(TRASH_CAN),
    },
  };
})();
