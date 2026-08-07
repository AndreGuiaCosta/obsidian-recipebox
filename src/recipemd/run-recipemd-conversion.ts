/**
 * Command-side wrapper for convertNoteToRecipeMd: the eligibility check the
 * command palette needs synchronously, plus the confirm-and-write flow.
 */
import { App, Notice, TFile } from "obsidian";
import { RecipeBoxSettings } from "../settings/settings-types";
import { ConfirmModal } from "../ui/modals/confirm-modal";
import { convertNoteToRecipeMd } from "./recipemd-convert";

/**
 * Whether the command should appear at all. checkCallback is synchronous, so
 * this reads the metadata cache's heading list rather than the file itself --
 * enough to tell a heading-based recipe from one that is already fenced, and
 * the real check runs again on the actual content before anything is written.
 */
export function canConvertToRecipeMd(app: App, file: TFile, settings: RecipeBoxSettings): boolean {
	const headings = app.metadataCache.getFileCache(file)?.headings ?? [];
	const target = settings.ingredientsHeading.trim().toLowerCase();
	return headings.some((h) => h.heading.trim().toLowerCase() === target);
}

export async function runRecipeMdConversion(app: App, file: TFile, settings: RecipeBoxSettings): Promise<void> {
	const raw = await app.vault.read(file);
	const result = convertNoteToRecipeMd(raw, file.basename, settings);

	if (result.kind === "already-recipemd") {
		new Notice(`${file.basename} is already in RecipeMD format.`);
		return;
	}
	if (result.kind === "unconvertible") {
		new Notice(`Cannot convert ${file.basename}: ${result.reason}`);
		return;
	}
	if (result.content === raw) {
		new Notice(`${file.basename} is already in RecipeMD format.`);
		return;
	}

	new ConfirmModal(
		app,
		"Convert to RecipeMD?",
		`This rewrites "${file.basename}" in place: the ${settings.ingredientsHeading} and ${settings.instructionsHeading} headings are replaced with horizontal rules. Frontmatter, ingredient lines and steps are kept as they are.`,
		"Convert",
		{
			destructive: true,
			onConfirm: () => {
				void (async () => {
					try {
						await app.vault.modify(file, result.content);
						new Notice(`${file.basename} converted to RecipeMD.`);
					} catch (err) {
						new Notice(`Failed to convert: ${err instanceof Error ? err.message : String(err)}`);
					}
				})();
			},
		},
	).open();
}
