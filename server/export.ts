import type express from "express";
import { ZipArchive } from "archiver";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { db, dataDir, audit } from "./store.js";
export function projectExport(app: express.Express) {
  app.get("/api/projects/:id/export", (req, res) => {
    const p = (req as any).project;
    res.type("application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="CAUSE-project.zip"',
    );
    const zip = new ZipArchive({ zlib: { level: 6 } });
    zip.on("error", () => res.destroy());
    res.on("close", () => zip.abort());
    zip.pipe(res);
    const clean = { ...p };
    delete clean.org;
    zip.append(JSON.stringify(clean, null, 2), { name: "project.json" });
    zip.append(
      "CAUSE PROJECT ARCHIVE\nOriginal files use their document UUIDs. Match IDs in project.json for original names and source pages. Keys, passwords and session credentials are excluded. Analysis may be incomplete; inspect review and stale flags.\n",
      { name: "README.txt" },
    );
    for (const d of p.documents) {
      const path = resolve(dataDir, d.id);
      if (existsSync(path)) zip.file(path, { name: "originals/" + d.id });
      else
        zip.append("Original file missing: " + d.id, {
          name: "missing/" + d.id + ".txt",
        });
    }
    void zip.finalize();
    audit(p.org, (req as any).user.id, "Project archive exported: " + p.id);
  });
}
