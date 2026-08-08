/**
 * The single spelling rule every vocabulary lookup goes through. Kept apart from
 * the tables it feeds because the matchers, the compilers and the locale contract
 * test all need it and none of them should depend on each other.
 */

const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Lowercase and strip accents, leaving everything else alone. Split out for the
 * importer's loose metadata scan, which runs over free text rather than a single
 * phrase: normalisePhrase below also strips periods, which would turn "1.5 g"
 * into "15 g" and silently multiply the value by ten.
 */
export function stripAccents(text: string): string {
	return text.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

/**
 * Lowercases, strips accents and periods, and collapses whitespace, so "C. Sopa",
 * "c.  sopa" and "c sopa" all reach the same key. Matching is done on whole words
 * rather than character offsets because stripping accents changes string length.
 */
export function normalisePhrase(text: string): string {
	return text
		.normalize("NFD")
		.replace(COMBINING_MARKS, "")
		.toLowerCase()
		.replace(/\./g, "")
		.trim()
		.replace(/\s+/g, " ");
}
