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

	new ConfirmModal(
		app,
		"Convert to RecipeMD?",
		`This rewrites "${file.basename}" in place: the ${settings.ingredientsHeading} and ${settings.instructionsHeading} headings are replaced with horizontal rules. Frontmatter, ingredient lines and steps are kept as they are.`,
		"Convert",
		{
			destructive: true,
			onConfirm: () => {
				void (async () => {
					// Holds the finished notice text rather than a flag, so the
					// wording matches the pre-modal checks above. In an object because
					// the callback below runs inside vault.process, and a plain `let`
					// assigned in a closure is not narrowed usefully once it returns.
					const outcome: { failure: string | null } = { failure: null };
					try {
						// The conversion is recomputed from the content vault.process
						// hands over rather than reusing `result.content` from the read
						// above. The note can be edited while the confirm modal is open,
						// and writing the earlier string would discard those edits
						// wholesale. Recomputing can now find the note unconvertible,
						// which means leaving it exactly as it stands.
						await app.vault.process(file, (current) => {
							const fresh = convertNoteToRecipeMd(current, file.basename, settings);
							if (fresh.kind === "converted") return fresh.content;
							outcome.failure = fresh.kind === "already-recipemd"
								? `${file.basename} is already in RecipeMD format.`
								: `Cannot convert ${file.basename}: ${fresh.reason}`;
							return current;
						});
					} catch (err) {
						new Notice(`Failed to convert: ${err instanceof Error ? err.message : String(err)}`);
						return;
					}
					new Notice(outcome.failure ?? `${file.basename} converted to RecipeMD.`);
				})();
			},
		},
	).open();
}
