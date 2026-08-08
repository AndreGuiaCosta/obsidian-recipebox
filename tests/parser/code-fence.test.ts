import { describe, it, expect } from "vitest";
import { markFencedLines } from "../../src/parser/code-fence";

/** Reads more clearly than a boolean array when a case fails. */
function mask(text: string): string {
	return markFencedLines(text.split("\n")).map((f) => (f ? "1" : "0")).join("");
}

describe("markFencedLines", () => {
	it("marks a fence and everything in it", () => {
		expect(mask("# T\n```\ncode\n```\nafter")).toBe("01110");
	});

	it("marks a tilde fence the same way", () => {
		expect(mask("# T\n~~~\ncode\n~~~\nafter")).toBe("01110");
	});

	it("runs an unclosed fence to the end of the note", () => {
		expect(mask("# T\n```\ncode\nmore")).toBe("0111");
	});

	it("does not let a backtick fence be closed by a tilde run", () => {
		expect(mask("```\ncode\n~~~\nstill code")).toBe("1111");
	});

	it("requires the closing run to be at least as long as the opener", () => {
		// The three-backtick line is content, so the block stays open past it.
		expect(mask("````\ncode\n```\nstill code\n````\nafter")).toBe("111110");
	});

	it("treats a trailing info string as content, not a closer", () => {
		expect(mask("```\ncode\n``` js\nstill code\n```\nafter")).toBe("111110");
	});

	it("ignores a line of inline code carrying its own backtick run", () => {
		// The info string of a backtick fence may not contain a backtick, so this
		// must not open a block that swallows the rest of the note.
		expect(mask("# T\n``` `x` ```\nafter")).toBe("000");
	});

	it("marks fenced lines in a CRLF note", () => {
		// `.` never matches \r and `$` without /m demands true end of input, so the
		// original pattern matched no line of a CRLF note and the mask came back
		// entirely false, silently disabling every scan that depends on it.
		const lines = "# T\r\n```\r\n## Ingredients\r\n```\r\nafter\r\n".split("\n");
		const marked = markFencedLines(lines);
		const heading = lines.findIndex((l) => l.startsWith("## Ingredients"));
		expect(marked[heading]).toBe(true);
		expect(marked[0]).toBe(false);
	});
});
