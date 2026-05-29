import { homedir } from "os";

const IS_WIN = process.platform === "win32";
const home = homedir();

/**
 * Format an absolute path for display in shell commands.
 * Unix  → replace home dir with ~
 * Windows → replace home dir with %USERPROFILE%
 */
export function shellPath(p: string): string {
  return IS_WIN ? p.replace(home, "%USERPROFILE%") : p.replace(home, "~");
}

/** Delete a single file (rm -f / del /f /q) */
export function rmFileCmd(p: string): string {
  return IS_WIN
    ? `del /f /q "${p}"`
    : `rm -f ${shellPath(p)}`;
}

/** Delete a directory recursively (rm -rf / rmdir /s /q) */
export function rmDirCmd(p: string): string {
  return IS_WIN
    ? `rmdir /s /q "${p}"`
    : `rm -rf ${shellPath(p)}`;
}

/** Create a symlink dest → src (ln -sf / mklink).
 *  Note: mklink arg order is reversed vs ln: mklink <dest> <src>
 *  Also note: mklink on Windows requires Developer Mode or admin. */
export function mkSymlinkCmd(src: string, dest: string): string {
  return IS_WIN
    ? `mklink "${dest}" "${src}"`
    : `ln -sf ${shellPath(src)} ${shellPath(dest)}`;
}

/** Copy a file (cp / copy) */
export function copyFileCmd(src: string, dest: string): string {
  return IS_WIN
    ? `copy "${src}" "${dest}"`
    : `cp ${shellPath(src)} ${shellPath(dest)}`;
}

/** Check / inspect a path (ls -la / dir) */
export function checkPathCmd(p: string): string {
  return IS_WIN ? `dir "${p}"` : `ls -la ${shellPath(p)} 2>&1`;
}

/** mkdir -p / mkdir */
export function mkdirCmd(p: string): string {
  return IS_WIN ? `mkdir "${p}"` : `mkdir -p ${shellPath(p)}`;
}

/**
 * Package install suggestion.
 * Unix  → brew install <brewPkg>
 * Windows → winget install --id <wingetId> (falls back to choco if no wingetId)
 */
export function pkgInstallCmd(
  brewPkg: string,
  wingetId?: string,
  chocoName?: string,
): string {
  if (IS_WIN) {
    if (wingetId) return `winget install --id ${wingetId} -e`;
    return `choco install ${chocoName ?? brewPkg}`;
  }
  return `brew install ${brewPkg}`;
}
