"""Blueprint theme ambient loop: "Phase Drawing".

A calm, glassy minimalist piece in D dorian. Two marimba voices play the
same twelve-note figure, one a little faster than the other, so they drift
apart and lock back together over the loop (Reich-style phasing): voice A
plays the figure 32 times, voice B 33 times, so both meet again exactly at
the loop point and the loop is seamless. Soft pads move through eight
chords, a sine bass breathes under them and a quiet pen-plotter click
pattern ticks along.

    python3 tools/ambient/blueprint.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import Song, drum, fm, hat, pad, render, tone  # noqa: E402

np.random.seed(2026)
LENGTH = 96.0
FIGURE = [62, 69, 72, 74, 69, 76, 72, 69, 74, 72, 67, 69]   # D A C D A E C A D C G A
CHORDS = [
    [50, 57, 60, 64, 65],   # Dm9
    [43, 55, 59, 62, 64],   # G6
    [41, 53, 57, 60, 64],   # Fmaj7
    [40, 52, 55, 59, 62],   # Em7
    [50, 57, 60, 64, 65],   # Dm9
    [48, 55, 59, 62, 64],   # Cmaj9
    [45, 57, 60, 64, 67],   # Am7
    [43, 55, 57, 62, 67],   # G sus2
]


def marimba(midi, vol):
    return fm(midi, 0.9, ratio=4.0, index=1.8, vol=vol, attack=0.002, release=0.6, decay_index=9.0)


def phasing(song):
    """Voice A: 32 figures; voice B: 33 figures in the same time, an octave up."""
    for reps, octave, vol in ((32, 0, 0.30), (33, 12, 0.16)):
        step = LENGTH / (reps * len(FIGURE))
        for n in range(reps * len(FIGURE)):
            midi = FIGURE[n % len(FIGURE)] + octave
            # A gentle swell every figure keeps the pulse breathing.
            accent = 1.0 if n % len(FIGURE) == 0 else 0.8 + 0.1 * np.sin(n * 0.7)
            song.add(n * step, marimba(midi, vol * accent))


def harmony(song):
    span = LENGTH / len(CHORDS)
    for k, chord in enumerate(CHORDS):
        start = k * span
        song.add(start, pad(chord[1:], span + 2.5, kind='triangle', vol=0.11, attack=2.2, release=2.5, cutoff=1400))
        for half in (0, span / 2):
            song.add(start + half, tone('sine', chord[0] - 12, span / 2 + 0.5, vol=0.22, attack=0.4, decay=0.5, sustain=0.6, release=1.2))
        # A high glass bell on the chord's top note, once per chord.
        song.add(start + span * 0.62, fm(chord[-1] + 24, 3.0, ratio=3.5, index=2.4, vol=0.08, release=2.4, decay_index=2.5))


def plotter(song):
    """Quiet clicks and servo ticks, like a pen plotter at work."""
    pattern = 'x.xx.x.xx.x.x..x'
    step = 0.25
    for n in range(int(LENGTH / step)):
        ch = pattern[n % len(pattern)]
        if ch == 'x':
            song.add(n * step, hat(vol=0.05 if n % 4 else 0.08, dur=0.03))
        if n % 32 == 16:
            song.add(n * step, drum(1900, vol=0.05, dur=0.05, bend=0.2, decay=70))


def main():
    song = Song(LENGTH)
    phasing(song)
    harmony(song)
    plotter(song)
    render('blueprint', song, echo='0.8:0.75:90|240:0.3|0.18', quality=3)


if __name__ == '__main__':
    main()
