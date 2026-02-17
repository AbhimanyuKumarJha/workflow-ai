import { defineConfig } from "@trigger.dev/sdk/v3";
import { ffmpeg } from "@trigger.dev/build/extensions/core";

export default defineConfig({
    // Set via TRIGGER_PROJECT_REF env var, or replace with your actual project ref
    project: process.env.TRIGGER_PROJECT_REF ?? "proj_qyqcccpnmsfbrvvbwuej",
    maxDuration: 3600,
    retries: {
        enabledInDev: true,
        default: {
            maxAttempts: 3,
            minTimeoutInMs: 1000,
            maxTimeoutInMs: 10000,
            factor: 2,
            randomize: true,
        },
    },
    dirs: ["src/trigger"],
    build: {
        extensions: [
            ffmpeg()
        ],
    },
});
