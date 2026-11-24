/**
 * Alien Field Notes — entry 1.
 *
 * A field-notes composer for the make.fun bounty "Alien Field Notes:
 * The Two Day Earth Review". It reads the alien tourist's one-line
 * review of planet Earth from line.txt, checks it against the
 * competition gate (UTF-8 text, 1-200 characters, a single line, not
 * only whitespace), and writes it byte-for-byte to /output/entry.txt
 * (or $MAKEFUN_OUTPUT_DIR/entry.txt when the harness sets it).
 *
 * The review itself is a plain-text verdict from a visitor who stayed
 * two days: the planet is beautiful, the onboarding is terrible.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Gate constants — sealed by the bounty rules.
// ---------------------------------------------------------------------------

/** Maximum length of the review, in Unicode code points. */
const MAX_CHARS = 200;
/** Minimum length of the review, in Unicode code points. */
const MIN_CHARS = 1;
/** The review must be one line: no line breaks of either flavour. */
const FORBIDDEN_BREAKS = ["\n", "\r"];

/** Words that mark the line as a tourist review, not a stray sentence. */
const REVIEW_MARKERS = [
  "stars",
  "would",
  "planet",
  "earth",
  "review",
  "visit",
  "again",
  "never",
];

// ---------------------------------------------------------------------------
// Small helpers — each one does a single check so the failure message
// names the exact rule that broke, instead of a generic "invalid".
// ---------------------------------------------------------------------------

/**
 * Count characters the way the gate does: Unicode code points, so an
 * emoji or an accented letter counts once, not once per UTF-16 unit.
 */
function countChars(text: string): number {
  return Array.from(text).length;
}

/** True when the text is empty or holds only whitespace. */
function isBlank(text: string): boolean {
  return text.trim().length === 0;
}

/** True when the text holds a line break anywhere. */
function hasLineBreak(text: string): boolean {
  return FORBIDDEN_BREAKS.some((mark) => text.includes(mark));
}

/**
 * Pull the star rating out of a review, e.g. "3/5" -> 3.
 * Returns null when the line carries no "N/5" rating at all.
 */
function extractRating(text: string): number | null {
  const match = text.match(/([1-5])\/5/);
  if (match === null) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

/**
 * Score how strongly the line reads like a tourist review: one point
 * per review marker present, capped by the number of markers. This is
 * only a sanity check for the author — the judge does the real scoring.
 */
function reviewVoiceScore(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const marker of REVIEW_MARKERS) {
    if (lower.includes(marker)) {
      score += 1;
    }
  }
  return score;
}

/**
 * Split the line into sentences on ". " boundaries, keeping the final
 * punctuation. A tight one-liner has few sentences; a ramble has many.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** Words that mark a closing remark as a verdict, not a trailing fact. */
const VERDICT_MARKERS = ["would", "never", "again", "stars", "return", "stay"];

/**
 * The last sentence is where the punch has to land. Return it, and
 * whether it carries a verdict marker — a review whose ending is just
 * another observation reads unfinished to a judge.
 */
function closingRemark(text: string): { remark: string; hasVerdict: boolean } {
  const sentences = splitSentences(text);
  const remark = sentences.length > 0 ? sentences[sentences.length - 1] : "";
  const lower = remark.toLowerCase();
  return {
    remark,
    hasVerdict: VERDICT_MARKERS.some((marker) => lower.includes(marker)),
  };
}

/** Count the words in the line (whitespace separated). */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
}

/**
 * Check the line against every gate rule and return the list of
 * problems found. An empty list means the line passes the gate.
 */
function validateLine(line: string): string[] {
  const problems: string[] = [];
  const chars = countChars(line);

  if (chars < MIN_CHARS || chars > MAX_CHARS) {
    problems.push(
      `length must be ${MIN_CHARS}-${MAX_CHARS} characters, got ${chars}`,
    );
  }
  if (isBlank(line)) {
    problems.push("line must not be only whitespace");
  }
  if (hasLineBreak(line)) {
    problems.push("line must be exactly one line (no line breaks)");
  }
  // A review with no verdict at all would read like a stray sentence.
  if (extractRating(line) === null && reviewVoiceScore(line) < 1) {
    problems.push("line carries no rating and no review wording");
  }
  // The punch must land at the end: the closing sentence needs a verdict.
  if (!closingRemark(line).hasVerdict) {
    problems.push("closing sentence carries no verdict (would/never/again)");
  }
  return problems;
}

/** Resolve the output file: the harness dir wins, else /output/entry.txt. */
function resolveOutputPath(): string {
  const dir = process.env.MAKEFUN_OUTPUT_DIR;
  if (dir !== undefined && dir.length > 0) {
    return dir.endsWith(".txt") ? dir : join(dir, "entry.txt");
  }
  return "/output/entry.txt";
}

// ---------------------------------------------------------------------------
// Main flow.
// ---------------------------------------------------------------------------

function main(): void {
  // Read the chosen line exactly as stored (no trailing newline in line.txt).
  const raw = readFileSync("line.txt");

  // The file must be valid UTF-8 — a broken byte would fail the gate.
  const line = raw.toString("utf8");

  const problems = validateLine(line);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`gate failed: ${problem}`);
    }
    process.exit(1);
  }

  const chars = countChars(line);
  const words = countWords(line);
  const sentences = splitSentences(line);
  const rating = extractRating(line);
  const voice = reviewVoiceScore(line);
  const closing = closingRemark(line);

  const outPath = resolveOutputPath();

  // The output directory may not exist yet (fresh sandbox, fresh folder).
  mkdirSync(dirname(outPath), { recursive: true });

  // Write byte-for-byte: the exact bytes of line.txt, nothing added.
  writeFileSync(outPath, raw);

  console.log(`review: ${line}`);
  console.log(`chars: ${chars} (max ${MAX_CHARS})`);
  console.log(`words: ${words}, sentences: ${sentences.length}`);
  console.log(`rating: ${rating === null ? "none" : `${rating}/5`}`);
  console.log(`review-voice markers: ${voice}/${REVIEW_MARKERS.length}`);
  console.log(`closing remark: "${closing.remark}" (verdict: ${closing.hasVerdict})`);
  console.log(`wrote ${chars} characters to ${outPath}`);
}

main();
