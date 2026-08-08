import { describe, it, expect } from "vitest";
import { createSectionMatcher, buildLabelAlternation } from "../../src/importer/text-recipe-detect";
import { BASE_IMPORT_LABELS, resolveImportLabels } from "../../src/importer/import-labels";

const en = createSectionMatcher(BASE_IMPORT_LABELS);
const pt = createSectionMatcher(resolveImportLabels("pt-PT"));

describe("createSectionMatcher", () => {
	it("matches common English ingredients spellings", () => {
		expect(en.isIngredients("Ingredients")).toBe(true);
		expect(en.isIngredients("Ingredient:")).toBe(true);
		expect(en.isIngredients("What You'll Need")).toBe(true);
		expect(en.isIngredients("## Ingredients")).toBe(true);
	});

	it("matches common English instructions spellings", () => {
		expect(en.isInstructions("Instructions")).toBe(true);
		expect(en.isInstructions("Directions")).toBe(true);
		expect(en.isInstructions("Method")).toBe(true);
		expect(en.isInstructions("Steps:")).toBe(true);
		expect(en.isInstructions("How to Make")).toBe(true);
	});

	it("does not match an unrelated line", () => {
		expect(en.isIngredients("2 cups flour")).toBe(false);
		expect(en.isSectionKeyword("Mix everything together.")).toBe(false);
	});

	// The whole point of the vocabulary work: these all failed before it.
	it("matches Portuguese headings under the pt-PT locale", () => {
		expect(pt.isIngredients("Ingredientes")).toBe(true);
		expect(pt.isInstructions("Preparação")).toBe(true);
		expect(pt.isInstructions("Modo de preparação")).toBe(true);
		expect(pt.isInstructions("## Confeção")).toBe(true);
	});

	it("folds accents and case, so one spelling in the table covers both", () => {
		expect(pt.isInstructions("PREPARACAO")).toBe(true);
		expect(pt.isInstructions("preparacao")).toBe(true);
	});

	it("folds curly apostrophes, which is how sites actually write them", () => {
		expect(en.isIngredients("What You’ll Need")).toBe(true);
	});

	it("keeps English working under a non-English locale", () => {
		// Portuguese sites still publish the occasional English heading, so the
		// base layer is concatenated rather than replaced.
		expect(pt.isIngredients("Ingredients")).toBe(true);
	});

	it("treats a section keyword as either boundary", () => {
		expect(en.isSectionKeyword("Ingredients")).toBe(true);
		expect(en.isSectionKeyword("Directions")).toBe(true);
	});
});

describe("buildLabelAlternation", () => {
	it("sorts longest-first so a prefix does not shadow a longer label", () => {
		// "cook" before "cook time" would match first and leave "time" to be eaten
		// by the gap pattern, so the wrong number could be captured.
		expect(buildLabelAlternation(["cook", "cook time"])).toBe("cook time|cook");
	});

	it("escapes regex metacharacters instead of letting them compile", () => {
		const alternation = buildLabelAlternation(["c. (approx)"]);
		expect(() => new RegExp(alternation)).not.toThrow();
		expect(new RegExp(alternation).test("c. (approx)")).toBe(true);
	});

	it("strips accents so the pattern matches accent-folded scan text", () => {
		expect(buildLabelAlternation(["proteína"])).toBe("proteina");
	});
});
