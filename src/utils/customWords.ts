/**
 * customWords.ts — parses a user's free-form custom word list.
 *
 * One word per line:
 *   猫|ねこ|cat          word | reading | meaning (meaning optional)
 *   猫 ねこ cat          spaces work too when no | / tab / comma is used
 *   ありがとう           kana-only words don't need a reading
 *   # comment            ignored
 */
import type { WordItem } from '../types/typing';
import { unsupportedChars } from './romajiEngine.ts';

export interface CustomParseIssue {
  line: number;
  text: string;
  message: string;
}

export interface CustomParseResult {
  words: WordItem[];
  issues: CustomParseIssue[];
}

const EXPLICIT_SEPARATOR = /[|｜\t,]/;
const KANJI = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff々〆]/;
const WHITESPACE = /\s/;

export function parseCustomWords(text: string): CustomParseResult {
  const words: WordItem[] = [];
  const issues: CustomParseIssue[] = [];
  const seen = new Set<string>();

  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const issue = (message: string) => issues.push({ line: idx + 1, text: line, message });

    let parts: string[];
    let meaning: string;
    if (EXPLICIT_SEPARATOR.test(line)) {
      parts = line.split(EXPLICIT_SEPARATOR).map((p) => p.trim());
      meaning = parts.slice(2).filter(Boolean).join(', ');
    } else {
      parts = line.split(/\s+/);
      meaning = parts.slice(2).join(' ');
    }

    const word = parts[0] ?? '';
    const hasReading = !!parts[1];
    const reading = hasReading ? parts[1] : word;

    if (!word) return issue('missing word');
    if (WHITESPACE.test(word) || WHITESPACE.test(reading)) return issue('no spaces inside a word or reading');
    if (KANJI.test(reading)) {
      return issue(hasReading ? 'reading must be kana, not kanji' : 'kanji need a reading — write it as 漢字|かんじ');
    }
    const bad = unsupportedChars(reading);
    if (bad.length) return issue(`can't be typed: ${bad.join(' ')}`);

    const key = `${word}\u0000${reading}`;
    if (seen.has(key)) return;
    seen.add(key);
    words.push({ id: `c${words.length}`, text: word, reading, meaning });
  });

  return { words, issues };
}
