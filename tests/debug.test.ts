import { describe, expect, it } from 'vitest';
import {
  DEBUG_SEQUENCES, debugQuery, debugStages, parseDebugOptions,
} from '../src/logic/debug';

describe('Developer Debug Lab URL contract', () => {
  it('is opt-in and defaults to the first transition', () => {
    expect(parseDebugOptions('')).toEqual({
      enabled: false,
      sequence: 'door1-door2',
      stage: 'unlock',
      speed: 1,
      loop: false,
      seed: 1842,
    });
  });

  it('accepts a shareable transition checkpoint', () => {
    expect(parseDebugOptions('debug=1&sequence=door2-door3&stage=walk&speed=0.5&loop=1&seed=77'))
      .toEqual({
        enabled: true,
        sequence: 'door2-door3',
        stage: 'walk',
        speed: 0.5,
        loop: true,
        seed: 77,
      });
  });

  it('falls back to a legal stage when sequence and stage do not match', () => {
    const options = parseDebugOptions('debug=1&sequence=door2&stage=through');
    expect(options.sequence).toBe('door2');
    expect(options.stage).toBe('missing');
  });

  it('rejects unknown sequences and playback speeds', () => {
    const options = parseDebugOptions('debug=1&sequence=teleport&stage=void&speed=8');
    expect(options.sequence).toBe('door1-door2');
    expect(options.stage).toBe('unlock');
    expect(options.speed).toBe(1);
  });

  it('normalises unsafe seeds into the supported range', () => {
    expect(parseDebugOptions('debug=1&seed=-4').seed).toBe(0);
    expect(parseDebugOptions('debug=1&seed=999999999999').seed).toBe(1842);
    expect(parseDebugOptions('debug=1&seed=3.5').seed).toBe(1842);
  });

  it('serialises and parses without losing the selected checkpoint', () => {
    const original = parseDebugOptions(
      'debug=1&sequence=door1-door2&stage=approach&speed=2&loop=1&seed=311',
    );
    expect(parseDebugOptions(debugQuery(original))).toEqual(original);
  });

  it('defines at least one legal stage for every sequence', () => {
    for (const sequence of Object.keys(DEBUG_SEQUENCES) as (keyof typeof DEBUG_SEQUENCES)[]) {
      expect(debugStages(sequence).length).toBeGreaterThan(0);
    }
  });

  it('exposes the crossroads hold before the console walk checkpoint', () => {
    const stages = debugStages('door2-door3');
    expect(stages.slice(-3)).toEqual(['cross', 'console', 'explore']);
  });

  it('keeps a direct Door 3 operator checkpoint for FX inspection', () => {
    expect(debugStages('door3')).toEqual(['explore']);
    expect(parseDebugOptions('debug=1&sequence=door3&stage=explore').stage)
      .toBe('explore');
  });
});
