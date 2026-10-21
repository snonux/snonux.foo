"""Gin Joint Shuffle: the deco theme's ambient loop.

A hot-jazz trio in F at 152 bpm, swung: a muted trumpet (additive brass
tone through a harmon-mute formant, with delayed vibrato), a walking
plucked upright bass, FM piano comping in the Charleston rhythm, and
brushes with a swung ride. Form: an AABA chorus with the trumpet on the
head, then a second chorus where the piano takes the two A sections, the
trumpet improvises over the bridge and plays the last A home, which
leads back into the top of the loop.

    python3 tools/ambient/deco.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import RATE, Song, env, fm, hat, hz, kick, pluck, render, tone  # noqa: E402

BPM = 152
BEAT = 60.0 / BPM
SWING = 2.0 / 3.0                      # the off-beat eighth falls 2/3 into the beat
np.random.seed(1927)

CHORDS = {
    'F6': (41, [0, 4, 7, 9]), 'D7': (38, [0, 4, 7, 10]), 'Gm7': (43, [0, 3, 7, 10]),
    'C7': (36, [0, 4, 7, 10]), 'A7': (45, [0, 4, 7, 10]), 'G7': (43, [0, 4, 7, 10]),
}
# One entry per bar; a pair is two beats each.
A1 = ['F6', 'D7', 'Gm7', 'C7', ('F6', 'D7'), ('Gm7', 'C7'), 'F6', 'C7']
A2 = ['F6', 'D7', 'Gm7', 'C7', ('F6', 'D7'), ('Gm7', 'C7'), 'F6', 'F6']
B = ['A7', 'A7', 'D7', 'D7', 'G7', 'G7', 'C7', 'C7']
FORM = A1 + A2 + B + A2

# The head: per bar a list of (beat, beats, midi); None is a rest.
HEAD_A = [
    [(0, 1.5, 69), (1.5, 0.5, 72), (2, 1, 74), (3, 1, 72)],
    [(0, 1, 66), (1, 0.5, 69), (1.5, 0.5, 72), (2, 2, 74)],
    [(0, 0.5, 70), (0.5, 0.5, 69), (1, 1, 67), (2, 0.5, 65), (2.5, 0.5, 67), (3, 1, 70)],
    [(0, 1.5, 64), (1.5, 0.5, 67), (2, 1, 70), (3, 1, 69)],
    [(0, 1, 65), (1, 1, 69), (2, 1, 66), (3, 1, 69)],
    [(0, 1, 70), (1, 0.5, 74), (1.5, 0.5, 70), (2, 1, 64), (3, 1, 67)],
]
END_A1 = [[(0, 3, 65), (3.5, 0.5, 72)], [(0, 0.5, 70), (0.5, 0.5, 69), (1, 0.5, 67), (1.5, 0.5, 64), (2, 1.5, 67)]]
END_A2 = [[(0, 1, 77), (1, 0.5, 74), (1.5, 0.5, 72), (2, 2, 69)], [(0, 3, 65)]]
HEAD_B = [
    [(0, 1.5, 73), (1.5, 0.5, 76), (2, 1, 79), (3, 1, 76)], [(0, 3, 73)],
    [(0, 1.5, 72), (1.5, 0.5, 74), (2, 1, 78), (3, 1, 74)], [(0, 3, 72)],
    [(0, 1.5, 71), (1.5, 0.5, 74), (2, 1, 77), (3, 1, 74)], [(0, 2, 71), (2, 0.5, 74), (2.5, 0.5, 71), (3, 1, 67)],
    [(0, 1.5, 70), (1.5, 0.5, 72), (2, 1, 76), (3, 1, 72)], [(0, 0.5, 70), (0.5, 0.5, 67), (1, 1, 64)],
]


def swung(beat):
    """Moves an off-beat eighth (x.5) to the swung position."""
    whole = int(beat)
    frac = beat - whole
    return whole + (SWING if abs(frac - 0.5) < 1e-6 else frac)


def chords_of(bar):
    """[(start beat, beats, chord name)] for one bar."""
    if isinstance(bar, tuple):
        return [(0, 2, bar[0]), (2, 2, bar[1])]
    return [(0, 4, bar)]


def trumpet(midi, dur, vol=0.22):
    """Muted trumpet: additive brass whose upper harmonics grow with the
    envelope, shaped by a harmon-mute formant, with a scoop and late vibrato."""
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    f = hz(midi)
    vib = np.clip((t - 0.18) / 0.25, 0, 1) * 0.007 * np.sin(2 * np.pi * 5.6 * t)
    inst = f * (1 + vib - 0.035 * np.exp(-t * 35))
    ph = 2 * np.pi * np.cumsum(inst) / RATE
    e = env(n, 0.025, 0.12, 0.75, min(0.07, dur / 3))
    out = np.zeros(n)
    for k in range(1, min(18, int(7000 / f)) + 1):
        fk = k * f
        w = np.exp(-np.log(fk / 1700.0) ** 2 / 0.32) + 0.35 * np.exp(-np.log(fk / 650.0) ** 2 / 0.3)
        out += w / k ** 0.3 * e ** (1 + 0.3 * (k - 1)) * np.sin(k * ph)
    breath = np.random.uniform(-1, 1, n) * np.exp(-t * 30) * 0.04
    return (out / 1.2 + breath) * vol


def play_line(song, start, notes, inst=trumpet, vol=0.22):
    for beat, beats, midi in notes:
        if midi is None:
            continue
        on, off = swung(beat), swung(beat + beats)
        song.add(start + on * BEAT, inst(midi, max(0.08, (off - on) * BEAT * 0.95), vol=vol))


def walking_bass(song, bars, t0):
    """Root on the chord's first beat, chord tones between, and a chromatic
    approach into the next chord on the beat before it."""
    prev = 41
    seq = []
    for b, bar in enumerate(bars):
        for beat, beats, name in chords_of(bar):
            seq.append((b * 4 + beat, beats, name))
    for i, (pos, beats, name) in enumerate(seq):
        root, iv = CHORDS[name]
        nxt = CHORDS[seq[(i + 1) % len(seq)][2]][0]
        notes = [root]
        for k in range(1, beats - 1):
            notes.append(root + iv[np.random.randint(1, len(iv))])
        if beats > 1:
            notes.append(nxt + (1 if np.random.rand() < 0.5 else -1))
        for k, m in enumerate(notes):
            while m - prev > 7:
                m -= 12
            while prev - m > 7:
                m += 12
            m = int(np.clip(m, 33, 52))
            prev = m
            at = t0 + (pos + k) * BEAT
            song.add(at, pluck(m, BEAT * 1.1, bright=0.3, vol=0.35))
            song.add(at, tone('sine', m, BEAT * 0.9, vol=0.22, attack=0.004, decay=0.15, sustain=0.4, release=0.1))


def voicing(name):
    root, iv = CHORDS[name]
    out = []
    for x in (iv[1], iv[3], iv[2]):
        m = root + x
        while m < 55:
            m += 12
        while m > 68:
            m -= 12
        out.append(m)
    return out


def piano_comp(song, bars, t0):
    """Charleston comping: a chord on one and on the and of two."""
    for b, bar in enumerate(bars):
        for beat, beats, name in chords_of(bar):
            hits = [0, 1.5] if beats == 4 else [0]
            for h in hits:
                at = t0 + (b * 4 + beat + swung(h)) * BEAT
                for m in voicing(name):
                    song.add(at, fm(m, BEAT * 0.9, ratio=1.0, index=1.6, vol=0.09, release=0.15, decay_index=4.0))


def improvise(bars, low=62, high=79, density=0.72):
    """A seeded swing-eighth line on chord tones, with passing scale tones
    and a breath at the end of every second bar."""
    scale = [0, 2, 4, 5, 7, 9, 10]
    out, prev = [], 69
    for b, bar in enumerate(bars):
        notes = []
        for slot in range(8 if b % 2 == 0 else 6):
            beat = slot * 0.5
            name = [c for c in chords_of(bar) if c[0] <= beat][-1][2]
            root, iv = CHORDS[name]
            pool = [root + x for x in iv] if slot % 2 == 0 else [41 + x for x in scale]
            pool = [p + 12 * o for p in pool for o in range(-1, 5) if low <= p + 12 * o <= high]
            pool.sort(key=lambda p: abs(p - prev) + np.random.rand() * 4)
            if np.random.rand() < density:
                prev = pool[0] if np.random.rand() < 0.7 else pool[min(1, len(pool) - 1)]
                notes.append((beat, 0.5, prev))
        out.append(notes)
    return out


def piano_note(midi, dur, vol=0.2):
    return fm(midi, dur, ratio=1.0, index=2.2, vol=vol, attack=0.003, release=0.12, decay_index=3.0)


def brush(dur, vol, swish=False):
    """Brushes: softened noise, a slap on the backbeat or a swish that
    swells through the beat."""
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    x = np.convolve(np.random.uniform(-1, 1, n), np.ones(6) / 6, mode='same')
    shape = np.sin(np.pi * t / dur) ** 2 if swish else np.exp(-t * 18)
    return x * shape * vol


def drums(song, nbars, t0):
    """Feathered kick, brushed snare on two and four, swung ride."""
    for b in range(nbars):
        for beat in range(4):
            at = t0 + (b * 4 + beat) * BEAT
            song.add(at, kick(vol=0.16, pitch=50, dur=0.25))
            song.add(at, hat(vol=0.07, open_=True))
            song.add(at, brush(BEAT * 0.95, 0.06, swish=True))
            if beat % 2 == 1:
                song.add(at, brush(0.22, 0.35))
                song.add(at - (1 - SWING) * BEAT, hat(vol=0.05, open_=False))


def main():
    nbars = len(FORM) * 2
    song = Song(nbars * 4 * BEAT)
    chorus = len(FORM) * 4 * BEAT
    for c in range(2):
        t0 = c * chorus
        walking_bass(song, FORM, t0)
        piano_comp(song, FORM, t0)
    drums(song, nbars, 0)
    bar = 4 * BEAT
    # Chorus 1: the head on trumpet.
    for i, notes in enumerate(HEAD_A + END_A1 + HEAD_A + END_A2):
        play_line(song, i * bar, notes)
    for i, notes in enumerate(HEAD_B):
        play_line(song, (16 + i) * bar, notes)
    for i, notes in enumerate(HEAD_A + END_A2):
        play_line(song, (24 + i) * bar, notes)
    # Chorus 2: piano solo on the A sections, trumpet on the bridge and the head out.
    for i, notes in enumerate(improvise(A1 + A2, low=65, high=84, density=0.8)):
        play_line(song, chorus + i * bar, notes, inst=piano_note, vol=0.2)
    for i, notes in enumerate(improvise(B)):
        play_line(song, chorus + (16 + i) * bar, notes)
    for i, notes in enumerate(HEAD_A + END_A2):
        play_line(song, chorus + (24 + i) * bar, notes)
    render('deco', song, echo='0.8:0.6:45|110:0.2|0.12', quality=3)


if __name__ == '__main__':
    main()
