import { describe, it, expect } from "vitest";
import { convertNoteToRecipeMd } from "../../src/recipemd/recipemd-convert";
import { DEFAULT_SETTINGS } from "../../src/settings/settings-defaults";
import { stripFrontmatter } from "../../src/parser/recipe-frontmatter-strip";
import { splitBodyAroundIngredients } from "../../src/parser/recipe-ingredient-groups";
import { splitBodyAroundInstructions } from "../../src/parser/recipe-instruction-groups";

const settings = DEFAULT_SETTINGS;

/**
 * Reads a note back the way the recipe view does. The point of every test here
 * is that this returns the same groups before and after conversion -- a
 * conversion that parses differently has broken the note.
 */
function reparse(content: string, headingIngredients = settings.ingredientsHeading) {
	const body = stripFrontmatter(content);
	const ing = splitBodyAroundIngredients(body, headingIngredients);
	const instr = splitBodyAroundInstructions(ing.after, settings.instructionsHeading, ing.isRecipeMd);
	return { isRecipeMd: ing.isRecipeMd, ingredients: ing.groups, instructions: instr.groups, trailing: instr.after };
}

function convert(raw: string, basename = "Test Recipe") {
	const result = convertNoteToRecipeMd(raw, basename, settings);
	if (result.kind !== "converted") throw new Error(`expected conversion, got ${result.kind}`);
	return result.content;
}

