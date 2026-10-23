import { randomUUID } from "node:crypto";
import type { GraphNode } from "./domain.js";
export const specialistNames = [
  "Contract analyst",
  "Timeline investigator",
  "Delay analyst",
  "Cost analyst",
  "Evidence verifier",
  "Lead investigator",
];
export function graph(documents: any[]): GraphNode[] {
  const now = new Date().toISOString();
  const node = (
    id: string,
    type: string,
    title: string,
    description: string,
    dependencies: string[],
    x: number,
    y: number,
  ): GraphNode => ({
    id,
    type,
    title,
    description,
    dependencies,
    inputs: {},
    x,
    y,
    state: "pending",
    output: null,
    updatedAt: now,
    history: [],
  });
  return [
    node(
      "sources",
      "document",
      "Project evidence",
      "Original documents & page-level sources",
      [],
      60,
      230,
    ),
    node(
      "contract",
      "agent",
      "Contract analyst",
      "Obligations, notices & relevant provisions",
      ["sources"],
      410,
      60,
    ),
    node(
      "timeline",
      "agent",
      "Timeline investigator",
      "Events, correspondence & conflicting accounts",
      ["sources"],
      410,
      275,
    ),
    node(
      "schedule",
      "tool",
      "Critical-path analysis",
      "Deterministic schedule calculation",
      ["sources"],
      410,
      490,
    ),
    node(
      "cost",
      "tool",
      "Financial analysis",
      "Source-linked arithmetic, in cents",
      ["sources"],
      760,
      490,
    ),
    node(
      "delay",
      "agent",
      "Delay analyst",
      "Schedule impacts & dependencies",
      ["schedule"],
      760,
      60,
    ),
    node(
      "cost-agent",
      "agent",
      "Cost analyst",
      "Documented costs & declared assumptions",
      ["cost"],
      760,
      275,
    ),
    node(
      "verify",
      "validation",
      "Evidence verifier",
      "Cross-check source excerpts & contradictions",
      ["contract", "timeline", "delay", "cost-agent"],
      1110,
      170,
    ),
    node(
      "lead",
      "agent",
      "Lead investigator",
      "Combine findings & identify evidence gaps",
      ["verify"],
      1460,
      170,
    ),
    node(
      "approval",
      "approval",
      "Professional review",
      "Accept or reject evidence-backed findings",
      ["lead"],
      1810,
      170,
    ),
    node(
      "report",
      "finding",
      "Investigation report",
      "Export an auditable assessment",
      ["approval"],
      2160,
      170,
    ),
  ];
}
export function emptyProject(org: string, name: string, description = "") {
  return {
    id: randomUUID(),
    org,
    name,
    description,
    location: "",
    reference: "PRJ-" + Date.now().toString().slice(-5),
    fictional: false,
    archived: false,
    createdAt: new Date().toISOString(),
    documents: [],
    investigations: [],
    activities: [],
    costRecords: [],
    notes: [],
  };
}
export function demoProject(org: string) {
  const p: any = emptyProject(
    org,
    "Riverside Quarter",
    "Design change & delayed access investigation",
  );
  p.fictional = true;
  p.reference = "RQ-2026-014";
  p.location = "Austin, Texas";
  const contents = [
    [
      "Construction agreement",
      "contract",
      "Contract §8.3: The contractor shall provide written notice of delay within 14 calendar days after becoming aware of the event. Extensions require evidence of impact to the critical path. Clause 12.2: Additional work requires written instruction and substantiated cost records. This fictional contract is not legal advice.",
    ],
    [
      "Baseline programme",
      "schedule",
      "Baseline approved 01 September 2026. Mobilisation: 5 calendar days. Foundation works: 12 calendar days after mobilisation. Structural frame: 18 calendar days after foundations. Envelope: 10 calendar days after structural frame. Handover: 0 days after envelope. Finish-to-start relationships, no resource constraints.",
    ],
    [
      "Design instruction DI-017",
      "event",
      "08 September 2026. To: Main contractor. From: Design consultant. Revise foundation layout for Grid C. Foundation works cannot proceed in this area until revised drawings are released. Drawing release is expected on 16 September 2026. Please retain cost records.",
    ],
    [
      "Site diary · 09 September",
      "evidence",
      "09 September 2026. Site supervisor reports foundation crew unable to progress at Grid C pending revised drawings. Eight crew members and one excavator stood by. Work in other areas continued. Access to Grid C was reported available by the site supervisor.",
    ],
    [
      "Notice of delay N-004",
      "event",
      "10 September 2026. The contractor gives written notice under clause 8.3 regarding the design revision issued 08 September 2026. Delay impact remains subject to schedule analysis and site access confirmation.",
    ],
    [
      "Cost register CR-008",
      "cost",
      "Recorded standby: labor 64 hours at USD 45 per hour = USD 2,880. Equipment 8 hours at USD 175 per hour = USD 1,400. Signed timesheets and equipment log support these entries. Estimated extended site overhead: 8 days at USD 650 per day = USD 5,200; no invoice supplied. These figures are fictional.",
    ],
  ];
  p.documents = contents.map(([name, category, text]) => ({
    id: randomUUID(),
    name: name + ".txt",
    category,
    mime: "text/plain",
    size: Buffer.byteLength(text),
    pages: [{ number: 1, text }],
    status: "extracted",
    createdAt: p.createdAt,
    fictional: true,
  }));
  p.activities = [
    { id: "a", name: "Mobilisation", duration: 5, delay: 0, dependencies: [] },
    {
      id: "b",
      name: "Foundation works",
      duration: 12,
      delay: 8,
      dependencies: ["a"],
    },
    {
      id: "c",
      name: "Structural frame",
      duration: 18,
      delay: 0,
      dependencies: ["b"],
    },
    { id: "d", name: "Envelope", duration: 10, delay: 0, dependencies: ["c"] },
    { id: "e", name: "Handover", duration: 0, delay: 0, dependencies: ["d"] },
  ];
  const source = (quote: string) => ({
    documentId: p.documents[5].id,
    page: 1,
    quote,
  });
  p.costRecords = [
    {
      id: randomUUID(),
      category: "Labor",
      description: "Foundation crew standby",
      quantity: 64,
      rateCents: 4500,
      basis: "documented",
      source: source("labor 64 hours at USD 45 per hour = USD 2,880"),
    },
    {
      id: randomUUID(),
      category: "Equipment",
      description: "Excavator standby",
      quantity: 8,
      rateCents: 17500,
      basis: "documented",
      source: source("Equipment 8 hours at USD 175 per hour = USD 1,400"),
    },
    {
      id: randomUUID(),
      category: "Extended overhead",
      description: "Modeled site overhead",
      quantity: 8,
      rateCents: 65000,
      basis: "estimated",
      source: source(
        "Estimated extended site overhead: 8 days at USD 650 per day = USD 5,200",
      ),
    },
  ];
  p.investigations = [
    {
      id: randomUUID(),
      name: "Design change · Grid C",
      scope:
        "Investigate design revision, concurrent access constraints, modeled delay and evidenced standby costs.",
      status: "draft",
      createdAt: p.createdAt,
      nodes: graph(p.documents),
      events: [],
      versions: [],
      usage: { inputTokens: 0, outputTokens: 0, requests: 0 },
      runId: null,
    },
  ];
  return p;
}
