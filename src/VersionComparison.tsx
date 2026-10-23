import React, { useState } from "react";
export default function VersionComparison({
  investigation,
}: {
  investigation: any;
}) {
  const versions = [
      ...investigation.versions,
      {
        id: "current",
        at: new Date().toISOString(),
        status: investigation.status,
        nodes: investigation.nodes,
      },
    ],
    [left, setLeft] = useState(Math.max(0, versions.length - 2)),
    [right, setRight] = useState(versions.length - 1);
  const a = versions[left],
    b = versions[right];
  if (versions.length < 2)
    return (
      <p className="muted">
        Execute or reopen the investigation to create a comparison snapshot.
      </p>
    );
  const ids = [
    ...new Set<string>([...a.nodes, ...b.nodes].map((n: any) => n.id)),
  ];
  return (
    <div className="version-comparison">
      <div className="form-row">
        <label>
          Before
          <select
            value={left}
            onChange={(e) => setLeft(Number(e.target.value))}
          >
            {versions.map((v, i) => (
              <option value={i} key={v.id}>
                {v.id === "current" ? "Current" : `Version ${i + 1}`} ·{" "}
                {v.status}
              </option>
            ))}
          </select>
        </label>
        <label>
          After
          <select
            value={right}
            onChange={(e) => setRight(Number(e.target.value))}
          >
            {versions.map((v, i) => (
              <option value={i} key={v.id}>
                {v.id === "current" ? "Current" : `Version ${i + 1}`} ·{" "}
                {v.status}
              </option>
            ))}
          </select>
        </label>
      </div>
      {ids.map((id) => {
        const old = a.nodes.find((n: any) => n.id === id),
          next = b.nodes.find((n: any) => n.id === id);
        const changed =
          JSON.stringify(old?.output) !== JSON.stringify(next?.output) ||
          old?.state !== next?.state;
        return (
          <div className="version-node" key={id}>
            <h3>
              {next?.title || old?.title}
              <span className="mini-tag">
                {changed ? "Changed" : "Preserved"}
              </span>
            </h3>
            <div className="comparison-columns">
              {[old, next].map((n, i) => (
                <div key={i}>
                  <span className="eyebrow">
                    {i ? "AFTER" : "BEFORE"} · {n?.state || "Absent"}
                  </span>
                  <p>{n?.output?.summary || n?.error || "No output"}</p>
                  {n?.output?.findings?.map((f: any, j: number) => (
                    <div className="comparison-finding" key={j}>
                      <strong>{f.title}</strong>
                      <p>{f.detail}</p>
                      <small>
                        {f.verification} · {f.review}
                        {f.stale ? " · Outdated" : ""}
                      </small>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
