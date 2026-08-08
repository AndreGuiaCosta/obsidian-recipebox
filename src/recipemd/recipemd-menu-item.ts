/**
 * The "Convert to RecipeMD" context-menu item. Lives here rather than in
 * recipe-file-detection so the detection module stays free of any dependency
 * on the conversion flow; the caller only has to hand over the menu.
 */
import { App, Menu, TFile } from "obsidian";
import { RecipeBoxSettings } from "../settings/settings-types";
import { canConvertToRecipeMd, runRecipeMdConversion } from "./run-recipemd-conversion";

/**
 * Adds the item when the file is actually convertible, matching the command
 * palette entry: a note that is already fenced offers nothing, so it is left
 * out rather than shown disabled. The real check still runs again inside
 * runRecipeMdConversion against the note's content, since this one only reads
 * the metadata cache's heading list.
 */
export function addConvertToRecipeMdItem(
	app: App,
	menu: Menu,
	file: TFile,
	settings: RecipeBoxSettings,
): void {
	if (!canConvertToRecipeMd(app, file, settings)) return;

	menu.addItem((item) => {
		item.setTitle("Convert to RecipeMD")
			.setIcon("file-cog")
			// runRecipeMdConversion is async and opens its own confirm modal, so
			// the click handler stays sync and voids the call rather than being
			// declared async and leaving a floating promise on the listener.
			.onClick(() => {
				void runRecipeMdConversion(app, file, settings);
			});
	});
}
