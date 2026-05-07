interface MidiRawEvent {
  tick: number;
  type: "noteOn" | "noteOff" | "tempo";
  channel?: number;
  note?: number;
  velocity?: number;
  tempo?: number;
}

interface MidiNote {
  start: number;
  duration: number;
  note: number;
  velocity: number;
  channel: number;
}

interface MidiSequence {
  notes: MidiNote[];
  duration: number;
}

export class AudioPlayer {
  private static audioContext: AudioContext | null = null;
  private static pendingPlayers = new Map<AudioPlayer, number>();

  private element: HTMLAudioElement | null = null;
  private midi: MidiSequence | null = null;
  private scheduledNodes: OscillatorNode[] = [];
  private scheduledGains: GainNode[] = [];
  private schedulerTimer = 0;
  private midiCursor = 0;
  private midiLoopCount = 1;
  private midiLoopsCompleted = 0;
  private midiPlayStartTime = 0;
  private ready: Promise<void> = Promise.resolve();
  private volume = 1;

  static async unlock(): Promise<void> {
    try {
      const context = AudioPlayer.getAudioContext();
      if (context.state !== "running") {
        await context.resume();
      }

      if (context.state === "running") {
        const pending = [...AudioPlayer.pendingPlayers.entries()];
        AudioPlayer.pendingPlayers.clear();
        for (const [player, loopCount] of pending) {
          player.play(loopCount);
        }
      }
    } catch {
      AudioPlayer.audioContext = null;
    }
  }

