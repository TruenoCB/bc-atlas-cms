export const publicModules = [
  { id: "essays", label: "Essays", view: "Essays", kind: "content" },
  { id: "thoughts", label: "Thoughts", view: "Thoughts", kind: "content" },
  { id: "knowledge", label: "Knowledge", view: "Knowledge", kind: "knowledge" },
  { id: "gallery", label: "Gallery", view: "Gallery", kind: "content" },
  { id: "field-notes", label: "Field Notes", view: "Field Notes", kind: "content" },
];

export function moduleForView(view) {
  return publicModules.find((module) => module.view === view);
}
