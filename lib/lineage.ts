// Idea breeding: the family tree that grows on a result when the visitor
// crosses two ideas. Types and pure helpers only, so both the page and the
// API routes can import this file.
//
// Every idea in the tree is a node with a string id:
//   "root"            the visitor's original idea
//   "d:<label>"       one of the result's directions, e.g. "d:B2B"
//   "o:<id>"          an offspring made by crossing two other nodes

import type { Version } from "@/lib/openrouter";

export type NodeId = string;
export const ROOT_ID: NodeId = "root";

/** One child of a cross. `direction` holds its generation label, e.g. "Gen 2". */
export type Offspring = Version & {
  id: string;
  generation: number; // 1 = a cross of two directions; parents' max + 1 after that
  parents: [NodeId, NodeId];
  inherits: string; // "Inherits X from A, Y from B"
  createdAt: number;
  saved?: boolean; // the visitor saved this one; it shows on the Saved page
};

/** The judge's verdict on a set of offspring from one generation. */
export type GenerationVerdict = {
  id: string;
  generation: number;
  offspringIds: string[]; // what was judged
  pickId: string; // the offspring the judge would chase
  why: string;
  notes: { id: string; note: string }[]; // one line per judged offspring
  model: string;
  createdAt: number;
};

export type Lineage = { offspring: Offspring[]; verdicts: GenerationVerdict[] };

export const EMPTY_LINEAGE: Lineage = { offspring: [], verdicts: [] };

// A cross sends at most this much of each parent, so a request stays small.
export const MAX_FIELD_LENGTH = 1500;
export const OFFSPRING_PER_CROSS = 3;
// "Judge this generation" looks at no more than this many offspring at once.
export const MAX_JUDGED = 9;

export const directionNodeId = (label: string): NodeId => `d:${label}`;
export const offspringNodeId = (id: string): NodeId => `o:${id}`;

/** What a parent looks like when it's sent to be crossed. */
export type ParentIdea = { label: string; title: string; pitch: string; details: Record<string, string> };

/** Find any node's idea: a direction or an offspring (not the root). */
export function findIdea(
  versions: Version[],
  lineage: Lineage,
  nodeId: NodeId
): { idea: Version; generation: number; offspring?: Offspring } | null {
  if (nodeId.startsWith("d:")) {
    const v = versions.find((x) => x.direction === nodeId.slice(2));
    return v ? { idea: v, generation: 0 } : null;
  }
  if (nodeId.startsWith("o:")) {
    const o = lineage.offspring.find((x) => x.id === nodeId.slice(2));
    return o ? { idea: o, generation: o.generation, offspring: o } : null;
  }
  return null;
}

/** Every ancestor of a node (not including itself), following parent links up to the root. */
export function ancestorsOf(lineage: Lineage, nodeId: NodeId): Set<NodeId> {
  const out = new Set<NodeId>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id.startsWith("d:")) {
      out.add(ROOT_ID);
      continue;
    }
    const o = lineage.offspring.find((x) => offspringNodeId(x.id) === id);
    for (const p of o?.parents ?? []) {
      if (!out.has(p)) {
        out.add(p);
        stack.push(p);
      }
    }
  }
  return out;
}

/** Old results have no lineage; give them an empty one. Also drops malformed entries. */
export function readLineage(raw: unknown): Lineage {
  const l = (raw ?? {}) as Partial<Lineage>;
  return {
    offspring: Array.isArray(l.offspring)
      ? l.offspring.filter((o) => typeof o?.id === "string" && typeof o?.title === "string" && Array.isArray(o?.parents))
      : [],
    verdicts: Array.isArray(l.verdicts) ? l.verdicts.filter((v) => typeof v?.pickId === "string") : [],
  };
}
