import { describe, it, expect, vi } from "vitest";

// Same reason as note-template-render.test.ts: vault-notes.ts imports the
// `moment` value from "obsidian", which has no runtime JS.
vi.mock("obsidian", () => ({ moment: () => ({ format: () => "" }) }));

import { buildRecipeNote } from "../../src/importer/note-template-render";
import { DEFAULT_SETTINGS } from "../../src/settings/settings-defaults";
import { stripFrontmatter } from "../../src/parser/recipe-frontmatter-strip";
import { splitBodyAroundIngredients } from "../../src/parser/recipe-ingredient-groups";
import { splitBodyAroundInstructions, RECIPEMD_SECTION_LEVEL } from "../../src/parser/recipe-instruction-groups";
import type { ExtractedRecipe } from "../../src/importer/recipe-extract-types";
import type { App } from "obsidian";

const FAKE_APP = {} as App;

function recipe(overrides: Partial<ExtractedRecipe> = {}): ExtractedRecipe {
	return {
		title: "Test Recipe",
		description: "A description.",
		heroImage: "hero.jpg",
		servings: "4",
		prepTime: 10,
		cookTime: 20,
		totalTime: 30,
		ingredientGroups: [{ name: null, items: ["flour", "sugar"] }],
		instructionGroups: [{ name: null, items: ["Mix.", "Bake."] }],
		notesGroups: [],
		sourceUrl: "https://example.com",
		calories: 300,
		protein: 20,
		fat: 10,
		carbs: 40,
		...overrides,
	};
}

/** Reads a rendered note back the way the recipe view does. */
function reparse(note: string) {
	const body = stripFrontmatter(note);
	const ing = splitBodyAroundIngredients(body, DEFAULT_SETTINGS.ingredientsHeading);
	const instr = splitBodyAroundInstructions(ing.after, DEFAULT_SETTINGS.instructionsHeading, ing.isRecipeMd);
	return { isRecipeMd: ing.isRecipeMd, ingredients: ing.groups, instructions: instr.groups, trailing: instr.after };
}

describe("buildRecipeNote with useRecipeMd", () => {
	it("renders fences instead of headings, and reads back as RecipeMD", async () => {
		const note = await buildRecipeNote(FAKE_APP, recipe(), DEFAULT_SETTINGS, true);

		expect(note).not.toContain(`## ${DEFAULT_SETTINGS.ingredientsHeading}`);
		expect(note).not.toContain(`## ${DEFAULT_SETTINGS.instructionsHeading}`);
		expect(note).toContain("# Test Recipe");

		const parsed = reparse(note);
		expect(parsed.isRecipeMd).toBe(true);
		expect(parsed.ingredients).toEqual([{ heading: null, lines: ["- flour", "- sugar"] }]);
		expect(parsed.instructions.flatMap(g => g.steps)).toEqual(["Mix.", "Bake."]);
	});

	it("keeps the same frontmatter as the heading template", async () => {
		const note = await buildRecipeNote(FAKE_APP, recipe(), DEFAULT_SETTINGS, true);
		expect(note).toContain("source: https://example.com");
		expect(note).toContain("servings: 4");
		expect(note).toContain("prep: 10");
		expect(note).toContain(`${DEFAULT_SETTINGS.caloriesProperty}: 300`);
	});

	it("renders step sub-groups deep enough not to end the method", async () => {
		// The template's nearest enclosing heading is the h1 title, so a naive
		// depth+1 would emit level-2 sub-headings -- exactly what the RecipeMD
		// reader treats as the end of the method, which would drop every step.
		const note = await buildRecipeNote(FAKE_APP, recipe({
			instructionGroups: [
				{ name: "Sauce", items: ["Simmer."] },
				{ name: "Assembly", items: ["Plate."] },
			],
		}), DEFAULT_SETTINGS, true);

		const headingDepths = note.split("\n")
			.map(l => l.match(/^(#{1,6})\s+(?:Sauce|Assembly)$/))
			.filter((m): m is RegExpMatchArray => m !== null)
			.map(m => m[1].length);
		expect(headingDepths).toHaveLength(2);
		for (const depth of headingDepths) expect(depth).toBeGreaterThan(RECIPEMD_SECTION_LEVEL);

		const parsed = reparse(note);
		expect(parsed.instructions.map(g => g.heading)).toEqual(["Sauce", "Assembly"]);
		expect(parsed.instructions.flatMap(g => g.steps)).toEqual(["Simmer.", "Plate."]);
	});

	it("puts ingredient sub-groups inside the fenced block", async () => {
		const note = await buildRecipeNote(FAKE_APP, recipe({
			ingredientGroups: [
				{ name: "Dough", items: ["flour"] },
				{ name: "Filling", items: ["sugar"] },
			],
		}), DEFAULT_SETTINGS, true);

		expect(reparse(note).ingredients).toEqual([
			{ heading: "Dough", lines: ["- flour"] },
			{ heading: "Filling", lines: ["- sugar"] },
		]);
	});

	it("keeps a notes section reachable as a trailing section", async () => {
		const note = await buildRecipeNote(FAKE_APP, recipe({
			notesGroups: [{ name: null, items: ["Freezes well."] }],
		}), DEFAULT_SETTINGS, true);

		const parsed = reparse(note);
		expect(parsed.instructions.flatMap(g => g.steps)).toEqual(["Mix.", "Bake."]);
		expect(parsed.trailing).toContain(`## ${DEFAULT_SETTINGS.notesHeading}`);
		expect(parsed.trailing).toContain("Freezes well.");
	});

	it("drops the notes heading when there are no notes, same as the heading template", async () => {
		const note = await buildRecipeNote(FAKE_APP, recipe({ notesGroups: [] }), DEFAULT_SETTINGS, true);
		expect(note).not.toContain(`## ${DEFAULT_SETTINGS.notesHeading}`);
	});

	it("still renders headings when the flag is off", async () => {
		const note = await buildRecipeNote(FAKE_APP, recipe(), DEFAULT_SETTINGS, false);
		expect(note).toContain(`## ${DEFAULT_SETTINGS.ingredientsHeading}`);
		expect(reparse(note).isRecipeMd).toBe(false);
	});
});
