// Tiny trigger: the autocorrect engine and word list load only on first focus,
// desktop only (touch keyboards already autocorrect).
export const armAutocorrect = (el: HTMLInputElement | HTMLTextAreaElement) => {
  if (!matchMedia("(pointer: fine)").matches || matchMedia("(pointer: coarse)").matches) return;
  import("./engine").then((m) => m.attach(el), () => {});
};
