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

'use strict';

const http = require('http');
const nock = require('nock');
const { createServer } = require('../src/server');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make a request to the test server and resolve with { status, body }. */
function request(server, method, path, body) {
    return new Promise((resolve, reject) => {
        const addr = server.address();
        const port = addr ? addr.port : 0;
        const payload = body ? JSON.stringify(body) : '';

        const opts = {
            hostname: '127.0.0.1',
            port,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        };

        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        req.end(payload);
    });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let server;

beforeEach((done) => {
    server = createServer();
    server.listen(0, '127.0.0.1', done); // port 0 = random available port
});

afterEach((done) => {
    server.close(done);
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

test('GET /health returns 200 with status ok', async () => {
    const { status, body } = await request(server, 'GET', '/health', null);
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('grafana-dash-gen');
});

// ---------------------------------------------------------------------------
// Unknown routes
// ---------------------------------------------------------------------------

test('Unknown route returns 404', async () => {
    const { status, body } = await request(server, 'GET', '/unknown', null);
    expect(status).toBe(404);
    expect(body.error).toBe('Not found');
});

test('GET /generate returns 404 (wrong method)', async () => {
    const { status } = await request(server, 'GET', '/generate', null);
    expect(status).toBe(404);
});

// ---------------------------------------------------------------------------
// POST /generate — validation
// ---------------------------------------------------------------------------

test('POST /generate with invalid JSON returns 400', async () => {
    // Send raw non-JSON to trigger parse error
    const port = server.address().port;
    const result = await new Promise((resolve, reject) => {
        const payload = 'not json';
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port,
                path: '/generate',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                },
            },
            (res) => {
                let data = '';
                res.on('data', (c) => (data += c));
                res.on('end', () =>
                    resolve({ status: res.statusCode, body: JSON.parse(data) })
                );
            }
        );
        req.on('error', reject);
        req.end(payload);
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/Invalid JSON/);
});

test('POST /generate without dashboard.title returns 400', async () => {
    const { status, body } = await request(server, 'POST', '/generate', {
        dashboard: {},
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/title/);
});

test('POST /generate without body returns 400', async () => {
    const { status, body } = await request(server, 'POST', '/generate', {});
    expect(status).toBe(400);
    expect(body.error).toMatch(/title/);
});

// ---------------------------------------------------------------------------
// POST /generate — success
// ---------------------------------------------------------------------------

test('POST /generate returns Grafana dashboard JSON', async () => {
    const { status, body } = await request(server, 'POST', '/generate', {
        dashboard: { title: 'Test Dashboard' },
    });
    expect(status).toBe(200);
    expect(body.title).toBe('Test Dashboard');
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.schemaVersion).toBeDefined();
});

test('POST /generate with tags, refresh, templating, annotations', async () => {
    const { status, body } = await request(server, 'POST', '/generate', {
        dashboard: {
            title: 'Full Dashboard',
            tags: ['prod', 'api'],
            refresh: '5m',
            templating: [{ name: 'dc', options: ['dc1', 'dc2'] }],
            annotations: [{ name: 'Deploy', target: 'stats.deploy' }],
        },
    });
    expect(status).toBe(200);
    expect(body.title).toBe('Full Dashboard');
    expect(body.tags).toEqual(['prod', 'api']);
    expect(body.refresh).toBe('5m');
    expect(body.templating.list).toHaveLength(1);
    expect(body.templating.list[0].name).toBe('dc');
    expect(body.annotations.list).toHaveLength(1);
    expect(body.annotations.list[0].name).toBe('Deploy');
});

test('POST /generate with raw panels includes them in a row', async () => {
    const panel = { type: 'graph', title: 'RPS', id: 1, targets: [] };
    const { status, body } = await request(server, 'POST', '/generate', {
        dashboard: {
            title: 'Panel Dashboard',
            panels: [panel],
        },
    });
    expect(status).toBe(200);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].panels).toHaveLength(1);
    expect(body.rows[0].panels[0].title).toBe('RPS');
});

// ---------------------------------------------------------------------------
// POST /publish — validation
// ---------------------------------------------------------------------------

test('POST /publish without grafana.url returns 400', async () => {
    const { status, body } = await request(server, 'POST', '/publish', {
        grafana: { cookie: 'auth=x' },
        dashboard: { title: 'Test' },
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/grafana\.url/);
});

test('POST /publish without grafana.cookie returns 400', async () => {
    const { status, body } = await request(server, 'POST', '/publish', {
        grafana: { url: 'http://grafana.example.com/api/dashboards/db/' },
        dashboard: { title: 'Test' },
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/grafana\.cookie/);
});

test('POST /publish without dashboard.title returns 400', async () => {
    const { status, body } = await request(server, 'POST', '/publish', {
        grafana: {
            url: 'http://grafana.example.com/api/dashboards/db/',
            cookie: 'auth=x',
        },
        dashboard: {},
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/dashboard\.title/);
});

// ---------------------------------------------------------------------------
// POST /publish — success (via nock)
// ---------------------------------------------------------------------------

test('POST /publish returns 200 on successful Grafana publish', async () => {
    const grafanaBase = 'http://grafana-test.local';
    const grafanaPath = '/api/dashboards/db/';

    nock(grafanaBase).post(grafanaPath).reply(200, 'ok');

    const { status, body } = await request(server, 'POST', '/publish', {
        grafana: {
            url: `${grafanaBase}${grafanaPath}`,
            cookie: 'auth-openid=testtoken',
        },
        dashboard: {
            title: 'Published Dashboard',
            tags: ['test'],
        },
    });
    expect(status).toBe(200);
    expect(body.status).toBe('published');
    expect(body.title).toBe('Published Dashboard');
});

test('POST /publish returns 502 when Grafana is unreachable', async () => {
    const { status, body } = await request(server, 'POST', '/publish', {
        grafana: {
            url: 'http://192.0.2.1/api/dashboards/db/', // non-routable
            cookie: 'auth-openid=testtoken',
        },
        dashboard: { title: 'Offline Dashboard' },
    });
    expect(status).toBe(502);
    expect(body.error).toBeDefined();
});
