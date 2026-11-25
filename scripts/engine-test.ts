/**
 * Engine & session regression tests — run with:  node scripts/engine-test.ts
 * (Node ≥ 22.18 strips TypeScript types natively.)
 */
import { createParser, defaultRomaji, getGuide, processKey, typeString } from '../src/utils/romajiEngine.ts';
import { backspace, buildSegmentViews, createSession, typeKey } from '../src/utils/typingSession.ts';
import { QUOTES, WORDS } from '../src/data/wordBanks.ts';

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else {
    failed++;
    console.error(`✗ ${name} ${detail}`);
  }
}

/** keys must complete the reading with zero rejected keys */
function accepts(reading: string, keys: string): void {
  const { state, errors } = typeString(reading, keys);
  check(`${reading} ← ${keys}`, state.completed && errors === 0, `(completed=${state.completed}, errors=${errors})`);
}
/** keys must NOT complete the reading cleanly */
function rejects(reading: string, keys: string): void {
  const { state, errors } = typeString(reading, keys);
  check(`${reading} ✗ ${keys}`, !state.completed || errors > 0);
}

// multi-variant syllables
for (const k of ['shi', 'si']) accepts('し', k);
for (const k of ['chi', 'ti']) accepts('ち', k);
for (const k of ['tsu', 'tu']) accepts('つ', k);
for (const k of ['fu', 'hu']) accepts('ふ', k);
for (const k of ['ji', 'zi']) accepts('じ', k);
for (const k of ['sha', 'sya']) accepts('しゃ', k);
for (const k of ['shu', 'syu']) accepts('しゅ', k);
for (const k of ['sho', 'syo']) accepts('しょ', k);
for (const k of ['cha', 'tya', 'cya']) accepts('ちゃ', k);
for (const k of ['chu', 'tyu', 'cyu']) accepts('ちゅ', k);
for (const k of ['cho', 'tyo', 'cyo']) accepts('ちょ', k);
for (const k of ['ja', 'zya', 'jya']) accepts('じゃ', k);
for (const k of ['ju', 'zyu', 'jyu']) accepts('じゅ', k);
for (const k of ['jo', 'zyo', 'jyo']) accepts('じょ', k);
accepts('しゃ', 'shixya');
accepts('しゃ', 'silya');

// sokuon
for (const k of ['kitte', 'kixtute', 'kiltute', 'kixtsute', 'kiltsute']) accepts('きって', k);
for (const k of ['kocchi', 'kotti']) accepts('こっち', k);
accepts('ざっし', 'zasshi');
accepts('ざっし', 'zassi');
accepts('しゅっちょう', 'shucchou');
accepts('しゅっちょう', 'syuttyou');
rejects('きって', 'kite');
{
  let s = createParser('きって');
  for (const k of 'kit') s = processKey(s, k).state;
  check('きって: "kit" commits っ', s.position === 2, `(pos=${s.position})`);
}

// hatsuon
accepts('かんたん', 'kantann');
accepts('かんたん', "kantan'");
accepts('かんたん', 'kantaxn');
rejects('かんたん', 'kantan');
accepts('かんい', 'kanni');
accepts('かんい', "kan'i");
rejects('かんい', 'kani');
accepts('こんや', 'konnya');
rejects('こんや', 'konya');
accepts('こんな', 'konnna');
accepts('としょかん', 'toshokann');
accepts('としょかん', 'tosyokann');
accepts('しんぶん', 'shinbunn');
accepts('おんがく', 'ongaku');

// small kana
accepts('ぁ', 'xa');
accepts('ぁ', 'la');
accepts('っ', 'xtsu');
accepts('っ', 'ltsu');

// katakana & punctuation
accepts('コンピュータ', 'konpyu-ta');
accepts('ラーメン', 'ra-menn');
accepts('ソフトウェア', 'sofutowea');
accepts('セキュリティ', 'sekyurithi');
accepts('えきはどこですか？', 'ekihadokodesuka?');
accepts('はじめまして、よろしく。', 'hajimemashite,yoroshiku.');
accepts('ふぁいる', 'fairu');

