/**
 * sdk/builder/parallel-engine.ts
 *
 * QAPi SDK Parallel Build Engine
 *
 * Orchestrates concurrent SDK artifact builds across multiple target
 * platforms. Production wiring uses BullMQ (Redis-backed job queue) and
 * Docker-based builders. Local/CI runs fall back to a lightweight in-process
 * queue so Docker/Redis are not required.
 *
 * Features:
 *  - Bull/BullMQ queue for durable build jobs
 *  - Docker-based platform builders: apk, ios, exe, web, pwa
 *  - Per-tier parallel concurrency limits
 *  - Priority ordering (higher tiers run first)
 *  - Artifact extraction & S3/storage upload stubs
 *  - `waitForCompletion` helper
 *  - Structured result logging
 *
 * Env vars:
 *   REDIS_URL           – enables BullMQ; falls back to in-process queue
 *   S3_BUCKET           – target bucket for artifact uploads (stub)
 *   S3_REGION           – AWS region (stub)
 *   DOCKER_HOST         – override Docker socket (optional)
 */

import { SubscriptionTier, SUBSCRIPTION_FEATURES } from "../../apps/core/lib/subscription-tiers.js";

// ── Platform types ────────────────────────────────────────────────────────────

/** Supported build target platforms. */
export type BuildPlatform = "apk" | "ios" | "exe" | "web" | "pwa";

export const ALL_PLATFORMS: BuildPlatform[] = ["apk", "ios", "exe", "web", "pwa"];

// ── Docker image map ──────────────────────────────────────────────────────────

/** Maps each platform to its Docker builder image (stubs). */
const PLATFORM_IMAGES: Record<BuildPlatform, string> = {
  apk: "qapi/builder-android:latest",
  ios: "qapi/builder-ios:latest",
  exe: "qapi/builder-windows:latest",
  web: "qapi/builder-web:latest",
  pwa: "qapi/builder-pwa:latest",
};

// ── Job model ─────────────────────────────────────────────────────────────────

export type BuildStatus = "queued" | "running" | "success" | "failed" | "cancelled";

export interface BuildJob {
  id: string;
  tier: SubscriptionTier;
  platform: BuildPlatform;
  sdkVersion: string;
  /** Absolute path to source dir (or S3 key). */
  sourcePath: string;
  status: BuildStatus;
  priority: number;
  /** Epoch ms when the job was created. */
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  /** Path / URL to produced artifact (populated on success). */
  artifactUrl?: string;
  error?: string;
  logs: string[];
}

export interface BuildResult {
  jobId: string;
  platform: BuildPlatform;
  status: BuildStatus;
  artifactUrl?: string;
  durationMs?: number;
  error?: string;
}

export interface EnqueueOptions {
  tier: SubscriptionTier;
  platforms: BuildPlatform[];
  sdkVersion: string;
  sourcePath: string;
  /** Override concurrency limit (admin use only). */
  maxConcurrency?: number;
}

// ── Priority by tier ──────────────────────────────────────────────────────────

const TIER_PRIORITY: Record<SubscriptionTier, number> = {
  [SubscriptionTier.Audited]: 10,
  [SubscriptionTier.Pro]: 5,
  [SubscriptionTier.Starter]: 1,
};

// ── In-process queue (fallback when BullMQ/Redis unavailable) ─────────────────

const _jobStore = new Map<string, BuildJob>();
const _pendingQueue: BuildJob[] = [];
let _activeBuilds = 0;