describe("convertNoteToRecipeMd", () => {
	it("round-trips a plain heading note into fenced RecipeMD", () => {
		const raw = [
			"---", "tags: Food", "servings: 4", "---",
			"## Ingredients",
			"- 400 g flour",
			"- 2 eggs",
			"## Instructions",
			"1. Mix.",
			"2. Bake.",
			"",
		].join("\n");

		const before = reparse(raw);
		const out = convert(raw);
		const after = reparse(out);

		expect(before.isRecipeMd).toBe(false);
		expect(after.isRecipeMd).toBe(true);
		expect(after.ingredients).toEqual(before.ingredients);
		expect(after.instructions).toEqual(before.instructions);
	});

	it("keeps the frontmatter block byte-for-byte, comments and key order included", () => {
		const frontmatter = ["---", "# hand-written note", "tags: Food", "servings: 4", "allergens:", "---"].join("\n");
		const raw = `${frontmatter}\n## Ingredients\n- flour\n## Instructions\n1. Mix.\n`;
		expect(convert(raw).startsWith(`${frontmatter}\n`)).toBe(true);
	});

	it("adds the h1 title RecipeMD expects, and does not add a second one", () => {
		const raw = "## Ingredients\n- flour\n## Instructions\n1. Mix.\n";
		expect(convert(raw, "Bolo de Cenoura")).toContain("# Bolo de Cenoura");

		const withTitle = "# Existing Title\n\n## Ingredients\n- flour\n## Instructions\n1. Mix.\n";
		const out = convert(withTitle, "Different Basename");
		expect(out).toContain("# Existing Title");
		expect(out).not.toContain("Different Basename");
	});

	it("preserves description text and ingredient sub-group headings", () => {
		const raw = [
			"Some intro prose.",
			"",
			"## Ingredients",
			"### Dough",
			"- flour",
			"### Filling",
			"- sugar",
			"## Instructions",
			"1. Mix.",
			"",
		].join("\n");

		const out = convert(raw);
		expect(out).toContain("Some intro prose.");
		expect(reparse(out).ingredients).toEqual([
			{ heading: "Dough", lines: ["- flour"] },
			{ heading: "Filling", lines: ["- sugar"] },
		]);
	});

	it("keeps non-list lines inside the ingredients block instead of dropping them", () => {
		// The group parser only keeps list items, so a rewrite driven by parsed
		// groups would silently delete this line out of the user's note.
		const raw = "## Ingredients\n- flour\n(use the good stuff)\n## Instructions\n1. Mix.\n";
		expect(convert(raw)).toContain("(use the good stuff)");
	});

	it("pushes method sub-headings deeper so they do not truncate the recipe", () => {
		// `# Instructions` with `## Sauce` under it is valid heading-style, but
		// once fenced, a level-2 heading reads as the end of the method.
		const raw = [
			"# Instructions",
			"## Sauce",
			"1. Simmer.",
			"## Assembly",
			"2. Plate.",
			"",
		].join("\n");
		const full = `## Ingredients\n- flour\n${raw}`;

		const out = convert(full);
		const after = reparse(out);
		expect(after.instructions.map(g => g.heading)).toEqual(["Sauce", "Assembly"]);
		expect(after.instructions.flatMap(g => g.steps)).toEqual(["Simmer.", "Plate."]);
	});

	it("preserves the relative nesting of method sub-headings when shifting them", () => {
		const raw = [
			"## Ingredients", "- flour",
			"# Instructions",
			"## Sauce",
			"1. Simmer.",
			"### Reduction",
			"2. Reduce.",
			"## Assembly",
			"3. Plate.",
			"",
		].join("\n");

		const out = convert(raw);
		const depths = out.split("\n")
			.map(l => l.match(/^(#{1,6})\s+(Sauce|Reduction|Assembly)$/))
			.filter((m): m is RegExpMatchArray => m !== null)
			.map(m => [m[2], m[1].length] as const);

		// Every level shifts by the same amount, so Reduction stays one deeper
		// than Sauce rather than being flattened onto it.
		expect(depths).toEqual([["Sauce", 3], ["Reduction", 4], ["Assembly", 3]]);
	});

	it("refuses rather than flatten method sub-headings that cannot all shift", () => {
		// Shallowest sub-heading is h2, so everything shifts by 1 -- but that
		// would push the h6 to h7, and clamping it back to h6 would flatten it
		// onto the level the h5 just moved to.
		const raw = [
			"## Ingredients", "- flour",
			"# Instructions",
			"## Sauce",
			"1. Simmer.",
			"##### Deep",
			"2. Stir.",
			"###### Deeper",
			"3. Wait.",
			"",
		].join("\n");

		const result = convertNoteToRecipeMd(raw, "Test Recipe", settings);
		expect(result.kind).toBe("unconvertible");
	});

	it("refuses a fenced note with no frontmatter rather than eat its ingredients", () => {
		// Obsidian itself would read this leading `---` as frontmatter, so the
		// note is genuinely ambiguous. What matters is that nothing is silently
		// destroyed.
		const raw = "---\n- flour\n---\n1. Mix.\n";
		const result = convertNoteToRecipeMd(raw, "Test Recipe", settings);
		expect(result.kind).toBe("unconvertible");
	});

	it("leaves trailing sections after the method as trailing sections", () => {
		const raw = [
			"## Ingredients", "- flour",
			"## Instructions", "1. Mix.",
			"## Notes", "Rest the dough overnight.",
			"## Cook History", "- 2026-08-01",
			"",
		].join("\n");

		const after = reparse(convert(raw));
		expect(after.instructions.flatMap(g => g.steps)).toEqual(["Mix."]);
		expect(after.trailing).toContain("## Notes");
		expect(after.trailing).toContain("Rest the dough overnight.");
		expect(after.trailing).toContain("## Cook History");
	});

	it("reports an already-fenced note instead of converting it twice", () => {
		const raw = "---\ntags: Food\n---\n# Title\n\n---\n\n- flour\n\n---\n\n1. Mix.\n";
		expect(convertNoteToRecipeMd(raw, "Title", settings).kind).toBe("already-recipemd");
	});

	it("is idempotent: converting its own output changes nothing", () => {
		const raw = "## Ingredients\n- flour\n## Instructions\n1. Mix.\n";
		const once = convert(raw);
		expect(convertNoteToRecipeMd(once, "Test Recipe", settings).kind).toBe("already-recipemd");
	});

	it("refuses rather than emit a note whose fences would be misread", () => {
		const raw = "Intro\n\n---\n\nMore intro.\n\n## Ingredients\n- flour\n## Instructions\n1. Mix.\n";
		const result = convertNoteToRecipeMd(raw, "Test Recipe", settings);
		expect(result.kind).toBe("unconvertible");
	});

	it("refuses a note with no ingredients heading", () => {
		const result = convertNoteToRecipeMd("Just prose.\n", "Test Recipe", settings);
		expect(result).toEqual({ kind: "unconvertible", reason: 'No "Ingredients" heading to convert.' });
	});

	it("handles an ingredients-only note by emitting an empty method", () => {
		const raw = "## Ingredients\n- flour\n- sugar\n";
		const after = reparse(convert(raw));
		expect(after.isRecipeMd).toBe(true);
		expect(after.ingredients).toEqual([{ heading: null, lines: ["- flour", "- sugar"] }]);
	});

	it("converts a note whose headings are the configured non-English ones", () => {
		const ptSettings = { ...DEFAULT_SETTINGS, ingredientsHeading: "Ingredientes", instructionsHeading: "Instruções" };
		const raw = "## Ingredientes\n- 400 g de grão\n- Sal q.b.\n## Instruções\n1. Cozinhe.\n";

		const result = convertNoteToRecipeMd(raw, "Medalhões", ptSettings);
		expect(result.kind).toBe("converted");
		if (result.kind !== "converted") return;

		// Reads back through the RecipeMD path, which needs no heading names at all.
		const after = reparse(result.content, "Ingredientes");
		expect(after.isRecipeMd).toBe(true);
		expect(after.ingredients).toEqual([{ heading: null, lines: ["- 400 g de grão", "- Sal q.b."] }]);
		expect(after.instructions.flatMap(g => g.steps)).toEqual(["Cozinhe."]);
	});
});
