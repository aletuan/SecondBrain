import { describe, expect, it } from 'vitest';
import {
  formatIngestProgressLine,
  tryParseIngestProgressLine,
} from '../cli/src/ingest/ingestProgress.js';

describe('formatIngestProgressLine', () => {
  it('round-trips with tryParseIngestProgressLine for phase events', () => {
    const ev = { v: 1 as const, kind: 'phase' as const, phase: 'fetch' as const, state: 'active' as const };
    expect(tryParseIngestProgressLine(formatIngestProgressLine(ev))).toEqual(ev);
  });
});

describe('tryParseIngestProgressLine', () => {
  it('parses phase lines', () => {
    expect(
      tryParseIngestProgressLine(
        '{"v":1,"kind":"phase","phase":"fetch","state":"active"}\r',
      ),
    ).toEqual({ v: 1, kind: 'phase', phase: 'fetch', state: 'active' });
    expect(tryParseIngestProgressLine('  {"v":1,"kind":"phase","phase":"vault","state":"done"}  ')).toEqual({
      v: 1,
      kind: 'phase',
      phase: 'vault',
      state: 'done',
    });
  });

  it('parses done and error', () => {
    expect(
      tryParseIngestProgressLine(
        '{"v":1,"kind":"done","captureDir":"/tmp/Captures/x","captureId":"x"}',
      ),
    ).toEqual({
      v: 1,
      kind: 'done',
      captureDir: '/tmp/Captures/x',
      captureId: 'x',
    });
    expect(
      tryParseIngestProgressLine('{"v":1,"kind":"error","message":"boom","phase":"fetch"}'),
    ).toEqual({ v: 1, kind: 'error', message: 'boom', phase: 'fetch' });
  });

  it('rejects invalid payloads', () => {
    expect(tryParseIngestProgressLine('not json')).toBeNull();
    expect(tryParseIngestProgressLine('{"v":2}')).toBeNull();
    expect(tryParseIngestProgressLine('{"v":1,"kind":"phase","phase":"nope","state":"active"}')).toBeNull();
    expect(tryParseIngestProgressLine('{"v":1,"kind":"phase","phase":"fetch","state":"maybe"}')).toBeNull();
    expect(tryParseIngestProgressLine('{"v":1,"kind":"done","captureDir":1,"captureId":"x"}')).toBeNull();
  });
});
