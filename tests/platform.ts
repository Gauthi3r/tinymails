// Windows implements neither POSIX permission bits nor real signal delivery, so
// assertions that depend on either are scoped to the platforms that honor them.
export const honorsPosixModes = process.platform !== "win32";
export const deliversTerminationSignals = process.platform !== "win32";
