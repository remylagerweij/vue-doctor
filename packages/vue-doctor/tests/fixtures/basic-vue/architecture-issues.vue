<script setup lang="ts">
// Giant component — this file is intentionally > 300 lines to trigger the rule

import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";

const count = ref(0);
const name = ref("test");
const items = ref<string[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const page = ref(1);
const search = ref("");
const filter = ref("all");
const sort = ref("asc");
const limit = ref(10);

const total = computed(() => items.value.length);
const filtered = computed(() =>
  items.value.filter((item) => item.includes(search.value))
);
const sorted = computed(() =>
  [...filtered.value].sort((a, b) =>
    sort.value === "asc" ? a.localeCompare(b) : b.localeCompare(a)
  )
);
const paginated = computed(() =>
  sorted.value.slice((page.value - 1) * limit.value, page.value * limit.value)
);

const increment = () => count.value++;
const decrement = () => count.value--;
const reset = () => (count.value = 0);
const addItem = (item: string) => items.value.push(item);
const removeItem = (index: number) => items.value.splice(index, 1);
const clearItems = () => (items.value = []);
const toggleSort = () => (sort.value = sort.value === "asc" ? "desc" : "asc");
const nextPage = () => page.value++;
const prevPage = () => page.value--;
const setSearch = (value: string) => (search.value = value);
const setFilter = (value: string) => (filter.value = value);
const setLimit = (value: number) => (limit.value = value);

// More filler to reach 300+ lines
const foo1 = computed(() => count.value * 1);
const foo2 = computed(() => count.value * 2);
const foo3 = computed(() => count.value * 3);
const foo4 = computed(() => count.value * 4);
const foo5 = computed(() => count.value * 5);
const foo6 = computed(() => count.value * 6);
const foo7 = computed(() => count.value * 7);
const foo8 = computed(() => count.value * 8);
const foo9 = computed(() => count.value * 9);
const foo10 = computed(() => count.value * 10);
const foo11 = computed(() => count.value * 11);
const foo12 = computed(() => count.value * 12);
const foo13 = computed(() => count.value * 13);
const foo14 = computed(() => count.value * 14);
const foo15 = computed(() => count.value * 15);
const foo16 = computed(() => count.value * 16);
const foo17 = computed(() => count.value * 17);
const foo18 = computed(() => count.value * 18);
const foo19 = computed(() => count.value * 19);
const foo20 = computed(() => count.value * 20);
const foo21 = computed(() => count.value * 21);
const foo22 = computed(() => count.value * 22);
const foo23 = computed(() => count.value * 23);
const foo24 = computed(() => count.value * 24);
const foo25 = computed(() => count.value * 25);

const handleSubmit = (e: Event) => {
  e.preventDefault();
  addItem(name.value);
  name.value = "";
};

const handleSearch = (e: Event) => {
  const target = e.target as HTMLInputElement;
  setSearch(target.value);
};

const handleFilter = (e: Event) => {
  const target = e.target as HTMLSelectElement;
  setFilter(target.value);
};

const handleLimit = (e: Event) => {
  const target = e.target as HTMLSelectElement;
  setLimit(Number(target.value));
};

onMounted(() => {
  console.log("mounted");
});

onUnmounted(() => {
  console.log("unmounted");
});

watch(search, () => {
  page.value = 1;
});

watch(filter, () => {
  page.value = 1;
});

const bar1 = () => "a";
const bar2 = () => "b";
const bar3 = () => "c";
const bar4 = () => "d";
const bar5 = () => "e";
const bar6 = () => "f";
const bar7 = () => "g";
const bar8 = () => "h";
const bar9 = () => "i";
const bar10 = () => "j";
const bar11 = () => "k";
const bar12 = () => "l";
const bar13 = () => "m";
const bar14 = () => "n";
const bar15 = () => "o";
const bar16 = () => "p";
const bar17 = () => "q";
const bar18 = () => "r";
const bar19 = () => "s";
const bar20 = () => "t";
const bar21 = () => "u";
const bar22 = () => "v";
const bar23 = () => "w";
const bar24 = () => "x";
const bar25 = () => "y";
const bar26 = () => "z";
const bar27 = () => "aa";
const bar28 = () => "bb";
const bar29 = () => "cc";
const bar30 = () => "dd";
const bar31 = () => "ee";
const bar32 = () => "ff";
const bar33 = () => "gg";
const bar34 = () => "hh";
const bar35 = () => "ii";
const bar36 = () => "jj";
const bar37 = () => "kk";
const bar38 = () => "ll";
const bar39 = () => "mm";
const bar40 = () => "nn";
const bar41 = () => "oo";
const bar42 = () => "pp";
const bar43 = () => "qq";
const bar44 = () => "rr";
const bar45 = () => "ss";
const bar46 = () => "tt";
const bar47 = () => "uu";
const bar48 = () => "vv";
const bar49 = () => "ww";
const bar50 = () => "xx";
const bar51 = () => "yy";
const bar52 = () => "zz";
const bar53 = () => "aaa";
const bar54 = () => "bbb";
const bar55 = () => "ccc";
const bar56 = () => "ddd";
const bar57 = () => "eee";
const bar58 = () => "fff";
const bar59 = () => "ggg";
const bar60 = () => "hhh";
const bar61 = () => "iii";
const bar62 = () => "jjj";
const bar63 = () => "kkk";
const bar64 = () => "lll";
const bar65 = () => "mmm";
const bar66 = () => "nnn";
const bar67 = () => "ooo";
const bar68 = () => "ppp";
const bar69 = () => "qqq";
const bar70 = () => "rrr";
const bar71 = () => "sss";
const bar72 = () => "ttt";
const bar73 = () => "uuu";
const bar74 = () => "vvv";
const bar75 = () => "www";
const bar76 = () => "xxx";
</script>

<template>
  <div>
    <h1>Giant Component</h1>
    <form @submit.prevent="handleSubmit">
      <input v-model="name" />
      <button type="submit">Add</button>
    </form>
    <input @input="handleSearch" :value="search" />
    <select @change="handleFilter">
      <option value="all">All</option>
    </select>
    <select @change="handleLimit">
      <option value="10">10</option>
      <option value="25">25</option>
    </select>
    <ul>
      <li v-for="(item, index) in paginated" :key="index">
        {{ item }}
        <button @click="removeItem(index)">Remove</button>
      </li>
    </ul>
    <button @click="prevPage" :disabled="page <= 1">Prev</button>
    <button @click="nextPage">Next</button>
    <button @click="toggleSort">Toggle Sort</button>
    <button @click="clearItems">Clear</button>
    <p>Total: {{ total }}</p>
    <p>Count: {{ count }}</p>
    <button @click="increment">+</button>
    <button @click="decrement">-</button>
    <button @click="reset">Reset</button>
    <p>{{ foo1 }} {{ foo2 }} {{ foo3 }} {{ foo4 }} {{ foo5 }}</p>
    <p>{{ foo6 }} {{ foo7 }} {{ foo8 }} {{ foo9 }} {{ foo10 }}</p>
    <p>{{ foo11 }} {{ foo12 }} {{ foo13 }} {{ foo14 }} {{ foo15 }}</p>
    <p>{{ foo16 }} {{ foo17 }} {{ foo18 }} {{ foo19 }} {{ foo20 }}</p>
    <p>{{ foo21 }} {{ foo22 }} {{ foo23 }} {{ foo24 }} {{ foo25 }}</p>
  </div>
</template>
