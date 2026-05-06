import { AudioPlayer } from "./AudioPlayer";
import { Image } from "./Image";

type AssetKind = "images" | "audio" | "levels" | "text";

const binaryExtensions = new Set([".act", ".bct", ".bin", ".blt", ".bmd", ".scd"]);
const imageExtensions = new Set([".png"]);
const audioExtensions = new Set([".amr", ".mid", ".mp3", ".ogg", ".wav"]);
const textExtensions = new Set([".txt"]);

export class ResourceLoader {
  async loadImage(path: string): Promise<Image> {
    return Image.createImage(this.resolveAssetPath(path, "images"));
  }

  async loadBinary(path: string): Promise<Uint8Array> {
    const response = await fetch(this.resolveAssetPath(path, "levels"));
    if (!response.ok) {
      throw new Error(`Unable to load binary resource: ${path}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  async loadText(path: string): Promise<string> {
    const response = await fetch(this.resolveAssetPath(path, "text"));
    if (!response.ok) {
      throw new Error(`Unable to load text resource: ${path}`);
    }

    return response.text();
  }

  async loadAudio(path: string): Promise<AudioPlayer> {
    const player = new AudioPlayer();
    await player.load(this.resolveAssetPath(path, "audio"));
    return player;
  }

  resolveAssetPath(path: string, preferredKind: AssetKind): string {
    if (
      path.startsWith("http://")
      || path.startsWith("https://")
      || path.startsWith("data:")
      || path.startsWith("blob:")
      || path.startsWith("/assets/")
    ) {
      return path;
    }

    const normalized = path.replace(/^\/+/, "");
    const extension = this.getExtension(normalized);
    const kind = this.resolveKind(extension) ?? preferredKind;
    const assetName = kind === "audio" && extension === "" ? `${normalized}.mid` : normalized;
    return `/assets/${kind}/${assetName}`;
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
