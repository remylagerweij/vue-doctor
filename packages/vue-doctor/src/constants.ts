export const SOURCE_FILE_PATTERN = /\.(vue|tsx?|jsx?|mjs|cjs)$/;

export const VUE_FILE_PATTERN = /\.(vue|tsx?|jsx?)$/;

export const MILLISECONDS_PER_SECOND = 1000;

export const ERROR_PREVIEW_LENGTH_CHARS = 200;

export const PERFECT_SCORE = 100;

export const SCORE_GOOD_THRESHOLD = 75;

export const SCORE_OK_THRESHOLD = 50;

export const SCORE_BAR_WIDTH_CHARS = 50;

export const SUMMARY_BOX_HORIZONTAL_PADDING_CHARS = 1;

export const SUMMARY_BOX_OUTER_INDENT_CHARS = 2;

export const FETCH_TIMEOUT_MS = 10_000;

export const GIT_LS_FILES_MAX_BUFFER_BYTES = 50 * 1024 * 1024;

// HACK: Windows CreateProcessW limits total command-line length to 32,767 chars.
// Use a conservative threshold to leave room for the executable path and quoting overhead.
export const SPAWN_ARGS_MAX_LENGTH_CHARS = 24_000;

export const DEFAULT_BRANCH_CANDIDATES = ["main", "master"];

export const ERROR_RULE_PENALTY = 1.5;

export const WARNING_RULE_PENALTY = 0.75;

export const MAX_KNIP_RETRIES = 5;

export const OXLINT_NODE_REQUIREMENT = "^20.19.0 || >=22.12.0";

export const OXLINT_RECOMMENDED_NODE_MAJOR = 24;
