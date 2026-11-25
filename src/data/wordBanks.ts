import type { QuoteItem, QuoteLength, QuoteLengthFilter, Segment, WordItem } from '../types/typing';

/* ========================================================================== */
/*  Words — everyday (JLPT N5/N4) + business & tech vocabulary                 */
/* ========================================================================== */

type WordEntry = readonly [text: string, reading: string, meaning: string];

const WORD_ENTRIES: readonly WordEntry[] = [
  // everyday
  ['学校', 'がっこう', 'school'],
  ['先生', 'せんせい', 'teacher'],
  ['学生', 'がくせい', 'student'],
  ['友達', 'ともだち', 'friend'],
  ['電車', 'でんしゃ', 'train'],
  ['時間', 'じかん', 'time'],
  ['天気', 'てんき', 'weather'],
  ['食べ物', 'たべもの', 'food'],
  ['飲み物', 'のみもの', 'drink'],
  ['図書館', 'としょかん', 'library'],
  ['病院', 'びょういん', 'hospital'],
  ['映画', 'えいが', 'movie'],
  ['音楽', 'おんがく', 'music'],
  ['写真', 'しゃしん', 'photograph'],
  ['新聞', 'しんぶん', 'newspaper'],
  ['部屋', 'へや', 'room'],
  ['旅行', 'りょこう', 'travel'],
  ['料理', 'りょうり', 'cooking'],
  ['自転車', 'じてんしゃ', 'bicycle'],
  ['切符', 'きっぷ', 'ticket'],
  ['雑誌', 'ざっし', 'magazine'],
  ['宿題', 'しゅくだい', 'homework'],
  ['誕生日', 'たんじょうび', 'birthday'],
  ['家族', 'かぞく', 'family'],
  ['お茶', 'おちゃ', 'green tea'],
  ['牛乳', 'ぎゅうにゅう', 'milk'],
  ['朝ご飯', 'あさごはん', 'breakfast'],
  ['今日', 'きょう', 'today'],
  ['明日', 'あした', 'tomorrow'],
  ['昨日', 'きのう', 'yesterday'],
  ['近所', 'きんじょ', 'neighborhood'],
  ['練習', 'れんしゅう', 'practice'],
  ['質問', 'しつもん', 'question'],
  ['動物', 'どうぶつ', 'animal'],
  ['地下鉄', 'ちかてつ', 'subway'],
  ['勉強', 'べんきょう', 'study'],
  ['日本語', 'にほんご', 'Japanese language'],
  ['お金', 'おかね', 'money'],
  ['会社', 'かいしゃ', 'company'],
  ['ちょっと', 'ちょっと', 'a little'],
  ['ラーメン', 'ラーメン', 'ramen'],
  ['コーヒー', 'コーヒー', 'coffee'],
  ['季節', 'きせつ', 'season'],
  ['空港', 'くうこう', 'airport'],
  ['野菜', 'やさい', 'vegetables'],
  ['お土産', 'おみやげ', 'souvenir'],
  // business & tech
  ['締め切り', 'しめきり', 'deadline'],
  ['会議', 'かいぎ', 'meeting'],
  ['開発環境', 'かいはつかんきょう', 'development environment'],
  ['仕様書', 'しようしょ', 'specification document'],
  ['打ち合わせ', 'うちあわせ', 'briefing / meeting'],
  ['進捗', 'しんちょく', 'progress'],
  ['報告書', 'ほうこくしょ', 'report'],
  ['見積もり', 'みつもり', 'estimate / quote'],
  ['取引先', 'とりひきさき', 'client'],
  ['名刺', 'めいし', 'business card'],
  ['出張', 'しゅっちょう', 'business trip'],
  ['残業', 'ざんぎょう', 'overtime'],
  ['予算', 'よさん', 'budget'],
  ['契約書', 'けいやくしょ', 'contract'],
  ['請求書', 'せいきゅうしょ', 'invoice'],
  ['資料', 'しりょう', 'materials'],
  ['担当者', 'たんとうしゃ', 'person in charge'],
  ['承認', 'しょうにん', 'approval'],
  ['納品', 'のうひん', 'delivery'],
  ['障害対応', 'しょうがいたいおう', 'incident response'],
  ['本番環境', 'ほんばんかんきょう', 'production environment'],
  ['人工知能', 'じんこうちのう', 'artificial intelligence'],
  ['暗号化', 'あんごうか', 'encryption'],
  ['バグ修正', 'バグしゅうせい', 'bug fix'],
  ['データベース', 'データベース', 'database'],
  ['コンピュータ', 'コンピュータ', 'computer'],
  ['サーバー', 'サーバー', 'server'],
  ['プログラミング', 'プログラミング', 'programming'],
  ['ソフトウェア', 'ソフトウェア', 'software'],
  ['セキュリティ', 'セキュリティ', 'security'],
  ['クラウド', 'クラウド', 'cloud'],
];

