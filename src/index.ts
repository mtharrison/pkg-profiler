// Public API surface
export { start, stop, clear, profile } from './sampler.js';
export { PkgProfile } from './pkg-profile.js';
export type { PackageEntry, StartOptions, ProfileCallbackOptions } from './types.js';

/** @deprecated Use `start()` instead */
export { start as track } from './sampler.js';

/** @deprecated Use `stop()` instead — now returns PkgProfile instead of filepath */
export { stop as report } from './sampler.js';
