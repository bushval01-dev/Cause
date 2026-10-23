import React, { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  KeyRound,
  ShieldCheck,
  LogOut,
  Check,
} from "lucide-react";
async function api(p: string, method = "GET", body?: any) {
  const r = await fetch("/api" + p, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const v = await r.json();
  if (!r.ok) throw Error(v.error);
  return v;
}
export default function WorkspaceSettings({
  session,
  project,
  onAuth,
  onUpdate,
}: {
  session: any;
  project: any;
  onAuth: (mode: string) => void;
  onUpdate: () => void;
}) {
  const [ai, setAi] = useState<any>(null),
    [team, setTeam] = useState<any[]>([]),
    [audit, setAudit] = useState<any[]>([]),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [codes, setCodes] = useState<string[]>([]),
    [invite, setInvite] = useState(""),
    [remove, setRemove] = useState("");
  const owner = session?.user?.role === "owner";
  async function load() {
    const [a, t, l] = await Promise.all([
      api("/settings/ai"),
      api("/team"),
      api("/audit"),
    ]);
    setAi(a);
    setTeam(t);
    setAudit(l);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function action(fn: () => Promise<any>, text: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fn();
      await load();
      onUpdate();
      setMessage(text);
      return r;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-grid">
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="info-note" role="status">
          <Check size={16} />
          {message}
        </div>
      )}
      <section className="card">
        <span className="eyebrow">WORKSPACE & ACCOUNT</span>
        <h2>
          {session?.user?.guest
            ? "Explore the fictional case"
            : session?.user?.email}
        </h2>
        <p className="muted">
          {session?.user?.guest
            ? "Create an account for your own private organization. AI is optional."
            : "Secure sessions. Organization-isolated data. You control team access."}
        </p>
        <div className="button-row">
          {session?.user?.guest ? (
            <>
              <button
                className="btn primary"
                onClick={() => onAuth("register")}
              >
                Create account
              </button>
              <button className="btn" onClick={() => onAuth("login")}>
                Sign in
              </button>
            </>
          ) : (
            <button
              className="btn"
              onClick={async () => {
                await api("/logout", "POST");
                location.reload();
              }}
            >
              <LogOut size={14} />
              Sign out
            </button>
          )}
        </div>
        {!session?.user?.guest && (
          <>
            <details className="settings-detail">
              <summary>Change password</summary>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = e.currentTarget,
                    d = new FormData(f);
                  void action(
                    () =>
                      api("/account/password", "POST", {
                        currentPassword: d.get("current"),
                        newPassword: d.get("next"),
                      }),
                    "Password changed. Other sessions revoked.",
                  ).then((r) => r && f.reset());
                }}
              >
                <label>
                  Current password
                  <input
                    type="password"
                    name="current"
                    required
                    minLength={12}
                    autoComplete="current-password"
                  />
                </label>
                <label>
                  New password
                  <input
                    type="password"
                    name="next"
                    required
                    minLength={12}
                    autoComplete="new-password"
                  />
                </label>
                <button className="btn" disabled={busy}>
                  Change password
                </button>
              </form>
            </details>
            <details className="settings-detail">
              <summary>Account recovery codes</summary>
              <p className="muted">
                Generate eight single-use recovery codes. Store them offline;
                regenerating replaces previous codes.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = e.currentTarget,
                    d = new FormData(f);
                  void action(
                    () =>
                      api("/account/recovery-codes", "POST", {
                        password: d.get("password"),
                      }),
                    "Recovery codes generated. Save them now.",
                  ).then((r) => {
                    if (r) {
                      setCodes(r.codes);
                      f.reset();
                    }
                  });
                }}
              >
                <label>
                  Confirm password
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={12}
                  />
                </label>
                <button className="btn" disabled={busy}>
                  Generate recovery codes
                </button>
              </form>
              {codes.length > 0 && (
                <div className="recovery-codes">
                  <pre>{codes.join("\n")}</pre>
                  <button
                    className="btn"
                    onClick={() => {
                      const blob = new Blob([codes.join("\n")], {
                        type: "text/plain",
                      });
                      const url = URL.createObjectURL(blob),
                        a = document.createElement("a");
                      a.href = url;
                      a.download = "CAUSE-recovery-codes.txt";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Download codes
                  </button>
                  <button className="btn" onClick={() => setCodes([])}>
                    Hide codes
                  </button>
                </div>
              )}
            </details>
          </>
        )}
      </section>
      <section className="card">
        <span className="eyebrow">OPTIONAL AI CONNECTION</span>
        <div className="connection-title">
          <h2>Your OpenAI connection</h2>
          <span
            className={"status " + (ai?.aiConfigured ? "completed" : "draft")}
          >
            {ai?.aiConfigured ? "Configured" : "Optional · not connected"}
          </span>
        </div>
        <p className="muted">
          Leave the key empty to use projects, evidence, schedules, financial
          calculations and reports. Add your organization's key when you want AI
          investigations. Keys are encrypted on the server and never returned to
          the browser.
        </p>
        {owner && ai ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form),
                key = String(f.get("key") || "").trim();
              void action(
                () =>
                  api("/settings/ai", "PUT", {
                    ...(key ? { apiKey: key } : {}),
                    model: f.get("model"),
                    enabled: f.get("enabled") === "on",
                    inputRate:
                      f.get("inputRate") === ""
                        ? null
                        : Number(f.get("inputRate")),
                    outputRate:
                      f.get("outputRate") === ""
                        ? null
                        : Number(f.get("outputRate")),
                  }),
                "AI settings saved.",
              ).then((r) => {
                if (r)
                  (form.elements.namedItem("key") as HTMLInputElement).value =
                    "";
              });
            }}
          >
            <label>
              OpenAI API key (optional)
              <input
                name="key"
                type="password"
                placeholder={
                  ai.keySource === "organization"
                    ? "Saved key · leave blank to keep"
                    : "Leave empty to continue without AI"
                }
                autoComplete="off"
                minLength={20}
              />
            </label>
            <label>
              Model
              <input
                name="model"
                defaultValue={ai.model}
                required
                maxLength={100}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={ai.enabled}
              />
              Enable AI when a key is available
            </label>
            <div className="form-row">
              <label>
                Input USD / million tokens
                <input
                  type="number"
                  name="inputRate"
                  min={0}
                  step="any"
                  defaultValue={ai.inputRate ?? ""}
                />
              </label>
              <label>
                Output USD / million tokens
                <input
                  type="number"
                  name="outputRate"
                  min={0}
                  step="any"
                  defaultValue={ai.outputRate ?? ""}
                />
              </label>
            </div>
            <div className="button-row">
              <button className="btn primary" disabled={busy}>
                Save connection settings
              </button>
              {ai.keySource === "organization" && (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    void action(
                      () => api("/settings/ai", "PUT", { removeKey: true }),
                      "Organization key removed",
                    )
                  }
                >
                  Remove saved key
                </button>
              )}
            </div>
          </form>
        ) : (
          <p className="muted">
            Organization owners manage this optional connection.
          </p>
        )}
      </section>
      <section className="card">
        <span className="eyebrow">TEAM ACCESS</span>
        <h2>Your organization</h2>
        {team.map((u) => (
          <div className="team-row" key={u.id}>
            <span>{u.email}</span>
            {owner && u.role !== "owner" ? (
              <>
                <select
                  aria-label={"Role for " + u.email}
                  value={u.role}
                  disabled={busy}
                  onChange={(e) =>
                    void action(
                      () =>
                        api("/team/" + u.id, "PATCH", { role: e.target.value }),
                      "Role updated; existing sessions revoked",
                    )
                  }
                >
                  {["analyst", "reviewer", "viewer"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <button
                  aria-label={"Remove " + u.email}
                  onClick={() => setRemove(u.id)}
                >
                  <Trash2 size={15} />
                </button>
                {remove === u.id && (
                  <div className="button-row">
                    <button
                      className="btn danger"
                      onClick={() =>
                        void action(
                          () => api("/team/" + u.id, "DELETE"),
                          "Member removed",
                        ).then(() => setRemove(""))
                      }
                    >
                      Confirm removal
                    </button>
                    <button className="btn" onClick={() => setRemove("")}>
                      Cancel
                    </button>
                  </div>
                )}
              </>
            ) : (
              <span className="mini-tag">{u.role}</span>
            )}
          </div>
        ))}
        {owner && (
          <details className="settings-detail">
            <summary>Invite a team member</summary>
            <p className="muted">
              A single-use invitation expires in 48 hours. Share the link
              through your existing secure channel. The invitee sets their own
              password.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void action(
                  () =>
                    api("/team/invitations", "POST", {
                      email: f.get("email"),
                      role: f.get("role"),
                    }),
                  "Invitation created",
                ).then(
                  (r) =>
                    r && setInvite(location.origin + "/?invite=" + r.token),
                );
              }}
            >
              <label>
                Invitee email
                <input name="email" type="email" required />
              </label>
              <label>
                Role
                <select name="role">
                  <option value="analyst">Analyst</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
              <button className="btn" disabled={busy}>
                <Plus size={14} />
                Create invitation
              </button>
            </form>
            {invite && (
              <label>
                One-time invitation link
                <input
                  readOnly
                  value={invite}
                  onFocus={(e) => e.target.select()}
                />
              </label>
            )}
          </details>
        )}
      </section>
      <section className="card">
        <span className="eyebrow">PROJECT DATA</span>
        <h2>Portable. Auditable. Yours.</h2>
        <p className="muted">
          Download the entire project with its original documents, source pages,
          schedule, cost records, graph, notes and execution snapshots.
        </p>
        <a className="btn" href={"/api/projects/" + project.id + "/export"}>
          Download project archive
        </a>
        <p className="muted">
          Archive or restore the project from the overview menu. Archived
          projects remain searchable and exportable.
        </p>
      </section>
      <section className="card">
        <span className="eyebrow">PROFESSIONAL NOTES</span>
        {project.notes.map((n: any) => (
          <div className="note" key={n.id}>
            <p>{n.text}</p>
            <small>{new Date(n.at).toLocaleString()}</small>
          </div>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = e.currentTarget,
              d = new FormData(f);
            void action(
              () =>
                api("/projects/" + project.id + "/notes", "POST", {
                  text: d.get("text"),
                }),
              "Note saved",
            ).then((r) => r && f.reset());
          }}
        >
          <label>
            Add context
            <textarea name="text" required maxLength={5000} />
          </label>
          <button className="btn" disabled={busy}>
            Save note
          </button>
        </form>
      </section>
      <section className="card">
        <span className="eyebrow">AUDIT TRAIL</span>
        {audit.map((a, i) => (
          <div className="log" key={i}>
            <time>{new Date(a.at).toLocaleString()}</time>
            <span>{a.event}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
