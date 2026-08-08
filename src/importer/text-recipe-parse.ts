/**
 * Parses a plain-text or lightly-marked-up recipe (e.g. pasted from a social
 * caption) into an ExtractedRecipe by running a section state machine over its lines.
 */
import { ExtractedRecipe, ImportedGroup } from "./recipe-extract-types";
import { decodeHtmlEntities } from "./html-entity-decode";
import { createSectionMatcher, buildLabelAlternation, buildLabelPattern } from "./text-recipe-detect";
import { BASE_IMPORT_LABELS, ResolvedImportLabels } from "./import-labels";
import { stripAccents } from "../parser/phrase-normalise";

const HTML_TAG_RE = /<[^>]+>/g;
const EXCESS_BLANK_RE = /\n{3,}/g;
const MD_HEADING_RE = /^#{1,6}\s+(.+)/;
const LIST_ITEM_RE = /^(?:[-*+•]|\d+\.|[¼-¾⅐-⅞])\s/;
const ORDERED_MARKER_RE = /^\d+\.\s+/;
const UNORDERED_MARKER_RE = /^[-*+•]\s+/;

// --- Loose metadata extraction ---

function timeToMinutes(value: string, unit: string): number | null {
	const n = Number(value);
	if (!isFinite(n) || n <= 0) return null;
	return /h/i.test(unit) ? Math.round(n * 60) : Math.round(n);
}

function extractLooseTime(text: string, words: readonly string[]): number | null {
	const re = new RegExp(
		`${buildLabelPattern(words)}[^\\d]{0,20}(\\d+(?:\\.\\d+)?)\\s*(min(?:utes?)?|hr?s?|hours?)`,
		"iu",
	);
	const m = re.exec(text);
	return m ? timeToMinutes(m[1], m[2]) : null;
}

function extractLooseNumber(text: string, words: readonly string[]): number | null {
	// The alternation stays wrapped in a non-capturing group: without it the
	// [^\d]{0,15}(\d+) suffix binds only to the last alternative, so a match on
	// an earlier one leaves the digit group unmatched and Number(undefined)
	// silently returns NaN. That was a real bug back when these were
	// hand-written fragments, and building the alternation here does not make
	// the grouping any less necessary.
	const re = new RegExp(`${buildLabelPattern(words)}[^\\d]{0,15}(\\d+)`, "iu");
	const m = re.exec(text);
	return m ? Number(m[1]) : null;
}

// --- Text cleaning ---

function cleanText(raw: string): string {
	return raw
		.replace(HTML_TAG_RE, "")
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.replace(EXCESS_BLANK_RE, "\n\n");
}

// --- Ingredient sub-group detection ---

function isIngredientSubHeading(line: string): boolean {
	if (LIST_ITEM_RE.test(line)) return false;
	return line.endsWith(":") || line === line.toUpperCase();
}

// --- Instruction sub-group detection ---

function isInstructionSubHeading(line: string): boolean {
	return MD_HEADING_RE.test(line) || (!MD_HEADING_RE.test(line) && line.endsWith(":") && line.length > 1);
}

function stripStepMarker(line: string): string {
	return line.replace(ORDERED_MARKER_RE, "").replace(UNORDERED_MARKER_RE, "");
}

// --- Group assembly ---

function buildIngredientGroups(lines: string[]): ImportedGroup[] {
	const groups: ImportedGroup[] = [{ name: null, items: [] }];
	for (const line of lines) {
		if (!line.trim()) continue;
		if (isIngredientSubHeading(line.trim())) {
			groups.push({ name: line.replace(/:$/, "").trim(), items: [] });
		} else {
			groups[groups.length - 1].items.push(line.trim());
		}
	}
	return groups.filter(g => g.name !== null || g.items.length > 0);
}

function buildInstructionGroups(lines: string[]): ImportedGroup[] {
	const groups: ImportedGroup[] = [{ name: null, items: [] }];
	for (const line of lines) {
		if (!line.trim()) continue;
		const trimmed = line.trim();
		const headingMatch = MD_HEADING_RE.exec(trimmed);
		if (headingMatch) {
			groups.push({ name: headingMatch[1].trim(), items: [] });
		} else if (isInstructionSubHeading(trimmed)) {
			groups.push({ name: trimmed.replace(/:$/, "").trim(), items: [] });
		} else {
			const step = stripStepMarker(trimmed);
			if (step) groups[groups.length - 1].items.push(step);
		}
	}
	// A named group with no steps carries nothing, and it is how the heading of a
	// trailing nutrition block reached the note: the values under it were trimmed
	// away, the header itself was not, and "Nutrição:" was left standing as an
	// empty sub-group in the imported Steps.
	return groups.filter(g => g.items.length > 0);
}

/**
 * Drops trailing "Doses: 4" / "Calories: 650" lines from the method.
 *
 * The state machine has no notion of the recipe ending, so a nutrition block
 * printed after the last step became a step. It was always wrong in English;
 * it only became obvious once the pt-PT vocabulary made Portuguese pastes
 * reach the method at all.
 *
 * Deliberately conservative in three ways. Only a trailing run is considered,
 * and scanning stops at the first line that does not match, so a nutrition
 * table buried mid-method stays where the user put it. The line must start with
 * a known label, so "Bake for 30 minutes" is never a candidate.
 *
 * And a word after the number is only tolerated when a separator marks the line
 * as a label ("Protein: 32 g"). Without that rule the pattern also ate
 * "Cook 30 minutes" -- a perfectly good unnumbered final step, since "cook" is
 * a cook-time label. Bare "Serves 4" still matches because nothing follows the
 * number.
 */
