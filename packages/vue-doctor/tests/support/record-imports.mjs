// Preloaded with `node --import` (via NODE_OPTIONS, so child processes are recorded too).
// Registers a module-resolution hook that appends every bare package specifier that gets
// imported to the file named by IMPORT_RECORDER_LOG ("<pid> <specifier>" per line).
import { register } from "node:module";

register("./record-imports-hooks.mjs", import.meta.url);
