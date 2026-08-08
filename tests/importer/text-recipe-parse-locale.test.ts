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

	it("keeps an unnumbered final step that starts with a time label", () => {
		// "cook" is a cook-time label, so without the separator rule this line
		// looked exactly like "Cook time: 30" and the step disappeared.
		const text = "Pasta\n\nIngredients\n\n- flour\n\nInstructions\n\nMix well.\nCook 30 minutes\n";
		expect(extractRecipeFromText(text).instructionGroups.flatMap((g) => g.items)).toEqual([
			"Mix well.",
			"Cook 30 minutes",
		]);
	});

	it("still trims a bare label and number with nothing after it", () => {
		const text = "Pasta\n\nIngredients\n\n- flour\n\nInstructions\n\nMix well.\nServes 4\n";
		expect(extractRecipeFromText(text).instructionGroups.flatMap((g) => g.items)).toEqual(["Mix well."]);
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

/**
 * Regressions from review. Each of these wrote a wrong number, or a stray
 * heading, into the imported note.
 */
describe("label matching stays on word boundaries", () => {
	it("does not read a stock cube as a calorie count", () => {
		// "caldo" starts with "cal". The alternation had no boundary, so the
		// calories label matched inside the word and [^\d]{0,15} walked forward to
		// the next number in the line.
		const text = [
			"Sopa de legumes", "", "Ingredientes", "",
			"- 1 caldo de carne 500 ml", "- 2 cenouras", "",
			"Preparação", "", "1. Junte tudo e sirva.",
		].join("\n");
		expect(extractRecipeFromText(text, undefined, ptLabels).calories).toBeNull();
	});

	it("does not read 'reserve' as a servings label", () => {
		const text = [
			"Soup", "", "Ingredients", "", "- flour", "",
			"Instructions", "", "1. reserve 2 tablespoons for later.",
		].join("\n");
		expect(extractRecipeFromText(text).servings).toBeNull();
	});

	it("still reads a real label that ends where a word ends", () => {
		const text = [
			"Bolo", "", "Ingredientes", "", "- farinha", "",
			"Preparação", "", "1. Misture.", "", "Calorias: 650", "Doses: 4",
		].join("\n");
		const recipe = extractRecipeFromText(text, undefined, ptLabels);
		expect(recipe.calories).toBe(650);
		expect(recipe.servings).toBe("4");
	});
});

describe("the method heading is not a time label", () => {
	it("does not invent a prep time from the Preparação heading", () => {
		const text = "Bolo\n\nIngredientes\n\n- farinha\n\nPreparação\n\nLeve ao forno 30 minutos.\n";
		expect(extractRecipeFromText(text, undefined, ptLabels).prepTime).toBeNull();
	});

	it("still reads an explicit 'Tempo de preparação'", () => {
		const text = "Bolo\n\nTempo de preparação: 20 minutos\n\nIngredientes\n\n- farinha\n\nPreparação\n\n1. Misture.\n";
		expect(extractRecipeFromText(text, undefined, ptLabels).prepTime).toBe(20);
	});
});

describe("the trailing metadata block leaves nothing behind", () => {
	it("drops the block's own header along with its values", () => {
		const text = [
			"Bolo", "", "Ingredientes", "", "- farinha", "",
			"Preparação", "", "1. Misture tudo.", "2. Leve ao forno.", "",
			"Nutrição:", "Doses: 4", "Calorias: 650",
		].join("\n");
		const recipe = extractRecipeFromText(text, undefined, ptLabels);
		expect(JSON.stringify(recipe.instructionGroups).toLowerCase()).not.toContain("nutri");
		expect(recipe.instructionGroups.flatMap(g => g.items)).toEqual(["Misture tudo.", "Leve ao forno."]);
		// The values themselves are still read as metadata.
		expect(recipe.servings).toBe("4");
		expect(recipe.calories).toBe(650);
	});

	it("leaves a one-word final step alone when no metadata follows it", () => {
		const text = [
			"Bolo", "", "Ingredientes", "", "- farinha", "",
			"Preparação", "", "1. Misture tudo.", "2. Sirva.",
		].join("\n");
		const recipe = extractRecipeFromText(text, undefined, ptLabels);
		expect(recipe.instructionGroups.flatMap(g => g.items)).toEqual(["Misture tudo.", "Sirva."]);
	});
});
