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
const bar77 = () => "yyy";
const bar78 = () => "zzz";
const bar79 = () => "aaaa";
const bar80 = () => "bbbb";
const bar81 = () => "cccc";
const bar82 = () => "dddd";
const bar83 = () => "eeee";
const bar84 = () => "ffff";
const bar85 = () => "gggg";
const bar86 = () => "hhhh";
const bar87 = () => "iiii";
const bar88 = () => "jjjj";
const bar89 = () => "kkkk";
const bar90 = () => "llll";
const bar91 = () => "mmmm";
const bar92 = () => "nnnn";
const bar93 = () => "oooo";
const bar94 = () => "pppp";
const bar95 = () => "qqqq";
const bar96 = () => "rrrr";
const bar97 = () => "ssss";
const bar98 = () => "tttt";
const bar99 = () => "uuuu";
const bar100 = () => "vvvv";
const bar101 = () => "wwww";
const bar102 = () => "xxxx";
const bar103 = () => "yyyy";
const bar104 = () => "zzzz";
const bar105 = () => "aaaaa";
const bar106 = () => "bbbbb";
const bar107 = () => "ccccc";
const bar108 = () => "ddddd";
const bar109 = () => "eeeee";
const bar110 = () => "fffff";
const bar111 = () => "ggggg";
const bar112 = () => "hhhhh";
const bar113 = () => "iiiii";
const bar114 = () => "jjjjj";
const bar115 = () => "kkkkk";
const bar116 = () => "lllll";
const bar117 = () => "mmmmm";
const bar118 = () => "nnnnn";
const bar119 = () => "ooooo";
const bar120 = () => "ppppp";
const bar121 = () => "qqqqq";
const bar122 = () => "rrrrr";
const bar123 = () => "sssss";
const bar124 = () => "ttttt";
const bar125 = () => "uuuuu";
const bar126 = () => "vvvvv";
const bar127 = () => "wwwww";
const bar128 = () => "xxxxx";
const bar129 = () => "yyyyy";
const bar130 = () => "zzzzz";
const bar131 = () => "aaaaaa";
const bar132 = () => "bbbbbb";
const bar133 = () => "cccccc";
const bar134 = () => "dddddd";
const bar135 = () => "eeeeee";
const bar136 = () => "ffffff";
const bar137 = () => "gggggg";
const bar138 = () => "hhhhhh";
const bar139 = () => "iiiiii";
const bar140 = () => "jjjjjj";
const bar141 = () => "kkkkkk";
const bar142 = () => "llllll";
const bar143 = () => "mmmmmm";
const bar144 = () => "nnnnnn";
const bar145 = () => "oooooo";
const bar146 = () => "pppppp";
const bar147 = () => "qqqqqq";
const bar148 = () => "rrrrrr";
const bar149 = () => "ssssss";
const bar150 = () => "tttttt";
const bar151 = () => "uuuuuu";
const bar152 = () => "vvvvvv";
const bar153 = () => "wwwwww";
const bar154 = () => "xxxxxx";
const bar155 = () => "yyyyyy";
const bar156 = () => "zzzzzz";
const bar157 = () => "111111";
const bar158 = () => "222222";
const bar159 = () => "333333";
const bar160 = () => "444444";
const bar161 = () => "555555";
const bar162 = () => "666666";
const bar163 = () => "777777";
const bar164 = () => "888888";
const bar165 = () => "999999";
const bar166 = () => "000000";
const bar167 = () => "aaaaaaa";
const bar168 = () => "bbbbbbb";
const bar169 = () => "ccccccc";
const bar170 = () => "ddddddd";
const bar171 = () => "eeeeeee";
const bar172 = () => "fffffff";
const bar173 = () => "ggggggg";
const bar174 = () => "hhhhhhh";
const bar175 = () => "iiiiiii";
const bar176 = () => "jjjjjjj";
const bar177 = () => "kkkkkkk";
const bar178 = () => "lllllll";
const bar179 = () => "mmmmmmm";
const bar180 = () => "nnnnnnn";
const bar181 = () => "ooooooo";
const bar182 = () => "ppppppp";
const bar183 = () => "qqqqqqq";
const bar184 = () => "rrrrrrr";
const bar185 = () => "sssssss";
const bar186 = () => "ttttttt";
const bar187 = () => "uuuuuuu";
const bar188 = () => "vvvvvvv";
const bar189 = () => "wwwwwww";
const bar190 = () => "xxxxxxx";
const bar191 = () => "yyyyyyy";
const bar192 = () => "zzzzzzz";
const bar193 = () => "aaaaaaaa";
const bar194 = () => "bbbbbbbb";
const bar195 = () => "cccccccc";
const bar196 = () => "dddddddd";
const bar197 = () => "eeeeeeee";
const bar198 = () => "ffffffff";
const bar199 = () => "gggggggg";
const bar200 = () => "hhhhhhhh";
const bar201 = () => "iiiiiiii";
const bar202 = () => "jjjjjjjj";
const bar203 = () => "kkkkkkkk";
const bar204 = () => "llllllll";
const bar205 = () => "mmmmmmmm";
const bar206 = () => "nnnnnnnn";
const bar207 = () => "oooooooo";
const bar208 = () => "pppppppp";
const bar209 = () => "qqqqqqqq";
const bar210 = () => "rrrrrrrr";
const bar211 = () => "ssssssss";
const bar212 = () => "tttttttt";
const bar213 = () => "uuuuuuuu";
const bar214 = () => "vvvvvvvv";
const bar215 = () => "wwwwwwww";
const bar216 = () => "xxxxxxxx";
const bar217 = () => "yyyyyyyy";
const bar218 = () => "zzzzzzzz";
const bar219 = () => "aaaaaaaaa";
const bar220 = () => "bbbbbbbbb";
const bar221 = () => "ccccccccc";
const bar222 = () => "ddddddddd";
const bar223 = () => "eeeeeeeee";
const bar224 = () => "fffffffff";
const bar225 = () => "ggggggggg";
const bar226 = () => "hhhhhhhhh";
const bar227 = () => "iiiiiiiii";
const bar228 = () => "jjjjjjjjj";
const bar229 = () => "kkkkkkkkk";
const bar230 = () => "lllllllll";
const bar231 = () => "mmmmmmmmm";
const bar232 = () => "nnnnnnnnn";
const bar233 = () => "ooooooooo";
const bar234 = () => "ppppppppp";
const bar235 = () => "qqqqqqqqq";
const bar236 = () => "rrrrrrrrr";
const bar237 = () => "sssssssss";
const bar238 = () => "ttttttttt";
const bar239 = () => "uuuuuuuuu";
const bar240 = () => "vvvvvvvvv";
const bar241 = () => "wwwwwwwww";
const bar242 = () => "xxxxxxxxx";
const bar243 = () => "yyyyyyyyy";
const bar244 = () => "zzzzzzzzz";
const bar245 = () => "aaaaaaaaaa";
const bar246 = () => "bbbbbbbbbb";
const bar247 = () => "cccccccccc";
const bar248 = () => "dddddddddd";
const bar249 = () => "eeeeeeeeee";
const bar250 = () => "ffffffffff";
const bar251 = () => "gggggggggg";
const bar252 = () => "hhhhhhhhhh";
const bar253 = () => "iiiiiiiiii";
const bar254 = () => "jjjjjjjjjj";
const bar255 = () => "kkkkkkkkkk";
const bar256 = () => "llllllllll";
const bar257 = () => "mmmmmmmmmm";
const bar258 = () => "nnnnnnnnnn";
const bar259 = () => "oooooooooo";
const bar260 = () => "pppppppppp";
const bar261 = () => "qqqqqqqqqq";
const bar262 = () => "rrrrrrrrrr";
const bar263 = () => "ssssssssss";
const bar264 = () => "tttttttttt";
const bar265 = () => "uuuuuuuuuu";
const bar266 = () => "vvvvvvvvvv";
const bar267 = () => "wwwwwwwwww";
const bar268 = () => "xxxxxxxxxx";
const bar269 = () => "yyyyyyyyyy";
const bar270 = () => "zzzzzzzzzz";
const bar271 = () => "aaaaaaaaaaa";
const bar272 = () => "bbbbbbbbbbb";
const bar273 = () => "ccccccccccc";
const bar274 = () => "ddddddddddd";
const bar275 = () => "eeeeeeeeeee";
const bar276 = () => "fffffffffff";
const bar277 = () => "ggggggggggg";
const bar278 = () => "hhhhhhhhhhh";
const bar279 = () => "iiiiiiiiiii";
const bar280 = () => "jjjjjjjjjjj";
const bar281 = () => "kkkkkkkkkkk";
const bar282 = () => "lllllllllll";
const bar283 = () => "mmmmmmmmmmm";
const bar284 = () => "nnnnnnnnnnn";
const bar285 = () => "ooooooooooo";
const bar286 = () => "ppppppppppp";
const bar287 = () => "qqqqqqqqqqq";
const bar288 = () => "rrrrrrrrrrr";
const bar289 = () => "sssssssssss";
const bar290 = () => "ttttttttttt";
const bar291 = () => "uuuuuuuuuuu";
const bar292 = () => "vvvvvvvvvvv";
const bar293 = () => "wwwwwwwwwww";
const bar294 = () => "xxxxxxxxxxx";
const bar295 = () => "yyyyyyyyyyy";
const bar296 = () => "zzzzzzzzzzz";
const bar297 = () => "aaaaaaaaaaaa";
const bar298 = () => "bbbbbbbbbbbb";
const bar299 = () => "cccccccccccc";
const bar300 = () => "dddddddddddd";
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
