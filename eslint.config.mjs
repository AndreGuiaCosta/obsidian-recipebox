import tsparser from "@typescript-eslint/parser";
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.mjs",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: { project: "./tsconfig.json" },
		},
		rules: {
			// sample-names fires on the boilerplate class names from the Obsidian
			// plugin template - this project has already renamed them.
			"obsidianmd/sample-names": "off",
			// RecipeMD is the name of a note format (recipemd.org), so its casing
			// is fixed. ignoreWords rather than brands: brands replaces the
			// plugin's whole default list, ignoreWords adds to an empty one.
			"obsidianmd/ui/sentence-case": ["error", { ignoreWords: ["RecipeMD"] }],
		},
	},
]);
