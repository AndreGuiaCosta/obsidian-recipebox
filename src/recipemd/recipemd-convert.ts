/**
 * Rewrites a heading-based recipe note into RecipeMD's fenced layout:
 * title, description, `---`, ingredients, `---`, method.
 *
 * Structural only. Ingredient and step lines are carried through byte-for-byte
 * because this rewrites the user's note in place -- reformatting amounts into
 * RecipeMD's `*600g*` emphasis would need the ingredient parser, and nothing
 * that reads these notes benefits: this plugin's own RecipeMD reader ignores
 * emphasis entirely. The one thing that is rewritten is method sub-heading
 * depth, and only because leaving it alone would silently truncate the recipe
 * (see reheadMethodLines).
 */
import { RecipeBoxSettings } from "../settings/settings-types";
import { splitFrontmatter } from "../parser/recipe-frontmatter-strip";
import { findHeadingIndex } from "../parser/recipe-heading-search";
import { findSectionBoundary, RECIPEMD_SECTION_LEVEL } from "../parser/recipe-instruction-groups";
import { findRecipeMdIngredients } from "../parser/recipemd-sections";

export type RecipeMdConversion =
	| { kind: "converted"; content: string }
	| { kind: "already-recipemd" }
	| { kind: "unconvertible"; reason: string };

const HEADING_RE = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/;
// Matches recipemd-sections.ts -- the lines that would be read back as fences.
const THEMATIC_BREAK = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

/** Drops leading and trailing blank lines without touching the interior. */
function trimBlankEdges(lines: string[]): string[] {
	let start = 0;
	let end = lines.length;
	while (start < end && !lines[start].trim()) start++;
	while (end > start && !lines[end - 1].trim()) end--;
	return lines.slice(start, end);
}

/**
 * Pushes method sub-headings below the section level so they stay sub-headings.
 *
 * In a heading-based note a sub-heading only has to be deeper than the
 * instructions heading, so `# Instructions` legitimately has `## Sauce` under
 * it. RecipeMD has no instructions heading to measure against, so the reader
 * falls back to RECIPEMD_SECTION_LEVEL -- and at that point `## Sauce` reads as
 * the *end* of the method, silently turning the rest of the recipe into a
 * trailing section. Shifting the whole run keeps the relative nesting intact.
 */
function reheadMethodLines(lines: string[]): string[] | null {
	let shallowest = 7;
	let deepest = 0;
	for (const line of lines) {
		const m = line.match(HEADING_RE);
		if (!m) continue;
		shallowest = Math.min(shallowest, m[1].length);
		deepest = Math.max(deepest, m[1].length);
	}
	const shift = shallowest <= RECIPEMD_SECTION_LEVEL ? RECIPEMD_SECTION_LEVEL + 1 - shallowest : 0;
	if (shift === 0) return lines;

	// Markdown stops at h6, so a shift that would push the deepest heading past
	// it cannot be applied uniformly -- clamping instead would flatten distinct
	// levels onto h6 and turn nested sub-sections into siblings. Refusing keeps
	// the note's structure honest; nothing here can fix it automatically.
	if (deepest + shift > 6) return null;

	return lines.map((line) => {
		const m = line.match(HEADING_RE);
		if (!m) return line;
		return `${"#".repeat(m[1].length + shift)} ${m[2].trim()}`;
	});
}

/**
 * Assembles the note. Blank lines around each fence are deliberate: a `---`
 * directly under a text line is a setext heading in Markdown, not a break, so
 * without the separation the fence would vanish from the rendered note.
 */
function assemble(frontmatter: string, intro: string[], ingredients: string[], method: string[], trailing: string[]): string {
	const parts = [
		...trimBlankEdges(intro),
		"",
		"---",
		"",
		...trimBlankEdges(ingredients),
		"",
		"---",
		"",
		...trimBlankEdges(method),
	];
	const tail = trimBlankEdges(trailing);
	if (tail.length > 0) parts.push("", ...tail);

	const body = parts.join("\n").replace(/\n{3,}/g, "\n\n");
	return `${frontmatter}${body}\n`;
}

export function convertNoteToRecipeMd(
	raw: string,
	basename: string,
	settings: RecipeBoxSettings,
): RecipeMdConversion {
	const { frontmatter, body } = splitFrontmatter(raw);
	const lines = body.split("\n");

	const ing = findHeadingIndex(lines, settings.ingredientsHeading);
	if (ing.index < 0) {
		// No ingredients heading at all: either it is already fenced, or there is
		// nothing here this can work from.
		if (findRecipeMdIngredients(lines)) return { kind: "already-recipemd" };
		return { kind: "unconvertible", reason: `No "${settings.ingredientsHeading}" heading to convert.` };
	}

	const instr = findHeadingIndex(lines, settings.instructionsHeading);
	if (instr.index >= 0 && instr.index < ing.index) {
		return { kind: "unconvertible", reason: `"${settings.instructionsHeading}" appears before "${settings.ingredientsHeading}".` };
	}

	// Where the ingredients stop: the instructions heading when there is one,
	// otherwise the first heading that closes the ingredients section.
	const ingredientsEnd = instr.index >= 0
		? instr.index
		: findSectionBoundary(lines, ing.index + 1, ing.level);

	const intro = lines.slice(0, ing.index);
	const ingredients = lines.slice(ing.index + 1, ingredientsEnd);

	let method: string[] = [];
	let trailing: string[];
	if (instr.index >= 0) {
		const methodEnd = findSectionBoundary(lines, instr.index + 1, instr.level);
		const reheaded = reheadMethodLines(lines.slice(instr.index + 1, methodEnd));
		if (reheaded === null) {
			return { kind: "unconvertible", reason: "The method's sub-headings are nested too deeply to shift below the RecipeMD section level." };
		}
		method = reheaded;
		trailing = lines.slice(methodEnd);
	} else {
		// Ingredients-only note. RecipeMD allows dropping the closing fence in
		// that case, but emitting both keeps the output shape uniform and the
		// reader accepts an empty method.
		trailing = lines.slice(ingredientsEnd);
	}

	// A stray `---`/`***`/`___` above the closing fence would be picked up as one
	// of the two fences and cut the ingredients short. Refusing beats writing a
	// note that reads back wrong.
	const strayBreak = [...intro, ...ingredients].find((line) => THEMATIC_BREAK.test(line));
	if (strayBreak !== undefined) {
		return { kind: "unconvertible", reason: "The text above the method contains a horizontal rule, which RecipeMD would read as a section divider." };
	}

	// RecipeMD opens with the title. cleanNoteBody hides an h1 that matches the
	// filename in the recipe view, so adding one changes nothing on screen.
	const introHasTitle = intro.some((line) => /^#\s+\S/.test(line));
	const introOut = introHasTitle ? intro : [`# ${basename}`, "", ...intro];

	return { kind: "converted", content: assemble(frontmatter, introOut, ingredients, method, trailing) };
}
