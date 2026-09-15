/**
 * ModelMetadata contract — Phase 2, Task 2.1.
 *
 * Mirrors CONTRACTS.md §43 and Orvex/ML/schemas/model_metadata.py. Every
 * AI-generated contract object carries this so results are reproducible and
 * auditable. Consumer-side: `.passthrough()` for forward-compat.
 */
import { z } from "zod";
import { isoTimestamp } from "./primitives.js";

export const ModelMetadata = z
  .object({
    provider: z.string(),
    model: z.string(),
    model_version: z.string(),
    configuration_version: z.string(),
    prompt_version: z.string(),
    temperature: z.number().default(0),
    timestamp: isoTimestamp,

    // Optional expansion fields (CONTRACTS.md §43) — kept optional for fwd-compat.
    system_prompt_hash: z.string().nullish(),
    toolset_version: z.string().nullish(),
    retrieval_version: z.string().nullish(),
    classifier_version: z.string().nullish(),
    embedding_model_version: z.string().nullish(),
  })
  .passthrough();
export type ModelMetadata = z.infer<typeof ModelMetadata>;