  async load(path: string): Promise<void> {
    this.close();
    const extension = path.split("?")[0].split(".").pop()?.toLowerCase();

    if (extension === "mid" || extension === "midi") {
      const response = await fetch(path);
      if (!response.ok) {
        return;
      }

      this.midi = this.parseMidi(new Uint8Array(await response.arrayBuffer()));
      return;
    }

    if (extension === "amr") {
      const probe = new Audio();
      if (probe.canPlayType("audio/amr") === "") {
        return;
      }
    }

    const element = new Audio(path);
    element.preload = "auto";
    element.volume = this.volume;
    this.element = element;
    this.ready = new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        element.removeEventListener("canplaythrough", finish);
        element.removeEventListener("loadeddata", finish);
        element.removeEventListener("error", finish);
        window.clearTimeout(timeout);
        resolve();
      };
      const timeout = window.setTimeout(finish, 2500);
      element.addEventListener("canplaythrough", finish, { once: true });
      element.addEventListener("loadeddata", finish, { once: true });
      element.addEventListener("error", finish, { once: true });
    });
    element.load();
    await this.ready;
  }

  play(loopCount = 1): void {
    if (this.midi) {
      this.playMidi(loopCount);
      return;
    }

    if (!this.element) {
      return;
    }

    this.element.loop = loopCount < 0;
    try {
      this.element.currentTime = 0;
    } catch {}
    void this.ready.then(() => this.element?.play()).catch(() => {
      AudioPlayer.pendingPlayers.set(this, loopCount);
    });
  }

  stop(): void {
    if (this.element) {
      this.element.pause();
      try {
        this.element.currentTime = 0;
      } catch {}
    }

    this.stopMidi();
    AudioPlayer.pendingPlayers.delete(this);
  }

  close(): void {
    this.stop();
    this.element = null;
    this.midi = null;
    this.ready = Promise.resolve();
  }

  setVolume(level: number): void {
    this.volume = Math.max(0, Math.min(1, level));
    if (this.element) {
      this.element.volume = this.volume;
    }
  }

  private static getAudioContext(): AudioContext {
    if (!AudioPlayer.audioContext) {
      AudioPlayer.audioContext = new AudioContext();
    }

    return AudioPlayer.audioContext;
  }

  private playMidi(loopCount: number): void {
    const sequence = this.midi;
    if (!sequence || sequence.notes.length === 0 || sequence.duration <= 0) {
      return;
    }

    let context: AudioContext;
    try {
      context = AudioPlayer.getAudioContext();
    } catch {
      return;
    }

    if (context.state !== "running") {
      AudioPlayer.pendingPlayers.set(this, loopCount);
      void AudioPlayer.unlock();
      return;
    }

    this.stopMidi();
    this.midiCursor = 0;
    this.midiLoopCount = loopCount;
    this.midiLoopsCompleted = 0;
    this.midiPlayStartTime = context.currentTime + 0.03;
    this.scheduleUpcomingMidiNotes(context);
    this.schedulerTimer = window.setInterval(() => {
      const freshContext = AudioPlayer.audioContext;
      if (!freshContext || freshContext.state !== "running") {
        AudioPlayer.pendingPlayers.set(this, this.midiLoopCount);
        this.stopMidiScheduler();
        return;
      }

      this.scheduleUpcomingMidiNotes(freshContext);
    }, 80);
  }

  private stopMidi(): void {
    this.stopMidiScheduler();

    for (const oscillator of this.scheduledNodes) {
      try {
        oscillator.stop();
      } catch {}
      oscillator.disconnect();
    }

    for (const gain of this.scheduledGains) {
      gain.disconnect();
    }

    this.scheduledNodes = [];
    this.scheduledGains = [];
    this.midiCursor = 0;
    this.midiLoopsCompleted = 0;
  }

  private stopMidiScheduler(): void {
    if (this.schedulerTimer !== 0) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = 0;
    }
  }

  private scheduleUpcomingMidiNotes(context: AudioContext): void {
    const sequence = this.midi;
    if (!sequence) {
      return;
    }

    if (sequence.duration <= 0) {
      this.stopMidiScheduler();
      return;
    }

    let playbackTime = context.currentTime - this.midiPlayStartTime;
    while (playbackTime >= sequence.duration) {
      const hasAnotherLoop = this.midiLoopCount < 0 || this.midiLoopsCompleted + 1 < this.midiLoopCount;
      if (!hasAnotherLoop) {
        this.stopMidiScheduler();
        return;
      }

      this.midiLoopsCompleted += 1;
      this.midiPlayStartTime += sequence.duration;
      this.midiCursor = 0;
      playbackTime = context.currentTime - this.midiPlayStartTime;
    }

    const lookAheadSeconds = 0.75;
    const scheduleUntil = playbackTime + lookAheadSeconds;
    while (this.midiCursor < sequence.notes.length && sequence.notes[this.midiCursor].start <= scheduleUntil) {
      const midiNote = sequence.notes[this.midiCursor];
      this.midiCursor += 1;
      this.scheduleMidiNote(context, midiNote, this.midiPlayStartTime + midiNote.start);
    }
  }

  private scheduleMidiNote(context: AudioContext, midiNote: MidiNote, absoluteStart: number): void {
    if (this.scheduledNodes.length > 96 || midiNote.channel === 9) {
      return;
    }

    const lateBy = context.currentTime - absoluteStart;
    if (lateBy > midiNote.duration) {
      return;
    }

    const duration = Math.max(0.035, Math.min(midiNote.duration - Math.max(0, lateBy), 3.5));
    const noteStart = Math.max(context.currentTime + 0.005, absoluteStart);
    const noteEnd = noteStart + duration;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const velocityGain = (midiNote.velocity / 127) * this.volume;

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(this.noteToFrequency(midiNote.note), noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, velocityGain * 0.045), noteStart + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
    oscillator.addEventListener("ended", () => {
      oscillator.disconnect();
      gain.disconnect();
      this.scheduledNodes = this.scheduledNodes.filter((node) => node !== oscillator);
      this.scheduledGains = this.scheduledGains.filter((node) => node !== gain);
    });

    this.scheduledNodes.push(oscillator);
    this.scheduledGains.push(gain);
  }

  private noteToFrequency(note: number): number {
    return 440 * 2 ** ((note - 69) / 12);
  }

  private parseMidi(data: Uint8Array): MidiSequence {
    let offset = 0;
    const readString = (length: number) => {
      const text = String.fromCharCode(...data.slice(offset, offset + length));
      offset += length;
      return text;
    };
    const readU16 = () => {
      const value = (data[offset] << 8) | data[offset + 1];
      offset += 2;
      return value;
    };
    const readU32 = () => {
      const value = (
        (data[offset] * 0x1000000)
        + ((data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3])
      ) >>> 0;
      offset += 4;
      return value;
    };

    if (readString(4) !== "MThd") {
      return { notes: [], duration: 0 };
    }

    const headerLength = readU32();
    const headerEnd = offset + headerLength;
    readU16();
    const trackCount = readU16();
    const division = readU16();
    offset = headerEnd;

    if ((division & 0x8000) !== 0) {
      return { notes: [], duration: 0 };
    }

    const ticksPerQuarter = division || 96;
    const events: MidiRawEvent[] = [];
    for (let track = 0; track < trackCount && offset < data.length; track += 1) {
      if (readString(4) !== "MTrk") {
        break;
      }

      const trackLength = readU32();
      const trackEnd = offset + trackLength;
      this.parseMidiTrack(data, offset, trackEnd, events);
      offset = trackEnd;
    }

    return this.eventsToSequence(events, ticksPerQuarter);
  }

  private parseMidiTrack(data: Uint8Array, start: number, end: number, events: MidiRawEvent[]): void {
    let offset = start;
    let tick = 0;
    let runningStatus = 0;

    const readVarLength = () => {
      let value = 0;
      for (let index = 0; index < 4 && offset < end; index += 1) {
        const byte = data[offset];
        offset += 1;
        value = (value << 7) | (byte & 0x7f);
        if ((byte & 0x80) === 0) {
          break;
        }
      }

      return value;
    };

    while (offset < end) {
      tick += readVarLength();
      let status = data[offset];
      offset += 1;

      if (status < 0x80) {
        offset -= 1;
        status = runningStatus;
      } else if (status < 0xf0) {
        runningStatus = status;
      }

      if (status === 0xff) {
        const metaType = data[offset];
        offset += 1;
        const length = readVarLength();
        if (metaType === 0x51 && length === 3) {
          const tempo = (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2];
          events.push({ tick, type: "tempo", tempo });
        }
        offset += length;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        offset += readVarLength();
        continue;
      }

      const command = status & 0xf0;
      const channel = status & 0x0f;
      const dataLength = command === 0xc0 || command === 0xd0 ? 1 : 2;
      const first = data[offset];
      offset += 1;
      const second = dataLength === 2 ? data[offset] : 0;
      offset += dataLength === 2 ? 1 : 0;

      if (command === 0x90 && second > 0) {
        events.push({ tick, type: "noteOn", channel, note: first, velocity: second });
      } else if (command === 0x80 || (command === 0x90 && second === 0)) {
        events.push({ tick, type: "noteOff", channel, note: first, velocity: second });
      }
    }
  }

  private eventsToSequence(events: MidiRawEvent[], ticksPerQuarter: number): MidiSequence {
    const sortedEvents = [...events].sort((a, b) => {
      if (a.tick !== b.tick) {
        return a.tick - b.tick;
      }

      if (a.type === b.type) {
        return 0;
      }

      return a.type === "tempo" ? -1 : 1;
    });
    const tempoEvents = sortedEvents
      .filter((event) => event.type === "tempo" && event.tempo)
      .map((event) => ({ tick: event.tick, tempo: event.tempo ?? 500000 }));

    if (tempoEvents.length === 0 || tempoEvents[0].tick !== 0) {
      tempoEvents.unshift({ tick: 0, tempo: 500000 });
    }

    const tickToSeconds = (targetTick: number) => {
      let seconds = 0;
      let lastTick = tempoEvents[0].tick;
      let tempo = tempoEvents[0].tempo;

      for (let index = 1; index < tempoEvents.length && tempoEvents[index].tick < targetTick; index += 1) {
        const next = tempoEvents[index];
        seconds += ((next.tick - lastTick) * tempo) / ticksPerQuarter / 1000000;
        lastTick = next.tick;
        tempo = next.tempo;
      }

      return seconds + ((targetTick - lastTick) * tempo) / ticksPerQuarter / 1000000;
    };

    const activeNotes = new Map<string, Array<{ tick: number; velocity: number }>>();
    const notes: MidiNote[] = [];

    for (const event of sortedEvents) {
      if (event.type !== "noteOn" && event.type !== "noteOff") {
        continue;
      }

      const channel = event.channel ?? 0;
      const note = event.note ?? 0;
      const key = `${channel}:${note}`;
      if (event.type === "noteOn") {
        const stack = activeNotes.get(key) ?? [];
        stack.push({ tick: event.tick, velocity: event.velocity ?? 64 });
        activeNotes.set(key, stack);
        continue;
      }

      const stack = activeNotes.get(key);
      const start = stack?.shift();
      if (!start) {
        continue;
      }

      const startSeconds = tickToSeconds(start.tick);
      const endSeconds = tickToSeconds(event.tick);
      if (endSeconds > startSeconds) {
        notes.push({
          start: startSeconds,
          duration: endSeconds - startSeconds,
          note,
          velocity: start.velocity,
          channel,
        });
      }
    }

    notes.sort((a, b) => a.start - b.start);
    const duration = notes.reduce((max, note) => Math.max(max, note.start + note.duration), 0);
    return { notes, duration };
  }
}
