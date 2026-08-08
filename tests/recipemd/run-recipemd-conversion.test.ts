import { describe, it, expect, vi, beforeEach } from "vitest";
import type { App, TFile } from "obsidian";

const notices: string[] = [];
vi.mock("obsidian", () => ({
	Notice: class { constructor(message: string) { notices.push(message); } },
}));

// Stands in for the real modal so the confirm path runs without a DOM. onConfirm
// fires as soon as open() is called, which is what a user clicking Convert does.
let lastMessage = "";
vi.mock("../../src/ui/modals/confirm-modal", () => ({
	ConfirmModal: class {
		constructor(
			_app: unknown,
			_heading: string,
			message: string,
			_label: string,
			private readonly options: { onConfirm: (checked: boolean) => void },
		) { lastMessage = message; }
		open(): void { this.options.onConfirm(false); }
	},
}));

import { runRecipeMdConversion } from "../../src/recipemd/run-recipemd-conversion";
import { DEFAULT_SETTINGS } from "../../src/settings/settings-defaults";

const HEADING_NOTE = "## Ingredients\n- flour\n## Instructions\n1. Mix.\n";
const FILE = { basename: "Test Recipe" } as TFile;

/**
 * `read` and `process` are handed different content on purpose: that is the
 * shape of a note edited while the confirm modal sits open.
 */
function fakeApp(atRead: string, atWrite: string) {
	const writes: string[] = [];
	const app = {
		vault: {
			read: () => Promise.resolve(atRead),
			process: (_file: TFile, fn: (data: string) => string) => {
				const out = fn(atWrite);
				writes.push(out);
				return Promise.resolve(out);
			},
		},
	} as unknown as App;
	return { app, writes };
}

/** Lets the voided async chain inside onConfirm settle. */
function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
	notices.length = 0;
	lastMessage = "";
});

describe("runRecipeMdConversion", () => {
	it("converts the content vault.process hands over, not the earlier read", async () => {
		const edited = "## Ingredients\n- flour\n- sugar added while the modal was open\n## Instructions\n1. Mix.\n";
		const { app, writes } = fakeApp(HEADING_NOTE, edited);

		await runRecipeMdConversion(app, FILE, DEFAULT_SETTINGS);
		await flush();

		expect(writes).toHaveLength(1);
		expect(writes[0]).toContain("- sugar added while the modal was open");
		expect(notices).toEqual(["Test Recipe converted to RecipeMD."]);
	});

	it("leaves the note alone when the edit made it unconvertible", async () => {
		// Already fenced by the time confirm fires, so there is nothing to do and
		// the content must come back out of process unchanged.
		const edited = "# Test Recipe\n\n---\n\n- flour\n\n---\n\n1. Mix.\n";
		const { app, writes } = fakeApp(HEADING_NOTE, edited);

		await runRecipeMdConversion(app, FILE, DEFAULT_SETTINGS);
		await flush();

		expect(writes).toEqual([edited]);
		expect(notices).toEqual(["Test Recipe is already in RecipeMD format."]);
	});

	it("reports why a note cannot be converted without opening the modal", async () => {
		const { app, writes } = fakeApp("Just prose.\n", "Just prose.\n");

		await runRecipeMdConversion(app, FILE, DEFAULT_SETTINGS);
		await flush();

		expect(writes).toEqual([]);
		expect(lastMessage).toBe("");
		expect(notices).toEqual(['Cannot convert Test Recipe: No "Ingredients" heading to convert.']);
	});
});
