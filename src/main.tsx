import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  LayoutDashboard,
  Workflow,
  Files,
  Clock3,
  ChartNoAxesCombined,
  FileText,
  Settings2,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Check,
  CheckCheck,
  X,
  Play,
  Pause,
  Minus,
  Maximize2,
  Upload,
  Download,
  MoreHorizontal,
  Folder,
  Building2,
  Command,
  LogOut,
  Link2,
  ShieldCheck,
  TriangleAlert,
  LoaderCircle,
  ScanLine,
  GitBranch,
  Coins,
  CalendarDays,
  MessageSquare,
  Grip,
  RotateCcw,
  ExternalLink,
  CheckCircle2,
  Circle,
  ArrowDownToLine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import CalculationEditor from "./CalculationEditor";
import VersionComparison from "./VersionComparison";
import WorkspaceSettings from "./WorkspaceSettings";
import "./styles.css";
type Any = any;
async function api(path: string, method = "GET", body?: Any) {
  const res = await fetch("/api" + path, {
    method,
    headers:
      body instanceof FormData
        ? {}
        : body
          ? { "Content-Type": "application/json" }
          : {},
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || "Request failed");
  return data;
}
const money = (c: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format((c || 0) / 100);
const time = (s: string) =>
  new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const date = (s: string) =>
  new Date(s).toLocaleDateString([], { day: "numeric", month: "short" });
const icons: Record<string, LucideIcon> = {
  document: Files,
  agent: ScanLine,
  tool: ChartNoAxesCombined,
  validation: ShieldCheck,
  approval: CheckCheck,
  finding: FileText,
};
const navs = [
  ["Overview", LayoutDashboard],
  ["Investigations", Workflow],
  ["Evidence library", Files],
  ["Event timeline", Clock3],
  ["Impact analysis", ChartNoAxesCombined],
  ["Reports", FileText],
] as const;
function Icon({
  icon: I,
  size = 18,
  ...rest
}: {
  icon: LucideIcon;
  size?: number;
  [k: string]: Any;
}) {
  return <I size={size} strokeWidth={1.65} {...rest} />;
}
function App() {
  const [session, setSession] = useState<Any>(null),
    [ps, setPs] = useState<Any[]>([]),
    [projectId, setProjectId] = useState(""),
    [view, setView] = useState("Overview"),
    [invId, setInvId] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState<Any>(null),
    [selected, setSelected] = useState<Any>(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [collapsed, setCollapsed] = useState(false),
    [zoom, setZoom] = useState(0.62),
    [calc, setCalc] = useState<Any>(null),
    [busy, setBusy] = useState(false),
    [audit, setAudit] = useState<Any[]>([]),
    [team, setTeam] = useState<Any[]>([]);
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const drag = useRef<Any>(null);
  const p = ps.find((p) => p.id === projectId) || ps[0];
  const inv =
    p?.investigations.find((i: Any) => i.id === invId) || p?.investigations[0];
  const base = p ? `/projects/${p.id}` : "";
  const invBase = inv ? `${base}/investigations/${inv.id}` : "";
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 4500);
  };
  async function refresh() {
    const data = await api("/projects");
    setPs(data);
    return data;
  }
  async function init() {
    try {
      let s = await api("/session");
      const invitation = new URLSearchParams(location.search).get("invite");
      if (invitation) {
        setSession(s);
        setModal({ type: "join", token: invitation });
        return;
      }
      if (!s.user) {
        if (s.demoAllowed) {
          await api("/demo", "POST");
          s = await api("/session");
        } else {
          setSession(s);
          return;
        }
      }
      setSession(s);
      const projects = await refresh();
      setProjectId(projects[0]?.id || "");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void init();
  }, []);
  useEffect(() => {
    if (p)
      api(`${base}/calculations`)
        .then(setCalc)
        .catch((e) => setError(e.message));
  }, [p]);
  useEffect(() => {
    if (!inv) return;
    const es = new EventSource("/api" + invBase + "/events");
    es.onmessage = () => {
      void refresh();
    };
    return () => es.close();
  }, [inv?.id]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    const dialog = document.querySelector(".modal") as HTMLElement;
    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]',
        ) || [],
      );
    focusables()
      .find((e) => !e.classList.contains("modal-close"))
      ?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      const first = list[0],
        last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modal?.type]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setModal({ type: "search" });
      }
      if (e.key === "Escape") {
        setModal(null);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  async function action(fn: () => Promise<Any>, message?: string) {
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      await refresh();
      if (message) notify(message);
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function run(mode = "full") {
    if (mode === "full" && !session?.aiConfigured) {
      setModal({ type: "aiOptional" });
      return;
    }
    await action(
      () => api(invBase + "/run", "POST", { mode }),
      mode === "full"
        ? "Investigation submitted"
        : "Deterministic analysis submitted",
    );
  }
  async function openSettings() {
    setView("Settings");
    setAudit(await api("/audit"));
    setTeam(await api("/team"));
  }
  const status = (s: string) => (
    <span className={"status " + s}>
      <i />
      {(
        {
          draft: "Not started",
          queued: "Queued",
          review: "Needs review",
          completed: "Complete",
          extracted: "Extracted",
          pending: "Not started",
          running: "Running",
          failed: "Failed",
          cancelled: "Cancelled",
        } as Any
      )[s] || s}
    </span>
  );
  const findings =
    inv?.nodes.flatMap((n: Any) =>
      (n.output?.findings || []).map((f: Any, index: number) => ({
        ...f,
        nodeId: n.id,
        index,
      })),
    ) || [];
  const complete =
    inv?.nodes.filter((n: Any) => n.state === "completed").length || 0;
  const go = (name: string) => {
    if (window.matchMedia("(max-width:700px)").matches) setCollapsed(false);
    setView(name);
    setSelected(null);
    setFilter("all");
    setQuery("");
  };
  function btn(text: string, I: LucideIcon, fn: () => void, kind = "") {
    return (
      <button className={"btn " + kind} onClick={fn} disabled={busy}>
        <Icon icon={I} size={15} />
        {text}
      </button>
    );
  }
  function documentCard(d: Any) {
    return (
      <button
        key={d.id}
        className="doc-card"
        onClick={() => setModal({ type: "source", doc: d })}
      >
        <div className={"file-preview " + d.category}>
          <div className="paper">
            <span>CAUSE / PROJECT RECORD</span>
            <b>{d.name.replace(/\.[^.]+$/, "")}</b>
            <i />
            <i />
            <i />
            <div className="paper-mark">
              {d.category === "contract" ? (
                "§ 8.3"
              ) : d.category === "cost" ? (
                "$"
              ) : d.category === "schedule" ? (
                <ChartNoAxesCombined size={22} />
              ) : (
                "↳"
              )}
            </div>
            <i />
            <i />
          </div>
          <span className="file-ext">
            {d.name.split(".").pop()?.toUpperCase()}
          </span>
        </div>
        <div className="doc-info">
          <span className="doc-icon">
            <Icon icon={FileText} size={16} />
          </span>
          <div>
            <strong>{d.name}</strong>
            <small>
              {d.pages.length} {d.pages.length === 1 ? "page" : "pages"}{" "}
              <span>·</span> {d.category}
            </small>
          </div>
          <Icon icon={ArrowUpRight} size={15} />
        </div>
      </button>
    );
  }
  function Graph({ full = false }: { full?: boolean }) {
    const nodes = inv?.nodes || [];
    const shown = full
      ? nodes
      : nodes.filter((n: Any) =>
          ["sources", "contract", "timeline", "verify"].includes(n.id),
        );
    const miniPos: Any = {
      sources: { x: 50, y: 135 },
      contract: { x: 370, y: 35 },
      timeline: { x: 370, y: 235 },
      verify: { x: 690, y: 135 },
      lead: { x: 1010, y: 135 },
    };
    const pos = (n: Any) =>
      positions[n.id] || (full ? { x: n.x, y: n.y } : miniPos[n.id]);
    const edges: Any[] = full
      ? nodes.flatMap((n: Any) =>
          n.dependencies.map((dep: string) => [dep, n.id]),
        )
      : [
          ["sources", "contract"],
          ["sources", "timeline"],
          ["contract", "verify"],
          ["timeline", "verify"],
          ["verify", "lead"],
        ];
    const z = full ? zoom : 0.65;
    const start = (e: React.PointerEvent, n: Any) => {
      if (!full) {
        setSelected(n);
        return;
      }
      e.preventDefault();
      setSelected(n);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { id: n.id, x: e.clientX, y: e.clientY, initial: pos(n) };
    };
    const move = (e: React.PointerEvent) => {
      if (!drag.current) return;
      const d = drag.current;
      setPositions((prev) => ({
        ...prev,
        [d.id]: {
          x: d.initial.x + (e.clientX - d.x) / z,
          y: d.initial.y + (e.clientY - d.y) / z,
        },
      }));
    };
    const end = async () => {
      if (!drag.current) return;
      const id = drag.current.id;
      drag.current = null;
      const coords = positions[id];
      if (coords)
        await action(() => api(invBase + "/nodes/" + id, "PATCH", coords));
    };
    return (
      <div className={"graph-canvas " + (full ? "full" : "")}>
        <div className="graph-caption">
          <span className="live-dot" />{" "}
          {full ? "INVESTIGATION CANVAS" : "EVIDENCE → UNDERSTANDING → FINDING"}
          <span className="graph-legend">
            <i /> Dependency
          </span>
        </div>
        <div className="graph-scroll">
          <div
            className="graph-space"
            style={{
              width: (full ? 2520 : 1030) * z,
              height:
                (full
                  ? Math.max(760, ...nodes.map((n: Any) => n.y + 240))
                  : 480) * z,
            }}
          >
            <div
              className="graph-world"
              style={{
                transform: `scale(${z})`,
                width: full ? 2520 : 1030,
                height: full
                  ? Math.max(760, ...nodes.map((n: Any) => n.y + 240))
                  : 480,
              }}
            >
              <svg width="100%" height="100%" className="connections">
                {edges.map(([a, b]: string[], idx) => {
                  const na = shown.find((n: Any) => n.id === a),
                    nb = shown.find((n: Any) => n.id === b);
                  if (!na || !nb) return null;
                  const pa = pos(na),
                    pb = pos(nb);
                  const x1 = pa.x + 260,
                    y1 = pa.y + 83,
                    x2 = pb.x,
                    y2 = pb.y + 83;
                  return (
                    <path
                      key={idx}
                      d={`M ${x1} ${y1} C ${x1 + 70} ${y1},${x2 - 70} ${y2},${x2} ${y2}`}
                      className={na.state === "completed" ? "done" : ""}
                    />
                  );
                })}
              </svg>
              {shown.map((n: Any) => {
                const xy = pos(n);
                const I = icons[n.type] || Circle;
                return (
                  <div
                    key={n.id}
                    className={
                      "graph-node " +
                      n.state +
                      (selected?.id === n.id ? " selected" : "")
                    }
                    style={{ left: xy.x, top: xy.y }}
                    onPointerDown={(e) => start(e, n)}
                    onPointerMove={move}
                    onPointerUp={end}
                  >
                    <button
                      className="node-content"
                      onClick={() => setSelected(n)}
                      aria-label={"Inspect " + n.title}
                    >
                      <span className="port in" />
                      <span className="port out" />
                      <div className="node-top">
                        <span className={"node-icon " + n.type}>
                          <Icon icon={I} size={21} />
                        </span>
                        <span className="node-type">
                          {n.type === "agent"
                            ? "AI INVESTIGATOR"
                            : n.type === "validation"
                              ? "VERIFICATION"
                              : n.type === "document"
                                ? "SOURCE DOCUMENTS"
                                : n.type.toUpperCase()}
                        </span>
                        <span className={"node-indicator " + n.state} />
                      </div>
                      <strong>{n.title}</strong>
                      <p>{n.description}</p>
                      <div className="node-foot">
                        <span>
                          {n.id === "sources"
                            ? `${p.documents.length} documents`
                            : n.type === "agent"
                              ? "OpenAI · bounded execution"
                              : n.type === "tool"
                                ? "Deterministic tool"
                                : "Human review required"}
                        </span>
                        <Icon icon={ArrowUpRight} size={13} />
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {full ? (
          <div className="canvas-controls">
            <button
              title="Zoom out"
              onClick={() => setZoom((v) => Math.max(0.25, v - 0.1))}
            >
              <Icon icon={Minus} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              title="Zoom in"
              onClick={() => setZoom((v) => Math.min(1.5, v + 0.1))}
            >
              <Icon icon={Plus} />
            </button>
            <i />
            <button title="Fit graph" onClick={() => setZoom(0.4)}>
              <Icon icon={Maximize2} />
            </button>
          </div>
        ) : (
          <button
            className="canvas-explore"
            onClick={() => go("Investigations")}
          >
            Explore investigation <Icon icon={ArrowUpRight} size={14} />
          </button>
        )}
      </div>
    );
  }
  if (loading)
    return (
      <div className="loading-screen">
        <div className="brand-logo">
          c
          <span>
            <ArrowUpRight size={16} strokeWidth={2} />
          </span>
        </div>
        <p>Opening your workspace…</p>
        <LoaderCircle className="spin" size={20} />
      </div>
    );
  return (
    <div className={"app " + (collapsed ? "sidebar-collapsed" : "")}>
      <aside className="sidebar">
        <button
          className="sidebar-dismiss"
          aria-label="Close navigation"
          onClick={() => setCollapsed(false)}
        >
          <X size={18} />
        </button>
        <div>
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              go("Overview");
            }}
          >
            <span className="brand-logo">
              c
              <span>
                <ArrowUpRight size={16} strokeWidth={2} />
              </span>
            </span>
            <span>
              cause<span className="brand-period">.</span>
            </span>
            <span className="brand-label">INTELLIGENCE</span>
          </a>
          <button
            className="workspace"
            onClick={() => setModal({ type: "projects" })}
          >
            <span className="workspace-avatar">W</span>
            <span>
              Workspace
              <small>
                {session?.user?.guest ? "Personal demo" : "Your organization"}
              </small>
            </span>
            <Icon icon={ChevronsUpDown} size={14} />
          </button>
          <button
            className="side-search"
            onClick={() => setModal({ type: "search" })}
          >
            <Icon icon={Search} size={15} />
            <span>Search anything</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="nav-label">WORKSPACE</div>
          <nav>
            {navs.map(([name, I]) => (
              <button
                key={name}
                className={view === name ? "active" : ""}
                onClick={() => go(name)}
              >
                <Icon icon={I} size={17} />
                {name}
                {name === "Evidence library" && (
                  <span className="nav-count">{p?.documents.length || 0}</span>
                )}
                {name === "Investigations" && (
                  <span className="nav-count">
                    {p?.investigations.length || 0}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="nav-label project-label">
            <span>YOUR PROJECTS</span>
            <button
              title="New project"
              onClick={() => setModal({ type: "project" })}
            >
              <Icon icon={Plus} size={15} />
            </button>
          </div>
          <div className="side-projects">
            {ps
              .filter((p) => !p.archived)
              .slice(0, 6)
              .map((proj) => (
                <button
                  key={proj.id}
                  className={p?.id === proj.id ? "current" : ""}
                  onClick={() => {
                    setProjectId(proj.id);
                    setInvId("");
                  }}
                >
                  <i />
                  {proj.name}
                  {p?.id === proj.id && <Icon icon={ChevronDown} size={13} />}
                </button>
              ))}
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="review-card">
            <div className="orbit">
              <span />
              <span />
              <span />
              <Icon icon={GitBranch} size={25} />
            </div>
            <strong>Evidence. Connected.</strong>
            <p>
              A clearer picture, one source
              <br />
              at a time.
            </p>
            <button onClick={() => setModal({ type: "guide" })}>
              How CAUSE works <Icon icon={ArrowUpRight} size={13} />
            </button>
          </div>
          <button
            className={view === "Settings" ? "bottom-nav active" : "bottom-nav"}
            onClick={() => void openSettings()}
          >
            <Icon icon={Settings2} size={17} />
            Settings & account
          </button>
          <button className="profile" onClick={() => void openSettings()}>
            <span className="avatar">
              {session?.user?.guest
                ? "D"
                : session?.user?.email?.[0]?.toUpperCase()}
            </span>
            <span>
              {session?.user?.guest ? "Demo workspace" : session?.user?.email}
              <small>
                {session?.user?.guest
                  ? "Fictional case · explore safely"
                  : "Organization owner"}
              </small>
            </span>
            <Icon icon={MoreHorizontal} size={17} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              title="Toggle sidebar"
              className="icon-button"
              onClick={() => setCollapsed(!collapsed)}
            >
              <Icon
                icon={collapsed ? PanelLeftOpen : PanelLeftClose}
                size={17}
              />
            </button>
            <span className="breadcrumb-divider" />
            <button onClick={() => setModal({ type: "projects" })}>
              Workspace
            </button>
            <ChevronRight size={13} />
            <button onClick={() => setModal({ type: "projects" })}>
              {p?.name || "Projects"}
            </button>
            <ChevronRight size={13} />
            <span>{view}</span>
          </div>
          <div className="top-actions">
            <span className="private-label">
              <Icon icon={ShieldCheck} size={13} />
              Private workspace
            </span>
            <button
              className="icon-button"
              title="Help"
              onClick={() => setModal({ type: "guide" })}
            >
              <Icon icon={HelpCircle} size={18} />
            </button>
            <span className="avatar small">
              {session?.user?.guest ? "D" : "C"}
            </span>
          </div>
        </header>
        <div className="main-content">
          {error && (
            <div role="alert" className="error-banner">
              <Icon icon={TriangleAlert} size={18} />
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {!p ? (
            <div className="empty-state">
              <Building2 size={38} />
              <h1>
                {session?.user
                  ? "Your next project starts here."
                  : "Clarity starts with the evidence."}
              </h1>
              <p>
                {session?.user
                  ? "Create a project to organize documents and investigate claims."
                  : "Sign in to your private construction claims workspace."}
              </p>
              {session?.user ? (
                <>
                  {btn(
                    "Create project",
                    Plus,
                    () => setModal({ type: "project" }),
                    "primary",
                  )}
                  {btn(
                    "Explore fictional case",
                    Folder,
                    () => void action(() => api("/projects/demo", "POST")),
                  )}
                </>
              ) : (
                <div className="button-row">
                  {btn(
                    "Sign in",
                    ArrowRight,
                    () => setModal({ type: "auth", mode: "login" }),
                    "primary",
                  )}
                  {btn("Create account", Plus, () =>
                    setModal({ type: "auth", mode: "register" }),
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="project-dot" />
                    {p.reference} <span>/</span>{" "}
                    {p.fictional
                      ? "FICTIONAL DEMONSTRATION"
                      : "CONSTRUCTION CLAIMS"}
                  </div>
                  <h1>
                    {view === "Overview"
                      ? p.name
                      : view === "Investigations"
                        ? "Investigation workspace"
                        : view === "Settings"
                          ? "Workspace settings"
                          : view}
                  </h1>
                  <p>
                    {view === "Overview"
                      ? "From scattered evidence to a clearer position."
                      : view === "Investigations"
                        ? "Trace the evidence. Understand the cause. Review every finding."
                        : view === "Evidence library"
                          ? "Original sources, preserved and connected to every finding."
                          : view === "Impact analysis"
                            ? "Deterministic calculations. Transparent assumptions."
                            : view === "Event timeline"
                              ? "Reconstruct what happened, with the source always in view."
                              : view === "Reports"
                                ? "A clear, auditable record of your investigation."
                                : "Your account, AI connection, and workspace activity."}
                  </p>
                </div>
                <div className="heading-actions">
                  {view === "Overview" && (
                    <>
                      {btn("Add evidence", Upload, () =>
                        setModal({ type: "upload" }),
                      )}
                      {btn(
                        "New investigation",
                        Plus,
                        () => setModal({ type: "investigation" }),
                        "primary",
                      )}
                    </>
                  )}
                  {view === "Evidence library" &&
                    btn(
                      "Upload evidence",
                      Plus,
                      () => setModal({ type: "upload" }),
                      "primary",
                    )}
                  {view === "Investigations" && inv && (
                    <>
                      {["running", "queued"].includes(inv.status)
                        ? btn(
                            "Cancel execution",
                            Pause,
                            () =>
                              void action(() =>
                                api(invBase + "/cancel", "POST"),
                              ),
                          )
                        : btn(
                            "Run investigation",
                            Play,
                            () => void run(),
                            "primary",
                          )}
                    </>
                  )}
                  {view === "Impact analysis" &&
                    btn("Edit inputs", Settings2, () =>
                      setModal({
                        type: "calculations",
                        text: JSON.stringify(
                          {
                            activities: p.activities,
                            costRecords: p.costRecords,
                          },
                          null,
                          2,
                        ),
                      }),
                    )}
                </div>
              </div>
              {view === "Overview" && (
                <>
                  <div className="project-tabs">
                    <button className="on">Project overview</button>
                    <button onClick={() => go("Investigations")}>
                      Investigations <span>{p.investigations.length}</span>
                    </button>
                    <button onClick={() => go("Evidence library")}>
                      Documents <span>{p.documents.length}</span>
                    </button>
                    <div className="tabs-right">
                      <span className="tiny-dot" />{" "}
                      {p.location || "Location not set"}{" "}
                      <button
                        title="Project options"
                        onClick={() => setModal({ type: "projectOptions" })}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="metrics">
                    <div className="metric">
                      <div className="metric-label">
                        Documented amount
                        <Icon icon={Coins} size={16} />
                      </div>
                      <strong>{money(calc?.cost.supported)}</strong>
                      <div className="metric-note">
                        <span className="lime-dot" />
                        Source-linked cost records <ArrowUpRight size={12} />
                      </div>
                    </div>
                    <div className="metric">
                      <div className="metric-label">
                        Modeled delay
                        <Icon icon={CalendarDays} size={16} />
                      </div>
                      <strong>
                        {calc?.schedule.impact || 0}
                        <small> calendar days</small>
                      </strong>
                      <div className="metric-note">
                        Critical-path scenario{" "}
                        <span className="mini-tag">Not entitlement</span>
                      </div>
                    </div>
                    <div className="metric">
                      <div className="metric-label">
                        Evidence collected
                        <Icon icon={Files} size={16} />
                      </div>
                      <strong>
                        {String(p.documents.length).padStart(2, "0")}
                        <small> documents</small>
                      </strong>
                      <div className="metric-note">
                        {
                          p.documents.filter(
                            (d: Any) => d.status === "extracted",
                          ).length
                        }{" "}
                        extracted <span className="muted-dot">·</span> Original
                        files preserved
                      </div>
                    </div>
                    <div className="metric">
                      <div className="metric-label">
                        Findings reviewed
                        <Icon icon={ShieldCheck} size={16} />
                      </div>
                      <strong>
                        {String(
                          findings.filter((f: Any) => f.review !== "pending")
                            .length,
                        ).padStart(2, "0")}
                        <small> / {findings.length}</small>
                      </strong>
                      <div className="metric-note">
                        {findings.length
                          ? "Professional review required"
                          : "Run an investigation to begin"}{" "}
                        <ArrowUpRight size={12} />
                      </div>
                    </div>
                  </div>
                  <div className="overview-grid">
                    <section className="investigation-panel">
                      <div className="section-heading">
                        <div>
                          <span className="section-kicker">
                            THE BIG PICTURE
                          </span>
                          <h2>Connected evidence. Clearer claims.</h2>
                        </div>
                        <button
                          className="icon-button"
                          title="Open investigation"
                          onClick={() => go("Investigations")}
                        >
                          <ArrowUpRight size={19} />
                        </button>
                      </div>
                      {inv ? (
                        <>
                          <div className="inv-summary">
                            <span className="inv-icon">
                              <Workflow size={18} />
                            </span>
                            <div>
                              <strong>{inv.name}</strong>
                              <small>
                                {complete} of {inv.nodes.length} nodes complete{" "}
                                <span>·</span> {p.documents.length} connected
                                sources
                              </small>
                            </div>
                            {status(inv.status)}
                          </div>
                          {Graph({})}
                        </>
                      ) : (
                        <div className="empty-inline">
                          <Workflow size={26} />
                          <p>Connect your first investigation.</p>
                          {btn("New investigation", Plus, () =>
                            setModal({ type: "investigation" }),
                          )}
                        </div>
                      )}
                      <div className="panel-footer">
                        <span>
                          <Icon icon={Link2} size={14} />
                          Every finding starts with a source.
                        </span>
                        <button onClick={() => go("Investigations")}>
                          Open workspace <ArrowRight size={14} />
                        </button>
                      </div>
                    </section>
                    <section className="activity-panel">
                      <div className="section-heading">
                        <h2>Investigation activity</h2>
                        <span className="activity-count">
                          {inv?.events.length || 0}
                        </span>
                      </div>
                      <div className="activity-list">
                        {inv?.events.length ? (
                          inv.events
                            .slice(-4)
                            .reverse()
                            .map((e: Any) => (
                              <div className="activity-item" key={e.id || e.at}>
                                <span className="activity-symbol">
                                  <GitBranch size={14} />
                                </span>
                                <div>
                                  <p>{e.message}</p>
                                  <small>{time(e.at)}</small>
                                </div>
                              </div>
                            ))
                        ) : (
                          <div className="activity-idle">
                            <span className="idle-graphic">
                              <ScanLine size={28} />
                              <i />
                            </span>
                            <h3>Ready when you are.</h3>
                            <p>
                              Your investigators’ activity will
                              <br />
                              appear here as work happens.
                            </p>
                            <button onClick={() => go("Investigations")}>
                              Start an investigation <ArrowUpRight size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="human-note">
                        <ShieldCheck size={17} />
                        <div>
                          <strong>Your expertise stays in control.</strong>
                          <p>
                            AI investigates. You review the findings
                            <br />
                            and make the final call.
                          </p>
                        </div>
                      </div>
                    </section>
                  </div>
                  <section className="evidence-section">
                    <div className="section-heading">
                      <div className="inline-heading">
                        <h2>Project evidence</h2>
                        <span className="count-pill">{p.documents.length}</span>
                        <span className="section-sub">
                          The foundation of your investigation
                        </span>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => go("Evidence library")}
                      >
                        View all evidence <ArrowRight size={14} />
                      </button>
                    </div>
                    <div className="document-grid">
                      {p.documents.slice(0, 4).map(documentCard)}
                      {!p.documents.length && (
                        <button
                          className="upload-card"
                          onClick={() => setModal({ type: "upload" })}
                        >
                          <Upload />
                          <p>Add your first source</p>
                        </button>
                      )}
                    </div>
                  </section>
                  <footer className="page-footer">
                    <span>
                      <span className="lime-dot" />
                      Built on evidence. Guided by expertise.
                    </span>
                    <span>CAUSE / CLAIMS INTELLIGENCE</span>
                  </footer>
                </>
              )}
              {view === "Investigations" && (
                <>
                  {p.investigations.length ? (
                    <>
                      <div className="investigation-toolbar">
                        <div className="toolbar-tabs">
                          {p.investigations.map((i: Any) => (
                            <button
                              key={i.id}
                              className={i.id === inv.id ? "on" : ""}
                              onClick={() => {
                                setInvId(i.id);
                                setSelected(null);
                              }}
                            >
                              <Workflow size={14} />
                              {i.name}
                            </button>
                          ))}
                          <button
                            title="New investigation"
                            onClick={() => setModal({ type: "investigation" })}
                          >
                            <Plus size={17} />
                          </button>
                        </div>
                        <div className="button-row">
                          {btn("Add node", Plus, () =>
                            setModal({ type: "addNode" }),
                          )}
                          {btn(
                            "Run calculations",
                            ChartNoAxesCombined,
                            () => void run("calculations"),
                          )}
                        </div>
                      </div>
                      <div className="button-row" style={{ marginTop: 14 }}>
                        {btn("Add professional finding", Plus, () =>
                          setModal({ type: "manualFinding" }),
                        )}
                        {btn("Reopen selected analysis", RotateCcw, () =>
                          setModal({ type: "reopen" }),
                        )}
                      </div>
                      <div className="execution-strip">
                        <span>{status(inv.status)}</span>
                        <span>
                          {complete}/{inv.nodes.length} completed
                        </span>
                        <span>
                          <Icon icon={Files} size={14} />
                          {p.documents.length} sources
                        </span>
                        <span>
                          {inv.usage.inputTokens + inv.usage.outputTokens}{" "}
                          tokens · {inv.usage.requests} requests
                          {inv.usage.estimatedCostUsd != null
                            ? ` · ~$${inv.usage.estimatedCostUsd.toFixed(4)}`
                            : " · cost rates not set"}
                        </span>
                        <button onClick={() => setModal({ type: "versions" })}>
                          <Clock3 size={14} />
                          {inv.versions.length} versions
                        </button>
                      </div>
                      <div className="graph-layout">
                        {Graph({ full: true })}
                        {selected && (
                          <div className="inspector">
                            <div className="section-heading">
                              <span className="eyebrow">NODE INSPECTOR</span>
                              <button
                                title="Close inspector"
                                onClick={() => setSelected(null)}
                              >
                                <X size={18} />
                              </button>
                            </div>
                            {(() => {
                              const n = inv.nodes.find(
                                (n: Any) => n.id === selected.id,
                              );
                              return (
                                n && (
                                  <>
                                    <span className="inspector-icon">
                                      <Icon
                                        icon={icons[n.type] || Circle}
                                        size={25}
                                      />
                                    </span>
                                    <h2>{n.title}</h2>
                                    <p>{n.description}</p>
                                    {status(n.state)}
                                    {n.error && (
                                      <div className="inline-error">
                                        {n.error}
                                      </div>
                                    )}
                                    <h4>Dependencies</h4>
                                    {n.dependencies.map((d: string) => (
                                      <button
                                        className="dependency"
                                        key={d}
                                        onClick={() =>
                                          setSelected(
                                            inv.nodes.find(
                                              (n: Any) => n.id === d,
                                            ),
                                          )
                                        }
                                      >
                                        <Link2 size={13} />
                                        {
                                          inv.nodes.find((n: Any) => n.id === d)
                                            ?.title
                                        }
                                        <ArrowUpRight size={12} />
                                      </button>
                                    ))}
                                    {["approval", "decision"].includes(
                                      n.type,
                                    ) &&
                                      n.state === "review" && (
                                        <button
                                          className="btn primary"
                                          onClick={() =>
                                            setModal({
                                              type: "decision",
                                              node: n,
                                            })
                                          }
                                        >
                                          Record human decision
                                        </button>
                                      )}
                                    <h4>Output</h4>
                                    {n.output?.origin === "human" && (
                                      <button
                                        className="btn"
                                        onClick={() =>
                                          setModal({
                                            type: "manualFinding",
                                            node: n,
                                          })
                                        }
                                      >
                                        Revise professional finding
                                      </button>
                                    )}
                                    {n.output ? (
                                      <pre>
                                        {JSON.stringify(n.output, null, 2)}
                                      </pre>
                                    ) : (
                                      <p className="muted">
                                        No output yet. Run the investigation to
                                        execute this node.
                                      </p>
                                    )}
                                    <h4>Execution history</h4>
                                    {n.history.map((h: Any, idx: number) => (
                                      <div className="history-row" key={idx}>
                                        <small>{time(h.at)}</small>
                                        <span>{h.state}</span>
                                        {h.reason && <p>{h.reason}</p>}
                                      </div>
                                    ))}
                                    <button
                                      className="btn"
                                      onClick={() =>
                                        setModal({
                                          type: "editNode",
                                          node: n,
                                          text: JSON.stringify(
                                            {
                                              title: n.title,
                                              description: n.description,
                                              dependencies: n.dependencies,
                                              inputs: n.inputs || {},
                                            },
                                            null,
                                            2,
                                          ),
                                        })
                                      }
                                    >
                                      <Settings2 size={14} />
                                      Edit node
                                    </button>
                                  </>
                                )
                              );
                            })()}
                          </div>
                        )}
                      </div>
                      <div className="workspace-bottom">
                        <section className="card">
                          <div className="section-heading">
                            <h2>Agent findings</h2>
                            <span className="count-pill">
                              {findings.length}
                            </span>
                          </div>
                          {findings.length ? (
                            findings.map((f: Any, idx: number) => (
                              <div className="finding" key={idx}>
                                <div className="finding-title">
                                  <strong>{f.title}</strong>
                                  <span
                                    className={
                                      "status " +
                                      (f.kind === "contradiction"
                                        ? "failed"
                                        : "review")
                                    }
                                  >
                                    {f.kind}
                                  </span>
                                </div>
                                <p>{f.detail}</p>
                                <small>
                                  {f.stale
                                    ? "Outdated · re-analysis required"
                                    : f.verification}{" "}
                                  · Review: {f.review}
                                </small>
                                {f.sources.map((s: Any, j: number) => (
                                  <button
                                    className="citation"
                                    key={j}
                                    onClick={() =>
                                      setModal({
                                        type: "source",
                                        doc: p.documents.find(
                                          (d: Any) => d.id === s.documentId,
                                        ),
                                        page: s.page,
                                        quote: s.quote,
                                      })
                                    }
                                  >
                                    <FileText size={13} />
                                    {p.documents.find(
                                      (d: Any) => d.id === s.documentId,
                                    )?.name || "Unknown source"}{" "}
                                    · p.{s.page}
                                  </button>
                                ))}
                                <div className="finding-actions">
                                  <button
                                    disabled={
                                      f.verification !== "source-checked" ||
                                      f.stale ||
                                      busy
                                    }
                                    onClick={() =>
                                      void action(
                                        () =>
                                          api(invBase + "/review", "POST", {
                                            nodeId: f.nodeId,
                                            findingIndex: f.index,
                                            decision: "accepted",
                                          }),
                                        "Finding accepted",
                                      )
                                    }
                                  >
                                    <Check size={14} />
                                    Accept
                                  </button>
                                  <button
                                    disabled={busy}
                                    onClick={() =>
                                      void action(
                                        () =>
                                          api(invBase + "/review", "POST", {
                                            nodeId: f.nodeId,
                                            findingIndex: f.index,
                                            decision: "rejected",
                                          }),
                                        "Finding rejected",
                                      )
                                    }
                                  >
                                    <X size={14} />
                                    Reject
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="empty-inline">
                              <ScanLine size={24} />
                              <p>No AI findings yet.</p>
                              <small>
                                Run the investigators with a server-side OpenAI
                                key.
                              </small>
                            </div>
                          )}
                        </section>
                        <section className="card">
                          <div className="section-heading">
                            <h2>Execution log</h2>
                            <span className="live-label">
                              <i />
                              Live
                            </span>
                          </div>
                          <div className="log-list">
                            {inv.events
                              .slice(-30)
                              .reverse()
                              .map((e: Any, idx: number) => (
                                <div className="log" key={idx}>
                                  <time>{time(e.at)}</time>
                                  <span>{e.message}</span>
                                </div>
                              ))}
                            {!inv.events.length && (
                              <p className="muted">
                                No executions yet. The log records actual tool
                                and agent activity.
                              </p>
                            )}
                          </div>
                        </section>
                      </div>
                    </>
                  ) : (
                    <div className="empty-state">
                      <Workflow size={36} />
                      <h2>Your evidence, connected.</h2>
                      <p>Create an investigation to begin.</p>
                      {btn(
                        "New investigation",
                        Plus,
                        () => setModal({ type: "investigation" }),
                        "primary",
                      )}
                    </div>
                  )}
                </>
              )}
              {view === "Evidence library" && (
                <>
                  <div className="library-toolbar">
                    <div className="filter-pills">
                      {[
                        "all",
                        "contract",
                        "schedule",
                        "event",
                        "evidence",
                        "cost",
                      ].map((f) => (
                        <button
                          className={filter === f ? "on" : ""}
                          key={f}
                          onClick={() => setFilter(f)}
                        >
                          {f === "all"
                            ? "All documents"
                            : f[0].toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                    </div>
                    <label className="search-input">
                      <Search size={15} />
                      <input
                        aria-label="Search evidence"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search documents…"
                      />
                    </label>
                  </div>
                  <div className="document-grid library">
                    {p.documents
                      .filter(
                        (d: Any) =>
                          (filter === "all" || d.category === filter) &&
                          (
                            d.name +
                            " " +
                            d.pages.map((p: Any) => p.text).join(" ")
                          )
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                      )
                      .map(documentCard)}
                    <button
                      className="upload-card"
                      onClick={() => setModal({ type: "upload" })}
                    >
                      <span>
                        <Plus size={24} />
                      </span>
                      <strong>Connect more evidence</strong>
                      <p>PDF, correspondence, records & photos</p>
                    </button>
                  </div>
                  <div className="info-note">
                    <ShieldCheck size={17} />
                    <span>
                      Original files are preserved. Local OCR extracts image and
                      scanned-PDF text. Review recognition accuracy against the
                      original.
                    </span>
                  </div>
                </>
              )}
              {view === "Impact analysis" && calc && (
                <>
                  <div className="analysis-banner">
                    <ChartNoAxesCombined size={22} />
                    <span>
                      Calculated from project inputs. Every amount has a source
                      or an explicit assumption.
                    </span>
                    <span className="mini-tag">USD · calendar days</span>
                  </div>
                  <div className="analysis-grid">
                    <section className="card">
                      <div className="section-heading">
                        <h2>Schedule impact</h2>
                        <span className="status review">Modeled scenario</span>
                      </div>
                      <div className="impact-number">
                        +{calc.schedule.impact}
                        <small>days</small>
                      </div>
                      <p className="muted">
                        Baseline {calc.schedule.baseline} days → revised{" "}
                        {calc.schedule.duration} days
                      </p>
                      <div className="gantt">
                        {calc.schedule.activities.map((a: Any) => (
                          <div className="gantt-row" key={a.id}>
                            <span>{a.name}</span>
                            <div>
                              <i
                                style={{
                                  marginLeft: `${(100 * a.es) / Math.max(1, calc.schedule.duration)}%`,
                                  width: `${Math.max(1, (100 * (a.ef - a.es)) / Math.max(1, calc.schedule.duration))}%`,
                                }}
                                className={a.critical ? "critical" : ""}
                              />
                            </div>
                            <small>{a.duration + a.delay}d</small>
                          </div>
                        ))}
                      </div>
                      <p className="assumption">{calc.schedule.assumptions}</p>
                    </section>
                    <section className="card">
                      <div className="section-heading">
                        <h2>Financial impact</h2>
                        <span className="mini-tag">Not recovery</span>
                      </div>
                      <div className="impact-number">
                        {money(calc.cost.claimed)}
                      </div>
                      <p className="muted">Total entered amount</p>
                      <div className="cost-bar">
                        <i
                          style={{
                            width: `${(100 * calc.cost.supported) / Math.max(1, calc.cost.claimed)}%`,
                          }}
                        />
                        <i
                          style={{
                            width: `${(100 * calc.cost.estimated) / Math.max(1, calc.cost.claimed)}%`,
                          }}
                        />
                      </div>
                      <div className="cost-totals">
                        {["supported", "estimated", "unsupported"].map((k) => (
                          <div key={k}>
                            <span>
                              <i className={k} />
                              {k[0].toUpperCase() + k.slice(1)}
                            </span>
                            <strong>{money(calc.cost[k])}</strong>
                          </div>
                        ))}
                      </div>
                      <p className="assumption">{calc.cost.assumptions}</p>
                    </section>
                  </div>
                  <section className="card table-card">
                    <h2>Cost record breakdown</h2>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Record</th>
                            <th>Category</th>
                            <th>Calculation</th>
                            <th>Amount</th>
                            <th>Basis</th>
                            <th>Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calc.cost.rows.map((r: Any) => (
                            <tr key={r.id}>
                              <td>{r.description}</td>
                              <td>{r.category}</td>
                              <td>
                                {r.quantity} × {money(r.rateCents)}
                              </td>
                              <td>{money(r.cents)}</td>
                              <td>
                                <span className="mini-tag">{r.basis}</span>
                              </td>
                              <td>
                                {r.source ? (
                                  <button
                                    className="text-button"
                                    onClick={() =>
                                      setModal({
                                        type: "source",
                                        doc: p.documents.find(
                                          (d: Any) =>
                                            d.id === r.source.documentId,
                                        ),
                                        quote: r.source.quote,
                                      })
                                    }
                                  >
                                    View source <ArrowUpRight size={13} />
                                  </button>
                                ) : (
                                  "No source"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <section className="card table-card">
                    <h2>Critical-path calculation</h2>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {[
                              "Activity",
                              "Early start",
                              "Early finish",
                              "Late start",
                              "Late finish",
                              "Float",
                              "Critical",
                            ].map((v) => (
                              <th key={v}>{v}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {calc.schedule.activities.map((a: Any) => (
                            <tr key={a.id}>
                              <td>{a.name}</td>
                              {["es", "ef", "ls", "lf", "float"].map((k) => (
                                <td key={k}>{a[k]}d</td>
                              ))}
                              <td>{a.critical ? "Yes" : "No"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
              {view === "Event timeline" && (
                <>
                  <div className="info-note">
                    <Clock3 size={18} />
                    <span>
                      Source dates below are extracted literally from document
                      text. AI reconstruction and conflict analysis appear in
                      agent findings after execution.
                    </span>
                  </div>
                  <div className="timeline">
                    {p.documents
                      .flatMap((d: Any) =>
                        d.pages.flatMap((page: Any) =>
                          [
                            ...new Set<string>(
                              page.text.match(
                                /\b\d{2} (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/g,
                              ) || [],
                            ),
                          ].map((day) => ({ d, page, day })),
                        ),
                      )
                      .sort(
                        (a: Any, b: Any) =>
                          Date.parse(a.day) - Date.parse(b.day),
                      )
                      .map((e: Any, idx: number) => (
                        <div className="timeline-item" key={idx}>
                          <div className="timeline-date">{e.day}</div>
                          <span className="timeline-dot" />
                          <div className="card">
                            <span className="eyebrow">
                              SOURCE DATE · {e.d.category}
                            </span>
                            <h3>{e.d.name}</h3>
                            <p>{e.page.text}</p>
                            <button
                              className="text-button"
                              onClick={() =>
                                setModal({
                                  type: "source",
                                  doc: e.d,
                                  page: e.page.number,
                                })
                              }
                            >
                              Inspect original · page {e.page.number}
                              <ArrowUpRight size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                  {!p.documents.length && (
                    <p className="empty-inline">
                      Upload dated documents to start the timeline.
                    </p>
                  )}
                </>
              )}
              {view === "Reports" && (
                <>
                  <div className="info-note">
                    <ShieldCheck size={18} />
                    <span>
                      Reports include execution status, source references,
                      calculations, uncertainty, and professional review status.
                      Unrun analysis is labeled.
                    </span>
                  </div>
                  {p.investigations.map((i: Any) => (
                    <div className="report-card" key={i.id}>
                      <span className="report-thumbnail">
                        <FileText size={32} />
                        <small>CAUSE / REPORT</small>
                      </span>
                      <div>
                        <span className="eyebrow">
                          {p.fictional
                            ? "FICTIONAL DEMONSTRATION"
                            : "INVESTIGATION ASSESSMENT"}
                        </span>
                        <h2>{i.name}</h2>
                        <p>{i.scope}</p>
                        <span className="muted">
                          {date(i.createdAt)} · {i.versions.length} execution
                          versions · Professional review required
                        </span>
                      </div>
                      <a
                        className="btn primary"
                        href={`/api${base}/investigations/${i.id}/report`}
                      >
                        <Download size={15} />
                        Download PDF
                      </a>
                    </div>
                  ))}
                  {!p.investigations.length && (
                    <div className="empty-inline">
                      Create an investigation before exporting a report.
                    </div>
                  )}
                </>
              )}
              {view === "Settings" && (
                <WorkspaceSettings
                  session={session}
                  project={p}
                  onAuth={(mode) => setModal({ type: "auth", mode })}
                  onUpdate={() => {
                    void refresh();
                    void api("/session").then(setSession);
                  }}
                />
              )}
            </>
          )}
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className={
              "modal " +
              (["source", "calculations", "versions"].includes(modal.type)
                ? "wide"
                : "")
            }
            role="dialog"
            aria-modal="true"
            aria-label={modal.type + " dialog"}
          >
            <button
              className="modal-close"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={19} />
            </button>
            {modal.type === "upload" && (
              <>
                <span className="eyebrow">BUILD YOUR EVIDENCE BASE</span>
                <h2>Connect a new source.</h2>
                <p>
                  Preserve the original. Keep the context. Update only the
                  affected analysis.
                </p>
                <div className="button-row">
                  <a className="text-button" href="/api/templates/schedule">
                    Schedule CSV template
                  </a>
                  <a className="text-button" href="/api/templates/cost">
                    Cost CSV template
                  </a>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    void action(
                      () => api(base + "/documents", "POST", data),
                      "Evidence uploaded; affected findings marked for review",
                    ).then((r) => {
                      if (r) setModal(null);
                    });
                  }}
                >
                  <label className="upload-drop">
                    <Upload size={30} />
                    <strong>Choose an evidence file</strong>
                    <span>
                      PDF, TXT, CSV, EML, JSON, PNG, JPG or WebP · up to 15 MB
                    </span>
                    <input
                      type="file"
                      name="file"
                      required
                      accept=".pdf,.txt,.csv,.eml,.json,.png,.jpg,.jpeg,.webp"
                    />
                  </label>
                  <label>
                    Evidence category
                    <select name="category">
                      <option value="evidence">
                        Supporting evidence / photograph
                      </option>
                      <option value="contract">Contract / clause</option>
                      <option value="schedule">Schedule / programme</option>
                      <option value="event">Correspondence / event</option>
                      <option value="cost">Invoice / cost record</option>
                    </select>
                  </label>
                  <div className="info-note compact">
                    <ShieldCheck size={16} />
                    <span>
                      Images and scanned PDFs use local OCR; verify extracted
                      text against the original. Embedded instructions are
                      treated as untrusted text.
                    </span>
                  </div>
                  <button className="btn primary" disabled={busy}>
                    {busy ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Upload size={15} />
                    )}
                    Upload evidence
                  </button>
                </form>
              </>
            )}
            {modal.type === "project" && (
              <>
                <span className="eyebrow">A NEW PERSPECTIVE</span>
                <h2>Create a project.</h2>
                <p>
                  A dedicated place for the evidence, events, and investigations
                  that matter.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action(
                      () =>
                        api("/projects", "POST", {
                          name: f.get("name"),
                          description: f.get("description"),
                        }),
                      "Project created",
                    ).then((r) => {
                      if (r) {
                        setProjectId(r.id);
                        setView("Overview");
                        setModal(null);
                      }
                    });
                  }}
                >
                  <label>
                    Project name
                    <input
                      name="name"
                      required
                      maxLength={120}
                      placeholder="e.g. Harbour Exchange"
                      autoFocus
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      name="description"
                      maxLength={2000}
                      placeholder="Project context and investigation goals"
                    />
                  </label>
                  <button className="btn primary" disabled={busy}>
                    <Plus size={15} />
                    Create project
                  </button>
                </form>
              </>
            )}
            {modal.type === "investigation" && (
              <>
                <span className="eyebrow">FOLLOW THE EVIDENCE</span>
                <h2>New investigation.</h2>
                <p>
                  Give your investigators a clear question. Findings remain
                  subject to your review.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action(
                      () =>
                        api(base + "/investigations", "POST", {
                          name: f.get("name"),
                          scope: f.get("scope"),
                        }),
                      "Investigation created",
                    ).then((r) => {
                      if (r) {
                        setInvId(r.id);
                        go("Investigations");
                        setModal(null);
                      }
                    });
                  }}
                >
                  <label>
                    Investigation name
                    <input
                      name="name"
                      required
                      maxLength={120}
                      placeholder="e.g. Late design information"
                      autoFocus
                    />
                  </label>
                  <label>
                    Investigation scope
                    <textarea
                      name="scope"
                      required
                      minLength={1}
                      maxLength={3000}
                      placeholder="What happened, which activities were affected, and what evidence supports the impact?"
                    />
                  </label>
                  <button className="btn primary" disabled={busy}>
                    <Workflow size={15} />
                    Create investigation
                  </button>
                </form>
              </>
            )}
            {modal.type === "source" &&
              (modal.doc ? (
                <>
                  <span className="eyebrow">
                    ORIGINAL SOURCE · {modal.doc.category}
                  </span>
                  <h2>{modal.doc.name}</h2>
                  <div className="source-meta">
                    {modal.doc.pages.length} pages · {modal.doc.status} ·
                    Uploaded {date(modal.doc.createdAt)}
                    {modal.doc.fictional && " · Fictional demonstration"}
                    {modal.doc.extractionMethod &&
                      ` · ${modal.doc.extractionMethod}`}
                  </div>
                  {modal.doc.mime?.startsWith("image/") && (
                    <img
                      className="source-image"
                      src={`/api${base}/documents/${modal.doc.id}/file`}
                      alt={modal.doc.name}
                    />
                  )}
                  {modal.quote && <blockquote>{modal.quote}</blockquote>}
                  <div className="source-pages">
                    {modal.doc.pages.map((page: Any) => (
                      <article key={page.number}>
                        <div className="page-label">
                          PAGE {page.number} <span>{modal.doc.id}</span>
                        </div>
                        <pre>{page.text}</pre>
                        {page.method === "ocr" && (
                          <p className="muted">
                            OCR confidence: {Math.round(page.confidence || 0)}%.
                            Inspect the original; recognition confidence does
                            not establish truth.
                          </p>
                        )}
                      </article>
                    ))}
                    {!modal.doc.pages.length && (
                      <div className="info-note">
                        This original is preserved. A text transcription is
                        required before it can support citations.
                      </div>
                    )}
                  </div>
                  {["schedule", "cost"].includes(modal.doc.category) &&
                    /\.(csv|json)$/i.test(modal.doc.name) && (
                      <button
                        className="btn primary"
                        disabled={busy}
                        onClick={() =>
                          void action(
                            () =>
                              api(
                                base + "/calculations/import/" + modal.doc.id,
                                "POST",
                              ),
                            "Calculation rows imported",
                          ).then((r) => {
                            if (r) {
                              setModal(null);
                              go("Impact analysis");
                            }
                          })
                        }
                      >
                        Import calculation rows
                      </button>
                    )}
                  <a
                    className="btn"
                    href={`/api${base}/documents/${modal.doc.id}/file`}
                  >
                    <Download size={15} />
                    Download original
                  </a>
                </>
              ) : (
                <p>Source not found.</p>
              ))}
            {modal.type === "search" && (
              <>
                <h2>Find your evidence.</h2>
                <label className="search-input large">
                  <Search size={19} />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search projects, sources, and findings"
                  />
                </label>
                <div className="search-results">
                  {ps
                    .filter((p) =>
                      p.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((proj) => (
                      <button
                        key={proj.id}
                        onClick={() => {
                          setProjectId(proj.id);
                          setModal(null);
                          go("Overview");
                        }}
                      >
                        <Building2 size={18} />
                        <span>
                          {proj.name}
                          <small>Project</small>
                        </span>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  {ps.flatMap((proj) =>
                    proj.documents
                      .filter((d: Any) =>
                        (
                          d.name +
                          " " +
                          d.pages.map((p: Any) => p.text).join(" ")
                        )
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .slice(0, 10)
                      .map((d: Any) => (
                        <button
                          key={d.id}
                          onClick={() => {
                            setProjectId(proj.id);
                            setModal({ type: "source", doc: d });
                          }}
                        >
                          <FileText size={18} />
                          <span>
                            {d.name}
                            <small>
                              {proj.name} · {d.category}
                            </small>
                          </span>
                          <ArrowUpRight size={16} />
                        </button>
                      )),
                  )}
                </div>
              </>
            )}
            {modal.type === "projects" && (
              <>
                <h2>Your projects.</h2>
                <div className="search-results">
                  {ps.map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => {
                        setProjectId(proj.id);
                        setModal(null);
                        setInvId("");
                      }}
                    >
                      <Building2 size={18} />
                      <span>
                        {proj.name}
                        <small>
                          {proj.archived ? "Archived" : proj.reference}
                        </small>
                      </span>
                      {proj.id === p?.id ? (
                        <Check size={16} />
                      ) : (
                        <ArrowUpRight size={16} />
                      )}
                    </button>
                  ))}
                </div>
                <div className="button-row">
                  {btn(
                    "New project",
                    Plus,
                    () => setModal({ type: "project" }),
                    "primary",
                  )}
                  {btn(
                    "Add fictional case",
                    Folder,
                    () =>
                      void action(
                        () => api("/projects/demo", "POST"),
                        "Fictional case added",
                      ).then((r) => {
                        if (r) {
                          setProjectId(r.id);
                          setModal(null);
                        }
                      }),
                  )}
                </div>
              </>
            )}
            {modal.type === "projectOptions" && (
              <>
                <h2>Project settings.</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action(
                      () =>
                        api(base, "PATCH", {
                          name: f.get("name"),
                          description: f.get("description"),
                        }),
                      "Project updated",
                    ).then(() => setModal(null));
                  }}
                >
                  <label>
                    Name
                    <input
                      name="name"
                      defaultValue={p.name}
                      required
                      maxLength={120}
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      name="description"
                      defaultValue={p.description}
                      maxLength={2000}
                    />
                  </label>
                  <button className="btn primary" disabled={busy}>
                    Save project
                  </button>
                </form>
                <button
                  className="btn danger"
                  onClick={() =>
                    void action(
                      () => api(base, "PATCH", { archived: !p.archived }),
                      p.archived ? "Project restored" : "Project archived",
                    ).then(() => setModal(null))
                  }
                >
                  {p.archived ? "Restore project" : "Archive project"}
                </button>
              </>
            )}
            {modal.type === "calculations" && (
              <>
                <span className="eyebrow">TRANSPARENT INPUTS</span>
                <h2>Schedule & financial inputs.</h2>
                <CalculationEditor
                  project={p}
                  busy={busy}
                  onSave={(data) =>
                    void action(
                      () => api(base + "/calculations", "PUT", data),
                      "Inputs saved; dependent results invalidated",
                    ).then((r) => r && setModal(null))
                  }
                />
              </>
            )}
            {modal.type === "editNode" && (
              <>
                <span className="eyebrow">TRANSPARENT INPUTS</span>
                <h2>
                  {modal.type === "calculations"
                    ? "Schedule & financial inputs."
                    : "Node configuration."}
                </h2>
                <p>
                  {modal.type === "calculations"
                    ? "Durations are calendar days. Rates are integer cents. Sources require documentId, page, and an exact quote."
                    : "Dependencies must be existing node IDs. Cycles are rejected."}
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    let data: Any;
                    try {
                      data = JSON.parse(modal.text);
                    } catch {
                      setError("Enter valid JSON");
                      return;
                    }
                    void action(
                      () =>
                        api(
                          modal.type === "calculations"
                            ? base + "/calculations"
                            : invBase + "/nodes/" + modal.node.id,
                          modal.type === "calculations" ? "PUT" : "PATCH",
                          data,
                        ),
                      "Inputs saved; dependent results invalidated",
                    ).then((r) => {
                      if (r) setModal(null);
                    });
                  }}
                >
                  <textarea
                    className="json-editor"
                    aria-label="JSON inputs"
                    spellCheck={false}
                    value={modal.text}
                    onChange={(e) =>
                      setModal({ ...modal, text: e.target.value })
                    }
                  />
                  <button className="btn primary" disabled={busy}>
                    Validate & save <Check size={15} />
                  </button>
                </form>
              </>
            )}
            {modal.type === "versions" && (
              <>
                <h2>Investigation history.</h2>
                <p>
                  Execution snapshots preserve earlier outputs and their review
                  status.
                </p>
                <VersionComparison investigation={inv} />
                {inv.versions.length ? (
                  inv.versions.map((v: Any, idx: number) => (
                    <details className="version" key={v.id}>
                      <summary>
                        Version {idx + 1} · {date(v.at)} {time(v.at)} ·{" "}
                        {v.status}
                      </summary>
                      <pre>
                        {JSON.stringify(
                          v.nodes.map((n: Any) => ({
                            title: n.title,
                            state: n.state,
                            output: n.output,
                          })),
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  ))
                ) : (
                  <div className="empty-inline">
                    No execution snapshots yet.
                  </div>
                )}
              </>
            )}
            {modal.type === "addNode" && (
              <>
                <span className="eyebrow">EXTEND THE INVESTIGATION</span>
                <h2>Connect a new node.</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action(
                      () =>
                        api(invBase + "/nodes", "POST", {
                          type: f.get("type"),
                          title: f.get("title"),
                          description: f.get("description"),
                          dependencies: f.getAll("dependencies"),
                          inputs: { tool: f.get("tool") },
                        }),
                      "Node created",
                    ).then((r) => {
                      if (r) {
                        setSelected(r);
                        setModal(null);
                      }
                    });
                  }}
                >
                  <label>
                    Node title
                    <input name="title" required maxLength={120} autoFocus />
                  </label>
                  <label>
                    Node type
                    <select name="type">
                      {Object.entries({
                        document: "Document",
                        evidence: "Evidence",
                        event: "Project event",
                        clause: "Contract clause",
                        activity: "Schedule activity",
                        financial: "Financial record",
                        agent: "AI investigator",
                        tool: "Tool execution",
                        validation: "Validation",
                        contradiction: "Contradiction analysis",
                        decision: "Decision",
                        approval: "Human approval",
                        finding: "Final finding",
                      }).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Description / investigator focus
                    <textarea name="description" maxLength={2000} />
                  </label>
                  <label>
                    Dependencies
                    <select name="dependencies" multiple size={4}>
                      {inv.nodes.map((n: Any) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                    </select>
                    <small>
                      Use Ctrl / Command to select multiple. Connections are
                      execution dependencies.
                    </small>
                  </label>
                  <label>
                    Deterministic tool (for tool nodes)
                    <select name="tool">
                      <option value="schedule">Critical-path schedule</option>
                      <option value="cost">Financial calculation</option>
                    </select>
                  </label>
                  <button className="btn primary" disabled={busy}>
                    Add node <Plus size={15} />
                  </button>
                </form>
              </>
            )}
            {modal.type === "decision" && (
              <>
                <h2>Record your decision.</h2>
                <p>
                  {modal.node.title}. Accepting allows dependent operations to
                  proceed; rejecting blocks them.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action(
                      () =>
                        api(
                          invBase + "/nodes/" + modal.node.id + "/decision",
                          "POST",
                          { decision: f.get("decision"), note: f.get("note") },
                        ),
                      "Decision recorded",
                    ).then((r) => {
                      if (r) setModal(null);
                    });
                  }}
                >
                  <label>
                    Decision
                    <select name="decision">
                      <option value="accepted">Accept</option>
                      <option value="rejected">Reject</option>
                    </select>
                  </label>
                  <label>
                    Professional rationale
                    <textarea name="note" required maxLength={3000} />
                  </label>
                  <button className="btn primary" disabled={busy}>
                    Save decision
                  </button>
                </form>
              </>
            )}
            {modal.type === "team" && (
              <>
                <h2>Add a team member.</h2>
                <p>
                  Create a workspace account with a temporary password. Share
                  credentials through your secure channel; email invitations are
                  not sent.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action(
                      () =>
                        api("/team", "POST", {
                          email: f.get("email"),
                          password: f.get("password"),
                          role: f.get("role"),
                        }),
                      "Team member added",
                    ).then((r) => {
                      if (r) {
                        setModal(null);
                        void openSettings();
                      }
                    });
                  }}
                >
                  <label>
                    Email
                    <input name="email" type="email" required />
                  </label>
                  <label>
                    Temporary password
                    <input
                      name="password"
                      type="password"
                      minLength={12}
                      required
                      autoComplete="new-password"
                    />
                  </label>
                  <label>
                    Role
                    <select name="role">
                      <option value="analyst">Analyst</option>
                      <option value="reviewer">Reviewer</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </label>
                  <button className="btn primary" disabled={busy}>
                    Add member <Plus size={14} />
                  </button>
                </form>
              </>
            )}
            {modal.type === "aiOptional" && (
              <>
                <span className="eyebrow">AI IS OPTIONAL</span>
                <h2>Your workspace works without a key.</h2>
                <p>
                  Projects, evidence, schedules, financial calculations and
                  exports are ready to use. Add your own OpenAI key in Settings
                  when you want the specialist AI investigators.
                </p>
                <div className="button-row">
                  <button
                    className="btn primary"
                    onClick={() => {
                      setModal(null);
                      void run("calculations");
                    }}
                  >
                    Run calculations
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setModal(null);
                      void openSettings();
                    }}
                  >
                    Connection settings
                  </button>
                </div>
              </>
            )}
            {["recover", "join"].includes(modal.type) && (
              <>
                <h2>
                  {modal.type === "join"
                    ? "Join your team."
                    : "Recover your account."}
                </h2>
                <p>
                  {modal.type === "join"
                    ? "Use the invited email and choose your own password. The invitation can be used once."
                    : "Use a saved single-use recovery code. Existing sessions will be signed out."}
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action(() =>
                      api(
                        modal.type === "join"
                          ? "/invitations/accept"
                          : "/recovery",
                        "POST",
                        {
                          email: f.get("email"),
                          password: f.get("password"),
                          ...(modal.type === "join"
                            ? { token: modal.token }
                            : { code: f.get("code") }),
                        },
                      ),
                    ).then((r) => {
                      if (r) {
                        history.replaceState(null, "", location.pathname);
                        location.reload();
                      }
                    });
                  }}
                >
                  <label>
                    Email
                    <input type="email" name="email" required />
                  </label>
                  {modal.type === "recover" && (
                    <label>
                      Single-use recovery code
                      <input
                        name="code"
                        required
                        minLength={16}
                        autoComplete="off"
                      />
                    </label>
                  )}
                  <label>
                    New password
                    <input
                      type="password"
                      name="password"
                      required
                      minLength={12}
                      autoComplete="new-password"
                    />
                  </label>
                  <button className="btn primary" disabled={busy}>
                    {modal.type === "join"
                      ? "Accept invitation"
                      : "Recover account"}
                  </button>
                </form>
              </>
            )}
            {modal.type === "manualFinding" && (
              <>
                <span className="eyebrow">PROFESSIONAL ASSESSMENT</span>
                <h2>Add an evidence-backed finding.</h2>
                <p>
                  This is labeled as your professional assessment. Source
                  excerpts are checked; findings still require review.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action(
                      () =>
                        api(invBase + "/manual-findings", "POST", {
                          title: f.get("title"),
                          detail: f.get("detail"),
                          kind: f.get("kind"),
                          ...(modal.node
                            ? { replacesNodeId: modal.node.id }
                            : {}),
                          sources: f.get("documentId")
                            ? [
                                {
                                  documentId: f.get("documentId"),
                                  page: Number(f.get("page")),
                                  quote: f.get("quote"),
                                },
                              ]
                            : [],
                        }),
                      "Professional finding added for review",
                    ).then((r) => r && setModal(null));
                  }}
                >
                  <label>
                    Title
                    <input
                      name="title"
                      required
                      maxLength={200}
                      defaultValue={
                        modal.node?.output?.findings?.[0]?.title || ""
                      }
                    />
                  </label>
                  <label>
                    Assessment
                    <textarea
                      name="detail"
                      required
                      maxLength={10000}
                      defaultValue={
                        modal.node?.output?.findings?.[0]?.detail || ""
                      }
                    />
                  </label>
                  <label>
                    Type
                    <select
                      name="kind"
                      defaultValue={
                        modal.node?.output?.findings?.[0]?.kind || "finding"
                      }
                    >
                      <option value="finding">Finding</option>
                      <option value="contradiction">Contradiction</option>
                      <option value="missing-information">
                        Missing information
                      </option>
                    </select>
                  </label>
                  <label>
                    Source document
                    <select
                      name="documentId"
                      defaultValue={
                        modal.node?.output?.findings?.[0]?.sources?.[0]
                          ?.documentId || ""
                      }
                    >
                      <option value="">
                        No source — cannot be accepted as supported
                      </option>
                      {p.documents.map((d: Any) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Source page
                    <input name="page" type="number" min={1} defaultValue={1} />
                  </label>
                  <label>
                    Exact excerpt
                    <textarea
                      name="quote"
                      minLength={8}
                      defaultValue={
                        modal.node?.output?.findings?.[0]?.sources?.[0]
                          ?.quote || ""
                      }
                    />
                  </label>
                  <button className="btn primary" disabled={busy}>
                    Add finding for review
                  </button>
                </form>
              </>
            )}
            {modal.type === "reopen" && (
              <>
                <h2>Reopen an investigation.</h2>
                <p>
                  Preserve a snapshot and invalidate only the selected nodes and
                  their dependants.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action(
                      () =>
                        api(invBase + "/reopen", "POST", {
                          reason: f.get("reason"),
                          nodeIds: f.getAll("nodeIds"),
                        }),
                      "Investigation reopened",
                    ).then((r) => r && setModal(null));
                  }}
                >
                  <label>
                    Reason
                    <textarea name="reason" required maxLength={2000} />
                  </label>
                  <label>
                    Analysis to revisit
                    <select name="nodeIds" multiple required size={7}>
                      {inv.nodes.map((n: Any) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                    </select>
                    <small>
                      Select one or more. Dependent results lose prior
                      acceptance.
                    </small>
                  </label>
                  <button className="btn primary" disabled={busy}>
                    Save snapshot & reopen
                  </button>
                </form>
              </>
            )}
            {modal.type === "auth" && (
              <>
                <span className="eyebrow">YOUR PRIVATE WORKSPACE</span>
                <h2>
                  {modal.mode === "register"
                    ? "Build your next case."
                    : "Welcome back."}
                </h2>
                <p>
                  {modal.mode === "register"
                    ? "Create an account. Your organization’s projects stay separate from the demo."
                    : "Sign in to your organization."}
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action(() =>
                      api("/auth/" + modal.mode, "POST", {
                        email: f.get("email"),
                        password: f.get("password"),
                      }),
                    ).then((r) => {
                      if (r) location.reload();
                    });
                  }}
                >
                  <label>
                    Email
                    <input
                      type="email"
                      name="email"
                      required
                      autoComplete="email"
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      name="password"
                      required
                      minLength={12}
                      maxLength={256}
                      autoComplete={
                        modal.mode === "register"
                          ? "new-password"
                          : "current-password"
                      }
                    />
                    <small>At least 12 characters</small>
                  </label>
                  <button className="btn primary" disabled={busy}>
                    {modal.mode === "register" ? "Create account" : "Sign in"}
                    <ArrowRight size={15} />
                  </button>
                </form>
                {modal.mode === "login" && (
                  <button
                    className="text-button"
                    onClick={() => setModal({ type: "recover" })}
                  >
                    Use an account recovery code
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() =>
                    setModal({
                      ...modal,
                      mode: modal.mode === "register" ? "login" : "register",
                    })
                  }
                >
                  {modal.mode === "register"
                    ? "Already have an account? Sign in"
                    : "Need an account? Register"}
                </button>
              </>
            )}
            {modal.type === "guide" && (
              <>
                <span className="eyebrow">A CLEARER WAY TO INVESTIGATE</span>
                <h2>From evidence to understanding.</h2>
                <div className="guide-step">
                  <span>01</span>
                  <div>
                    <h3>Build your evidence base.</h3>
                    <p>
                      Upload original contracts, correspondence, schedules, and
                      cost records. Inspect exact page text at any time.
                    </p>
                  </div>
                </div>
                <div className="guide-step">
                  <span>02</span>
                  <div>
                    <h3>Connect the investigation.</h3>
                    <p>
                      Run deterministic calculations independently. With an
                      OpenAI key, specialist agents use source search and
                      calculation tools to investigate your scope.
                    </p>
                  </div>
                </div>
                <div className="guide-step">
                  <span>03</span>
                  <div>
                    <h3>Apply your expertise.</h3>
                    <p>
                      Inspect sources, challenge findings, and export the
                      assessment. Source checking does not establish legal
                      entitlement. New evidence invalidates dependent results.
                    </p>
                  </div>
                </div>
                <button className="btn primary" onClick={() => setModal(null)}>
                  Let’s investigate <ArrowRight size={15} />
                </button>
              </>
            )}
            {error && (
              <div className="inline-error" role="alert">
                {error}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
