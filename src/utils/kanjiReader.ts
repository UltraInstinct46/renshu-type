/**
 * kanjiReader.ts — looks up kana readings for kanji using kuromoji.js
 * (an in-browser Japanese morphological analyzer with the IPADIC dictionary).
 *
 * The analyzer and its dictionary (~18 MB, cached by the browser) are only
 * downloaded the first time a kanji word without a reading needs one.
 */
import { KANJI_RE } from './customWords.ts';
import { toHiragana } from './romajiEngine.ts';

export interface KuromojiToken {
  surface_form: string;
  reading?: string;
}

export interface KanjiTokenizer {
  tokenize(text: string): KuromojiToken[];
}

interface KuromojiModule {
  builder(options: { dicPath: string }): {
    build(callback: (err: Error | null, tokenizer: KanjiTokenizer) => void): void;
  };
}

let tokenizerPromise: Promise<KanjiTokenizer> | null = null;

export function loadTokenizer(): Promise<KanjiTokenizer> {
  if (!tokenizerPromise) {
    tokenizerPromise = import('kuromoji/build/kuromoji.js').then((mod: { default?: KuromojiModule } & KuromojiModule) => {
      const kuromoji = mod.default ?? mod;
      return new Promise<KanjiTokenizer>((resolve, reject) => {
        kuromoji
          .builder({ dicPath: `${import.meta.env.BASE_URL}dict/` })
          .build((err, tokenizer) => (err ? reject(err) : resolve(tokenizer)));
      });
    });
    tokenizerPromise.catch(() => {
      tokenizerPromise = null; // allow a retry after a network failure
    });
  }
  return tokenizerPromise;
}

/**
 * Reading for `text` in hiragana. Kana already in the text is kept as written
 * (so ラーメン屋 → ラーメンや). Returns null if any kanji has no known reading.
 */
export function readingOf(tokenizer: KanjiTokenizer, text: string): string | null {
  let out = '';
  for (const token of tokenizer.tokenize(text)) {
    if (!KANJI_RE.test(token.surface_form)) {
      out += token.surface_form;
      continue;
    }
    if (!token.reading || token.reading === '*') return null;
    out += toHiragana(token.reading);
  }
  return out || null;
}
