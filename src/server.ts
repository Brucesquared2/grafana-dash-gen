// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/**
 * Lightweight HTTP server that exposes grafana-dash-gen as a REST microservice,
 * enabling Docker-based container orchestration (e.g. MAPS-Quadcore).
 *
 * Endpoints:
 *   GET  /health   — liveness / readiness probe for Docker / Kubernetes
 *   POST /generate — accept a dashboard config; return Grafana dashboard JSON
 *   POST /publish  — accept a dashboard config + Grafana creds; publish to Grafana
 *
 * Configuration via environment variables:
 *   PORT           — port to listen on (default: 3000)
 */

import http = require('http');
import Dashboard = require('./dashboard');
import Row = require('./row');
import publish = require('./publish');
import config = require('./config');
import type { IncomingMessage, ServerResponse } from 'http';

const PORT = parseInt(process.env.PORT || '3000', 10);

// ---------------------------------------------------------------------------
// Types for the REST API payloads
// ---------------------------------------------------------------------------

interface AnnotationConfig {
    name: string;
    target?: string;
    [k: string]: unknown;
}

interface TemplatingConfig {
    name: string;
    options?: unknown[];
    [k: string]: unknown;
}

interface GrafanaConfig {
    url: string;
    cookie: string;
    headers?: Record<string, string>;
}

interface DashboardConfig {
    title: string;
    tags?: string[];
    refresh?: string | boolean;
    slug?: string;
    templating?: TemplatingConfig[];
    annotations?: AnnotationConfig[];
    /** Pre-built Grafana panel / row JSON to include verbatim. */
    panels?: unknown[];
}

interface GenerateRequest {
    dashboard: DashboardConfig;
}

interface PublishRequest {
    grafana: GrafanaConfig;
    dashboard: DashboardConfig;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read and parse a JSON request body; reject on parse error or size limit. */
function readBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (chunk: Buffer) => {
            raw += chunk.toString();
            if (raw.length > 1_000_000) {
                req.destroy();
                reject(new Error('Request body exceeds maximum size of 1MB'));
            }
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(raw));
            } catch {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

function send(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
}

/** Build a Dashboard from a plain config object. */
function buildDashboard(cfg: DashboardConfig): Dashboard {
    // Dashboard constructor handles wrapping templating / annotations itself.
    const dashboard = new Dashboard({
        title: cfg.title,
        tags: cfg.tags,
        refresh: cfg.refresh,
        templating: (cfg.templating || []) as any,
        annotations: (cfg.annotations || []) as any,
    });

    if (cfg.panels && cfg.panels.length > 0) {
        const row = new Row();
        cfg.panels.forEach((p) => {
            // Wrap each raw Grafana panel JSON in a minimal Panel-like object
            // so Row.generate() can call .generate() on it.
            row.addPanel({ generate: () => p } as any);
        });
        dashboard.addRow(row);
    }

    return dashboard;
}

// ---------------------------------------------------------------------------
// Request handlers
// ---------------------------------------------------------------------------

function handleHealth(res: ServerResponse): void {
    send(res, 200, { status: 'ok', service: 'grafana-dash-gen' });
}

async function handleGenerate(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    let body: GenerateRequest;
    try {
        body = (await readBody(req)) as GenerateRequest;
    } catch (e) {
        send(res, 400, { error: (e as Error).message });
        return;
    }

    if (!body?.dashboard?.title) {
        send(res, 400, { error: 'dashboard.title is required' });
        return;
    }

    try {
        const dashboard = buildDashboard(body.dashboard);
        send(res, 200, dashboard.generate());
    } catch (e) {
        send(res, 500, { error: (e as Error).message });
    }
}

async function handlePublish(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    let body: PublishRequest;
    try {
        body = (await readBody(req)) as PublishRequest;
    } catch (e) {
        send(res, 400, { error: (e as Error).message });
        return;
    }

    if (!body?.grafana?.url) {
        send(res, 400, { error: 'grafana.url is required' });
        return;
    }
    if (!body?.grafana?.cookie) {
        send(res, 400, { error: 'grafana.cookie is required' });
        return;
    }
    if (!body?.dashboard?.title) {
        send(res, 400, { error: 'dashboard.title is required' });
        return;
    }

    try {
        config.configure({
            url: body.grafana.url,
            cookie: body.grafana.cookie,
            headers: body.grafana.headers || {},
        });

        const dashboard = buildDashboard(body.dashboard);
        await publish(dashboard);
        send(res, 200, {
            status: 'published',
            title: body.dashboard.title,
        });
    } catch (e) {
        send(res, 502, { error: (e as Error).message });
    }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export function createServer(): http.Server {
    const server = http.createServer(
        (req: IncomingMessage, res: ServerResponse) => {
            const method = req.method?.toUpperCase();
            const url = req.url?.split('?')[0];

            if (method === 'GET' && url === '/health') {
                handleHealth(res);
            } else if (method === 'POST' && url === '/generate') {
                handleGenerate(req, res).catch((e) =>
                    send(res, 500, { error: (e as Error).message })
                );
            } else if (method === 'POST' && url === '/publish') {
                handlePublish(req, res).catch((e) =>
                    send(res, 500, { error: (e as Error).message })
                );
            } else {
                send(res, 404, { error: 'Not found' });
            }
        }
    );
    return server;
}

// Allow starting the server directly: `node grafana/server.js`
if (require.main === module) {
    const server = createServer();
    server.listen(PORT, () => {
        console.log(`grafana-dash-gen service listening on port ${PORT}`);
    });
}
