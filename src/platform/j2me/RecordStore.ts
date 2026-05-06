interface StoredRecords {
  records: string[];
}

const storagePrefix = "sonic-j2me-web:rms:";

export class RecordStore {
  private readonly name: string;
  private records: Uint8Array[];

  private constructor(name: string, records: Uint8Array[]) {
    this.name = name;
    this.records = records;
  }

  static openRecordStore(name: string, createIfNecessary: boolean): RecordStore {
    const raw = localStorage.getItem(RecordStore.storageKey(name));
    if (!raw) {
      if (!createIfNecessary) {
        throw new Error(`RecordStore does not exist: ${name}`);
      }

      return new RecordStore(name, []);
    }

    const parsed = JSON.parse(raw) as StoredRecords;
    return new RecordStore(name, parsed.records.map((record) => RecordStore.fromBase64(record)));
  }

  static deleteRecordStore(name: string): void {
    localStorage.removeItem(RecordStore.storageKey(name));
  }

  addRecord(data: Uint8Array): number {
    this.records.push(new Uint8Array(data));
    this.persist();
    return this.records.length;
  }

  setRecord(id: number, data: Uint8Array): void {
    this.assertRecordId(id);
    this.records[id - 1] = new Uint8Array(data);
    this.persist();
  }

  getRecord(id: number): Uint8Array {
    this.assertRecordId(id);
    return new Uint8Array(this.records[id - 1]);
  }

  closeRecordStore(): void {
    this.persist();
  }

  private assertRecordId(id: number): void {
    if (id < 1 || id > this.records.length) {
      throw new Error(`Record id out of range: ${id}`);
    }
  }

  private persist(): void {
    const payload: StoredRecords = {
      records: this.records.map((record) => RecordStore.toBase64(record)),
    };
    localStorage.setItem(RecordStore.storageKey(this.name), JSON.stringify(payload));
  }

  private static storageKey(name: string): string {
    return `${storagePrefix}${name}`;
  }

  private static toBase64(data: Uint8Array): string {
    let binary = "";
    for (const byte of data) {
      binary += String.fromCharCode(byte);
    }

    return btoa(binary);
  }

  private static fromBase64(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }
}
