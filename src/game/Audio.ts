import type { AudioPlayer } from "../platform/j2me/AudioPlayer";
import { ResourceLoader } from "../platform/j2me/ResourceLoader";

export const AUDIO_TRACKS = [
  "greenhill_loop",
  "labyrinth_loop",
  "marble_loop",
  "starlight_loop",
  "springyard_loop",
  "scrapbrain",
  "invincible",
  "1up",
  "specialstage",
  "maintitle",
  "ending",
  "bossstage",
  "bossstagefinal_loop",
  "stageclear",
  "gameover",
  "continue",
  "credits",
  "hurry",
  "chaosemerald",
] as const;

const SOURCE_MUSIC: Readonly<Record<number, { name: string; loopCount: number }>> = {
  1: { name: "81_1", loopCount: 1 },
  2: { name: "81_2", loopCount: -1 },
  3: { name: "82_1", loopCount: 1 },
  4: { name: "82_2", loopCount: -1 },
  5: { name: "83_1", loopCount: 1 },
  6: { name: "83_2", loopCount: -1 },
  7: { name: "84_1", loopCount: 1 },
  8: { name: "84_2", loopCount: -1 },
  9: { name: "85_1", loopCount: 1 },
  10: { name: "85_2", loopCount: -1 },
  11: { name: "86", loopCount: -1 },
  12: { name: "87", loopCount: -1 },
  13: { name: "88", loopCount: 1 },
  14: { name: "89", loopCount: -1 },
  15: { name: "8a", loopCount: 1 },
  16: { name: "8b", loopCount: 1 },
  17: { name: "8c", loopCount: -1 },
  18: { name: "8d_1", loopCount: 1 },
  19: { name: "8d_2", loopCount: -1 },
  20: { name: "8e", loopCount: 1 },
  21: { name: "8f", loopCount: 1 },
  22: { name: "90", loopCount: 1 },
  23: { name: "91", loopCount: 1 },
  24: { name: "92", loopCount: -1 },
  25: { name: "93", loopCount: 1 },
  26: { name: "SEGA", loopCount: 1 },
  27: { name: "ad", loopCount: 1 },
  28: { name: "c5", loopCount: 1 },
  29: { name: "b2", loopCount: 1 },
  30: { name: "88", loopCount: 1 },
};

export class Audio {
  private readonly resources = new ResourceLoader();
  public audioTracks: readonly string[] = AUDIO_TRACKS;
  public currentTrack = -1;

  private readonly playerCache = new Map<string, AudioPlayer>();
  private player: AudioPlayer | null = null;
  private interruptedTrack: number | string = -1;
  private options = 1;
  private enabled = true;

  setOptions(newOptions: number): void {
    this.options = newOptions;
    this.setEnabled((this.options & 1) === 1);
  }

  async play(track: number, loopCount = 1): Promise<void> {
    await this.playTrack(track, loopCount);
  }

  async playTrack(trackOrPath: number | string, loopCount = 1): Promise<void> {
    if (!this.enabled || (this.options & 1) !== 1) {
      return;
    }

    const path = this.resolveTrackPath(trackOrPath);
    if (!path) {
      return;
    }

    this.stop();
    this.player = await this.getOrLoadPlayer(path);
    this.player.play(loopCount);
    this.currentTrack = typeof trackOrPath === "number" ? trackOrPath : -1;
  }

  async preloadTrack(trackOrPath: number | string): Promise<void> {
    const path = this.resolveTrackPath(trackOrPath);
    if (!path || this.playerCache.has(path)) {
      return;
    }

    await this.getOrLoadPlayer(path);
  }

  async playMusicId(id: number, loopCount?: number): Promise<void> {
    const music = SOURCE_MUSIC[id];
    if (!music) {
      this.stop();
      return;
    }

    await this.playTrack(this.resolveSourceMusicPath(music.name), loopCount ?? music.loopCount);
    this.currentTrack = id;
  }

  async preloadMusicId(id: number): Promise<void> {
    const music = SOURCE_MUSIC[id];
    if (!music) {
      return;
    }

    await this.preloadTrack(this.resolveSourceMusicPath(music.name));
  }

  async playZoneBgm(zoneID: number, actID: number, loopPart = true): Promise<void> {
    await this.playMusicId(this.getZoneBgmId(zoneID, actID, loopPart));
  }

  async preloadZoneBgm(zoneID: number, actID: number, loopPart = true): Promise<void> {
    await this.preloadMusicId(this.getZoneBgmId(zoneID, actID, loopPart));
  }

  interruptTrack(): void {
    this.interruptedTrack = this.currentTrack;
    this.stop();
  }

  async replayInterruptedTrack(): Promise<void> {
    if (this.interruptedTrack === -1) {
      return;
    }

    const track = this.interruptedTrack;
    this.interruptedTrack = -1;
    await this.playTrack(track, -1);
  }

  async interruptTrackAndPlay(trackOrPath: number | string, loopCount = 1): Promise<void> {
    this.interruptTrack();
    await this.playTrack(trackOrPath, loopCount);
  }

  stop(): void {
    this.player?.stop();
    this.player = null;
    this.currentTrack = -1;
  }

  closePlayer(): void {
    this.stop();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
    }
  }

  private resolveTrackPath(trackOrPath: number | string): string | null {
    const trackName = typeof trackOrPath === "number" ? this.audioTracks[trackOrPath] : trackOrPath;
    if (!trackName) {
      return null;
    }

    if (
      trackName.startsWith("http://")
      || trackName.startsWith("https://")
      || trackName.startsWith("data:")
      || trackName.startsWith("blob:")
      || trackName.startsWith("/assets/")
      || trackName.startsWith("assets/")
      || /\.[a-z0-9]+$/i.test(trackName)
    ) {
      return trackName;
    }

    return `assets/ogg-audio/${trackName}.ogg`;
  }

  private resolveSourceMusicPath(name: string): string {
    return `assets/source-j2me/ogg-audio/${name}.ogg`;
  }

  private getZoneBgmId(zoneID: number, actID: number, loopPart: boolean): number {
    const finalAct = actID >= 2;
    if (loopPart) {
      switch (zoneID) {
        case 0:
          return 2;
        case 1:
          return finalAct ? 11 : 4;
        case 2:
          return 6;
        case 3:
          return 8;
        case 4:
          return 10;
        case 5:
          return finalAct ? 18 : 11;
        default:
          return 2;
      }
    }

    switch (zoneID) {
      case 0:
        return 1;
      case 1:
        return finalAct ? 11 : 3;
      case 2:
        return 5;
      case 3:
        return 7;
      case 4:
        return 9;
      case 5:
        return finalAct ? 19 : 11;
      default:
        return 2;
    }
  }

  private async getOrLoadPlayer(path: string): Promise<AudioPlayer> {
    const cachedPlayer = this.playerCache.get(path);
    if (cachedPlayer) {
      return cachedPlayer;
    }

    const player = await this.resources.loadAudio(path);
    this.playerCache.set(path, player);
    return player;
  }
}
