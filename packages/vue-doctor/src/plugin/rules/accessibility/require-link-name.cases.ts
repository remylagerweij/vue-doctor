import type { RuleCases } from "../../rule-cases.js";

const vue = (template: string): string => `<template>\n${template}\n</template>\n`;
const FILENAME = "src/Nav.tsx";

const cases: RuleCases = {
  valid: [
    { name: "link with text", filename: FILENAME, code: `export const X = () => <div><a href="/about">About</a></div>;\n` },
    { name: "link with an expression", filename: FILENAME, code: `export const X = (p) => <div><a href={p.url}>{p.label}</a></div>;\n` },
    { name: "icon link with aria-label", filename: FILENAME, code: `export const X = () => <div><a href="/" aria-label="Home"><svg><use href="#home" /></svg></a></div>;\n` },
    { name: "link with a component child", filename: FILENAME, code: `export const X = () => <div><a href="/"><Logo /></a></div>;\n` },
    { name: "anchor without href", filename: FILENAME, code: `export const X = () => <div><a id="top" /></div>;\n` },
    { name: "image link with alt", filename: FILENAME, code: `export const X = () => <div><a href="/"><img src="/l.svg" alt="Acme home" /></a></div>;\n` },
  ],
  invalid: [
    { name: "empty link", filename: FILENAME, code: `export const X = () => <div><a href="/cart" className="cart-icon"></a></div>;\n` },
    { name: "svg icon only", filename: FILENAME, code: `export const X = () => <div><a href="https://github.com/acme"><svg viewBox="0 0 24 24"><path d="M0 0" /></svg></a></div>;\n` },
    { name: "icon font only", filename: FILENAME, code: `export const X = () => <div><a href="/settings"><i className="fa fa-cog" /></a></div>;\n` },
  ],
  template: {
    valid: [
      { name: "root link receives aria-label through attribute fallthrough", code: vue(`  <a :href="href" class="icon-link"><i class="i-external"></i></a>`) },
      { name: "text", code: vue(`  <div><a href="/about">About us</a></div>`) },
      { name: "interpolation", code: vue(`  <div><a :href="post.url">{{ post.title }}</a></div>`) },
      { name: "aria-label on an icon link", code: vue(`  <div><a href="https://x.com/acme" aria-label="Acme on X"><svg aria-hidden="true"><use href="#x" /></svg></a></div>`) },
      { name: "visually hidden text", code: vue(`  <div><a href="/cart"><i class="icon-cart"></i><span class="sr-only">Cart</span></a></div>`) },
      { name: "component child may render text", code: vue(`  <div><RouterLink to="/"><AppLogo /></RouterLink></div>`) },
      { name: "slot content", code: vue(`  <div><a :href="href"><slot /></a></div>`) },
      { name: "v-text", code: vue(`  <div><a :href="url" v-text="label"></a></div>`) },
      { name: "svg with a title", code: vue(`  <div><a href="/"><svg role="img"><title>Home</title><path d="M0 0" /></svg></a></div>`) },
      { name: "image with alt", code: vue(`  <div><NuxtLink to="/"><img src="/logo.svg" alt="Acme home"></NuxtLink></div>`) },
      { name: "custom RouterLink", code: vue(`  <div><RouterLink v-slot="{ navigate }" to="/" custom><span @click="navigate" @keydown.enter="navigate" role="link" tabindex="0">Home</span></RouterLink></div>`) },
      { name: "anchor without href", code: vue(`  <div><a name="top"></a></div>`) },
      { name: "v-bind object", code: vue(`  <div><a v-bind="linkAttrs"></a></div>`) },
      { name: "text in a v-if branch", code: vue(`  <div><a href="/"><template v-if="short">Home</template><i v-else class="i-home"></i></a></div>`) },
      { name: "title attribute", code: vue(`  <div><a href="/print" title="Print this page"><i class="icon-print"></i></a></div>`) },
      { name: "img without alt is require-img-alt's finding", code: vue(`  <div><a href="/"><img src="/logo.svg"></a></div>`) },
    ],
    invalid: [
      { name: "empty anchor", code: vue(`  <div><a href="/cart" class="cart"></a></div>`) },
      { name: "icon font only", code: vue(`  <div><a href="https://github.com/acme"><i class="fab fa-github"></i></a></div>`) },
      { name: "aria-hidden icon only", code: vue(`  <div><NuxtLink to="/settings"><svg aria-hidden="true"><use href="#cog" /></svg></NuxtLink></div>`) },
      { name: "router-link with svg only", code: vue(`  <div><router-link to="/"><svg viewBox="0 0 10 10"><path d="M0 0" /></svg></router-link></div>`) },
      { name: "decorative image only", code: vue(`  <div><a :href="profileUrl"><img :src="avatar" alt=""></a></div>`) },
    ],
  },
};

export default cases;
