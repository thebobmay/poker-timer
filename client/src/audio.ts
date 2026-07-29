// Audio for the display client. A short pleasant chime (Web Audio) followed by
// a spoken announcement (Web Speech). Browsers block audio until a user gesture,
// so call `armAudio()` from a click before relying on playback (CLAUDE.md §6).

import type { AudioCue } from '@poker/shared';

let ctx: AudioContext | null = null;
let armed = false;

export function isArmed(): boolean {
  return armed;
}

/** Unlock audio + speech from within a user gesture. */
export function armAudio(): void {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    // Prime speech synthesis with a silent utterance so the first real one is instant.
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
    armed = true;
  } catch (err) {
    console.warn('[audio] could not arm:', err);
  }
}

/** A pleasant two-note rising chime. */
function chime(): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [523.25, 783.99]; // C5, G5
  notes.forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.18;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(start);
    osc.stop(start + 0.65);
  });
}

function speak(text: string, delayMs = 500): void {
  if (!('speechSynthesis' in window)) return;
  window.setTimeout(() => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1;
    u.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, delayMs);
}

/** Play the cue: chime + spoken line. */
export function playCue(cue: AudioCue): void {
  if (!armed) return;
  if (ctx && ctx.state === 'suspended') void ctx.resume();
  chime();
  if (cue.kind === 'blinds-up') {
    speak('Blinds up');
  } else {
    speak(`${cue.minutes} minute break`);
  }
}
