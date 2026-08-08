import { describe, it, expect } from "vitest";
import { extractRecipeFromText } from "../../src/importer/text-recipe-parse";
import { resolveImportLabels } from "../../src/importer/import-labels";

const PT_TEXT = `Carbonara

Ingredientes

- 200g presunto em cubos
- 2 ovos inteiros
- 400g queijo pecorino ralado

Preparação

1. Deixe caramelizar o presunto.
2. Coza a massa.

Doses: 4
Calorias: 650
Proteína: 32 g
Hidratos de carbono: 70 g
`;

const ptLabels = resolveImportLabels("pt-PT");

describe("pasted Portuguese recipe", () => {
	// Before the locale vocabulary this whole file was the regression: no section
	// matched, so foundAnySection stayed false, the body collapsed into the
	// description, and every figure below came back null.
	it("splits ingredients from the method", () => {
		const recipe = extractRecipeFromText(PT_TEXT, undefined, ptLabels);

		// Bullet markers are kept on ingredient lines and stripped from steps --
		// existing buildIngredientGroups/buildInstructionGroups behaviour, not
		// something the locale change alters.
		expect(recipe.ingredientGroups.flatMap((g) => g.items)).toEqual([
			"- 200g presunto em cubos",
			"- 2 ovos inteiros",
			"- 400g queijo pecorino ralado",
		]);
		expect(recipe.instructionGroups.flatMap((g) => g.items)).toEqual([
			"Deixe caramelizar o presunto.",
			"Coza a massa.",
		]);
	});

	it("reads the Portuguese metadata labels", () => {
		const recipe = extractRecipeFromText(PT_TEXT, undefined, ptLabels);

		expect(recipe.servings).toBe("4");
		expect(recipe.calories).toBe(650);
		expect(recipe.protein).toBe(32);
		expect(recipe.carbs).toBe(70);
	});

	it("still collapses to a description without the locale, which is the old behaviour", () => {
		// Guards the default: English labels over Portuguese text must not start
		// half-matching and produce a worse result than no match at all.
		const recipe = extractRecipeFromText(PT_TEXT);

		expect(recipe.ingredientGroups).toEqual([]);
		expect(recipe.instructionGroups).toEqual([]);
		expect(recipe.description).toContain("Ingredientes");
	});
});

describe("trailing metadata after the last step", () => {
	it("keeps a nutrition block out of the method", () => {
		const recipe = extractRecipeFromText(PT_TEXT, undefined, ptLabels);

		expect(recipe.instructionGroups.flatMap((g) => g.items)).toEqual([
			"Deixe caramelizar o presunto.",
			"Coza a massa.",
		]);
	});

	it("does the same in English, where the bug also existed", () => {
		const text = "Pasta\n\nIngredients\n\n- flour\n\nInstructions\n\n1. Mix.\n\nServes: 4\nCalories: 650\n";
		expect(extractRecipeFromText(text).instructionGroups.flatMap((g) => g.items)).toEqual(["Mix."]);
	});

	it("does not eat a final step that happens to contain a number", () => {
		const text = "Pasta\n\nIngredients\n\n- flour\n\nInstructions\n\n1. Mix.\n2. Bake for 30 minutes.\n";
		expect(extractRecipeFromText(text).instructionGroups.flatMap((g) => g.items)).toEqual([
			"Mix.",
			"Bake for 30 minutes.",
		]);
	});

	it("stops at the first non-metadata line rather than filtering throughout", () => {
		// A stray "Serves 4" mid-method stays put: only a trailing run is trimmed,
		// so the step after it protects everything above.
		const text = "Pasta\n\nIngredients\n\n- flour\n\nInstructions\n\n1. Serves 4\n2. Stir well.\n";
		expect(extractRecipeFromText(text).instructionGroups.flatMap((g) => g.items)).toEqual([
			"Serves 4",
			"Stir well.",
		]);
	});
});

describe("locale layering", () => {
	it("keeps English headings working under pt-PT", () => {
		const mixed = "Bolo\n\nIngredients\n\n- 200g farinha\n\nPreparação\n\n1. Misture.\n";
		const recipe = extractRecipeFromText(mixed, undefined, ptLabels);

		expect(recipe.ingredientGroups.flatMap((g) => g.items)).toEqual(["- 200g farinha"]);
		expect(recipe.instructionGroups.flatMap((g) => g.items)).toEqual(["Misture."]);
	});

	it("does not let a decimal be mangled by accent folding", () => {
		// stripAccents is used rather than normalisePhrase precisely because the
		// latter strips periods, which would read 1.5 hours as 15.
		const text = "Bolo\n\nIngredientes\n\n- farinha\n\nPreparação\n\n1. Misture.\n\nTempo total: 1.5 horas\n";
		expect(extractRecipeFromText(text, undefined, ptLabels).totalTime).toBe(90);
	});
});
