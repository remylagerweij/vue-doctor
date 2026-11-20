import type { RuleCases } from "../../rule-cases.js";

const vue = (template: string): string => `<template>\n${template}\n</template>\n`;
const FILENAME = "src/Embed.tsx";

const cases: RuleCases = {
  valid: [
    { name: "iframe with title", filename: FILENAME, code: `export const Map = () => <div><iframe src="https://maps.example.com" title="Office location" /></div>;\n` },
    { name: "iframe with bound title", filename: FILENAME, code: `export const Video = (props) => <div><iframe src={props.url} title={props.title} /></div>;\n` },
    { name: "iframe with spread props", filename: FILENAME, code: `export const Frame = (props) => <div><iframe {...props} /></div>;\n` },
    { name: "hidden tracking iframe", filename: FILENAME, code: `export const Pixel = () => <div><iframe src="/t" aria-hidden="true" tabIndex={-1} /></div>;\n` },
  ],
  invalid: [
    { name: "iframe without title", filename: FILENAME, code: `export const Map = () => <div><iframe src="https://maps.example.com" /></div>;\n` },
    { name: "iframe with empty title", filename: FILENAME, code: `export const Map = () => <div><iframe src="/m" title="" /></div>;\n` },
    { name: "iframe with bound src only", filename: FILENAME, code: `export const Video = (props) => <div><iframe src={props.url} allowFullScreen /></div>;\n` },
  ],
  template: {
    valid: [
      { name: "root iframe receives title through attribute fallthrough", code: vue(`  <iframe :src="src"></iframe>`) },
      { name: "static title", code: vue(`  <div><iframe src="https://www.youtube.com/embed/x" title="Product demo"></iframe></div>`) },
      { name: "bound title", code: vue(`  <div><iframe :src="video.url" :title="video.title"></iframe></div>`) },
      { name: "aria-label", code: vue(`  <div><iframe src="/m" aria-label="Map"></iframe></div>`) },
      { name: "v-bind object", code: vue(`  <div><iframe v-bind="frameAttrs"></iframe></div>`) },
      { name: "hidden iframe", code: vue(`  <div><iframe src="/sync" aria-hidden="true" tabindex="-1"></iframe></div>`) },
      { name: "component named Iframe", code: vue(`  <div><Iframe src="/m" /></div>`) },
    ],
    invalid: [
      { name: "no title", code: vue(`  <div><iframe src="https://maps.example.com"></iframe></div>`) },
      { name: "bound src only", code: vue(`  <div><div class="video"><iframe :src="embedUrl" allowfullscreen></iframe></div></div>`) },
      { name: "empty title", code: vue(`  <div><iframe src="/m" title=""></iframe></div>`) },
    ],
  },
};

export default cases;
