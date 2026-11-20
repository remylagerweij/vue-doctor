import type { RuleCases } from "../../rule-cases.js";

const vue = (template: string): string => `<template>\n${template}\n</template>\n`;
const FILENAME = "src/Gallery.tsx";

const cases: RuleCases = {
  valid: [
    { name: "img with alt text", filename: FILENAME, code: `export const Logo = () => <div><img src="/logo.svg" alt="Acme" /></div>;\n` },
    { name: "decorative img with empty alt", filename: FILENAME, code: `export const Divider = () => <div><img src="/wave.svg" alt="" /></div>;\n` },
    { name: "img with a bound alt", filename: FILENAME, code: `export const Photo = (props) => <div><img src={props.src} alt={props.caption} /></div>;\n` },
    { name: "img with spread props", filename: FILENAME, code: `export const Photo = (props) => <div><img {...props} /></div>;\n` },
    { name: "Image component without alt", filename: FILENAME, code: `export const Photo = () => <div><Image src="/a.png" /></div>;\n` },
    { name: "img labelled with aria-label", filename: FILENAME, code: `export const Chart = () => <div><img src="/c.png" aria-label="Sales chart" /></div>;\n` },
  ],
  invalid: [
    { name: "img without alt", filename: FILENAME, code: `export const Logo = () => <div><img src="/logo.svg" /></div>;\n` },
    { name: "input type image without alt", filename: FILENAME, code: `export const Go = () => <div><input type="image" src="/go.png" /></div>;\n` },
    { name: "area link without alt", filename: FILENAME, code: `export const Map = () => <div><map name="m"><area href="/a" shape="rect" coords="0,0,1,1" /></map></div>;\n` },
  ],
  template: {
    valid: [
      { name: "root img receives alt through attribute fallthrough", code: vue(`  <img :src="src" class="avatar">`) },
      { name: "static alt", code: vue(`  <div><img src="/logo.svg" alt="Acme"></div>`) },
      { name: "empty alt for a decorative image", code: vue(`  <div><img src="/wave.svg" alt=""></div>`) },
      { name: "bound alt", code: vue(`  <div><img :src="photo.url" :alt="photo.caption"></div>`) },
      { name: "same-name shorthand alt", code: vue(`  <div><img :src="src" :alt></div>`) },
      { name: "v-bind object may bind alt", code: vue(`  <div><img v-bind="imageAttrs"></div>`) },
      { name: "v-bind object literal with alt", code: vue(`  <div><img v-bind="{ src: url, alt: label }"></div>`) },
      { name: "NuxtImg component is not a native img", code: vue(`  <div><NuxtImg src="/hero.jpg" /></div>`) },
      { name: "presentational role", code: vue(`  <div><img src="/dots.svg" role="presentation"></div>`) },
      { name: "aria-hidden decorative image", code: vue(`  <div><img src="/dots.svg" aria-hidden="true"></div>`) },
      { name: "input type text", code: vue(`  <div><input type="text" placeholder="Name"></div>`) },
      { name: "area without href", code: vue(`  <div><map name="m"><area shape="rect" coords="0,0,1,1"></map></div>`) },
      { name: "component rendered through is", code: vue(`  <div><img is="vue:LazyImage" src="/a.png"></div>`) },
    ],
    invalid: [
      { name: "img without alt", code: vue(`  <div><img src="/logo.svg"></div>`) },
      { name: "bound src but no alt", code: vue(`  <div><div><img :src="user.avatar" class="avatar"></div></div>`) },
      { name: "input type image without alt", code: vue(`  <div><form><input type="image" src="/go.png"></form></div>`) },
      { name: "area link without alt", code: vue(`  <div><map name="m"><area href="/a" shape="rect" coords="0,0,1,1"></map></div>`) },
      { name: "img in a v-for without alt", code: vue(`  <div><ul><li v-for="p in photos" :key="p.id"><img :src="p.url"></li></ul></div>`) },
    ],
  },
};

export default cases;
