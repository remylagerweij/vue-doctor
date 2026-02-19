<script setup lang="ts">
// Bundle size issues fixture

// no-full-lodash-import
import _ from "lodash";

// no-moment
import moment from "moment";

// prefer-dynamic-import
import MonacoEditor from "@monaco-editor/react";

// no-barrel-import
import { Button } from "./components/index";

const now = moment();
const debounced = _.debounce(() => {}, 300);
</script>

<template>
  <div>Bundle Issues: {{ now }}</div>
</template>
