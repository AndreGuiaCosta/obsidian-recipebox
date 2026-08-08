/**
 * Words a pasted recipe uses to mark its sections and label its loose metadata,
 * consumed by the importer's text parser.
 *
 * Literal words only, never regex fragments. The English defaults used to be
 * fragments (`cook(?:ing)?(?:\s+time)?`), which made them impossible to expose
 * as a setting: one stray parenthesis from a user and `new RegExp` throws
 * mid-import. Everything here is escaped at compile time, so the alternatives a
 * fragment used to express are spelled out instead ("cook", "cooking",
 * "cook time", "cooking time").
 *
 * Accents are optional: both these words and the text they match are run
 * through stripAccents, so "preparação" and "preparacao" are the same entry.
 */
export interface ImportLabels {
	ingredientsSection?: string[];
	instructionsSection?: string[];
	servings?: string[];
	calories?: string[];
	protein?: string[];
	fat?: string[];
	carbs?: string[];
	prepTime?: string[];
	cookTime?: string[];
	totalTime?: string[];
}

/** A locale's ingredient vocabulary, consumed by compileVocabulary. */
export interface RecipeLocale {
	id: string;
	label: string;
	/** Unit form (lowercase, unaccented, no periods) to the canonical unit shown to the user. */
	forms: Record<string, string>;
	/** Base-table unit forms this locale must not inherit, where the two languages disagree. */
	suppress?: string[];
	/**
	 * Size and preparation words moved from the name into the note, so the grocery
	 * list merges on what you buy while the recipe still shows how to prepare it.
	 * Variety words belong nowhere near this list: a red onion is not an onion.
	 */
	qualifiers?: string[];
	/** Spelled-out amounts, the locale counterpart of English "a"/"an". */
	numerals?: Record<string, number>;
	/** Words joining a unit to its ingredient, stripped like the English "of". */
	prepositions?: string[];
	/**
	 * Section and metadata words for the text importer. Optional like every other
	 * table here: what a locale omits falls back to the English base, which is
	 * better than nothing but is why a locale that supplies none of these still
	 * imports pasted text as one undivided description.
	 */
	importLabels?: ImportLabels;
}
