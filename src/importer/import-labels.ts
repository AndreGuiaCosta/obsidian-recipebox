/**
 * The English base import vocabulary, and the resolver that layers a locale and
 * the user's own words on top of it. Every list is literal words; escaping and
 * regex assembly happen in text-recipe-detect.ts.
 */
import { ImportLabels } from "../parser/locales/locale-types";
import { getLocale } from "../parser/locales";
import { stripAccents } from "../parser/phrase-normalise";
import { RecipeBoxSettings } from "../settings/settings-types";

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
/**
 * The vocabulary as configured: locale plus the user's settings words. This is
 * what the import modal pre-fills its section fields from, so what the user
 * sees there is exactly what would be matched if they changed nothing.
 */
export function settingsImportLabels(settings: RecipeBoxSettings): ResolvedImportLabels {
	return resolveImportLabels(settings.recipeLocale, {
		ingredientsSection: parseLabelList(settings.importerIngredientsWords),
		instructionsSection: parseLabelList(settings.importerInstructionsWords),
	});
}

/**
 * A per-import override of the two section lists. Replace rather than append,
 * unlike the settings layer: the modal field is pre-filled with the effective
 * words, so a user who deletes one expects it gone for this import, and
 * appending would quietly hand it back from the locale layer.
 *
 * An empty field falls back to the configured list. Clearing the box has no
 * useful meaning -- no delimiters means the whole paste becomes description --
 * so it is read as "I did not mean to do that" rather than obeyed.
 */
export function withSectionOverrides(
	configured: ResolvedImportLabels,
	ingredientsWords: string,
	instructionsWords: string,
): ResolvedImportLabels {
	const ingredients = parseLabelList(ingredientsWords);
	const instructions = parseLabelList(instructionsWords);
	return {
		...configured,
		ingredientsSection: ingredients.length > 0 ? ingredients : configured.ingredientsSection,
		instructionsSection: instructions.length > 0 ? instructions : configured.instructionsSection,
	};
}

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
