"""Score for the dmg theme's ambient.ogg: "Pocket Pea Green".

An upbeat four-channel chiptune in C major, laid out like a Game Boy sound
chip: pulse 1 (25% duty) sings the lead, pulse 2 (square) plays sixteenth
arpeggios and, in the second A section, a harmony a third below the lead,
the wave channel (triangle) bounces an octave bass, and the noise channel
keeps a kick/snare/hat groove with sample-and-hold noise (the LFSR's gritty
pitch). 150 bpm, 48 bars: intro, A, B, A with harmony, a short breakdown,
B, A, and the last bar leads back into the intro.

    python3 tools/ambient/dmg.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import RATE, Song, env, render, tone  # noqa: E402

BPM = 150
S16 = 60.0 / BPM / 4          # one sixteenth note in seconds
BAR = 16 * S16
NOTES = {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11}
C_MAJOR = [0, 2, 4, 5, 7, 9, 11]

# Chords as (root midi in the bass register, chord tones above the root).
CHORDS = {
    'C': (36, [0, 4, 7, 12]), 'Am': (45, [0, 3, 7, 12]), 'F': (41, [0, 4, 7, 12]),
    'G': (43, [0, 4, 7, 12]), 'Em': (40, [0, 3, 7, 12]), 'Dm': (38, [0, 3, 7, 12]),
}

LEAD_A = [
    'e5:2 g5:2 c6:3 b5:1 c6:2 g5:2 e5:4', 'a5:2 c6:2 e6:3 d6:1 c6:2 a5:2 e5:4',
    'f5:2 a5:2 c6:2 d6:2 c6:2 a5:2 f5:2 a5:2', 'g5:3 a5:1 b5:2 d6:2 g6:4 f6:2 d6:2',
    'e6:2 d6:2 c6:2 g5:2 e5:2 g5:2 c6:4', 'b5:2 g5:2 e5:2 g5:2 b5:3 c6:1 b5:4',
    'a5:2 c6:2 f6:4 e6:2 d6:2 c6:2 a5:2', 'b5:2 d6:2 g6:2 f6:2 d6:2 b5:2 c6:4',
]
LEAD_B = [
    'c6:4 b5:2 a5:6 e5:4', 'f5:4 g5:2 a5:6 c6:4', 'e6:4 d6:2 c6:6 g5:4', 'd6:6 b5:2 g5:8',
    'c6:4 b5:2 a5:4 c6:2 e6:4', 'f6:4 e6:2 c6:4 a5:2 c6:4', 'd6:2 f6:2 a6:4 g6:2 f6:2 d6:4',
    'g6:2 f6:2 d6:2 b5:2 g5:4 r:4',
]
PROG_A = ['C', 'Am', 'F', 'G', 'C', 'Em', 'F', 'G']
PROG_B = ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'G']
PROG_INTRO = ['C', 'Am', 'F', 'G']


def parse(bar):
    """'e5:2 r:4' -> [(midi or None, sixteenths)]."""
    out = []
    for tok in bar.split():
        name, n = tok.split(':')
        if name == 'r':
            out.append((None, int(n)))
            continue
        out.append((12 * (int(name[1]) + 1) + NOTES[name[0]], int(n)))
    return out


def third_below(midi):
    """The diatonic third under a C-major note, for the harmony part."""
    octave, pc = divmod(midi, 12)
    i = C_MAJOR.index(pc) if pc in C_MAJOR else 0
    j = i - 2
    return 12 * (octave + (j // 7)) + C_MAJOR[j % 7]


def lfsr_noise(dur, hold, vol, decay):
    """Noise-channel hit: random levels held for `hold` samples (lower =
    hissier, higher = grittier and more pitched), with a fast decay."""
    n = int(dur * RATE)
    steps = np.random.choice([-1.0, 1.0], n // hold + 1)
    x = np.repeat(steps, hold)[:n]
    t = np.arange(n) / RATE
    return x * np.exp(-t * decay) * vol


def lead_bar(song, start, bar, vol=0.2, kind='pulse25', harmony=False):
    t = start
    for midi, n in parse(bar):
        if midi is not None:
            dur = n * S16
            song.add(t, tone(kind, midi, dur * 0.92, vol=vol, attack=0.004, decay=0.07, sustain=0.62, release=0.03))
            if harmony:
                song.add(t, tone('square', third_below(midi), dur * 0.9, vol=vol * 0.45, attack=0.004, decay=0.07, sustain=0.5, release=0.03))
        t += n * S16


def bass_bar(song, start, chord, vol=0.34):
    root, _ = CHORDS[chord]
    for i, step in enumerate([0, 12, 7, 12, 0, 12, 7, 19]):
        song.add(start + i * 2 * S16, tone('triangle', root + step, S16 * 1.6, vol=vol, attack=0.003, decay=0.05, sustain=0.8, release=0.02))


def arp_bar(song, start, chord, vol=0.06):
    root, tones = CHORDS[chord]
    for i in range(16):
        midi = root + 24 + tones[i % 4]
        song.add(start + i * S16, tone('square', midi, S16 * 0.8, vol=vol, attack=0.002, decay=0.03, sustain=0.5, release=0.01))


def drum_bar(song, start, fill=False, light=False):
    for i in range(16):
        t = start + i * S16
        if i in (0, 8) or (i == 14 and not light):
            song.add(t, lfsr_noise(0.12, 24, 0.42, 38))
        if i in (4, 12) and not light:
            song.add(t, lfsr_noise(0.16, 3, 0.26, 22))
        if fill and i >= 12:
            song.add(t, lfsr_noise(0.08, 2 + (i - 12) * 2, 0.2, 30))
        if i % 2 == 0:
            song.add(t, lfsr_noise(0.035, 1, 0.09, 90))
        elif i in (6, 14):
            song.add(t, lfsr_noise(0.14, 1, 0.07, 20))


def section(song, bar0, prog, lead=None, harmony=False, arp=True, drums=True, light=False):
    for k, chord in enumerate(prog):
        start = (bar0 + k) * BAR
        bass_bar(song, start, chord, vol=0.26 if light else 0.34)
        if arp:
            arp_bar(song, start, chord, vol=0.045 if lead else 0.07)
        if drums:
            drum_bar(song, start, fill=(k == len(prog) - 1), light=light)
        if lead:
            lead_bar(song, start, lead[k], harmony=harmony)
    return bar0 + len(prog)


def main():
    np.random.seed(1989)
    song = Song(48 * BAR)
    b = section(song, 0, PROG_INTRO)
    b = section(song, b, PROG_A, LEAD_A)
    b = section(song, b, PROG_B, LEAD_B)
    b = section(song, b, PROG_A, LEAD_A, harmony=True)
    b = section(song, b, PROG_INTRO, light=True)
    b = section(song, b, PROG_B, LEAD_B, harmony=True)
    b = section(song, b, PROG_A, LEAD_A)
    assert b == 48
    render('dmg', song, echo='0.8:0.6:70:0.16', lowcut=35, quality=3)


if __name__ == '__main__':
    main()
