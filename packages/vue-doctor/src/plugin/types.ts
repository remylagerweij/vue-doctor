export interface ReportDescriptor {
  node: EsTreeNode;
  message: string;
}

export interface RuleContext {
  report: (descriptor: ReportDescriptor) => void;
  /** Path of the linted file (ESLint 9+ / oxlint). */
  filename?: string;
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

export interface RulePlugin {
  meta: { name: string };
  rules: Record<string, Rule>;
}

export interface EsTreeNode {
  type: string;
  [key: string]: any;
}
