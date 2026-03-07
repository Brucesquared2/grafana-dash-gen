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

const grafana = require('../src/index');

test('index exports Dashboard as a named export', function () {
    expect(typeof grafana.Dashboard).toBe('function');
    expect(new grafana.Dashboard()).toBeInstanceOf(grafana.Dashboard);
});

test('index exports Row as a named export', function () {
    expect(typeof grafana.Row).toBe('function');
    expect(new grafana.Row()).toBeInstanceOf(grafana.Row);
});

test('index exports ExternalLink as a named export', function () {
    expect(typeof grafana.ExternalLink).toBe('function');
});

test('index exports Target as a named export', function () {
    expect(typeof grafana.Target).toBe('function');
    expect(new grafana.Target('a.b.c')).toBeInstanceOf(grafana.Target);
});

test('index exports Alert as a named export', function () {
    expect(typeof grafana.Alert).toBe('function');
    expect(new grafana.Alert()).toBeInstanceOf(grafana.Alert);
});

test('index exports Condition as a named export', function () {
    expect(typeof grafana.Condition).toBe('function');
    expect(new grafana.Condition()).toBeInstanceOf(grafana.Condition);
});

test('index exports Panels namespace with all panel types', function () {
    expect(typeof grafana.Panels).toBe('object');
    expect(typeof grafana.Panels.Graph).toBe('function');
    expect(typeof grafana.Panels.SingleStat).toBe('function');
    expect(typeof grafana.Panels.Text).toBe('function');
    expect(typeof grafana.Panels.Table).toBe('function');
    expect(typeof grafana.Panels.DashboardList).toBe('function');
});

test('index exports Templates namespace with all template types', function () {
    expect(typeof grafana.Templates).toBe('object');
    expect(typeof grafana.Templates.Custom).toBe('function');
    expect(typeof grafana.Templates.Query).toBe('function');
});

test('index exports Annotations namespace with all annotation types', function () {
    expect(typeof grafana.Annotations).toBe('object');
    expect(typeof grafana.Annotations.Graphite).toBe('function');
});

test('index exports publish as a named export', function () {
    expect(typeof grafana.publish).toBe('function');
});

test('index exports configure as a named export', function () {
    expect(typeof grafana.configure).toBe('function');
});

test('index exports generateGraphId as a named export', function () {
    expect(typeof grafana.generateGraphId).toBe('function');
});

test('named exports support destructuring', function () {
    const { Dashboard, Row, Target, Panels } = grafana;
    expect(typeof Dashboard).toBe('function');
    expect(typeof Row).toBe('function');
    expect(typeof Target).toBe('function');
    expect(typeof Panels.Graph).toBe('function');
});