function generateJobId(): string {
  return `build_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function log(job: BuildJob, message: string): void {
  const ts = new Date().toISOString();
  job.logs.push(`[${ts}] ${message}`);
  console.log(`[qapi-builder][${job.id}][${job.platform}] ${message}`);
}

// ── BullMQ wrapper (optional) ─────────────────────────────────────────────────

interface BullQueue {
  add(name: string, data: BuildJob, opts: { priority: number }): Promise<{ id: string }>;
  close(): Promise<void>;
}

let _bullQueue: BullQueue | null = null;

async function getBullQueue(): Promise<BullQueue | null> {
  if (_bullQueue) return _bullQueue;
  if (!process.env.REDIS_URL) return null;

  try {
    const { Queue } = await import("bullmq" as string) as {
      Queue: new (name: string, opts: { connection: { url: string } }) => BullQueue;
    };
    _bullQueue = new Queue("qapi-builds", {
      connection: { url: process.env.REDIS_URL },
    });
    return _bullQueue;
  } catch {
    return null;
  }
}

// ── Docker build stub ──────────────────────────────────────────────────────────

/**
 * Runs (or simulates) a Docker-based build for the given job.
 *
 * In production this would:
 *   1. `docker pull <image>`
 *   2. `docker run --rm -v <sourcePath>:/workspace <image> build`
 *   3. Extract artifact from container output
 *   4. Upload to S3 via `uploadArtifact`
 *
 * Currently a deterministic stub that always succeeds after a short delay.
 */
async function runDockerBuild(job: BuildJob): Promise<string> {
  const image = PLATFORM_IMAGES[job.platform];
  log(job, `Pulling image ${image} …`);
  // Stub: simulate 50-200 ms build time
  await new Promise((res) => setTimeout(res, 50 + Math.random() * 150));
  log(job, `Build complete for platform '${job.platform}'.`);

  const artifactKey = `builds/${job.tier}/${job.sdkVersion}/${job.id}/${job.platform}.artifact`;
  const artifactUrl = await uploadArtifact(job, artifactKey);
  return artifactUrl;
}

// ── S3 upload stub ────────────────────────────────────────────────────────────

/**
 * Uploads a build artifact to S3 (stub implementation).
 *
 * In production this would use `@aws-sdk/client-s3` or `@aws-sdk/lib-storage`
 * to stream the artifact to S3_BUCKET.
 */
async function uploadArtifact(job: BuildJob, key: string): Promise<string> {
  const bucket = process.env.S3_BUCKET ?? "qapi-artifacts";
  const region = process.env.S3_REGION ?? "us-east-1";

  log(job, `[S3-stub] Uploading artifact to s3://${bucket}/${key}`);
  // Stub: return the would-be S3 URL
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

// ── Per-job builder ───────────────────────────────────────────────────────────

async function executeBuild(job: BuildJob): Promise<BuildResult> {
  job.status = "running";
  job.startedAt = Date.now();
  log(job, `Starting build (tier=${job.tier}, priority=${job.priority})`);

  try {
    const artifactUrl = await runDockerBuild(job);
    job.status = "success";
    job.artifactUrl = artifactUrl;
    job.finishedAt = Date.now();
    const durationMs = job.finishedAt - (job.startedAt ?? job.finishedAt);
    log(job, `✔ Build succeeded in ${durationMs}ms → ${artifactUrl}`);
    return { jobId: job.id, platform: job.platform, status: "success", artifactUrl, durationMs };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    job.status = "failed";
    job.error = msg;
    job.finishedAt = Date.now();
    log(job, `✘ Build failed: ${msg}`);
    return { jobId: job.id, platform: job.platform, status: "failed", error: msg };
  }
}

// ── Parallel scheduler ────────────────────────────────────────────────────────

/**
 * Runs up to `maxConcurrency` builds in parallel, respecting priority order.
 */
async function runParallel(jobs: BuildJob[], maxConcurrency: number): Promise<BuildResult[]> {
  const results: BuildResult[] = [];
  // Sort by priority descending (highest first)
  const queue = [...jobs].sort((a, b) => b.priority - a.priority);

  const workers: Promise<void>[] = [];

  async function processNext(): Promise<void> {
    while (queue.length > 0) {
      const job = queue.shift()!;
      const result = await executeBuild(job);
      results.push(result);
    }
  }

  for (let i = 0; i < Math.min(maxConcurrency, jobs.length); i++) {
    workers.push(processNext());
  }

  await Promise.all(workers);
  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueues parallel builds for the specified platforms and returns a batch ID
 * plus the initial job list.
 *
 * Concurrency is limited by the caller's tier:
 *   Starter  → 1 parallel build
 *   Pro      → 5 parallel builds
 *   Audited  → unlimited (defaults to platform count)
 *
 * @example
 * const { batchId, jobs } = await enqueueBuildBatch({
 *   tier: SubscriptionTier.Pro,
 *   platforms: ["web", "pwa"],
 *   sdkVersion: "1.2.3",
 *   sourcePath: "/workspace/my-app",
 * });
 */
export async function enqueueBuildBatch(opts: EnqueueOptions): Promise<{
  batchId: string;
  jobs: BuildJob[];
  maxConcurrency: number;
}> {
  const { tier, platforms, sdkVersion, sourcePath } = opts;

  const features = SUBSCRIPTION_FEATURES[tier];
  const tierConcurrency = features.maxParallelBuilds ?? platforms.length;
  const maxConcurrency = opts.maxConcurrency ?? tierConcurrency;
  const priority = TIER_PRIORITY[tier];

  const batchId = `batch_${Date.now().toString(36)}`;
  const jobs: BuildJob[] = platforms.map((platform) => {
    const job: BuildJob = {
      id: generateJobId(),
      tier,
      platform,
      sdkVersion,
      sourcePath,
      status: "queued",
      priority,
      createdAt: Date.now(),
      logs: [],
    };
    _jobStore.set(job.id, job);
    _pendingQueue.push(job);
    return job;
  });

  console.log(`[qapi-builder] Batch ${batchId}: ${jobs.length} jobs queued (tier=${tier}, concurrency=${maxConcurrency})`);

  // Try to push to BullMQ if available
  const bull = await getBullQueue();
  if (bull) {
    await Promise.all(
      jobs.map((job) => bull.add("build", job, { priority: job.priority }))
    );
  }

  return { batchId, jobs, maxConcurrency };
}

/**
 * Executes all queued builds for a batch and waits for completion.
 *
 * @returns Array of build results, one per platform.
 */
export async function waitForCompletion(jobs: BuildJob[], maxConcurrency?: number): Promise<BuildResult[]> {
  const concurrency = maxConcurrency ?? jobs.length;
  const results = await runParallel(jobs, concurrency);

  // Log summary
  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;
  console.log(`[qapi-builder] Batch complete: ${succeeded} succeeded, ${failed} failed`);

  return results;
}

/**
 * Convenience wrapper: enqueue and immediately wait for completion.
 */
export async function buildAll(opts: EnqueueOptions): Promise<BuildResult[]> {
  const { batchId, jobs, maxConcurrency } = await enqueueBuildBatch(opts);
  console.log(`[qapi-builder] Running batch ${batchId} …`);
  return waitForCompletion(jobs, maxConcurrency);
}

/**
 * Returns a stored job by ID.
 */
export function getJob(id: string): BuildJob | undefined {
  return _jobStore.get(id);
}

/**
 * Lists all jobs, optionally filtered by status.
 */
export function listJobs(filter?: { status?: BuildStatus; tier?: SubscriptionTier }): BuildJob[] {
  let jobs = Array.from(_jobStore.values());
  if (filter?.status) jobs = jobs.filter((j) => j.status === filter.status);
  if (filter?.tier) jobs = jobs.filter((j) => j.tier === filter.tier);
  return jobs.sort((a, b) => b.createdAt - a.createdAt);
}

/** Clears all state. Useful for testing. */
export function _resetForTesting(): void {
  _jobStore.clear();
  _pendingQueue.length = 0;
  _activeBuilds = 0;
  _bullQueue = null;
}
