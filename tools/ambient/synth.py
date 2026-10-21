"""Tiny offline synthesiser for the themes' ambient.ogg loops.

The original themes ship CC0 loops from OpenGameArt. The themes added later
compose their own loop instead: a score script per theme
(tools/ambient/<theme>.py) builds a song from the instruments below and calls
render(), which mixes it, runs it through ffmpeg for room and loudness and
writes internal/generator/templates/themes/<theme>/ambient.ogg.

Only numpy and ffmpeg (with libvorbis) are needed:

    python3 tools/ambient/ukiyoe.py

A score works in seconds and MIDI note numbers. Song.add(start, signal)
places a rendered note; every instrument returns a mono float array at RATE.
"""
import os
import subprocess
import tempfile
import wave

import numpy as np

RATE = 44100
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12.0)


def _t(dur):
    return np.arange(int(dur * RATE)) / RATE


def env(n, attack=0.01, decay=0.1, sustain=0.7, release=0.2, hold=None):
    """ADSR envelope over n samples; hold is the gate length in seconds."""
    a, d, r = int(attack * RATE), int(decay * RATE), int(release * RATE)
    g = n - r if hold is None else min(n, int(hold * RATE))
    e = np.full(n, sustain, dtype=float)
    if a:
        e[:min(a, n)] = np.linspace(0, 1, a)[:n]
    if d and a < n:
        seg = e[a:min(a + d, n)]
        e[a:a + len(seg)] = np.linspace(1, sustain, d)[:len(seg)]
    if r and g < n:
        e[g:] = np.linspace(e[max(g - 1, 0)], 0, n - g)
    return e


def osc(kind, freq, dur, phase=0.0, detune=0.0):
    """Band-limited-ish oscillator: sine, triangle, saw, square, pulse25."""
    t = _t(dur)
    f = freq * 2 ** (detune / 1200.0)
    if kind == 'sine':
        return np.sin(2 * np.pi * f * t + phase)
    harmonics = max(1, int((RATE / 2.5) / max(f, 1)))
    harmonics = min(harmonics, 40)
    out = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        if kind == 'saw':
            out += np.sin(2 * np.pi * k * f * t + phase) / k
        elif kind == 'square' and k % 2:
            out += np.sin(2 * np.pi * k * f * t + phase) / k
        elif kind == 'triangle' and k % 2:
            out += ((-1) ** ((k - 1) // 2)) * np.sin(2 * np.pi * k * f * t + phase) / (k * k)
        elif kind == 'pulse25':
            out += np.sin(np.pi * k * 0.25) * np.cos(2 * np.pi * k * f * t + phase) / k
    norm = {'saw': 0.55, 'square': 0.8, 'triangle': 1.2, 'pulse25': 0.9}
    return out * norm.get(kind, 0.6)


def lowpass(x, cutoff):
    """One-pole low-pass, vectorised by blocks of a cumulative filter."""
    a = np.exp(-2 * np.pi * cutoff / RATE)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):  # notes are short, so this stays fast enough
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def pluck(midi, dur, bright=0.5, vol=0.5):
    """Karplus-Strong string: koto, guitar, harp, shamisen."""
    f = hz(midi)
    n = int(dur * RATE)
    p = max(2, int(RATE / f))
    buf = np.random.uniform(-1, 1, p)
    if bright < 1:
        buf = np.convolve(buf, np.ones(2) / 2, mode='same') * (1 - bright) + buf * bright
    out = np.empty(n)
    decay = 0.996
    for i in range(0, n, p):
        k = min(p, n - i)
        out[i:i + k] = buf[:k]
        buf = decay * 0.5 * (buf + np.roll(buf, -1))
    return out * vol * env(n, 0.002, 0.05, 1.0, min(0.08, dur / 3))


def fm(midi, dur, ratio=2.0, index=3.0, vol=0.4, attack=0.005, release=0.8, decay_index=2.0):
    """Two-operator FM: bells, e-piano, marimba-ish tones."""
    t = _t(dur)
    f = hz(midi)
    idx = index * np.exp(-decay_index * t)
    sig = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * ratio * t))
    return sig * vol * env(len(t), attack, dur * 0.3, 0.3, release)


