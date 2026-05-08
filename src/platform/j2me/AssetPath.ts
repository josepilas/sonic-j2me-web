export const GITHUB_PAGES_BASE_PATH = "/sonic-j2me-web/";

const externalUrlPattern = /^(?:https?:|data:|blob:)/i;
const githubPagesHostPattern = /(?:^|\.)github\.io$/i;

export function isExternalUrl(path: string): boolean {
  return externalUrlPattern.test(path);
}

export function resolveAppPath(path: string): string {
  if (isExternalUrl(path)) {
    return path;
  }

  const normalizedPath = path.replace(/^\/+/, "");
  const basePath = getAppBasePath();
  if (basePath === "/" || basePath === "") {
    return `/${normalizedPath}`;
  }

  if (basePath === "./") {
    return `./${normalizedPath}`;
  }

  return `${basePath.replace(/\/?$/, "/")}${normalizedPath}`;
}

export function getAppBasePath(): string {
  const githubPagesBasePath = getGitHubPagesBasePath();
  if (githubPagesBasePath) {
    return githubPagesBasePath;
  }

  return normalizeBasePath(import.meta.env.BASE_URL || "/");
}

function getGitHubPagesBasePath(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (!githubPagesHostPattern.test(window.location.hostname)) {
    return null;
  }

  return GITHUB_PAGES_BASE_PATH;
}

function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim();
  if (trimmed === "" || trimmed === ".") {
    return "./";
  }

  if (isExternalUrl(trimmed)) {
    return trimmed.replace(/\/?$/, "/");
  }

  if (trimmed === "/") {
    return "/";
  }

  return trimmed.replace(/\/?$/, "/");
}
