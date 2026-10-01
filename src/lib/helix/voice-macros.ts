export interface VoiceMacro {
  id: string;
  name: string;
  trigger: string;
  template: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface VoiceMacroStorage {
  list(): VoiceMacro[];
  save(macro: VoiceMacro): void;
  remove(id: string): void;
}

const STORAGE_KEY = "helix.voice-macros.v1";
const MAX_MACROS = 64;
const MAX_LENGTH = 240;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createVoiceMacro(
  name: string,
  trigger: string,
  template: string,
  now = Date.now(),
): VoiceMacro {
  const cleanName = name.trim().slice(0, 80);
  const cleanTrigger = normalize(trigger).slice(0, 80);
  const cleanTemplate = template.trim().slice(0, MAX_LENGTH);
  if (!cleanName || cleanTrigger.length < 2 || !cleanTemplate)
    throw new Error("A macro needs a name, a trigger, and a command template.");
  if (/[;\n\r]/.test(cleanTemplate))
    throw new Error("Macro templates must contain one Helix command.");
  return {
    id: `macro_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name: cleanName,
    trigger: cleanTrigger,
    template: cleanTemplate,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function expandVoiceMacro(
  text: string,
  macros: VoiceMacro[],
): { text: string; macro?: VoiceMacro } {
  const clean = text.trim();
  const normalized = normalize(clean);
  const macro = macros
    .filter((candidate) => candidate.enabled)
    .sort((a, b) => b.trigger.length - a.trigger.length)
    .find(
      (candidate) =>
        normalized === candidate.trigger || normalized.startsWith(`${candidate.trigger} `),
    );
  if (!macro) return { text: clean };
  const rest = clean.slice(macro.trigger.length).trim();
  const args = rest ? rest.split(/\s+/) : [];
  const expanded = macro.template.replace(
    /\$(\d+)/g,
    (_, index: string) => args[Number(index) - 1] ?? "",
  );
  return { text: expanded.slice(0, MAX_LENGTH), macro };
}

export function createMemoryVoiceMacroStorage(seed: VoiceMacro[] = []): VoiceMacroStorage {
  let records = seed.map(clone);
  return {
    list: () => records.map(clone),
    save: (macro) => {
      records = [macro, ...records.filter((candidate) => candidate.id !== macro.id)].slice(
        0,
        MAX_MACROS,
      );
    },
    remove: (id) => {
      records = records.filter((macro) => macro.id !== id);
    },
  };
}

export function createBrowserVoiceMacroStorage(): VoiceMacroStorage {
  if (typeof window === "undefined" || !window.localStorage) return createMemoryVoiceMacroStorage();
  const read = (): VoiceMacro[] => {
    try {
      const records = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as VoiceMacro[];
      return Array.isArray(records) ? records : [];
    } catch {
      return [];
    }
  };
  const write = (records: VoiceMacro[]) =>
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_MACROS)));
  return {
    list: () => read(),
    save: (macro) => write([macro, ...read().filter((candidate) => candidate.id !== macro.id)]),
    remove: (id) => write(read().filter((macro) => macro.id !== id)),
  };
}
