/**
 * Removes the YAML frontmatter block from raw note content, returning the body text only.
 */
export interface FrontmatterSplit {
	/**
	 * The frontmatter block including both delimiters and the line ending that
	 * closes it, or "" when absent. A note whose frontmatter is the entire file,
	 * with no trailing newline, is the one case where it ends at the delimiter --
	 * anything reassembling a note has to allow for that.
	 */
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
	if (closeIdx < 0) return { frontmatter: "", body: contents }; // no closing delimiter, so treat it all as body
	// Consume the whole line ending after the closing `---`, CR and LF separately.
	// Testing only for "\n" left a CRLF note's frontmatter ending at the delimiter
	// with the "\r" pushed onto the body, so a caller that put the block back
	// glued the closing `---` to the first body line and broke the frontmatter.
	let splitAt = closeIdx + 4;
	if (contents[splitAt] === "\r") splitAt++;
	if (contents[splitAt] === "\n") splitAt++;
	return { frontmatter: contents.slice(0, splitAt), body: contents.slice(splitAt) };
}

export function stripFrontmatter(contents: string): string {
	return splitFrontmatter(contents).body;
}
