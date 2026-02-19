import pc from "picocolors";
import {
  SUMMARY_BOX_HORIZONTAL_PADDING_CHARS,
  SUMMARY_BOX_OUTER_INDENT_CHARS,
} from "../constants.js";

export interface FramedLine {
  plainText: string;
  renderedText: string;
}

export const createFramedLine = (plainText: string, renderedText?: string): FramedLine => ({
  plainText,
  renderedText: renderedText ?? plainText,
});

const computeMaxWidth = (lines: FramedLine[]): number =>
  Math.max(...lines.map((line) => line.plainText.length));

export const renderFramedBoxString = (lines: FramedLine[]): string => {
  const maxWidth = computeMaxWidth(lines);
  const innerWidth = maxWidth + SUMMARY_BOX_HORIZONTAL_PADDING_CHARS * 2;
  const outerIndent = " ".repeat(SUMMARY_BOX_OUTER_INDENT_CHARS);
  const padding = " ".repeat(SUMMARY_BOX_HORIZONTAL_PADDING_CHARS);

  const output: string[] = [];
  output.push(`${outerIndent}${pc.dim("┌" + "─".repeat(innerWidth) + "┐")}`);

  for (const line of lines) {
    const rightPadding = " ".repeat(maxWidth - line.plainText.length);
    output.push(
      `${outerIndent}${pc.dim("│")}${padding}${line.renderedText}${rightPadding}${padding}${pc.dim("│")}`,
    );
  }

  output.push(`${outerIndent}${pc.dim("└" + "─".repeat(innerWidth) + "┘")}`);
  return output.join("\n");
};

export const printFramedBox = (lines: FramedLine[]): void => {
  console.log(renderFramedBoxString(lines));
};
