import type { VueDoctorConfig } from "./schema.js";

/**
 * Identity helper that gives `vue-doctor.config.ts` autocompletion and type checking.
 * Kept apart from the zod schema so importing it does not load zod.
 */
export const defineConfig = (config: VueDoctorConfig): VueDoctorConfig => config;
