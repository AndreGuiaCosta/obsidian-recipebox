/**
 * Locates a Markdown heading by name within a pre-split array of lines,
 * returning its index and level for use by the ingredient and instruction parsers.
 */
export interface HeadingResult {
	index: number;
	level: number;
}

const NOT_FOUND: HeadingResult = { index: -1, level: 0 };
// Matches # through ###### headings; trims optional trailing hashes
const HEADING_RE = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/;

/**
 * `fenced` is the optional per-line mask from markFencedLines. It is opt-in
 * because the read path deliberately stays fence-blind here (see the note in
 * recipe-instruction-groups.ts): showing a recipe that stops early is
 * recoverable, so that behaviour is left as it is. Anything that rewrites the
 * note in place must pass the mask, or it will treat a heading inside a code
 * block as the real one and mangle the block on disk.
 */
export function findHeadingIndex(
	lines: string[],
	headingName: string,
	fenced?: readonly boolean[],
): HeadingResult {
	const target = headingName.trim().toLowerCase();
	for (let i = 0; i < lines.length; i++) {
		if (fenced?.[i]) continue;
		const m = lines[i].match(HEADING_RE);
		if (m && m[2].trim().toLowerCase() === target) {
			return { index: i, level: m[1].length };
		}
	}
	return NOT_FOUND;
}
