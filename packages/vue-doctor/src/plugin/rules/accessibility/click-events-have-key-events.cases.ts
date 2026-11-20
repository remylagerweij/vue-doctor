import type { RuleCases } from "../../rule-cases.js";

const vue = (template: string): string => `<template>\n${template}\n</template>\n`;
const FILENAME = "src/List.tsx";

const cases: RuleCases = {
  valid: [
    { name: "button with onClick", filename: FILENAME, code: `export const X = (p) => <div><button onClick={p.select}>Pick</button></div>;\n` },
    { name: "div with click and key handler", filename: FILENAME, code: `export const X = (p) => <div><div onClick={p.go} onKeydown={p.go}>Go</div></div>;\n` },
    { name: "div with a role", filename: FILENAME, code: `export const X = (p) => <div><div role="button" tabIndex={0} onClick={p.go}>Go</div></div>;\n` },
    { name: "component with onClick", filename: FILENAME, code: `export const X = (p) => <div><Card onClick={p.open} /></div>;\n` },
    { name: "handler that only stops propagation", filename: FILENAME, code: `export const X = () => <div><div onClick={(e) => e.stopPropagation()}>Menu</div></div>;\n` },
    { name: "wrapper around a button", filename: FILENAME, code: `export const X = (p) => <div><div onClick={p.track}><button>Buy</button></div></div>;\n` },
  ],
  invalid: [
    { name: "div with onClick", filename: FILENAME, code: `export const X = (p) => <div><div className="card" onClick={p.open}>Open</div></div>;\n` },
    { name: "span with onClick", filename: FILENAME, code: `export const X = (p) => <div><span onClick={() => p.copy(p.text)}>Copy</span></div>;\n` },
    { name: "img with onClick", filename: FILENAME, code: `export const X = (p) => <div><img src={p.src} alt="Zoom" onClick={p.zoom} /></div>;\n` },
  ],
  template: {
    valid: [
      { name: "root element receives key listeners through fallthrough", code: vue(`  <div class="command-item" :class="{ active }" @click="emit('activate')"><slot /></div>`) },
      { name: "native button", code: vue(`  <div><button type="button" @click="save">Save</button></div>`) },
      { name: "keyboard handler", code: vue(`  <div><div tabindex="0" @click="open" @keydown.enter="open">Open</div></div>`) },
      { name: "role and tabindex", code: vue(`  <div><span role="button" tabindex="0" @click="copy" @keyup.space="copy">Copy</span></div>`) },
      { name: "click.self on a backdrop", code: vue(`  <div><div class="modal" @click.self="close"><div class="content">Hi</div></div></div>`) },
      { name: "backdrop class", code: vue(`  <div><div><div class="modal-overlay" @click="close"></div><dialog open>Hi</dialog></div></div>`) },
      { name: "drawer background", code: vue(`  <div class="app"><div v-if="mobile && open" class="drawer-bg" @click="closeSidebar" /><main>Hi</main></div>`) },
      { name: "empty full-cover backdrop", code: vue(`  <div class="flex"><div :class="open ? 'block' : 'hidden'" class="fixed inset-0 z-20 bg-black opacity-50" @click="open = false"></div><aside>Menu</aside></div>`) },
      { name: "stop modifier without handler", code: vue(`  <div><div class="dropdown" @click.stop><a href="/a">A</a> text</div></div>`) },
      { name: "inline stopPropagation", code: vue(`  <div><div @click="$event.stopPropagation()">Panel</div></div>`) },
      { name: "wraps a checkbox", code: vue(`  <div><div class="row" @click="toggle(item)"><input type="checkbox" :checked="item.done" aria-label="Done"> {{ item.title }}</div></div>`) },
      { name: "inside a label", code: vue(`  <div><label><input type="checkbox" v-model="agree"><span @click="openTerms">terms</span></label></div>`) },
      { name: "inside a button", code: vue(`  <div><button type="button" @click="open"><span @click.stop="clear">×</span> Filter</button></div>`) },
      { name: "component", code: vue(`  <div><MyCard @click="open(card)" /></div>`) },
      { name: "v-on object", code: vue(`  <div><div v-on="listeners" @click="open">x</div></div>`) },
      { name: "v-bind object", code: vue(`  <div><div v-bind="$attrs" @click="open">x</div></div>`) },
      { name: "aria-hidden element", code: vue(`  <div><span aria-hidden="true" @click="focusInput">*</span></div>`) },
      { name: "listbox option inside a role", code: vue(`  <div><ul role="listbox"><li v-for="o in options" :key="o.id" @click="pick(o)">{{ o.label }}</li></ul></div>`) },
      { name: "wraps a router link", code: vue(`  <div><li @click="close"><RouterLink to="/a">A</RouterLink></li></div>`) },
      { name: "list item driven by a keyboard cursor", code: vue(`  <div><div v-for="(tool, idx) in items" :key="tool.id" class="item" :class="{ active: idx === selectedIndex }" @click="pick(idx)">{{ tool.title }}</div></div>`) },
      { name: "keyboard cursor in a class array", code: vue(`  <ul><li v-for="(c, i) in countries" :key="c.id" :class="[i === state.highlightedIndex && 'focus']" @click="select(c)">{{ c.name }}</li></ul>`) },
      { name: "wraps slot content", code: vue(`  <div class="card"><div class="body" @click="handleClick"><slot /></div></div>`) },
      { name: "content from a custom html directive", code: vue(`  <div><div v-dompurify-html="message.html" class="prose" @click="openLink"></div></div>`) },
    ],
    invalid: [
      { name: "clickable card div", code: vue(`  <div><div class="card" @click="open(card)">{{ card.title }}</div></div>`) },
      { name: "clickable span", code: vue(`  <div><span class="copy" @click="copy(text)">Copy</span></div>`) },
      { name: "clickable li", code: vue(`  <div><ul><li v-for="o in options" :key="o.id" @click="pick(o)">{{ o.label }}</li></ul></div>`) },
      { name: "clickable image", code: vue(`  <div><img :src="photo" alt="Product" @click="zoom"></div>`) },
      { name: "click with a key-less modifier", code: vue(`  <div><div @click.prevent="toggle">Details</div></div>`) },
      { name: "full-cover element with content", code: vue(`  <div><div class="absolute inset-0 flex items-center" @click="play"><span>Play</span></div></div>`) },
      { name: "background-image button class", code: vue(`  <div><div class="bg-close" @click="close"></div><p>Hi</p></div>`) },
      { name: "bound class that is not a keyboard cursor", code: vue(`  <div><span class="tag" :class="{ active: isActive }" @click="toggle">Tag</span></div>`) },
    ],
  },
};

export default cases;
