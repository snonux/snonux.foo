"""Glasshouse Morning: the greenhouse theme's ambient loop (original, CC0).

A pastoral piece in D major at 72 BPM, 24 bars (80 s) that loop seamlessly:
an 8-bar progression played three times. Pass one is harp arpeggios over a
gentle pad with birdsong; pass two adds a soft woodwind-like lead; pass three
gives the lead its second phrase and adds kalimba figures. A soft rain bed
with the odd drip on the glass runs underneath throughout.

    python3 tools/ambient/greenhouse.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import RATE, Song, env, fm, hz, lowpass, pad, pluck, render  # noqa: E402

BPM = 72
BEAT = 60.0 / BPM
BAR = 4 * BEAT
BARS = 24

# One chord per bar: D Bm G A D Em G A (bass root, triad for the pad).
CHORDS = [
    (50, [62, 66, 69]), (47, [62, 66, 71]), (43, [62, 67, 71]), (45, [61, 64, 69]),
    (50, [62, 66, 69]), (40, [62, 67, 71]), (43, [62, 67, 71]), (45, [61, 64, 69]),
]

# The lead: (bar, beat, midi, beats). Phrase A on bars 8-15, B on 16-23.
LEAD = [
    (8, 0, 74, 1.5), (8, 1.5, 76, 0.5), (8, 2, 78, 2),
    (9, 0, 78, 1), (9, 1, 76, 1), (9, 2, 74, 1), (9, 3, 71, 1),
    (10, 0, 74, 3), (10, 3, 71, 1),
    (11, 0, 73, 2), (11, 2, 69, 2),
    (12, 0, 74, 1.5), (12, 1.5, 76, 0.5), (12, 2, 78, 1), (12, 3, 81, 1),
    (13, 0, 83, 2), (13, 2, 81, 1), (13, 3, 79, 1),
    (14, 0, 78, 2), (14, 2, 79, 1), (14, 3, 78, 1),
    (15, 0, 76, 4),
    (16, 0, 78, 1), (16, 1, 81, 1), (16, 2, 83, 2),
    (17, 0, 86, 2), (17, 2, 83, 1), (17, 3, 81, 1),
    (18, 0, 79, 1.5), (18, 1.5, 78, 0.5), (18, 2, 76, 2),
    (19, 0, 73, 1), (19, 1, 76, 1), (19, 2, 81, 2),
    (20, 0, 78, 2), (20, 2, 76, 1), (20, 3, 74, 1),
    (21, 0, 71, 1), (21, 1, 74, 1), (21, 2, 76, 2),
    (22, 0, 74, 2), (22, 2, 71, 1), (22, 3, 69, 1),
    (23, 0, 73, 2), (23, 2, 69, 2),
]


def woodwind(midi, dur, vol=0.17):
    """Soft flute/recorder: sine plus a little second harmonic, slow vibrato
    that comes in late, and a breath of filtered noise at the onset."""
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    f = hz(midi)
    vib = 1 + 0.005 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t / 0.4, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / RATE
    sig = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    breath = lowpass(np.random.uniform(-1, 1, n), 2500) * np.exp(-t * 8) * 0.25
    return (sig + breath) * vol * env(n, 0.07, 0.1, 0.85, min(0.25, dur / 3))


def chirp(f0, f1, dur=0.07, vol=0.05):
    """One birdsong syllable: a fast sine glide."""
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    f = f0 + (f1 - f0) * (t / dur) ** 0.6
    return np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.sin(np.pi * t / dur) ** 2 * vol


def bird(song, start, rng):
    """A little call: three to six glides, up or down, quickly repeated."""
    base = rng.uniform(2600, 3800)
    for i in range(rng.integers(3, 7)):
        up = rng.random() < 0.6
        lo, hi = base * rng.uniform(0.8, 0.95), base * rng.uniform(1.15, 1.5)
        song.add(start + i * rng.uniform(0.08, 0.13), chirp(lo if up else hi, hi if up else lo, rng.uniform(0.05, 0.09), rng.uniform(0.03, 0.055)))


def harp(song, bar, chord):
    """Eighth-note harp arpeggio up and back down the chord."""
    root, tri = chord
    notes = [root + 12, tri[0], tri[1], tri[2], tri[0] + 12, tri[2], tri[1], tri[0]]
    for i, m in enumerate(notes):
        song.add(bar * BAR + i * BEAT / 2, pluck(m, 1.6, bright=0.45, vol=0.2 if i else 0.26))


def kalimba(song, bar, chord, rng):
    """Sparse tine figures on the off-beats, high in the chord."""
    tri = chord[1]
    for beat in (0.5, 1.5, 2.5, 3.5):
        if rng.random() < 0.55:
            m = rng.choice(tri) + 12
            song.add(bar * BAR + beat * BEAT, fm(m, 0.9, ratio=5.4, index=1.4, vol=0.1, release=0.6, decay_index=9))


def rain(seconds, rng):
    """Soft rain on the roof: high-passed noise breathing slowly, plus drips."""
    n = int(seconds * RATE)
    x = rng.uniform(-1, 1, n)
    hp = x - lowpass(x, 900)
    t = np.arange(n) / RATE
    swell = 0.75 + 0.25 * np.sin(2 * np.pi * t / seconds * 3)
    bed = lowpass(hp, 6000) * swell * 0.05
    for _ in range(int(seconds * 1.2)):
        i = rng.integers(0, n - 2000)
        k = np.arange(1500)
        bed[i:i + 1500] += np.sin(2 * np.pi * rng.uniform(1800, 3200) * k / RATE) * np.exp(-k / 120.0) * 0.03
    return bed


def score():
    rng = np.random.default_rng(1868)
    song = Song(BARS * BAR)
    for bar in range(BARS):
        chord = CHORDS[bar % 8]
        harp(song, bar, chord)
        song.add(bar * BAR, pad(chord[1], BAR + 1.0, kind='saw', vol=0.07, attack=1.0, release=1.4, cutoff=1100))
        song.add(bar * BAR, pluck(chord[0] - 12, 2.8, bright=0.25, vol=0.22))
        if bar >= 16:
            kalimba(song, bar, chord, rng)
        if bar % 2 == 0 or rng.random() < 0.3:
            bird(song, bar * BAR + rng.uniform(0.3, 3.0), rng)
    for bar, beat, midi, beats in LEAD:
        song.add(bar * BAR + beat * BEAT, woodwind(midi, beats * BEAT * 0.97 + 0.15))
    song.add(0, rain(BARS * BAR, rng))
    return song


if __name__ == '__main__':
    render('greenhouse', score(), echo='0.8:0.75:90|210:0.3|0.18', quality=3)
