export interface ReportDescriptor {
  node: EsTreeNode;
  message: string;
}

export interface RuleContext {
  report: (descriptor: ReportDescriptor) => void;
  /** Path of the linted file (ESLint 9+ / oxlint). */
  filename?: string;
  /** The rule's configured options (`[severity, options]` minus the severity); empty or absent without options. */
  options?: readonly unknown[];
  /** @deprecated Removed in ESLint 10; only read when `filename` is undefined. */
  getFilename?: () => string;
  /** Shared settings from the lint config; Vue Doctor's own live under `"vue-doctor"`. */
  settings?: Record<string, unknown>;
}

export interface RuleVisitors {
  [selector: string]: ((node: EsTreeNode) => void) | (() => void);
}

export interface Rule {
  meta?: any;
  create: (context: RuleContext) => RuleVisitors;
}

/** An ESLint flat config object; `plugins` points back at the plugin that owns the preset. */
export interface PluginConfig {
  name: string;
  plugins: Record<string, RulePlugin>;
  rules: Record<string, "error" | "warn">;
  settings?: Record<string, unknown>;
}

export interface RulePlugin {
  meta: { name: string };
  rules: Record<string, Rule>;
  /** Ready-made rule sets: `recommended` (every Vue project) and `nuxt` (adds Nuxt-only rules). */
  configs: { recommended: PluginConfig; nuxt: PluginConfig };
}

export interface EsTreeNode {
  type: string;
  [key: string]: any;
}
