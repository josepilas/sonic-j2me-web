import { isExternalUrl, resolveAppPath } from "./AssetPath";
import { AudioPlayer } from "./AudioPlayer";
import { Image } from "./Image";

type AssetKind = "images" | "audio" | "levels" | "text";
export type AssetProfile = "runtime" | "source-j2me";

interface LoadOptions {
  profile?: AssetProfile;
}

const binaryExtensions = new Set([".act", ".bct", ".bin", ".blt", ".bmd", ".scd"]);
const imageExtensions = new Set([".png"]);
const audioExtensions = new Set([".amr", ".mid", ".mp3", ".ogg", ".wav"]);
const textExtensions = new Set([".json", ".txt"]);

export class ResourceLoader {
  async loadImage(path: string, options: LoadOptions = {}): Promise<Image> {
    return Image.createImage(this.resolveAssetPath(path, "images", options.profile));
  }

  async loadBinary(path: string, options: LoadOptions = {}): Promise<Uint8Array> {
    const response = await fetch(this.resolveAssetPath(path, "levels", options.profile));
    if (!response.ok) {
      throw new Error(`Unable to load binary resource: ${path}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  async loadText(path: string, options: LoadOptions = {}): Promise<string> {
    const response = await fetch(this.resolveAssetPath(path, "text", options.profile));
    if (!response.ok) {
      throw new Error(`Unable to load text resource: ${path}`);
    }

    return response.text();
  }

  async loadAudio(path: string, options: LoadOptions = {}): Promise<AudioPlayer> {
    const player = new AudioPlayer();
    await player.load(this.resolveAssetPath(path, "audio", options.profile));
    return player;
  }

  resolveAssetPath(path: string, preferredKind: AssetKind, profile: AssetProfile = "runtime"): string {
    if (isExternalUrl(path)) {
      return path;
    }

    const normalized = path.replace(/^\/+/, "");
    if (normalized.startsWith("assets/")) {
      return resolveAppPath(normalized);
    }

    const extension = this.getExtension(normalized);
    const kind = this.resolveKind(extension) ?? preferredKind;
    const assetName = kind === "audio" && extension === "" ? `${normalized}.mid` : normalized;
    const root = profile === "source-j2me" ? "assets/source-j2me" : "assets";
    return resolveAppPath(`${root}/${kind}/${assetName}`);
  }

  private resolveKind(extension: string): AssetKind | null {
    if (imageExtensions.has(extension)) {
      return "images";
    }

    if (audioExtensions.has(extension)) {
      return "audio";
    }

    if (binaryExtensions.has(extension)) {
      return "levels";
    }

    if (textExtensions.has(extension)) {
      return "text";
    }

    return null;
  }

  private getExtension(path: string): string {
    const dotIndex = path.lastIndexOf(".");
    if (dotIndex === -1) {
      return "";
    }

    return path.slice(dotIndex).toLowerCase();
  }
}
