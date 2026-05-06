import { RecordStore } from "../platform/j2me/RecordStore";

export interface GameProgress {
  zoneID: number;
  actID: number;
  lives: number;
  score: number;
  rings: number;
}

export interface HighscoreEntry {
  difficulty: number;
  name: string;
  score: number;
}

const defaultHighscores: readonly HighscoreEntry[] = [
  { name: "SON", score: 10000, difficulty: 0 },
  { name: "SON", score: 8000, difficulty: 1 },
  { name: "SON", score: 6000, difficulty: 2 },
  { name: "SON", score: 4000, difficulty: 1 },
  { name: "SON", score: 2000, difficulty: 0 },
];

export class SaveManager {
  loadRecord(name: string, id: number): Uint8Array | null {
    try {
      const store = RecordStore.openRecordStore(name, false);
      const record = store.getRecord(id);
      store.closeRecordStore();
      return record;
    } catch {
      return null;
    }
  }

  saveRecord(name: string, id: number, data: Uint8Array): void {
    const store = RecordStore.openRecordStore(name, true);
    try {
      store.setRecord(id, data);
    } catch {
      while (this.getRecordCount(store) < id - 1) {
        store.addRecord(new Uint8Array());
      }

      store.addRecord(data);
    }

    store.closeRecordStore();
  }

  loadConfig(): Uint8Array | null {
    return this.loadRecord("config", 1);
  }

  saveConfig(config: Uint8Array): void {
    this.saveRecord("config", 1, config);
  }

  loadGameProgress(): GameProgress | null {
    const data = this.loadRecord("savedGame", 1);
    if (!data || data.length < 8) {
      return null;
    }

    return {
      zoneID: data[0] ?? 0,
      actID: data[1] ?? 0,
      lives: data[2] ?? 3,
      score: this.readUint24(data, 3),
      rings: data[6] ?? 0,
    };
  }

  saveGameProgress(progress: GameProgress): void {
    const data = new Uint8Array(8);
    data[0] = progress.zoneID & 0xff;
    data[1] = progress.actID & 0xff;
    data[2] = progress.lives & 0xff;
    this.writeUint24(data, 3, progress.score);
    data[6] = progress.rings & 0xff;
    data[7] = 0;
    this.saveRecord("savedGame", 1, data);
  }

  loadHighscores(): HighscoreEntry[] {
    const data = this.loadRecord("highscore", 1);
    if (!data || data.length < 55) {
      return defaultHighscores.map((entry) => ({ ...entry }));
    }

    const entries: HighscoreEntry[] = [];
    for (let index = 0; index < 5; index += 1) {
      const offset = index * 11;
      const name = String.fromCharCode(data[offset + 1] ?? 83, data[offset + 2] ?? 79, data[offset + 3] ?? 78);
      entries.push({
        difficulty: data[offset] ?? 0,
        name,
        score: this.readUint24(data, offset + 4),
      });
    }

    return entries;
  }

  saveHighscores(entries: readonly HighscoreEntry[]): void {
    const sorted = [...entries].sort((a, b) => b.score - a.score).slice(0, 5);
    while (sorted.length < 5) {
      sorted.push(defaultHighscores[sorted.length]);
    }

    const data = new Uint8Array(55);
    for (let index = 0; index < 5; index += 1) {
      const entry = sorted[index];
      const offset = index * 11;
      const name = entry.name.toUpperCase().padEnd(3, " ").slice(0, 3);
      data[offset] = entry.difficulty & 0xff;
      data[offset + 1] = name.charCodeAt(0);
      data[offset + 2] = name.charCodeAt(1);
      data[offset + 3] = name.charCodeAt(2);
      this.writeUint24(data, offset + 4, entry.score);
    }

    this.saveRecord("highscore", 1, data);
  }

  addHighscore(entry: HighscoreEntry): HighscoreEntry[] {
    const entries = [...this.loadHighscores(), entry].sort((a, b) => b.score - a.score).slice(0, 5);
    this.saveHighscores(entries);
    return entries;
  }

  private getRecordCount(store: RecordStore): number {
    let count = 0;
    for (;;) {
      try {
        store.getRecord(count + 1);
        count += 1;
      } catch {
        return count;
      }
    }
  }

  private readUint24(data: Uint8Array, offset: number): number {
    return ((data[offset] ?? 0) << 16) | ((data[offset + 1] ?? 0) << 8) | (data[offset + 2] ?? 0);
  }

  private writeUint24(data: Uint8Array, offset: number, value: number): void {
    const normalized = Math.max(0, Math.min(0xffffff, Math.floor(value)));
    data[offset] = (normalized >> 16) & 0xff;
    data[offset + 1] = (normalized >> 8) & 0xff;
    data[offset + 2] = normalized & 0xff;
  }
}
