/** Griglia uniforme per trovare in fretta le entità vicine a un punto. */
export class SpatialGrid<T extends { x: number; y: number }> {
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: T[][];

  constructor(
    width: number,
    height: number,
    private readonly cellSize: number,
  ) {
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  clear(): void {
    for (const c of this.cells) c.length = 0;
  }

  private cx(x: number): number {
    const c = Math.floor(x / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private cy(y: number): number {
    const c = Math.floor(y / this.cellSize);
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }

  insert(item: T): void {
    this.cells[this.cy(item.y) * this.cols + this.cx(item.x)].push(item);
  }

  /** Riempie `out` con i candidati nelle celle che toccano il cerchio (va filtrato per distanza). */
  query(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    const x0 = this.cx(x - r);
    const x1 = this.cx(x + r);
    const y0 = this.cy(y - r);
    const y1 = this.cy(y + r);
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const cell = this.cells[j * this.cols + i];
        for (let k = 0; k < cell.length; k++) out.push(cell[k]);
      }
    }
    return out;
  }
}