export const WORDS: readonly WordItem[] = WORD_ENTRIES.map(([text, reading, meaning], i) => ({
  id: `w${i}`,
  text,
  reading,
  meaning,
}));

/* ========================================================================== */
/*  Quotes — proverbs, everyday sentences, public-domain literature            */
/*  Notation: space-separated chunks, "漢字|かんじ" or plain kana/punctuation.  */
/* ========================================================================== */

type QuoteEntry = readonly [notation: string, source: string, meaning: string];

const QUOTE_ENTRIES: readonly QuoteEntry[] = [
  ['猿|さる も 木|き から 落ちる|おちる', 'ことわざ', 'Even monkeys fall from trees.'],
  ['継続|けいぞく は 力|ちから なり', 'ことわざ', 'Persistence is power.'],
  ['七転び八起き|ななころびやおき', 'ことわざ', 'Fall seven times, stand up eight.'],
  ['急がば|いそがば 回れ|まわれ', 'ことわざ', 'More haste, less speed.'],
  ['花|はな より 団子|だんご', 'ことわざ', 'Dumplings over flowers — substance over style.'],
  ['知らぬ|しらぬ が 仏|ほとけ', 'ことわざ', 'Ignorance is bliss.'],
  ['一期一会|いちごいちえ', '茶道の言葉', 'One time, one meeting — treasure every encounter.'],
  ['時|とき は 金|かね なり', 'ことわざ', 'Time is money.'],
  ['雨|あめ 降って|ふって 地|じ 固まる|かたまる', 'ことわざ', 'After rain, the ground hardens.'],
  ['石|いし の 上|うえ にも 三年|さんねん', 'ことわざ', 'Three years on a cold stone — perseverance prevails.'],
  ['笑う|わらう 門|かど には 福|ふく 来る|きたる', 'ことわざ', 'Fortune comes to a merry home.'],
  ['塵|ちり も 積もれば|つもれば 山|やま と なる', 'ことわざ', 'Even dust, piled up, becomes a mountain.'],
  ['千里|せんり の 道|みち も 一歩|いっぽ から', 'ことわざ', 'A journey of a thousand miles begins with a single step.'],
  ['百聞|ひゃくぶん は 一見|いっけん に 如かず|しかず', 'ことわざ', 'Seeing once is better than hearing a hundred times.'],
  ['能|のう ある 鷹|たか は 爪|つめ を 隠す|かくす', 'ことわざ', 'The talented hawk hides its claws.'],
  ['案ずる|あんずる より 産む|うむ が 易し|やすし', 'ことわざ', 'Doing is easier than worrying.'],
  ['失敗|しっぱい は 成功|せいこう の もと 。', 'ことわざ', 'Failure is the foundation of success.'],
  ['禍福|かふく は あざなえる 縄|なわ の ごとし 。', 'ことわざ', 'Fortune and misfortune are twisted together like a rope.'],
  ['初心|しょしん 忘る|わする べからず 。', '世阿弥', 'Never forget the beginner’s mind.'],
  ['今日|きょう は いい 天気|てんき です ね 。', '日常会話', 'Nice weather today, isn’t it?'],
  ['駅|えき は どこ です か ？', '日常会話', 'Where is the station?'],
  ['少々|しょうしょう お待ち|おまち ください 。', '日常会話', 'Please wait a moment.'],
  ['はじめまして 、 よろしく お願い|おねがい します 。', '日常会話', 'Nice to meet you.'],
  ['明日|あした の 会議|かいぎ は 十時|じゅうじ から です 。', '日常会話', 'Tomorrow’s meeting starts at ten.'],
  ['新幹線|しんかんせん で 京都|きょうと へ 行きます|いきます 。', '日常会話', 'I’ll go to Kyoto by shinkansen.'],
  ['ラーメン を 食べ|たべ に 行き|いき ましょう 。', '日常会話', 'Let’s go eat ramen.'],
  ['日本語|にほんご の 勉強|べんきょう は 楽しい|たのしい です 。', '日常会話', 'Studying Japanese is fun.'],
  ['明日|あした は 明日|あした の 風|かぜ が 吹く|ふく 。', 'ことわざ', 'Tomorrow’s wind will blow tomorrow.'],
  ['為せば|なせば 成る|なる 、 為さねば|なさねば 成らぬ|ならぬ 何事|なにごと も 。', '上杉鷹山', 'If you act, it can be done; if you don’t, nothing will be.'],
  ['吾輩|わがはい は 猫|ねこ で ある 。 名前|なまえ は まだ 無い|ない 。', '夏目漱石『吾輩は猫である』', 'I am a cat. As yet I have no name.'],
  ['親譲り|おやゆずり の 無鉄砲|むてっぽう で 小供|こども の 時|とき から 損|そん ばかり している 。', '夏目漱石『坊っちゃん』', 'Thanks to my inherited recklessness, I’ve been losing out since childhood.'],
  ['智|ち に 働けば|はたらけば 角|かど が 立つ|たつ 。 情|じょう に 棹させば|さおさせば 流される|ながされる 。', '夏目漱石『草枕』', 'Use your head and you make enemies; give in to feelings and you are swept away.'],
  ['意地|いじ を 通せば|とおせば 窮屈|きゅうくつ だ 。 とかくに 人|ひと の 世|よ は 住みにくい|すみにくい 。', '夏目漱石『草枕』', 'Insist on your own way and you are cornered. This human world is hard to live in.'],
  ['祇園精舎|ぎおんしょうじゃ の 鐘|かね の 声|こえ 、 諸行無常|しょぎょうむじょう の 響き|ひびき あり 。', '『平家物語』', 'The bell of the Gion temple echoes the impermanence of all things.'],
  ['ゆく 河|かわ の 流れ|ながれ は 絶えず|たえず して 、 しかも もと の 水|みず に あらず 。', '鴨長明『方丈記』', 'The flowing river never stops, and yet the water is never the same.'],
  ['雨|あめ ニモ マケズ 、 風|かぜ ニモ マケズ 、 雪|ゆき ニモ 夏|なつ ノ 暑サ|あつさ ニモ マケヌ 丈夫|じょうぶ ナ カラダ ヲ モチ', '宮沢賢治『雨ニモマケズ』', 'Unbeaten by rain, unbeaten by wind, unbowed by snow or summer heat, with a strong body…'],
];

export function parseSegments(notation: string): Segment[] {
  return notation
    .trim()
    .split(/\s+/)
    .map((token) => {
      const [text, reading] = token.split('|');
      return { text, reading: reading ?? text };
    });
}

function classify(kanaCount: number): QuoteLength {
  if (kanaCount <= 15) return 'short';
  if (kanaCount <= 30) return 'medium';
  return 'long';
}

export const QUOTES: readonly QuoteItem[] = QUOTE_ENTRIES.map(([notation, source, meaning], i) => {
  const segments = parseSegments(notation);
  const kanaCount = segments.reduce((n, s) => n + s.reading.length, 0);
  return { id: `q${i}`, segments, source, meaning, kanaCount, length: classify(kanaCount) };
});

export const QUOTE_LENGTH_LABELS: Record<QuoteLengthFilter, string> = {
  all: 'all',
  short: 'short',
  medium: 'medium',
  long: 'long',
};

export function getQuotePool(filter: QuoteLengthFilter): readonly QuoteItem[] {
  return filter === 'all' ? QUOTES : QUOTES.filter((q) => q.length === filter);
}
