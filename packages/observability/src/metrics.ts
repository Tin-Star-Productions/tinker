import { Counter, Histogram, Gauge, Registry, collectDefaultMetrics } from "prom-client";

export const registry = new Registry();

// Collect default Node.js metrics (heap, event loop lag, GC, etc.)
collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new Histogram({
  name: "tinker_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const jobProcessingDuration = new Histogram({
  name: "tinker_job_processing_duration_seconds",
  help: "BullMQ job processing duration in seconds",
  labelNames: ["job_name", "status"],
  buckets: [0.5, 1, 5, 10, 30, 60, 120, 300],
  registers: [registry],
});

export const jobQueueDepth = new Gauge({
  name: "tinker_job_queue_depth",
  help: "Number of jobs waiting in the BullMQ queue",
  labelNames: ["queue", "state"],
  registers: [registry],
});

export const classificationFeedbackTotal = new Counter({
  name: "tinker_classification_feedback_total",
  help: "Total engineer feedback on failure classifications",
  labelNames: ["kind", "classification"],
  registers: [registry],
});

export const webhookReceivedTotal = new Counter({
  name: "tinker_webhook_received_total",
  help: "Total GitHub webhook events received",
  labelNames: ["event_type", "action"],
  registers: [registry],
});

export const logProcessingErrorsTotal = new Counter({
  name: "tinker_log_processing_errors_total",
  help: "Total errors during CI log processing",
  labelNames: ["stage"],
  registers: [registry],
});
