// Shared by every "Vérification avant confirmation" import preview screen: rows already valid
// start collapsed (compact summary) so reviewing hundreds of rows means scanning summaries and
// only opening the ones that need attention; rows with an issue start expanded so they're never
// hidden. Collapse state afterward is fully under the user's control — never auto-reset while
// they edit — so a reviewed row stays exactly as they left it ("conserver l'état de vérification").

export const collapseValidRows = <T,>(rows: T[], getId: (row: T) => string, hasIssues: (row: T) => boolean): Set<string> =>
  new Set(rows.filter((r) => !hasIssues(r)).map(getId));

export const toggleInSet = (set: Set<string>, id: string): Set<string> => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
};
