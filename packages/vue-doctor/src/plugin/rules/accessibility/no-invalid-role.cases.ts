import type { RuleCases } from "../../rule-cases.js";

const vue = (template: string): string => `<template>\n${template}\n</template>\n`;
const FILENAME = "src/Widget.tsx";

const cases: RuleCases = {
  valid: [
    { name: "button role", filename: FILENAME, code: `export const X = () => <div role="button" tabIndex={0}>x</div>;\n` },
    { name: "fallback list of valid roles", filename: FILENAME, code: `export const X = () => <div role="switch checkbox" aria-checked="false">x</div>;\n` },
    { name: "bound role", filename: FILENAME, code: `export const X = (props) => <div role={props.role}>x</div>;\n` },
    { name: "role on a component", filename: FILENAME, code: `export const X = () => <Panel role="panel" />;\n` },
    { name: "DPUB role", filename: FILENAME, code: `export const X = () => <aside role="doc-tip">x</aside>;\n` },
  ],
  invalid: [
    { name: "unknown role", filename: FILENAME, code: `export const X = () => <div role="panel">x</div>;\n` },
    { name: "abstract role", filename: FILENAME, code: `export const X = () => <div role="widget">x</div>;\n` },
    { name: "misspelled role", filename: FILENAME, code: `export const X = () => <nav role="navigaton">x</nav>;\n` },
  ],
  template: {
    valid: [
      { name: "dialog role", code: vue(`  <div role="dialog" aria-modal="true">x</div>`) },
      { name: "presentation role", code: vue(`  <table role="presentation"><tr><td>x</td></tr></table>`) },
      { name: "bound role", code: vue(`  <div :role="interactive ? 'button' : undefined">x</div>`) },
      { name: "upper-case role", code: vue(`  <div role="Navigation">x</div>`) },
      { name: "graphics role on svg", code: vue(`  <svg role="graphics-document"><title>Plan</title></svg>`) },
      { name: "role prop on a component", code: vue(`  <VList role="nav" />`) },
    ],
    invalid: [
      { name: "unknown role", code: vue(`  <div role="panel">x</div>`) },
      { name: "abstract role", code: vue(`  <div role="section">x</div>`) },
      { name: "bound literal invalid role", code: vue(`  <span :role="'btn'">x</span>`) },
      { name: "invalid token in a fallback list", code: vue(`  <div role="switch toggle">x</div>`) },
    ],
  },
};

export default cases;
