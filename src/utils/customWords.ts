/**
 * customWords.ts — parses a user's free-form custom word list.
 *
 * One word per line:
 *   猫                   kanji only — reading is looked up from the dictionary
 *   猫|ねこ|cat          word | reading | meaning (meaning optional)
 *   猫|neko              readings may be written in romaji
 *   猫 ねこ cat          spaces work too when no | / tab / comma is used
 *   ありがとう           kana-only words don't need a reading
 *   # comment            ignored
 */
import type { WordItem } from '../types/typing';
import { romajiToKana, unsupportedChars } from './romajiEngine.ts';

export interface CustomParseIssue {
  line: number;
  text: string;
  message: string;
}

export interface CustomParseResult {
  words: WordItem[];
  issues: CustomParseIssue[];
  /** Kanji words without a reading that haven't been looked up yet. */
  unresolved: string[];
}

/** Map of word → dictionary reading ('' means the lookup failed). */
export type ReadingLookup = ReadonlyMap<string, string>;

export const KANJI_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff々〆]/;
const EXPLICIT_SEPARATOR = /[|｜\t,]/;
const WHITESPACE = /\s/;
const NON_ASCII = /[^\x00-\x7f]/;
const ROMAJI_ONLY = /^[a-zA-Z'\-āīūēōâîûêô]+$/;

interface RawLine {
  word: string;
  reading: string | null;
  meaning: string;
}

function splitLine(line: string): RawLine {
  if (EXPLICIT_SEPARATOR.test(line)) {
    const parts = line.split(EXPLICIT_SEPARATOR).map((p) => p.trim());
    return { word: parts[0] ?? '', reading: parts[1] || null, meaning: parts.slice(2).filter(Boolean).join(', ') };
  }
  const parts = line.split(/\s+/);
  return { word: parts[0] ?? '', reading: parts[1] || null, meaning: parts.slice(2).join(' ') };
}

const isSkippable = (line: string) => !line || line.startsWith('#');

export function parseCustomWords(text: string, lookup?: ReadingLookup): CustomParseResult {
  const words: WordItem[] = [];
  const issues: CustomParseIssue[] = [];
  const unresolved = new Set<string>();
  const seen = new Set<string>();

  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    if (isSkippable(line)) return;
    const issue = (message: string) => issues.push({ line: idx + 1, text: line, message });

    const { word, reading: explicit, meaning } = splitLine(line);
    if (!word) return issue('missing word');

    let reading = explicit ?? word;
    let autoReading = false;

    if (explicit && NON_ASCII.test(word) && ROMAJI_ONLY.test(explicit)) {
      const kana = romajiToKana(explicit);
      if (!kana) return issue(`couldn't read the romaji "${explicit}"`);
      reading = kana;
    } else if (!explicit && KANJI_RE.test(word)) {
      const found = lookup?.get(word);
      if (found === undefined) {
        unresolved.add(word);
        return;
      }
      if (found === '') return issue('no reading found — write it as 漢字|かんじ');
      reading = found;
      autoReading = true;
    }

    if (WHITESPACE.test(word) || WHITESPACE.test(reading)) return issue('no spaces inside a word or reading');
    if (KANJI_RE.test(reading)) return issue('reading must be kana or romaji, not kanji');
    const bad = unsupportedChars(reading);
    if (bad.length) return issue(`can't be typed: ${bad.join(' ')}`);

    const key = `${word}\u0000${reading}`;
    if (seen.has(key)) return;
    seen.add(key);
    words.push({ id: `c${words.length}`, text: word, reading, meaning, ...(autoReading ? { autoReading } : {}) });
  });

  return { words, issues, unresolved: [...unresolved] };
}

/**
 * Writes looked-up readings back into the text ("猫" → "猫|ねこ") so the saved
 * list never needs the dictionary again and readings can be corrected by hand.
 */
export function materializeReadings(text: string, lookup: ReadingLookup): string {
  return text
    .split(/\r?\n/)
    .map((raw) => {
      const line = raw.trim();
      if (isSkippable(line)) return raw;
      const { word, reading, meaning } = splitLine(line);
      if (reading || !KANJI_RE.test(word)) return raw;
      const found = lookup.get(word);
      if (!found) return raw;
      return meaning ? `${word}|${found}|${meaning}` : `${word}|${found}`;
    })
    .join('\n');
}
