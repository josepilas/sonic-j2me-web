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

const OGG_AUDIO_TRACKS = new Set<string>([
  "greenhill_loop",
  "marble_loop",
  "springyard_loop",
  "invincible",
  "1up",
  "maintitle",
  "ending",
  "bossstage",
  "stageclear",
  "gameover",
  "continue",
]);

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
      || /\.[a-z0-9]+$/i.test(trackName)
    ) {
      return trackName;
    }

    if (OGG_AUDIO_TRACKS.has(trackName)) {
      return `/assets/ogg-audio/${trackName}.ogg`;
    }

    return trackName;
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
