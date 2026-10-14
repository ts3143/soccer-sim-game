/** Club crest image URLs, keyed by club code (data/crests/<code>.svg). */
const urls = import.meta.glob<string>("../../data/crests/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

const byCode = new Map(
  Object.entries(urls).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1, -4), url]),
);

export const crestUrl = (code: string): string | undefined => byCode.get(code);
