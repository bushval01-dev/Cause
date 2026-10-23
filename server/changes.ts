import { invalidate, type GraphNode } from "./domain.js";
import { randomUUID } from "node:crypto";
/** Evidence references and topic overlap supplement categories. Unknown text invalidates all analysts conservatively. */
export function affectedRoots(inv: any, document: any) {
  const roots = new Set<string>(["timeline"]);
  const text = document.pages
    .map((p: any) => p.text)
    .join(" ")
    .toLowerCase();
  const topics: [RegExp, string[]][] = [
    [
      /contract|clause|notice|obligation|deadline|entitle|instruction/,
      ["contract"],
    ],
    [
      /delay|schedule|programme|program|access|critical|foundation|drawing|completion|standby/,
      ["schedule", "delay"],
    ],
    [
      /cost|invoice|labor|labour|equipment|overhead|\$|usd|amount|standby/,
      ["cost", "cost-agent"],
    ],
  ];
  let matched = false;
  for (const [regex, ids] of topics)
    if (regex.test(text)) {
      ids.forEach((id) => roots.add(id));
      matched = true;
    }
  const byCategory: any = {
    contract: ["contract"],
    schedule: ["schedule", "delay"],
    cost: ["cost", "cost-agent"],
  };
  for (const id of byCategory[document.category] || []) roots.add(id);
  if (!matched || !text.trim())
    for (const n of inv.nodes)
      if (["agent", "validation", "contradiction"].includes(n.type))
        roots.add(n.id);
  for (const n of inv.nodes) {
    if (
      ![
        "sources",
        "contract",
        "timeline",
        "schedule",
        "cost",
        "delay",
        "cost-agent",
        "verify",
        "lead",
        "approval",
        "report",
      ].includes(n.id) &&
      (!n.inputs?.documentIds?.length ||
        ["agent", "validation", "contradiction"].includes(n.type) ||
        n.inputs?.documentIds?.includes(document.id))
    )
      roots.add(n.id);
    const findings = n.output?.findings || [];
    if (
      findings.some((f: any) =>
        f.sources?.some((s: any) => s.documentId === document.id),
      )
    )
      roots.add(n.id);
  }
  return [...roots];
}
export function evidenceChanged(p: any, document: any, reason: string) {
  for (const inv of p.investigations) {
    const changed = invalidate(inv.nodes, affectedRoots(inv, document), reason);
    inv.status = "draft";
    inv.events.push({
      id: randomUUID(),
      at: new Date().toISOString(),
      message: `${reason}. ${changed.length} nodes invalidated by source links, topics and dependency closure; unrelated results preserved.`,
    });
  }
}
