import React, { useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";
export default function CalculationEditor({
  project,
  onSave,
  busy,
}: {
  project: any;
  onSave: (v: any) => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState("schedule"),
    [activities, setActivities] = useState<any[]>(
      structuredClone(project.activities),
    ),
    [records, setRecords] = useState<any[]>(
      structuredClone(project.costRecords),
    ),
    [startDate, setStartDate] = useState(project.scheduleStart || "");
  const update = (
    list: any[],
    set: (v: any[]) => void,
    index: number,
    key: string,
    value: any,
  ) => set(list.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  return (
    <>
      <div className="filter-pills editor-tabs">
        <button
          className={tab === "schedule" ? "on" : ""}
          onClick={() => setTab("schedule")}
        >
          Schedule activities
        </button>
        <button
          className={tab === "cost" ? "on" : ""}
          onClick={() => setTab("cost")}
        >
          Cost records
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            activities,
            costRecords: records,
            scheduleStart: startDate || null,
          });
        }}
      >
        {tab === "schedule" ? (
          <>
            <label>
              Baseline start date
              <input
                aria-label="Baseline start date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            {activities.map((a, i) => (
              <fieldset className="input-record" key={a.id}>
                <legend>Activity {i + 1}</legend>
                <div className="form-row">
                  <label>
                    Activity name
                    <input
                      required
                      maxLength={200}
                      value={a.name}
                      onChange={(e) =>
                        update(
                          activities,
                          setActivities,
                          i,
                          "name",
                          e.target.value,
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={"Remove " + a.name}
                    onClick={() => {
                      setActivities(
                        activities
                          .filter((_, j) => j !== i)
                          .map((v) => ({
                            ...v,
                            dependencies: v.dependencies.filter(
                              (d: string) => d !== a.id,
                            ),
                          })),
                      );
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="form-row">
                  <label>
                    Baseline duration (days)
                    <input
                      type="number"
                      min={0}
                      max={36500}
                      required
                      value={a.duration}
                      onChange={(e) =>
                        update(
                          activities,
                          setActivities,
                          i,
                          "duration",
                          Number(e.target.value),
                        )
                      }
                    />
                  </label>
                  <label>
                    Modeled delay (days)
                    <input
                      type="number"
                      min={0}
                      max={36500}
                      required
                      value={a.delay}
                      onChange={(e) =>
                        update(
                          activities,
                          setActivities,
                          i,
                          "delay",
                          Number(e.target.value),
                        )
                      }
                    />
                  </label>
                </div>
                <label>
                  Predecessors
                  <select
                    multiple
                    value={a.dependencies}
                    onChange={(e) =>
                      update(
                        activities,
                        setActivities,
                        i,
                        "dependencies",
                        Array.from(e.target.selectedOptions, (o) => o.value),
                      )
                    }
                  >
                    {activities
                      .filter((v) => v.id !== a.id)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                  </select>
                  <small>
                    Finish-to-start. Ctrl/Command selects multiple.
                    Zero-duration activities are milestones.
                  </small>
                </label>
              </fieldset>
            ))}
            <button
              type="button"
              className="btn"
              onClick={() =>
                setActivities([
                  ...activities,
                  {
                    id: crypto.randomUUID(),
                    name: "New activity",
                    duration: 1,
                    delay: 0,
                    dependencies: [],
                  },
                ])
              }
            >
              <Plus size={14} />
              Add activity
            </button>
          </>
        ) : (
          <>
            {records.map((r, i) => (
              <fieldset className="input-record" key={r.id}>
                <legend>Cost record {i + 1}</legend>
                <div className="form-row">
                  <label>
                    Description
                    <input
                      required
                      maxLength={250}
                      value={r.description}
                      onChange={(e) =>
                        update(
                          records,
                          setRecords,
                          i,
                          "description",
                          e.target.value,
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={"Remove " + r.description}
                    onClick={() =>
                      setRecords(records.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="form-row">
                  <label>
                    Category
                    <input
                      required
                      value={r.category}
                      onChange={(e) =>
                        update(
                          records,
                          setRecords,
                          i,
                          "category",
                          e.target.value,
                        )
                      }
                    />
                  </label>
                  <label>
                    Basis
                    <select
                      value={r.basis}
                      onChange={(e) =>
                        update(records, setRecords, i, "basis", e.target.value)
                      }
                    >
                      <option value="documented">Documented</option>
                      <option value="estimated">Estimated</option>
                      <option value="unsupported">Unsupported</option>
                    </select>
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Quantity
                    <input
                      type="number"
                      min={0}
                      max={1e8}
                      step="any"
                      required
                      value={r.quantity}
                      onChange={(e) =>
                        update(
                          records,
                          setRecords,
                          i,
                          "quantity",
                          Number(e.target.value),
                        )
                      }
                    />
                  </label>
                  <label>
                    Unit rate (USD)
                    <input
                      type="number"
                      min={0}
                      max={1e8}
                      step=".01"
                      required
                      value={r.rateCents / 100}
                      onChange={(e) =>
                        update(
                          records,
                          setRecords,
                          i,
                          "rateCents",
                          Math.round(Number(e.target.value) * 100),
                        )
                      }
                    />
                  </label>
                </div>
                <label>
                  Source document
                  <select
                    value={r.source?.documentId || ""}
                    onChange={(e) =>
                      update(
                        records,
                        setRecords,
                        i,
                        "source",
                        e.target.value
                          ? { documentId: e.target.value, page: 1, quote: "" }
                          : null,
                      )
                    }
                  >
                    <option value="">
                      No source — documented amounts will be unsupported
                    </option>
                    {project.documents.map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                {r.source && (
                  <>
                    <label>
                      Source page
                      <input
                        type="number"
                        min={1}
                        required
                        value={r.source.page}
                        onChange={(e) =>
                          update(records, setRecords, i, "source", {
                            ...r.source,
                            page: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Exact source excerpt
                      <textarea
                        required
                        value={r.source.quote}
                        onChange={(e) =>
                          update(records, setRecords, i, "source", {
                            ...r.source,
                            quote: e.target.value,
                          })
                        }
                      />
                    </label>
                    <small className="muted">
                      An exact quotation is required for source support.
                      Correctness still requires professional review.
                    </small>
                  </>
                )}
              </fieldset>
            ))}
            <button
              type="button"
              className="btn"
              onClick={() =>
                setRecords([
                  ...records,
                  {
                    id: crypto.randomUUID(),
                    description: "New cost",
                    category: "Labor",
                    quantity: 1,
                    rateCents: 0,
                    basis: "estimated",
                    source: null,
                  },
                ])
              }
            >
              <Plus size={14} />
              Add cost record
            </button>
          </>
        )}
        <div className="editor-save">
          <button className="btn primary" disabled={busy}>
            <Check size={14} />
            Validate & save inputs
          </button>
        </div>
      </form>
    </>
  );
}