function trimTrailingMetadataLines(lines: string[], labels: ResolvedImportLabels): string[] {
	const metaWords = [
		...labels.servings, ...labels.calories, ...labels.protein,
		...labels.fat, ...labels.carbs,
		...labels.prepTime, ...labels.cookTime, ...labels.totalTime,
	];
	const number = "\\d+(?:[.,]\\d+)?";
	const metaLine = new RegExp(
		`^(?:${buildLabelAlternation(metaWords)})`
		+ `(?:\\s*[:\\-–]\\s*${number}\\s*\\S{0,12}` // separator present: a unit may follow
		+ `|\\s+${number})\\s*$`, // no separator: the number must end the line
		"i",
	);

	// The block's own header ("Nutrição:", "Calorias:") carries no number, so the
	// value pattern above steps over it and it survived as a stray heading in the
	// method. Only consumed as part of a trailing run that already matched, never
	// on its own, so a method genuinely ending on a one-word line is left alone.
	// A bare section word such as "Preparação" is not a metaWord and so cannot be
	// eaten here.
	const metaHeader = new RegExp(`^(?:${buildLabelAlternation(metaWords)})\\s*:?\\s*$`, "iu");

	let end = lines.length;
	let sawValue = false;
	while (end > 0) {
		const line = stripAccents(lines[end - 1].trim());
		if (line && metaLine.test(line)) {
			sawValue = true;
		} else if (line && !(sawValue && metaHeader.test(line))) {
			break;
		}
		end--;
	}
	return lines.slice(0, end);
}

// --- Main export ---

/**
 * `labels` defaults to the English base so the social-caption path and existing
 * callers keep working unchanged; the import modal passes the locale-resolved
 * set. Without it a pasted Portuguese recipe matched no section at all and the
 * whole body collapsed into the description.
 */
export function extractRecipeFromText(
	rawText: string,
	titleOverride?: string,
	labels: ResolvedImportLabels = BASE_IMPORT_LABELS,
): ExtractedRecipe {
	const cleaned = decodeHtmlEntities(cleanText(rawText));
	const allLines = cleaned.split("\n");
	const sections = createSectionMatcher(labels);
	// Accents are folded for the metadata scan so "Proteína" matches a label
	// stored as "proteina". Deliberately not normalisePhrase: that also strips
	// periods, which would turn "1.5 g" into "15 g".
	const scanText = stripAccents(cleaned);

	// Title detection
	let titleLineIndex = -1;
	let title = titleOverride ?? "";
	if (!title) {
		for (let i = 0; i < allLines.length; i++) {
			const line = allLines[i].trim();
			if (!line) continue;
			const headingMatch = MD_HEADING_RE.exec(line);
			if (headingMatch) {
				title = headingMatch[1].trim();
				titleLineIndex = i;
				break;
			}
			if (!sections.isSectionKeyword(line)) {
				title = line;
				titleLineIndex = i;
			}
			break;
		}
	}

	// Loose metadata from full text
	const servingsMatch = new RegExp(
		`${buildLabelPattern(labels.servings)}[^\\d]{0,15}(\\d+)`,
		"iu",
	).exec(scanText);
	const servings = servingsMatch ? servingsMatch[1] : null;
	const prepTime = extractLooseTime(scanText, labels.prepTime);
	const cookTime = extractLooseTime(scanText, labels.cookTime);
	const totalTime = extractLooseTime(scanText, labels.totalTime);
	const calories = extractLooseNumber(scanText, labels.calories);
	const protein = extractLooseNumber(scanText, labels.protein);
	const fat = extractLooseNumber(scanText, labels.fat);
	const carbs = extractLooseNumber(scanText, labels.carbs);

	// Section state machine
	type Section = "before" | "ingredients" | "instructions";
	let section: Section = "before";
	const descLines: string[] = [];
	const ingredientLines: string[] = [];
	const instructionLines: string[] = [];
	let foundAnySection = false;

	for (let i = 0; i < allLines.length; i++) {
		if (i === titleLineIndex) continue;
		const line = allLines[i];
		const trimmed = line.trim();

		if (sections.isIngredients(trimmed)) {
			section = "ingredients";
			foundAnySection = true;
			continue;
		}
		if (sections.isInstructions(trimmed)) {
			section = "instructions";
			foundAnySection = true;
			continue;
		}

		if (section === "before") descLines.push(line);
		else if (section === "ingredients") ingredientLines.push(line);
		else instructionLines.push(line);
	}

	if (!foundAnySection) {
		// Graceful degradation: all body becomes description
		descLines.push(...ingredientLines, ...instructionLines);
		ingredientLines.length = 0;
		instructionLines.length = 0;
	}

	return {
		title,
		description: descLines.join("\n").trim(),
		heroImage: null,
		servings,
		prepTime,
		cookTime,
		totalTime,
		ingredientGroups: buildIngredientGroups(ingredientLines),
		instructionGroups: buildInstructionGroups(trimTrailingMetadataLines(instructionLines, labels)),
		// Text-mode import (pasted captions/text) has no notes-block detection --
		// always empty, same convention as "no notes found" from the URL path.
		notesGroups: [],
		sourceUrl: "",
		calories: calories !== null ? Math.round(calories) : null,
		protein: protein !== null ? Math.round(protein) : null,
		fat: fat !== null ? Math.round(fat) : null,
		carbs: carbs !== null ? Math.round(carbs) : null,
	};
}
