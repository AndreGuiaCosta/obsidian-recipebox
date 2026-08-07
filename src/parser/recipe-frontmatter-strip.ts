/**
 * Removes the YAML frontmatter block from raw note content, returning the body text only.
 */
export interface FrontmatterSplit {
	/** The frontmatter block including both delimiters and the newline that ends it, or "" when absent. */
	frontmatter: string;
	body: string;
}

/**
 * Same boundary rule as stripFrontmatter, but hands back the frontmatter too.
 * Anything that rewrites a note in place needs to put the original block back
 * byte-for-byte, and re-serialising parsed YAML would reorder keys and drop
 * comments -- so the raw text is carried through untouched.
 */
export function splitFrontmatter(contents: string): FrontmatterSplit {
	if (!contents.startsWith("---")) return { frontmatter: "", body: contents };
	const closeIdx = contents.indexOf("\n---", 3);
	if (closeIdx < 0) return { frontmatter: "", body: contents }; // no closing delimiter — treat it all as body
	const splitAt = contents[closeIdx + 4] === "\n" ? closeIdx + 5 : closeIdx + 4;
	return { frontmatter: contents.slice(0, splitAt), body: contents.slice(splitAt) };
}

export function stripFrontmatter(contents: string): string {
	return splitFrontmatter(contents).body;
}
