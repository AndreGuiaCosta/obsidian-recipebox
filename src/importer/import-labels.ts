/**
 * The English base import vocabulary, and the resolver that layers a locale and
 * the user's own words on top of it. Every list is literal words; escaping and
 * regex assembly happen in text-recipe-detect.ts.
 */
import { ImportLabels } from "../parser/locales/locale-types";
import { getLocale } from "../parser/locales";
import { stripAccents } from "../parser/phrase-normalise";

/** Every field present, which is what the parser can rely on after resolution. */
export type ResolvedImportLabels = Required<ImportLabels>;

/**
 * These were regex fragments until the vocabulary became configurable. The
 * alternations they used to carry are spelled out: "cook(?:ing)?(?:\s+time)?"
 * is now four entries, and longest-first matching in the compiler makes
 * "cook time" win over a bare "cook".
 */
export const BASE_IMPORT_LABELS: ResolvedImportLabels = {
	ingredientsSection: [
		"ingredient", "ingredients",
		"what you need", "what you'll need", "what you will need",
	],
	instructionsSection: [
		"instruction", "instructions",
		"direction", "directions",
		"method", "methods",
		"step", "steps",
		"how to make", "how to",
		"preparation", "directions and method",
	],
	servings: ["serves", "serve", "serving", "servings", "yield", "yields", "makes", "portions"],
	calories: ["calories", "calorie", "kcal", "cal"],
	protein: ["protein", "proteins"],
	fat: ["fat", "fats", "total fat"],
	carbs: ["carbs", "carb", "carbohydrate", "carbohydrates"],
	prepTime: ["prep time", "preparation time", "prep"],
	cookTime: ["cook time", "cooking time", "cooking", "cook"],
	totalTime: ["total time", "total"],
};

const FIELDS = Object.keys(BASE_IMPORT_LABELS) as (keyof ResolvedImportLabels)[];

/**
 * Splits a settings field into words. Comma-separated rather than
 * newline-separated because these sit on a single-line Setting input, and an
 * empty field has to mean "add nothing" rather than "one empty word" -- an
 * empty string would otherwise compile into a regex that matches everywhere.
 */
export function parseLabelList(raw: string): string[] {
	return raw
		.split(",")
		.map((word) => word.trim())
		.filter((word) => word.length > 0);
}

/**
 * Layers user words over the locale over the English base, in that precedence.
 * All three are concatenated rather than replaced: a Portuguese recipe site
 * still occasionally writes "Ingredients", and dropping the base would trade
 * one broken language for another. Duplicates (after accent folding) are
 * removed so the compiled alternation stays small.
 */
export function resolveImportLabels(
	localeId: string,
	overrides: Partial<Record<keyof ImportLabels, string[]>> = {},
): ResolvedImportLabels {
	const locale = getLocale(localeId);
	const localeLabels = locale?.importLabels ?? {};

	const resolved = {} as ResolvedImportLabels;
	for (const field of FIELDS) {
		const layered = [
			...(overrides[field] ?? []),
			...(localeLabels[field] ?? []),
			...BASE_IMPORT_LABELS[field],
		];
		const seen = new Set<string>();
		resolved[field] = layered.filter((word) => {
			const key = stripAccents(word).trim().replace(/\s+/g, " ");
			if (!key || seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}
	return resolved;
}
