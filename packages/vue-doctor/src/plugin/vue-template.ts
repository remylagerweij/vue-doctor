import fs from "node:fs";

/** Where a script identifier is used in a component's `<template>`. */
export type TemplateUsage = "none" | "event-handler" | "render";

export interface TemplateIndex {
  usage: (name: string) => TemplateUsage;
}

const ATTRIBUTE_PATTERN = /\s(@[^\s=/>]+|v-on:[^\s=/>]+|:[^\s=/>]+|v-[^\s=/>]+|#[^\s=/>]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const MUSTACHE_PATTERN = /\{\{([\s\S]*?)\}\}/g;
const EMPTY_INDEX: TemplateIndex = { usage: () => "none" };

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const usesIdentifier = (code: string, name: string): boolean =>
  new RegExp(`(?<![\\w$.])${escapeRegExp(name)}(?![\\w$])`).test(code);

// The script AST of a .vue file does not include the template, so it is read from disk.
export const indexTemplate = (filename: string): TemplateIndex => {
  if (!filename.endsWith(".vue")) return EMPTY_INDEX;
  let source: string;
  try {
    source = fs.readFileSync(filename, "utf-8");
  } catch {
    return EMPTY_INDEX;
  }
  const start = source.indexOf("<template");
  const end = source.lastIndexOf("</template>");
  if (start === -1 || end <= start) return EMPTY_INDEX;
  const template = source.slice(start, end);

  const handlers: string[] = [];
  const render: string[] = [];
  for (const match of template.matchAll(ATTRIBUTE_PATTERN)) {
    const code = match[2] ?? match[3] ?? "";
    (match[1].startsWith("@") || match[1].startsWith("v-on:") ? handlers : render).push(code);
  }
  for (const match of template.matchAll(MUSTACHE_PATTERN)) render.push(match[1]);

  return {
    usage: (name) => {
      if (render.some((code) => usesIdentifier(code, name))) return "render";
      return handlers.some((code) => usesIdentifier(code, name)) ? "event-handler" : "none";
    },
  };
};
