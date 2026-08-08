/**
 * Renders the URL / paste-text input stage of the import modal into the
 * provided body and footer elements (supplied by BaseModal's shell).
 */
import { App } from "obsidian";
import { RecipeBoxSettings } from "../../settings/settings-types";
import { FolderSuggest } from "../components/folder-suggest";
import { ExtractedRecipe } from "../../importer/recipe-extract-types";
import { submitUrl, submitText, resolveDestinationFolder } from "./import-submit";
import { settingsImportLabels, withSectionOverrides } from "../../importer/import-labels";

export interface InputStageState {
	tab: "url" | "text";
	url: string;
	text: string;
	titleOverride: string;
	folder: string;
	useRecipeMd: boolean;
	/**
	 * The section words in effect for this import, comma-separated. Empty until
	 * the stage renders and fills them from settings, and never written back --
	 * an odd source should not permanently change how every later import parses.
	 */
	ingredientsWords: string;
	instructionsWords: string;
}

export function renderInputStage(
	bodyEl: HTMLElement,
	footerEl: HTMLElement,
	app: App,
	settings: RecipeBoxSettings,
	state: InputStageState,
	onResult: (recipe: ExtractedRecipe, folder: string, warning: string | null) => void,
): void {
	// Tab switcher
	const tabs = bodyEl.createDiv({ cls: "rb-import-tabs" });
	const urlTab = tabs.createEl("button", { cls: "rb-import-tab", text: "From URL" });
	const textTab = tabs.createEl("button", { cls: "rb-import-tab", text: "From text" });

	function setTab(tab: "url" | "text"): void {
		state.tab = tab;
		urlTab.toggleClass("rb-import-tab--active", tab === "url");
		textTab.toggleClass("rb-import-tab--active", tab === "text");
		urlPane.toggle(tab === "url");
		textPane.toggle(tab === "text");
	}

	urlTab.addEventListener("click", () => setTab("url"));
	textTab.addEventListener("click", () => setTab("text"));

	// URL pane
	const urlPane = bodyEl.createDiv({ cls: "rb-import-pane" });
	urlPane.createDiv({ cls: "rb-import-field-label", text: "Recipe URL" });
	const urlInput = urlPane.createEl("input", {
		cls: "rb-import-text-input",
		attr: { type: "url", placeholder: "HTTPS://…" },
	});
	urlInput.value = state.url;
	const urlErrorBox = urlPane.createDiv({ cls: "rb-import-error-box" });
	urlErrorBox.hide();
	urlInput.addEventListener("input", () => {
		state.url = urlInput.value;
		urlErrorBox.empty();
		urlErrorBox.hide();
	});

	// Text pane
	const textPane = bodyEl.createDiv({ cls: "rb-import-pane" });
	textPane.createDiv({ cls: "rb-import-field-label", text: "Title (optional)" });
	const titleInput = textPane.createEl("input", {
		cls: "rb-import-text-input",
		attr: { type: "text", placeholder: "My recipe" },
	});
	titleInput.value = state.titleOverride;
	titleInput.addEventListener("input", () => { state.titleOverride = titleInput.value; });
	textPane.createDiv({ cls: "rb-import-field-label", text: "Paste recipe text" });
	const textArea = textPane.createEl("textarea", {
		cls: "rb-import-textarea rb-import-textarea--tall",
		attr: { placeholder: "Paste ingredients and instructions here…" },
	});
	textArea.value = state.text;
	textArea.addEventListener("input", () => { state.text = textArea.value; });

	// Shared folder field
	const folderSection = bodyEl.createDiv({ cls: "rb-import-folder-row" });
	folderSection.createDiv({ cls: "rb-import-field-label", text: "Destination folder" });
	const folderInput = folderSection.createEl("input", {
		cls: "rb-import-text-input",
		attr: { type: "text", placeholder: "Recipes" },
	});
	if (!state.folder) state.folder = resolveDestinationFolder(settings);
	folderInput.value = state.folder;
	folderInput.addEventListener("input", () => { state.folder = folderInput.value; });
	new FolderSuggest(app, folderInput);

	// A configured custom template decides the note's whole shape, so the format
	// choice has nothing to act on. Shown disabled rather than hidden so the
	// reason is visible instead of the checkbox just being missing.
	const customTemplate = settings.importerTemplatePath.trim() !== "";
	const formatRow = folderSection.createEl("label", { cls: "rb-confirm-checkbox-row" });
	const formatCheckbox = formatRow.createEl("input", { attr: { type: "checkbox" } });
	formatCheckbox.checked = state.useRecipeMd && !customTemplate;
	formatCheckbox.disabled = customTemplate;
	formatRow.createSpan({
		text: customTemplate
			? "Save as RecipeMD (overridden by the custom template in settings)"
			: "Save as RecipeMD (fenced format, instead of Ingredients/Instructions headings)",
	});
	formatCheckbox.addEventListener("change", () => { state.useRecipeMd = formatCheckbox.checked; });
	if (customTemplate) state.useRecipeMd = false;

	// Section words, shown for both tabs. These decide where the ingredients stop
	// and the method starts, and they vary enough between sources that having to
	// guess why an import came out as one long description was the main way this
	// went wrong. Pre-filled with what settings and the locale actually produce,
	// so the box doubles as the answer to "what is it looking for?".
	//
	// The hint names the paths that actually consult these words. A normal URL
	// import goes through recipe-scrapers, which reads structured data and never
	// looks at headings -- leaving that unsaid would make the fields look broken
	// on the URL tab, since editing them would change nothing.
	const configured = settingsImportLabels(settings);
	if (!state.ingredientsWords) state.ingredientsWords = configured.ingredientsSection.join(", ");
	if (!state.instructionsWords) state.instructionsWords = configured.instructionsSection.join(", ");

	const wordsSection = bodyEl.createDiv({ cls: "rb-import-words-section" });
	wordsSection.createDiv({
		cls: "rb-import-field-hint",
		text: "Words that separate the ingredients from the method when reading pasted text, or a YouTube or TikTok caption. Recipe pages with structured data are read directly and ignore these. Changes apply to this import only.",
	});
	const wordsField = (label: string, value: string, onInput: (v: string) => void): void => {
		wordsSection.createDiv({ cls: "rb-import-field-label", text: label });
		const input = wordsSection.createEl("input", {
			cls: "rb-import-text-input",
			attr: { type: "text" },
		});
		input.value = value;
		input.addEventListener("input", () => onInput(input.value));
	};
	wordsField("Ingredients headings", state.ingredientsWords, (v) => { state.ingredientsWords = v; });
	wordsField("Method headings", state.instructionsWords, (v) => { state.instructionsWords = v; });

	const importBtn = footerEl.createEl("button", { cls: "mod-cta", text: "Import" });
	importBtn.addEventListener("click", () => { void (async () => {
		importBtn.disabled = true;
		importBtn.setText("Importing…");
		urlErrorBox.empty();
		urlErrorBox.hide();
		try {
			// Resolved per click rather than once at render, so a locale change in
			// settings takes effect without reopening the modal.
			const labels = withSectionOverrides(
				settingsImportLabels(settings),
				state.ingredientsWords,
				state.instructionsWords,
			);
			if (state.tab === "url") {
				const result = await submitUrl(state.url, labels);
				if (result.kind === "success") {
					onResult(result.recipe, state.folder, result.warning);
				} else {
					urlErrorBox.setText(result.message);
					urlErrorBox.show();
				}
			} else {
				const recipe = submitText(state.text, state.titleOverride, labels);
				if (recipe) onResult(recipe, state.folder, null);
			}
		} finally {
			importBtn.disabled = false;
			importBtn.setText("Import");
		}
	})(); });

	setTab(state.tab);
}
