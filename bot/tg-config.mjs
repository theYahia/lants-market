// Shared bot configuration for the Telegram bot (@lantsalerts_bot).
//
// TOP_MODELS_ENABLED is the same gate diff.mjs applies to the antseedstats
// top-models post: the /top command stays unavailable until the models
// first-page sort semantics are verified (open question 1 in the plan). The
// X-side constant in diff.mjs cannot be touched (run.mjs/diff.mjs are frozen),
// so the Telegram side reads the shared flag from here - flip it once alongside
// the diff.mjs one.

export const TOP_MODELS_ENABLED = false;
