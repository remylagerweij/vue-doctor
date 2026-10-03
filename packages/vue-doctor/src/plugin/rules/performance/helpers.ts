import type { EsTreeNode } from "../../types.js";

export const isMemberProperty = (node: EsTreeNode | null, name: string): boolean =>
  node?.type === "MemberExpression" &&
  node.property?.type === "Identifier" &&
  node.property.name === name;