// live guide morphs to the chosen spelling
{
  let s = createParser('としょかん');
  check('guide default', getGuide(s).remaining === 'toshokann', getGuide(s).remaining);
  for (const k of 'tosy') s = processKey(s, k).state;
  const g = getGuide(s);
  check('guide morph', g.typed === 'tosy' && g.remaining === 'okann', `${g.typed}|${g.remaining}`);
}
{
  const prefs = { し: 'si' };
  check('guide prefs', defaultRomaji('しんぶん', prefs) === 'sinbunn', defaultRomaji('しんぶん', prefs));
}

// typingSession: typos are typed in red and can be backspaced
{
  let ses = createSession(
    [
      { text: '学校', reading: 'がっこう' },
      { text: '時間', reading: 'じかん' },
    ],
    true,
  );

  // Type 'gz' (z is typo for a)
  let r = typeKey(ses, 'g');
  check('session: g correct', r.outcome === 'correct');
  ses = r.session;

  r = typeKey(ses, 'z');
  check('session: z is error (typed)', r.outcome === 'error');
  ses = r.session;

  let views = buildSegmentViews(ses);
  check('session: z shown as error in romaji', views[0].romaji[1].ch === 'z' && views[0].romaji[1].state === 'error');
  check('session: caret after z', views[0].caretAt === 2);

  // Backspace removes z and restores parser
  ses = backspace(ses);
  views = buildSegmentViews(ses);
  check('session: backspace restores caret to 1', views[0].caretAt === 1);
  check('session: backspace restores remaining to a', views[0].romaji[1].ch === 'a' && views[0].romaji[1].state === 'pending');

  // Finish word correctly, then type extra, then backspace, then space
  for (const k of 'akkou') ses = typeKey(ses, k).session;
  r = typeKey(ses, 'x');
  check('session: x at end of word is extra', r.outcome === 'extra');
  ses = r.session;
  ses = backspace(ses);
  r = typeKey(ses, ' ');
  check('session: space advances to next word', r.outcome === 'correct');
  ses = r.session;
  views = buildSegmentViews(ses);
  check('session: word 1 done, word 2 current', views[0].status === 'done' && views[1].status === 'current');

  // Skip word 2 mid-word with Space, then backspace back into it
  ses = typeKey(ses, 'j').session;
  r = typeKey(ses, ' ');
  check('session: space mid-word skips', r.outcome === 'skip' && ses.parser.completed === false);
  ses = r.session;
  check('session: completed after skipping last word', ses.parser.completed);
  ses = backspace(ses);
  check('session: backspace un-skips last word', !ses.parser.completed);
}

// typingSession: quote (no space separator)
{
  const q = QUOTES[0];
  let ses = createSession(q.segments, false);
  const fullRomaji = q.segments.map((s) => defaultRomaji(s.reading)).join('');
  for (const ch of fullRomaji) {
    const r = typeKey(ses, ch);
    check(`quote char ${ch}`, r.outcome === 'correct');
    ses = r.session;
  }
  check('quote completed', ses.parser.completed);
}

// every word & quote in the banks must be typeable via its default guide
for (const w of WORDS) {
  const romaji = defaultRomaji(w.reading);
  const { state, errors } = typeString(w.reading, romaji);
  check(`word ${w.text} (${romaji})`, state.completed && errors === 0);
}
for (const q of QUOTES) {
  const reading = q.segments.map((s) => s.reading).join('');
  const romaji = defaultRomaji(reading);
  const { state, errors } = typeString(reading, romaji);
  check(`quote ${q.id}`, state.completed && errors === 0);
}

console.log(`\n${passed} passed, ${failed} failed  (words: ${WORDS.length}, quotes: ${QUOTES.length})`);
if (failed) process.exit(1);
