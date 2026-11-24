export interface Row {
  name: string;
  score: number;
}

export function formatRow(row: Row): string {
  return `${row.name.padEnd(8)} ${row.score.toFixed(1)}`;
}
