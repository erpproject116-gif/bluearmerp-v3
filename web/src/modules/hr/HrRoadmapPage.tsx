import { A } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { HrLayout } from "./HrLayout";
import {
  DONE_STORAGE_KEY,
  JOURNEY_TITLE,
  LANG_STORAGE_KEY,
  PERSONA_STORAGE_KEY,
  ROADMAP,
  stepKey,
  type JourneyPersona,
} from "./roadmapJourney";

type Lang = "en" | "fil";

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadPersona(): JourneyPersona {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(PERSONA_STORAGE_KEY) : null;
  if (v === "hr" || v === "client" || v === "employee") return v;
  return "hr";
}

function loadLang(): Lang {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(LANG_STORAGE_KEY) : null;
  return v === "fil" ? "fil" : "en";
}

export default function HrRoadmapPage() {
  const [persona, setPersona] = createSignal<JourneyPersona>(loadPersona());
  const [lang, setLang] = createSignal<Lang>(loadLang());
  const [done, setDone] = createSignal<Record<string, 1>>(loadJson(DONE_STORAGE_KEY, {}));
  const [open, setOpen] = createSignal<Record<string, boolean>>({});
  const [activeStage, setActiveStage] = createSignal(0);
  const [stuckOpen, setStuckOpen] = createSignal(false);
  const [flashKey, setFlashKey] = createSignal<string | null>(null);
  const [scenario, setScenario] = createSignal("");

  const data = createMemo(() => ROADMAP[persona()]);
  const t = (en: string, fil?: string) => (lang() === "fil" && fil ? fil : en);

  const totals = createMemo(() => {
    let total = 0;
    let finished = 0;
    data().st.forEach((stage, si) => {
      stage.steps.forEach((_, ji) => {
        total += 1;
        if (done()[stepKey(persona(), si, ji)]) finished += 1;
      });
    });
    return { finished, total };
  });

  const hereStage = createMemo(() => {
    const p = persona();
    for (let si = 0; si < data().st.length; si++) {
      for (let ji = 0; ji < data().st[si].steps.length; ji++) {
        if (!done()[stepKey(p, si, ji)]) return si;
      }
    }
    return -1;
  });

  createEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(DONE_STORAGE_KEY, JSON.stringify(done()));
  });
  createEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LANG_STORAGE_KEY, lang());
  });
  createEffect(() => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(PERSONA_STORAGE_KEY, persona());
  });

  const markActive = () => {
    const secs = document.querySelectorAll<HTMLElement>(".hr-jb-sec");
    let cur = 0;
    secs.forEach((el, i) => {
      if (el.getBoundingClientRect().top < 160) cur = i;
    });
    setActiveStage(cur);
  };

  onMount(() => {
    const onScroll = () => {
      requestAnimationFrame(markActive);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    markActive();
    onCleanup(() => window.removeEventListener("scroll", onScroll));
  });

  const choosePersona = (p: JourneyPersona) => {
    setPersona(p);
    setOpen({});
    setScenario("");
    setStuckOpen(false);
    window.scrollTo({ top: 0 });
  };

  const toggleDone = (key: string) => {
    setDone((cur) => {
      const next = { ...cur };
      if (next[key]) delete next[key];
      else next[key] = 1;
      return next;
    });
  };

  const toggleOpen = (key: string) => {
    setOpen((cur) => ({ ...cur, [key]: !cur[key] }));
  };

  const goTo = (si: number, ji?: number) => {
    const id = ji == null ? `hr-jb-s${si + 1}` : `hr-jb-${persona()}-${si + 1}-${ji + 1}`;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: ji == null ? "start" : "center", behavior: "smooth" });
    if (ji != null) {
      const key = stepKey(persona(), si, ji);
      setOpen((cur) => ({ ...cur, [key]: true }));
      setFlashKey(key);
      window.setTimeout(() => setFlashKey((k) => (k === key ? null : k)), 1600);
    }
    window.setTimeout(markActive, 80);
  };

  const onScenario = (value: string) => {
    setScenario(value);
    if (value === "") return;
    const scen = data().scen[Number(value)];
    if (!scen) return;
    goTo(scen.s, scen.i);
  };

  const stageComplete = (si: number) =>
    data().st[si].steps.every((_, ji) => !!done()[stepKey(persona(), si, ji)]);

  return (
    <HrLayout>
      <div class="hr-jb-root" id="hr-jb">
        <div class="hr-jb-head">
          <div>
            <h1>{t(JOURNEY_TITLE.en, JOURNEY_TITLE.fil)}</h1>
            <div class="hr-jb-seg" role="tablist" aria-label="Who are you?">
              <For each={(["hr", "client", "employee"] as JourneyPersona[])}>
                {(p) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={persona() === p}
                    onClick={() => choosePersona(p)}
                  >
                    {t(ROADMAP[p].name, ROADMAP[p].nameFil)}
                  </button>
                )}
              </For>
            </div>
          </div>
          <div class="hr-jb-ctrl noprint">
            <label class="sr-only" for="hr-jb-sc">
              Where do I start?
            </label>
            <select id="hr-jb-sc" class={inputClass} value={scenario()} onChange={(e) => onScenario(e.currentTarget.value)}>
              <option value="">{t("Where do I start?", "Saan ako magsisimula?")}</option>
              <For each={data().scen}>
                {(s, idx) => (
                  <option value={String(idx())}>{t(s.t, s.tFil)}</option>
                )}
              </For>
            </select>
            <span class="hr-jb-lang" role="group" aria-label="Language">
              <button type="button" aria-pressed={lang() === "en"} onClick={() => setLang("en")}>
                EN
              </button>
              <button type="button" aria-pressed={lang() === "fil"} onClick={() => setLang("fil")}>
                FIL
              </button>
            </span>
          </div>
        </div>

        <div class="hr-jb">
          <nav class="hr-jb-idx noprint" aria-label="Stages">
            <ol>
              <For each={data().st}>
                {(stage, si) => {
                  const i = () => si();
                  const doneAll = () => stageComplete(i());
                  return (
                    <li classList={{ y: doneAll() }}>
                      <a
                        href={`#${persona()}/${i() + 1}`}
                        classList={{ on: activeStage() === i() }}
                        aria-current={activeStage() === i() ? "location" : undefined}
                        onClick={(e) => {
                          e.preventDefault();
                          goTo(i());
                        }}
                      >
                        <span class="n" aria-hidden="true">
                          {doneAll() ? "✓" : i() + 1}
                        </span>
                        <span class="lab">{stage.n}</span>
                      </a>
                    </li>
                  );
                }}
              </For>
            </ol>
            <div class="hr-jb-pr">
              {totals().finished} of {totals().total} steps done
            </div>
          </nav>

          <div class="hr-jb-main">
            <For each={data().st}>
              {(stage, si) => {
                const i = () => si();
                return (
                  <section class="hr-jb-sec" id={`hr-jb-s${i() + 1}`} aria-labelledby={`hr-jb-h${i()}`}>
                    <span class="num" aria-hidden="true">
                      {i() + 1}
                    </span>
                    <h2 id={`hr-jb-h${i()}`} tabindex={-1}>
                      {stage.n}
                      <Show when={hereStage() === i()}>
                        <span class="hr-jb-here">{t("You are here", "Nandito ka")}</span>
                      </Show>
                    </h2>
                    <p class="sub">{stage.d}</p>
                    <For each={stage.steps}>
                      {(step, ji) => {
                        const j = () => ji();
                        const key = () => stepKey(persona(), i(), j());
                        const isDone = () => !!done()[key()];
                        const isOpen = () => !!open()[key()];
                        const rowId = () => `hr-jb-${persona()}-${i() + 1}-${j() + 1}`;
                        return (
                          <div
                            class="hr-jb-row"
                            classList={{ d: isDone(), flash: flashKey() === key() }}
                            id={rowId()}
                          >
                            <div class="hr-jb-line">
                              <button
                                type="button"
                                class="hr-jb-tick"
                                aria-pressed={isDone()}
                                aria-label={`Done: ${step.t}`}
                                onClick={() => toggleDone(key())}
                              >
                                ✓
                              </button>
                              <div>
                                <button
                                  type="button"
                                  class="hr-jb-t"
                                  aria-expanded={isOpen()}
                                  aria-controls={`d-${rowId()}`}
                                  onClick={() => toggleOpen(key())}
                                >
                                  {t(step.t, step.tFil)}
                                </button>
                                <div class="hr-jb-why">{step.why}</div>
                              </div>
                              <Show
                                when={step.href}
                                fallback={<span class="hr-jb-open muted">{t("No page yet", "Wala pang page")}</span>}
                              >
                                <A class="hr-btn hr-btn-primary hr-jb-open" href={step.href!}>
                                  {t("Open", "Buksan")} →
                                </A>
                              </Show>
                            </div>
                            <Show when={isOpen()}>
                              <div class="hr-jb-det" id={`d-${rowId()}`}>
                                <p>
                                  👤 <b>{t("Who", "Sino")}:</b> {step.who} · ⏱ {step.time}
                                </p>
                                <p>
                                  ➡ <b>{t("Next", "Susunod")}:</b> {step.next}
                                </p>
                                <Show when={step.wrong}>
                                  <p>
                                    ⚠ <b>{t("If it goes wrong", "Kung may mali")}:</b> {step.wrong}
                                  </p>
                                </Show>
                              </div>
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </section>
                );
              }}
            </For>

            <p class="hr-jb-foot">
              Ticks are saved on this device only.{" "}
              <button type="button" class="hr-jb-lnk noprint" onClick={() => setStuckOpen((v) => !v)}>
                {t("Stuck? Who to ask", "Naipit? Sino ang tatanungin")}
              </button>
            </p>
            <Show when={stuckOpen()}>
              <p class="hr-jb-stuck">{data().stuck}</p>
            </Show>
            <p class="noprint">
              <button type="button" class="hr-btn" onClick={() => window.print()}>
                Print / Save as PDF
              </button>
            </p>
          </div>
        </div>
      </div>
    </HrLayout>
  );
}
