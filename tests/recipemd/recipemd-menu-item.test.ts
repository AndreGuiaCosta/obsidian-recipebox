import { describe, it, expect, vi, beforeEach } from "vitest";
import type { App, Menu, TFile } from "obsidian";

// Keeping canConvertToRecipeMd real pulls in run-recipemd-conversion's own
// imports, and ConfirmModal reaches BaseModal, which extends Modal at module
// scope. These stubs exist only so that chain loads outside Obsidian.
vi.mock("obsidian", () => ({
	Modal: class {},
	Notice: class {},
	setIcon: () => {},
}));

// canConvertToRecipeMd stays real -- it is the gate under test. Only the
// conversion itself is stubbed, so clicking does not need a vault or a modal.
const converted: TFile[] = [];
vi.mock("../../src/recipemd/run-recipemd-conversion", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/recipemd/run-recipemd-conversion")>()),
	runRecipeMdConversion: (_app: App, file: TFile) => {
		converted.push(file);
		return Promise.resolve();
	},
}));

import { addConvertToRecipeMdItem } from "../../src/recipemd/recipemd-menu-item";
import { DEFAULT_SETTINGS } from "../../src/settings/settings-defaults";

const FILE = { basename: "Test Recipe" } as TFile;

interface Recorded { title: string; icon: string; click: () => void }

/** Minimal stand-in for Obsidian's Menu, recording what each item was built with. */
function fakeMenu(): { menu: Menu; items: Recorded[] } {
	const items: Recorded[] = [];
	const menu = {
		addItem(cb: (item: unknown) => void) {
			const rec: Recorded = { title: "", icon: "", click: () => {} };
			const item = {
				setTitle(t: string) { rec.title = t; return item; },
				setIcon(i: string) { rec.icon = i; return item; },
				onClick(fn: () => void) { rec.click = fn; return item; },
			};
			cb(item);
			items.push(rec);
			return menu;
		},
	} as unknown as Menu;
	return { menu, items };
}

/** headings is what canConvertToRecipeMd reads, so that is all the cache needs. */
function fakeApp(headings: string[]): App {
	return {
		metadataCache: {
			getFileCache: () => ({ headings: headings.map((heading) => ({ heading })) }),
		},
	} as unknown as App;
}

describe("addConvertToRecipeMdItem", () => {
	beforeEach(() => { converted.length = 0; });

	it("adds the item for a note with an ingredients heading", () => {
		const { menu, items } = fakeMenu();
		addConvertToRecipeMdItem(fakeApp(["Test Recipe", "Ingredients", "Instructions"]), menu, FILE, DEFAULT_SETTINGS);

		expect(items).toHaveLength(1);
		expect(items[0].title).toBe("Convert to RecipeMD");
		expect(items[0].icon).toBe("file-cog");
	});

	it("adds nothing for a note that is already fenced", () => {
		// A converted note keeps only its title heading, so the gate sees no match.
		const { menu, items } = fakeMenu();
		addConvertToRecipeMdItem(fakeApp(["Test Recipe"]), menu, FILE, DEFAULT_SETTINGS);

		expect(items).toHaveLength(0);
	});

	it("matches the configured heading, not the default", () => {
		const settings = { ...DEFAULT_SETTINGS, ingredientsHeading: "Ingredientes" };

		const { menu: ptMenu, items: ptItems } = fakeMenu();
		addConvertToRecipeMdItem(fakeApp(["Ingredientes"]), ptMenu, FILE, settings);
		expect(ptItems).toHaveLength(1);

		// The English heading must stop matching once the setting moves off it.
		const { menu: enMenu, items: enItems } = fakeMenu();
		addConvertToRecipeMdItem(fakeApp(["Ingredients"]), enMenu, FILE, settings);
		expect(enItems).toHaveLength(0);
	});

	it("ignores case and surrounding whitespace on the heading", () => {
		const { menu, items } = fakeMenu();
		addConvertToRecipeMdItem(fakeApp(["  INGREDIENTS  "]), menu, FILE, DEFAULT_SETTINGS);

		expect(items).toHaveLength(1);
	});

	it("runs the conversion on click", () => {
		const { menu, items } = fakeMenu();
		addConvertToRecipeMdItem(fakeApp(["Ingredients"]), menu, FILE, DEFAULT_SETTINGS);
		items[0].click();

		expect(converted).toEqual([FILE]);
	});
});
