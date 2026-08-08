import { describe, it, expect } from "vitest";
import {
	BASE_IMPORT_LABELS,
	parseLabelList,
	resolveImportLabels,
	settingsImportLabels,
	withSectionOverrides,
} from "../../src/importer/import-labels";
import { DEFAULT_SETTINGS } from "../../src/settings/settings-defaults";

describe("parseLabelList", () => {
	it("splits on commas and trims", () => {
		expect(parseLabelList(" ingredientes , o que precisa ")).toEqual(["ingredientes", "o que precisa"]);
	});

	it("drops empty entries", () => {
		// An empty word compiles into an alternation branch matching everywhere,
		// so a trailing comma must not survive into the vocabulary.
		expect(parseLabelList("ingredientes,,")).toEqual(["ingredientes"]);
		expect(parseLabelList("   ")).toEqual([]);
	});
});

describe("resolveImportLabels", () => {
	it("falls back to the base vocabulary for an unknown locale", () => {
		expect(resolveImportLabels("xx-XX")).toEqual(BASE_IMPORT_LABELS);
	});

	it("layers user words ahead of locale ahead of base", () => {
		const resolved = resolveImportLabels("pt-PT", { ingredientsSection: ["lista de compras"] });

		expect(resolved.ingredientsSection[0]).toBe("lista de compras");
		expect(resolved.ingredientsSection).toContain("ingredientes");
		expect(resolved.ingredientsSection).toContain("ingredients");
	});

	it("removes duplicates that differ only by accent", () => {
		const resolved = resolveImportLabels("pt-PT", { instructionsSection: ["preparacao"] });
		const folded = resolved.instructionsSection.filter((w) => w === "preparacao" || w === "preparação");

		expect(folded).toHaveLength(1);
	});

	it("fills every field even when the locale supplies none", () => {
		const resolved = resolveImportLabels("en");
		for (const [field, words] of Object.entries(resolved)) {
			expect(words.length, `${field} is empty`).toBeGreaterThan(0);
		}
	});
});

describe("settingsImportLabels", () => {
	it("adds the settings words without losing the locale's own", () => {
		const settings = {
			...DEFAULT_SETTINGS,
			recipeLocale: "pt-PT",
			importerInstructionsWords: "vamos cozinhar",
		};
		const resolved = settingsImportLabels(settings);

		expect(resolved.instructionsSection).toContain("vamos cozinhar");
		expect(resolved.instructionsSection).toContain("preparação");
	});
});

describe("withSectionOverrides", () => {
	const configured = resolveImportLabels("pt-PT");

	it("replaces rather than appends, so a deleted word stays deleted", () => {
		// The modal pre-fills with the effective list, so appending would hand
		// back anything the user removed and make the field look broken.
		const result = withSectionOverrides(configured, "só isto", "");

		expect(result.ingredientsSection).toEqual(["só isto"]);
		expect(result.ingredientsSection).not.toContain("ingredientes");
	});

	it("falls back to the configured list when a field is cleared", () => {
		const result = withSectionOverrides(configured, "", "");

		expect(result.ingredientsSection).toEqual(configured.ingredientsSection);
		expect(result.instructionsSection).toEqual(configured.instructionsSection);
	});

	it("leaves the metadata labels alone", () => {
		const result = withSectionOverrides(configured, "abc", "def");

		expect(result.calories).toEqual(configured.calories);
		expect(result.servings).toEqual(configured.servings);
	});
});
