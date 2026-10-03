import type { RuleCases } from "../../rule-cases.js";

const cases: RuleCases = {
  valid: [
    {
      name: "handler checks event.origin before reading data",
      code: `export const listen = (onData) => {\n  window.addEventListener("message", (event) => {\n    if (event.origin !== "https://trusted.example") return;\n    onData(event.data);\n  });\n};\n`,
    },
    {
      name: "handler checks an origin allowlist",
      code: `const ALLOWED = new Set(["https://a.example", "https://b.example"]);\nexport const listen = (onData) => {\n  window.addEventListener("message", ({ origin, data }) => {\n    if (!ALLOWED.has(origin)) return;\n    onData(data);\n  });\n};\n`,
    },
    {
      name: "handler checks event.source against the iframe window",
      code: `export const listen = (frame, onData) => {\n  const handle = (event) => {\n    if (event.source !== frame.contentWindow) return;\n    onData(event.data);\n  };\n  window.addEventListener("message", handle);\n};\n`,
    },
    {
      name: "handler passes the event to a validating function",
      code: `import { acceptMessage } from "./accept";\nexport const listen = () => {\n  window.addEventListener("message", (event) => acceptMessage(event));\n};\n`,
    },
    {
      name: "listener for another event and a worker message listener",
      code: `export const listen = (worker) => {\n  window.addEventListener("resize", (event) => console.log(event.data));\n  worker.addEventListener("message", (event) => console.log(event.data));\n};\n`,
    },
    {
      name: "postMessage with an explicit target origin",
      code: `export const send = (frame, token) => { frame.contentWindow.postMessage({ type: "auth", token }, "https://app.example"); };\n`,
    },
    {
      name: "wildcard postMessage with non-sensitive data",
      code: `export const send = (frame, height) => { frame.contentWindow.postMessage({ type: "resize", height }, "*"); };\n`,
    },
  ],
  invalid: [
    {
      name: "inline handler reads event.data without an origin check",
      code: `export const listen = (onData) => {\n  window.addEventListener("message", (event) => {\n    onData(event.data);\n  });\n};\n`,
    },
    {
      name: "named handler reads data without an origin check",
      code: `export function listen(onData) {\n  function handle(event) {\n    onData(event.data.payload);\n  }\n  window.addEventListener("message", handle);\n}\n`,
    },
    {
      name: "destructured data without origin",
      code: `export const listen = (onData) => {\n  window.addEventListener("message", ({ data }) => onData(data));\n};\n`,
    },
    {
      name: "window.onmessage assignment",
      code: `export const listen = (onData) => {\n  window.onmessage = (event) => { onData(event.data); };\n};\n`,
    },
    {
      name: "Options API method registered with this.method",
      filename: "src/Comp.vue",
      code: `<script>\nexport default {\n  mounted() {\n    window.addEventListener("message", this.onMessage);\n  },\n  methods: {\n    onMessage(event) {\n      this.payload = event.data;\n    },\n  },\n};\n</script>\n`,
    },
    {
      name: "VueUse useEventListener on window",
      code: `import { useEventListener } from "@vueuse/core";\nexport const useMessages = (onData) => {\n  useEventListener(window, "message", (event) => onData(event.data));\n};\n`,
    },
    {
      name: "postMessage of a token to any origin",
      code: `export const send = (frame, token) => { frame.contentWindow.postMessage({ type: "auth", token }, "*"); };\n`,
    },
    {
      name: "postMessage of a session value with a targetOrigin option",
      code: `export const send = (target, session) => { target.postMessage(session.jwt, { targetOrigin: "*" }); };\n`,
    },
  ],
};

export default cases;
