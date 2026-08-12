import { describe, expect, it, vi } from 'vitest';
import { createAudioMuteController } from '../src/game/audio-mute.js';

function fakeContext(initial: 'running' | 'suspended' = 'running') {
  const audio = {
    state: initial,
    suspend: vi.fn(async () => { audio.state = 'suspended'; }),
    resume: vi.fn(async () => { audio.state = 'running'; }),
  };
  return audio;
}

describe('CG4 coordinated audio mute controller', () => {
  it('keeps audio suspended until every mute reason is removed', async () => {
    const audio = fakeContext();
    const controller = createAudioMuteController({ context: () => audio } as any);

    await controller.setMuted('crazygames-ad', true);
    expect(audio.suspend).toHaveBeenCalledTimes(1);
    expect(controller.snapshot()).toMatchObject({
      muted: true,
      reasons: ['crazygames-ad'],
      suspendedByController: true,
    });

    await controller.setMuted('crazygames-setting', true);
    expect(audio.suspend).toHaveBeenCalledTimes(1);

    await controller.setMuted('crazygames-ad', false);
    expect(audio.resume).not.toHaveBeenCalled();
    expect(controller.snapshot().reasons).toEqual(['crazygames-setting']);

    await controller.setMuted('crazygames-setting', false);
    expect(audio.resume).toHaveBeenCalledTimes(1);
    expect(controller.snapshot()).toMatchObject({
      muted: false,
      reasons: [],
      suspendedByController: false,
      contextState: 'running',
    });
  });

  it('does not resume a context that the browser had already suspended', async () => {
    const audio = fakeContext('suspended');
    const controller = createAudioMuteController({ context: () => audio } as any);

    await controller.setMuted('crazygames-setting', true);
    expect(audio.suspend).not.toHaveBeenCalled();
    expect(controller.snapshot().suspendedByController).toBe(false);

    await controller.setMuted('crazygames-setting', false);
    expect(audio.resume).not.toHaveBeenCalled();
    expect(audio.state).toBe('suspended');
  });

  it('defers an owned resume while hidden and completes it on foreground', async () => {
    const audio = fakeContext();
    let hidden = false;
    const controller = createAudioMuteController({
      context: () => audio,
      hidden: () => hidden,
    } as any);

    await controller.setMuted('crazygames-ad', true);
    hidden = true;
    await controller.setMuted('crazygames-ad', false);
    expect(audio.resume).not.toHaveBeenCalled();
    expect(controller.snapshot()).toMatchObject({
      muted: false,
      suspendedByController: true,
      resumeDeferred: true,
    });

    hidden = false;
    await controller.foreground();
    expect(audio.resume).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().resumeDeferred).toBe(false);
  });

  it('reports whether user-gesture audio resume is currently allowed', async () => {
    const audio = fakeContext();
    const controller = createAudioMuteController({ context: () => audio } as any);
    expect(controller.canResume()).toBe(true);
    await controller.setMuted('crazygames-ad', true);
    expect(controller.canResume()).toBe(false);
    await controller.setMuted('crazygames-ad', false);
    expect(controller.canResume()).toBe(true);
  });
});
