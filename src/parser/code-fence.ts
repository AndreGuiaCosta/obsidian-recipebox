/**
 * Marks which lines of a note sit inside a fenced code block, so heading and
 * thematic-break scanning can skip them. A `# foo` line inside a fence is not a
 * heading, and treating it as one truncates the recipe at that point.
 */

// Group 2 is the delimiter run, group 3 whatever follows it on the same line.
const FENCE_RE = /^\s{0,3}(?:(`{3,}|~{3,}))(.*)$/;

/**
 * Returns a per-line mask, true for every line of a fenced block including its
 * opening and closing delimiters. An unclosed fence runs to the end of the
 * note, which is what CommonMark specifies.
 */
export function markFencedLines(lines: string[]): boolean[] {
	const inside: boolean[] = new Array<boolean>(lines.length).fill(false);
	let openChar = "";
	let openLength = 0;

	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(FENCE_RE);

		if (openLength === 0) {
			if (!m) continue;
			// A backtick fence's info string may not itself contain a backtick.
			// Without this, a line of inline code with an embedded run of three
			// backticks would open a block that never closes, hiding the rest of
			// the note from every scan that consults this mask.
			if (m[1][0] === "`" && m[2].includes("`")) continue;
			openChar = m[1][0];
			openLength = m[1].length;
			inside[i] = true;
			continue;
		}

		inside[i] = true;
		// Only a bare run of the same character, at least as long as the opening
		// one, closes the block. A shorter run or a trailing info string is
		// ordinary content.
		if (m && m[1][0] === openChar && m[1].length >= openLength && m[2].trim() === "") {
			openLength = 0;
		}
	}

	return inside;
}
