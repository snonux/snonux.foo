"""Bauhaus theme loop: "Primary Sequence" (original, CC0).

Minimal electronic in the Kraftwerk manner: a sine bass sequence, a square
arpeggio running up F lydian, a sine lead, and a precise drum machine (kick,
snare, closed hat). Halfway through, the harmony slides into a whole-tone
arpeggio over a held F, then the sequence returns. 48 bars at 120 BPM: a
96-second loop whose last bar thins out like the first so the seam is quiet.

    python3 tools/ambient/bauhaus.py
"""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import Song, hat, kick, render, snare, tone  # noqa: E402

BPM = 120
BEAT = 60.0 / BPM
STEP = BEAT / 4          # a sixteenth
BAR = BEAT * 4
BARS = 48

# F lydian chords, two bars each: F (I), G (II), Am (iii), G (II).
CHORDS = [[53, 57, 60, 64], [55, 59, 62, 66], [57, 60, 64, 67], [55, 59, 62, 66]]
ROOTS = [41, 43, 45, 43]
WHOLE = [65, 67, 69, 71, 73, 75]   # the whole-tone scale on F

# Lead phrases (MIDI, length in sixteenths); None is a rest.
PHRASES = [
    [(77, 4), (76, 2), (72, 2), (71, 4), (None, 4), (72, 4), (74, 4), (76, 8)],
    [(79, 4), (78, 2), (74, 2), (71, 8), (None, 4), (74, 2), (76, 2), (79, 8)],
    [(81, 6), (79, 2), (76, 4), (72, 4), (76, 4), (79, 4), (81, 8)],
    [(79, 4), (78, 4), (74, 4), (71, 4), (74, 8), (None, 8)],
]


def chord_at(bar):
    return (bar // 2) % 4


def drums(song, bar, full):
    t0 = bar * BAR
    for s in range(16):
        t = t0 + s * STEP
        if s in (0, 8) or (full and s == 11):
            song.add(t, kick(vol=0.75, pitch=52, dur=0.3))
        if full and s in (4, 12):
            song.add(t, snare(vol=0.28, dur=0.16))
        if s % 2 == 0:
            song.add(t, hat(vol=0.07 if s % 4 else 0.1))
        elif full and s == 15:
            song.add(t, hat(vol=0.06, open_=True))


def bass(song, bar):
    root = ROOTS[chord_at(bar)]
    pattern = [0, None, 0, 12, None, 0, 7, None, 0, None, 0, 12, None, 7, 12, None]
    for s, iv in enumerate(pattern):
        if iv is not None:
            song.add(bar * BAR + s * STEP, tone('sine', root + iv, STEP * 1.6, vol=0.42, attack=0.004,
                                               decay=0.08, sustain=0.5, release=0.06))


def arp(song, bar, notes, vol):
    order = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 2, 3]
    ladder = notes + [n + 12 for n in notes]
    for s, i in enumerate(order):
        n = ladder[i % len(ladder)]
        song.add(bar * BAR + s * STEP, tone('square', n, STEP * 0.8, vol=vol, attack=0.003,
                                            decay=0.05, sustain=0.35, release=0.04))


def lead(song, bar, phrase):
    t = bar * BAR
    for midi, steps in phrase:
        if midi is not None:
            song.add(t, tone('sine', midi, steps * STEP * 0.92, vol=0.2, attack=0.01, decay=0.15,
                             sustain=0.6, release=0.12, vibrato=0.004))
            song.add(t, tone('triangle', midi + 12, steps * STEP * 0.5, vol=0.035, attack=0.005,
                             decay=0.1, sustain=0.2, release=0.1))
        t += steps * STEP


def drone(song, bar, midis, vol):
    for m in midis:
        song.add(bar * BAR, tone('triangle', m, BAR * 1.05, vol=vol, attack=0.4, decay=0.3,
                                 sustain=0.8, release=0.5))


def main():
    np.random.seed(1919)
    song = Song(BARS * BAR)
    for bar in range(BARS):
        whole = 24 <= bar < 32
        full = 8 <= bar < 46 and bar not in (22, 23)
        drums(song, bar, full)
        if whole:
            drone(song, bar, [41, 53], 0.12)
            arp(song, bar, WHOLE[bar % 2:] + WHOLE[:bar % 2], 0.05)
            continue
        bass(song, bar)
        if bar >= 4:
            arp(song, bar, CHORDS[chord_at(bar)], 0.045 if bar < 8 or bar >= 44 else 0.06)
        if 12 <= bar < 24 or 32 <= bar < 44:
            if bar % 2 == 0:
                lead(song, bar, PHRASES[(bar // 2) % 4])
    render('bauhaus', song, echo='0.8:0.6:375|750:0.22|0.1')
    trim(BARS * BAR)


def trim(seconds):
    """The mastering chain pads the end a little; cut the file back to the
    exact loop length (stream copy, no second encode) so it loops on the beat."""
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..',
                       'internal/generator/templates/themes/bauhaus/ambient.ogg')
    tmp = out + '.tmp.ogg'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', out, '-t', '%.3f' % seconds, '-c', 'copy', tmp], check=True)
    os.replace(tmp, out)


if __name__ == '__main__':
    main()