def tone(kind, midi, dur, vol=0.3, attack=0.01, decay=0.1, sustain=0.7, release=0.1, detune=0.0, vibrato=0.0):
    t = _t(dur)
    f = hz(midi)
    if vibrato:
        ph = 2 * np.pi * np.cumsum(f * (1 + vibrato * np.sin(2 * np.pi * 5.5 * t))) / RATE
        sig = np.sin(ph) if kind == 'sine' else osc(kind, f, dur)
    else:
        sig = osc(kind, f, dur, detune=detune)
    return sig * vol * env(len(t), attack, decay, sustain, release)


def pad(midis, dur, kind='saw', vol=0.12, attack=0.8, release=1.2, cutoff=1800, spread=8.0):
    """Detuned chord pad, softened by a low-pass."""
    out = np.zeros(int(dur * RATE))
    for m in midis:
        for dt in (-spread, spread):
            out += osc(kind, hz(m), dur, phase=np.random.rand() * 6.28, detune=dt)
    out = lowpass(out / (2 * len(midis)), cutoff)
    return out * vol * env(len(out), attack, 0.2, 1.0, release)


def noise(dur, vol=0.3, cutoff=None, attack=0.001, release=None):
    n = int(dur * RATE)
    x = np.random.uniform(-1, 1, n)
    if cutoff:
        x = lowpass(x, cutoff)
    rel = dur * 0.9 if release is None else release
    return x * vol * env(n, attack, 0.0, 1.0, rel, hold=0)


def kick(vol=0.8, pitch=55, dur=0.35):
    t = _t(dur)
    f = pitch * (1 + 3 * np.exp(-t * 30))
    return np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.exp(-t * 9) * vol


def snare(vol=0.4, dur=0.2):
    t = _t(dur)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25)
    return (np.random.uniform(-1, 1, len(t)) * np.exp(-t * 18) * 0.8 + body * 0.5) * vol


def hat(vol=0.12, dur=0.05, open_=False):
    t = _t(0.25 if open_ else dur)
    x = np.random.uniform(-1, 1, len(t))
    x = x - np.concatenate(([0], x[:-1]))  # crude high-pass
    return x * np.exp(-t * (10 if open_ else 60)) * vol


def drum(freq, vol=0.5, dur=0.4, bend=1.5, decay=8.0):
    """Tuned hand drum / taiko / tom."""
    t = _t(dur)
    f = freq * (1 + bend * np.exp(-t * 20))
    body = np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.exp(-t * decay)
    slap = np.random.uniform(-1, 1, len(t)) * np.exp(-t * 60) * 0.3
    return (body + slap) * vol


class Song:
    """A mono timeline at RATE; add() mixes a signal in at a time in seconds."""

    def __init__(self, seconds):
        self.buf = np.zeros(int(seconds * RATE) + RATE * 4)
        self.length = seconds

    def add(self, start, sig, pan_vol=1.0):
        i = int(start * RATE)
        self.buf[i:i + len(sig)] += sig[:max(0, len(self.buf) - i)] * pan_vol


def render(theme, song, echo='0.8:0.7:60|180:0.25|0.15', lowcut=40, quality=4):
    """Fold the tail into the start (seamless loop), master and encode."""
    n = int(song.length * RATE)
    buf = song.buf.copy()
    tail = buf[n:]
    buf = buf[:n]
    buf[:len(tail)] += tail
    peak = np.max(np.abs(buf)) or 1.0
    pcm = (buf / peak * 0.89 * 32767).astype(np.int16)
    out = os.path.join(ROOT, 'internal/generator/templates/themes', theme, 'ambient.ogg')
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, 'dry.wav')
        with wave.open(wav, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(pcm.tobytes())
        # aecho appends its own tail; cut it so the loop has no silent seam.
        filt = 'highpass=f=%d,aecho=%s,atrim=end=%.4f,loudnorm=I=-20:TP=-2' % (lowcut, echo, song.length)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', filt,
                        '-ar', str(RATE), '-ac', '1', '-c:a', 'libvorbis', '-q:a', str(quality), out],
                       check=True)
    print('wrote', out, os.path.getsize(out) // 1024, 'KiB')
