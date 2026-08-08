/**
 * Renders the final Markdown note for an imported recipe by substituting token
 * placeholders in a user-supplied or built-in template string.
 *
 * Token values are produced by note-template-tokens.ts; this file handles
 * grouped content (ingredients, instructions) and heading-depth detection.
 */
import { App } from "obsidian";
import { ExtractedRecipe, ImportedGroup } from "./recipe-extract-types";
import { RecipeBoxSettings } from "../settings/settings-types";
import { buildTokenTable } from "./note-template-tokens";
import { readNoteOrEmpty } from "../utils/vault-notes";

const DEFAULT_TEMPLATE = `---
{{recipeTypePropertyName}}: {{recipeType}}
image: {{image}}
source: {{sourceUrl}}
servings: {{servings}}
prep: {{prepTime}}
cook: {{cookTime}}
total: {{totalTime}}
{{caloriesProperty}}: {{calories}}
{{proteinProperty}}: {{protein}}
{{fatProperty}}: {{fat}}
{{carbsProperty}}: {{carbs}}
{{allergensProperty}}:
---

{{description}}

## {{ingredientsHeading}}

{{ingredients}}

## {{instructionsHeading}}

{{instructions}}

## {{notesHeading}}

{{notes}}
`;

// RecipeMD separates title, ingredients and method with thematic breaks instead
// of headings (https://recipemd.org/). Same frontmatter and the same trailing
// notes section -- the spec has no element for notes, but a section-level
// heading ends the method in this plugin's reader, so it survives the round
// trip. The blank line above each fence is load-bearing: a `---` directly under
// a text line is a setext heading, not a break.
const RECIPEMD_TEMPLATE = `---
{{recipeTypePropertyName}}: {{recipeType}}
image: {{image}}
source: {{sourceUrl}}
servings: {{servings}}
prep: {{prepTime}}
cook: {{cookTime}}
total: {{totalTime}}
{{caloriesProperty}}: {{calories}}
{{proteinProperty}}: {{protein}}
{{fatProperty}}: {{fat}}
{{carbsProperty}}: {{carbs}}
{{allergensProperty}}:
---

# {{title}}

{{description}}

---

{{ingredients}}

---

{{instructions}}

## {{notesHeading}}

{{notes}}
`;

const MAX_HEADING_DEPTH = 6;
// Matches recipemd-sections.ts's fence pattern.
const THEMATIC_BREAK = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
// One deeper than RECIPEMD_SECTION_LEVEL. Kept as a literal rather than an
// import so this file stays free of parser dependencies; the test asserts they
// agree.
const RECIPEMD_SUB_GROUP_DEPTH = 3;

/**
 * Heading depth for sub-group headings rendered at `tokenPos`, read off the
 * template's own structure by walking back to whatever encloses the token.
 *
 * A thematic break encountered before any heading means the token sits inside a
 * RecipeMD block, where the enclosing heading is the h1 title -- following it
 * would emit level-2 sub-headings, and level 2 is exactly what the RecipeMD
 * reader treats as the end of the method. So a fence pins the depth instead of
 * the title's depth + 1.
 */
function subGroupHeadingPrefix(template: string, tokenPos: number): string {
	const before = template.slice(0, tokenPos);
	const lines = before.split("\n").reverse();
	for (const line of lines) {
		if (THEMATIC_BREAK.test(line)) return "#".repeat(RECIPEMD_SUB_GROUP_DEPTH);
		const m = line.match(/^(#{1,6})\s/);
		if (m) {
			const depth = Math.min(m[1].length + 1, MAX_HEADING_DEPTH);
			return "#".repeat(depth);
		}
	}
	return "###";
}

function flattenIngredients(groups: ImportedGroup[], subPrefix: string): string {
	const lines: string[] = [];
	for (const group of groups) {
		if (group.name !== null) lines.push(`${subPrefix} ${group.name}`);
		for (const item of group.items) lines.push(`- ${item}`);
	}
	return lines.join("\n");
}

function flattenInstructions(groups: ImportedGroup[], subPrefix: string): string {
	const lines: string[] = [];
	let stepNum = 1;
	for (const group of groups) {
		if (group.name !== null) lines.push(`${subPrefix} ${group.name}`);
		for (const step of group.items) {
			lines.push(`${stepNum}. ${step}`);
			stepNum++;
		}
	}
	return lines.join("\n");
}

function renderTemplate(template: string, recipe: ExtractedRecipe, tokens: Record<string, string>): string {
	let result = template;

	// Render grouped content tokens with heading-depth detection
	for (const [tokenName, groups] of [
		["ingredients", recipe.ingredientGroups],
		["instructions", recipe.instructionGroups],
		["notes", recipe.notesGroups],
	] as [string, ImportedGroup[]][]) {
		const placeholder = `{{${tokenName}}}`;
		const pos = result.indexOf(placeholder);
		if (pos < 0) continue;
		const subPrefix = subGroupHeadingPrefix(result, pos);
		// Notes reuse the same flat bullet-list rendering as ingredients --
		// there's no inherent order to notes the way there is to steps, so the
		// numbered-list treatment (flattenInstructions) wouldn't fit.
		const rendered =
			tokenName === "instructions"
				? flattenInstructions(groups, subPrefix)
				: flattenIngredients(groups, subPrefix);

		if (tokenName === "notes" && rendered.trim() === "") {
			// Notes are optional and frequently absent -- unlike ingredients/
			// instructions, leaving a bare "## Notes" heading with nothing under
			// it would just be clutter on every recipe that doesn't have any.
			// Remove the whole heading-through-placeholder block instead of
			// substituting an empty string in place of the placeholder alone.
			const before = result.slice(0, pos);
			const headingLineStart = before.lastIndexOf("\n#");
			// +1 skips the leading \n so the cut starts at the '#' itself; if no
			// heading line is found above the placeholder (a custom template
			// without one), fall back to cutting from the placeholder itself.
			const cutFrom = headingLineStart >= 0 ? headingLineStart + 1 : pos;
			let cutTo = pos + placeholder.length;
			// Also consume one trailing newline so removing the block doesn't
			// leave a stray blank line where it used to sit.
			if (result[cutTo] === "\n") cutTo++;
			result = result.slice(0, cutFrom) + result.slice(cutTo);
			continue;
		}

		result = result.slice(0, pos) + rendered + result.slice(pos + placeholder.length);
	}

	// Render all remaining scalar tokens
	for (const [key, value] of Object.entries(tokens)) {
		result = result.split(`{{${key}}}`).join(value);
	}

	return result;
}

/**
 * `useRecipeMd` selects between the two built-in templates. A configured custom
 * template still wins over both -- pointing the importer at your own template is
 * a deliberate choice about the note's whole shape, so a format checkbox should
 * not quietly override it.
 */
export async function buildRecipeNote(
	app: App,
	recipe: ExtractedRecipe,
	settings: RecipeBoxSettings,
	useRecipeMd = false,
): Promise<string> {
	let template = useRecipeMd ? RECIPEMD_TEMPLATE : DEFAULT_TEMPLATE;
	if (settings.importerTemplatePath) {
		const customTemplate = await readNoteOrEmpty(app, settings.importerTemplatePath);
		if (customTemplate) template = customTemplate;
	}
	const tokens = buildTokenTable(recipe, settings);
	return renderTemplate(template, recipe, tokens);
}
