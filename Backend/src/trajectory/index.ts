/**
 * Trajectory module barrel — Phase 6.
 *
 * Core-authoritative, append-only, hash-chained trajectory storage + the Redis Streams
 * ingestion worker. PostgreSQL is the durable source of truth; Redis is transport only.
 */
export { TrajectoryService } from "./trajectory.service.js";
export type {
  CreateTraceInput,
  AppendEventInput,
} from "./trajectory.service.js";
export {
  TrajectoryIngestionWorker,
  parseStreamedEvent,
  TRAJECTORY_STREAM,
  TRAJECTORY_GROUP,
} from "./ingestion.worker.js";
export type { StreamedEvent, IngestionResult } from "./ingestion.worker.js";
