// Autocorrect on space for prose boxes (desktop only). Loaded lazily the first
// time a prose box is focused - never part of the startup bundle.
import { supabase } from "@/integrations/supabase/client";
import { CORRECTIONS } from "./corrections";

const DELIMS = new Set([" ", ".", ","]);
const UNIT = /(mg|ml|mcg|cm|mm|kg|gm|iu|%)$/i;
const BLOCKED_FIELD = /name|phone|mobile|email|dose|dosage|qty|quantity|amount|price|rate|invoice|search|number|code|hsn|gst|otp|password|url/i;

const attached = new WeakSet<HTMLElement>();
const ignored = new Set<string>(); // misspellings a doctor undid: leave alone from now on
const protectedWords = new Set<string>();
let protectedReady = false;
let protectedLoading = false;

const addWords = (v: unknown) => {
  if (typeof v !== "string") return;
  for (const w of v.toLowerCase().split(/[^a-z']+/)) if (w) protectedWords.add(w);
};

async function loadProtected() {
  if (protectedLoading) return;
  protectedLoading = true;
  try {
    const page = async (table: string, cols: string) => {
      for (let from = 0; ; from += 1000) {
        const { data, error } = await (supabase.from(table as any) as any).select(cols).range(from, from + 999);
        if (error) throw error;
        for (const r of data || []) for (const v of Object.values(r)) addWords(v);
        if (!data || data.length < 1000) break;
      }
    };
    await Promise.all([
      page("pharma_products", "name, generic_name"),
      page("services", "name"),
      page("staff", "first_name, last_name"),
    ]);
    await page("patients", "first_name, last_name");
    protectedReady = true;
  } catch {
    protectedLoading = false; // retry on a later focus; no corrections until loaded
  }
}

function isEligible(el: HTMLElement): boolean {
  if (el instanceof HTMLTextAreaElement) {
    const hint = `${el.name} ${el.id}`;
    return !BLOCKED_FIELD.test(hint) || /note|remark|instruction|history|recommend/i.test(hint);
  }
  if (el instanceof HTMLInputElement) {
    if (el.type && el.type !== "text") return false;
    const hint = `${el.name} ${el.id} ${el.placeholder} ${el.autocomplete} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("inputmode") || ""}`;
    return !BLOCKED_FIELD.test(hint) && !/numeric|decimal|tel|email/.test(hint);
  }
  return false;
}

function matchCase(src: string, fix: string) {
  return src[0] === src[0].toUpperCase() ? fix[0].toUpperCase() + fix.slice(1) : fix;
}

export function attach(el: HTMLInputElement | HTMLTextAreaElement) {
  if (attached.has(el)) return;
  attached.add(el);
  if (!isEligible(el)) return;
  void loadProtected();

  let last: { wrong: string; at: number } | null = null;

  el.addEventListener("input", (e) => {
    const ev = e as InputEvent;
    if (ev.inputType === "historyUndo") {
      if (last) ignored.add(last.wrong);
      last = null;
      return;
    }
    last = null;
    if (!protectedReady || ev.isComposing) return;
    const isBreak = ev.inputType === "insertLineBreak" || ev.inputType === "insertParagraph";
    if (!isBreak && !(ev.inputType === "insertText" && ev.data && DELIMS.has(ev.data))) return;

    const caret = el.selectionStart ?? 0;
    if (caret !== el.selectionEnd) return;
    const end = caret - 1; // delimiter just typed
    const v = el.value;
    let start = end;
    // walk back over the single word only (bounded, no scan of the text)
    while (start > 0 && end - start < 40 && /[A-Za-z']/.test(v[start - 1])) start--;
    if (start === end || (start > 0 && /[0-9A-Za-z\-/_@]/.test(v[start - 1]))) return;
    const word = v.slice(start, end);
    if (word.length < 3 || /\d/.test(word) || UNIT.test(word)) return;
    if (word === word.toUpperCase()) return; // EMLA, GFC, MNRF
    if (/[A-Z]/.test(word.slice(1))) return; // mixed case = brand/name
    const key = word.toLowerCase();
    if (ignored.has(key) || protectedWords.has(key)) return;
    const fix = CORRECTIONS.get(key);
    if (!fix) return;

    const replacement = matchCase(word, fix);
    el.setSelectionRange(start, end);
    // execCommand keeps the native undo stack (one Ctrl+Z reverts) and fires
    // a real input event so React state stays in sync.
    const ok = document.execCommand("insertText", false, replacement);
    if (!ok) {
      el.setSelectionRange(caret, caret);
      return;
    }
    const newCaret = caret + (replacement.length - word.length);
    el.setSelectionRange(newCaret, newCaret);
    last = { wrong: key, at: Date.now() };
  });
}
