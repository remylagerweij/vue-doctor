// async-parallel
async function badAsync() {
  const a = await fetch('/a');
  const b = await fetch('/b');
  const c = await fetch('/c'); // Should trigger (threshold is 3)
}

// js-combine-iterations
const items = [1, 2, 3];
items.filter(i => i > 0).map(i => i * 2);

// js-tosorted-immutable
items.sort(); // Wait, rule checks [...arr].sort() or just .sort()?
// Rule: `receiver?.type === "ArrayExpression" && ... type === "SpreadElement"`
// So it catches `[...arr].sort()`
[...items].sort();

// js-hoist-regexp
for (const i of items) {
  const regex = new RegExp("abc"); // Should trigger
  regex.test("abc");
}

// js-min-max-loop
items.sort()[0]; // Min
items.sort()[items.length - 1]; // Max

// js-set-map-lookups
for (const i of items) {
  if (items.includes(i)) {} // O(n) in loop
}

// js-batch-dom-css
function updateStyle() {
  const el = document.createElement("div");
  el.style.width = "100px";
  el.style.height = "100px"; // Should trigger
  // console.log(el.offsetWidth);
}

// js-index-maps
const users = [{id: 1}, {id: 2}];
for (const i of items) {
  users.find(u => u.id === i); // O(n*m)
}

// js-cache-storage
function checkStorage() {
  localStorage.getItem("key");
  localStorage.getItem("key");
}

// js-early-exit
function test(a) {
  if (a) {
    if (a > 1) {
      if (a > 2) {
        if (a > 3) { // Should trigger (threshold is 3 nested levels, so 4 deep)
           console.log(a);
        }
      }
    }
  }
}
