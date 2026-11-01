/** "Team 10 (PhucNT18)" — a team's name followed by its manager in brackets (name alone if none). */
export function playerLabel(name: string, manager?: string | null): string {
  return manager ? name + ' (' + manager + ')' : name;
}
