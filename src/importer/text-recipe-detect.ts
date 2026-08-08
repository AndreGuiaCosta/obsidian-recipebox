/**
 * Recognises section headings and loose metadata labels in free-form recipe
 * text, driven by a resolved import vocabulary rather than fixed English.
 *
 * Sections match by set membership on a normalised line, not by regex. The line
 * is a whole heading, so exact comparison is both cheaper and stricter than an
 * anchored alternation, and it removes the escaping question entirely for the
 * half of the vocabulary users are most likely to edit.
 */
import { ResolvedImportLabels } from "./import-labels";
import { stripAccents } from "../parser/phrase-normalise";

const HEADING_PREFIX_RE = /^#{1,6}\s+/;
const TRAILING_COLON_RE = /\s*:+\s*$/;
const CURLY_APOSTROPHES = /[‘’ʼ]/g;
const REGEX_METACHARS = /[.*+?^${}()|[\]\\]/g;

/**
 * The one spelling rule both sides of a section comparison go through. Curly
 * apostrophes are folded to straight ones because "What You’ll Need" pasted
 * from a site would otherwise miss a vocabulary holding "what you'll need".
 */
function normaliseSectionLine(line: string): string {
	return stripAccents(
		line
			.trim()
			.replace(HEADING_PREFIX_RE, "")
			.replace(TRAILING_COLON_RE, "")
			.replace(CURLY_APOSTROPHES, "'"),
	)
		.trim()
		.replace(/\s+/g, " ");
}

export interface SectionMatcher {
	isIngredients(line: string): boolean;
	isInstructions(line: string): boolean;
	/** Either boundary, used when picking a title so a heading is never taken for one. */
	isSectionKeyword(line: string): boolean;
}

export function createSectionMatcher(labels: ResolvedImportLabels): SectionMatcher {
	const ingredients = new Set(labels.ingredientsSection.map(normaliseSectionLine));
	const instructions = new Set(labels.instructionsSection.map(normaliseSectionLine));

	const isIngredients = (line: string): boolean => ingredients.has(normaliseSectionLine(line));
	const isInstructions = (line: string): boolean => instructions.has(normaliseSectionLine(line));

	return {
		isIngredients,
		isInstructions,
		isSectionKeyword: (line) => isIngredients(line) || isInstructions(line),
	};
}

/**
 * Builds the label alternation for a loose-metadata scan. Sorted longest-first
 * so "cook time" is preferred over "cook": regex alternation is first-match, not
 * longest-match, so a short entry listed earlier would otherwise win and leave
 * the rest of the label to be eaten by the following [^\d]{0,N} gap.
 */
export function buildLabelAlternation(words: readonly string[]): string {
	return [...words]
		.sort((a, b) => b.length - a.length)
		.map((word) => stripAccents(word).replace(REGEX_METACHARS, "\\$&"))
		.join("|");
}

/**
 * The alternation with word boundaries, for the loose scans that hunt a label
 * anywhere in the text. Without these a label matched inside a longer word:
 * "caldo de carne 500 ml" hit the "cal" calories label and imported a stock
 * cube as 500 calories, and "reserve 2 tablespoons" hit "serve" and set the
 * servings. Requires the /u flag at the call site.
 *
 * Deliberately not \b, on two counts. \b is defined on ASCII word characters,
 * so it breaks in the middle of an accented word. And a trailing \b never fires
 * after a label that ends in a period, which the locale tables are free to
 * contain ("q.b." is an established form elsewhere in this codebase). An
 * explicit leading class plus a lookahead behaves correctly for both.
 */
export function buildLabelPattern(words: readonly string[]): string {
	return `(?:^|[^\\p{L}\\d])(?:${buildLabelAlternation(words)})(?![\\p{L}\\d])`;
}
