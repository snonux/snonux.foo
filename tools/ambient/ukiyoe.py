"""ukiyoe ambient loop: "Tokaido at Dusk" (original composition).

A slow walk along the old road in the Japanese in scale on A (A Bb D E F):
a plucked koto ostinato under a koto melody, a breathy shakuhachi line in
the middle section, a low drone, and taiko strokes that mark each bar with a
roll closing every phrase. 24 bars at 72 bpm, 80 seconds, seamless.

    python3 tools/ambient/ukiyoe.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import synth  # noqa: E402

BPM = 72
BEAT = 60.0 / BPM
BAR = 4 * BEAT
BARS = 24

# The in scale on A, as MIDI notes from A2 up.
IN = [45, 46, 50, 52, 53, 57, 58, 62, 64, 65, 69, 70, 74, 76, 77, 81]

# One chord root per bar (index into IN) for the koto ostinato.
ROOTS = [0, 0, 2, 3, 0, 0, 4, 3, 2, 2, 0, 3, 0, 4, 2, 3, 0, 0, 2, 3, 4, 2, 3, 0]

# The koto melody: (bar, beat, scale index, beats held).
KOTO = [
    (4, 0, 10, 1), (4, 1, 9, 0.5), (4, 1.5, 8, 1.5), (4, 3, 7, 1),
    (5, 0, 8, 1), (5, 1, 9, 1), (5, 2, 10, 2),
    (6, 0, 11, 1), (6, 1, 10, 0.5), (6, 1.5, 9, 0.5), (6, 2, 8, 2),
    (7, 0, 7, 1), (7, 1, 6, 1), (7, 2, 5, 2),
    (16, 0, 12, 1), (16, 1, 11, 0.5), (16, 1.5, 10, 1.5), (16, 3, 9, 1),
    (17, 0, 10, 1), (17, 1, 8, 1), (17, 2, 7, 2),
    (18, 0, 9, 0.5), (18, 0.5, 10, 0.5), (18, 1, 11, 1), (18, 2, 12, 1), (18, 3, 11, 1),
    (19, 0, 10, 2), (19, 2, 8, 2),
    (20, 0, 7, 1), (20, 1, 8, 1), (20, 2, 9, 1), (20, 3, 10, 1),
    (21, 0, 11, 3),
    (22, 0, 10, 1), (22, 1, 9, 1), (22, 2, 8, 1), (22, 3, 7, 1),
    (23, 0, 5, 4),
]

# The shakuhachi: long breathy notes with a slide into each.
FLUTE = [
    (8, 0, 10, 3), (9, 0, 9, 1.5), (9, 1.5, 8, 2.5), (10, 0, 7, 2), (10, 2, 8, 2),
    (11, 0, 9, 4), (12, 0, 10, 2), (12, 2, 11, 2), (13, 0, 12, 3), (13, 3, 11, 1),
    (14, 0, 10, 2), (14, 2, 9, 2), (15, 0, 8, 4),
]


def at(bar, beat):
    return bar * BAR + beat * BEAT


def shakuhachi(midi, dur):
    """A sine with slow vibrato, a breath of filtered noise at its start."""
    body = synth.tone('sine', midi, dur, vol=0.16, attack=0.18, decay=0.3, sustain=0.75, release=0.5, vibrato=0.006)
    body += synth.tone('sine', midi + 12, dur, vol=0.025, attack=0.25, decay=0.3, sustain=0.6, release=0.5)
    breath = synth.noise(min(dur, 0.9), vol=0.035, cutoff=1800, attack=0.06, release=0.7)
    body[:len(breath)] += breath
    return body


def ostinato(song, bar):
    """The low koto figure: root, fifth-ish neighbour and octave."""
    r = ROOTS[bar]
    pattern = [(0, r, 0.42), (1, r + 3, 0.22), (1.5, r + 5, 0.2), (2, r + 4, 0.24), (3, r + 5, 0.2), (3.5, r + 3, 0.16)]
    for beat, idx, vol in pattern:
        song.add(at(bar, beat), synth.pluck(IN[min(idx, len(IN) - 1)], 1.6, bright=0.35, vol=vol))


def taiko(song, bar):
    song.add(at(bar, 0), synth.drum(68, vol=0.75, dur=0.9, bend=1.2, decay=5.0))
    song.add(at(bar, 2.5), synth.drum(104, vol=0.32, dur=0.4, bend=1.0, decay=9.0))
    if bar % 4 == 3:
        for k in range(4):
            song.add(at(bar, 3 + k * 0.25), synth.drum(118 - k * 6, vol=0.22 + k * 0.06, dur=0.3, decay=11.0))
    else:
        song.add(at(bar, 3.5), synth.drum(150, vol=0.12, dur=0.15, bend=0.5, decay=20.0))


def build():
    song = synth.Song(BARS * BAR)
    for b in range(0, BARS, 4):
        song.add(at(b, 0), synth.pad([45, 52, 57], 4 * BAR + 1.0, kind='triangle', vol=0.09, attack=1.5, release=1.5, cutoff=900))
    for b in range(BARS):
        ostinato(song, b)
        taiko(song, b)
    for bar, beat, idx, held in KOTO:
        song.add(at(bar, beat), synth.pluck(IN[idx], max(1.2, held * BEAT + 0.6), bright=0.6, vol=0.36))
    for bar, beat, idx, held in FLUTE:
        song.add(at(bar, beat), shakuhachi(IN[idx], held * BEAT + 0.4))
    return song


if __name__ == '__main__':
    np.random.seed(53)   # the fifty-three stations of the Tokaido
    synth.render('ukiyoe', build(), echo='0.8:0.75:90|240:0.3|0.18')
