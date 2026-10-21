"""Score for the western theme's ambient.ogg: "Dust on the Express".

An original spaghetti-western loop in A minor at 96 bpm, 32 bars (80 s):
a clip-clop gallop of wood blocks, a plucked bass and a twangy guitar
picking the chords, a whistled tune with vibrato, a harmonica answering
it, and a dry wind under everything. The chords run i-i-iv-i-VI-VII-V-V,
the Andalusian lean that westerns love.

    python3 tools/ambient/western.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import synth  # noqa: E402

np.random.seed(1866)

BPM = 96
BEAT = 60.0 / BPM
BAR = 4 * BEAT
BARS = 32
RATE = synth.RATE

# Chord roots (MIDI, bass register) and chord tones (guitar register).
CHORDS = [
    (45, [57, 60, 64]),   # Am
    (45, [57, 60, 64]),   # Am
    (50, [62, 65, 69]),   # Dm
    (45, [57, 60, 64]),   # Am
    (41, [53, 57, 60]),   # F
    (43, [55, 59, 62]),   # G
    (40, [52, 56, 59]),   # E
    (40, [52, 56, 59]),   # E
]

# (midi, beats) per bar; a midi of 0 is a rest.
WHISTLE = [
    [(81, 1.5), (86, 0.5), (81, 2)],
    [(81, 1.5), (86, 0.5), (81, 1), (76, 1)],
    [(77, 1), (79, 1), (81, 1), (77, 1)],
    [(76, 4)],
    [(77, 1.5), (76, 0.5), (74, 1), (72, 1)],
    [(74, 1.5), (72, 0.5), (71, 2)],
    [(76, 1), (80, 1), (83, 2)],
    [(80, 2), (76, 1.5), (0, 0.5)],
]
HARMONICA = [
    [(69, 1), (72, 1), (76, 2)],
    [(74, 1), (72, 1), (69, 2)],
    [(74, 2), (77, 1), (74, 1)],
    [(72, 1), (71, 1), (69, 2)],
    [(65, 1), (69, 1), (72, 2)],
    [(71, 1), (74, 1), (79, 2)],
    [(76, 2), (74, 1), (71, 1)],
    [(68, 2), (64, 1.5), (0, 0.5)],
]


def fft_lowpass(x, cutoff):
    """Smooth fourth-order low-pass done in the frequency domain."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1.0 / RATE)
    spec *= 1.0 / (1.0 + (f / cutoff) ** 4)
    return np.fft.irfft(spec, len(x))


def vibrato_phase(midi, dur, depth, rate=5.2, delay=0.15, scoop=0.0):
    """Phase of a note with delayed vibrato and an optional scoop up into
    the pitch (in semitones), as a whistler or harmonica player does."""
    t = np.arange(int(dur * RATE)) / RATE
    f = synth.hz(midi) * 2 ** (-scoop * np.exp(-t * 28) / 12.0)
    ramp = np.clip((t - delay) / 0.3, 0, 1)
    f = f * (1 + depth * ramp * np.sin(2 * np.pi * rate * t))
    return 2 * np.pi * np.cumsum(f) / RATE, t


def whistle(midi, dur, vol=0.13):
    ph, t = vibrato_phase(midi, dur, 0.012, rate=5.6, scoop=1.0)
    breath = fft_lowpass(np.random.uniform(-1, 1, len(t)), 3000) * 0.05
    sig = np.sin(ph) + 0.08 * np.sin(2 * ph) + breath
    return sig * vol * synth.env(len(t), 0.05, 0.1, 0.85, min(0.12, dur / 3))


def harmonica(midi, dur, vol=0.14):
    ph, t = vibrato_phase(midi, dur, 0.02, rate=6.0, delay=0.2, scoop=0.6)
    sig = np.zeros_like(t)
    for k in range(1, 10):
        sig += np.sin(k * ph) * (1.0 / k if k % 2 else 0.45 / k)
    sig = fft_lowpass(sig, 2400)
    return sig * vol * synth.env(len(t), 0.04, 0.12, 0.75, min(0.1, dur / 3))


def clop(high, vol=0.16):
    """One hoof on hard ground: a short wooden knock."""
    return synth.drum(780 if high else 560, vol=vol, dur=0.09, bend=0.4, decay=55)


def add_gallop(song, start, vol):
    # Each beat is da-da-DUM: an eighth and two sixteenths, the canter rhythm.
    for b in range(4):
        t0 = start + b * BEAT
        song.add(t0, clop(True, vol))
        song.add(t0 + BEAT * 0.5, clop(False, vol * 0.7))
        song.add(t0 + BEAT * 0.75, clop(True, vol * 0.85))


def add_bass(song, start, root):
    song.add(start, synth.pluck(root, BEAT * 1.6, bright=0.3, vol=0.42))
    song.add(start + 2 * BEAT, synth.pluck(root + 7, BEAT * 1.4, bright=0.3, vol=0.34))
    song.add(start + 3.5 * BEAT, synth.pluck(root + 12, BEAT * 0.5, bright=0.3, vol=0.24))


def add_guitar(song, start, tones, busy):
    # Twangy picking: root-fifth-octave-third in eighths, or a strum.
    if not busy:
        for k, m in enumerate(tones + [tones[0] + 12]):
            song.add(start + k * 0.025, synth.pluck(m, BAR * 0.9, bright=0.85, vol=0.12))
        return
    order = [0, 2, 1, 2, 0, 2, 1, 2]
    for k, i in enumerate(order):
        m = tones[i] + (12 if k in (3, 7) else 0)
        song.add(start + k * BEAT / 2, synth.pluck(m, BEAT * 0.9, bright=0.85, vol=0.11))


def add_line(song, start, bars, voice, octave=0):
    for b, notes in enumerate(bars):
        t = start + b * BAR
        for midi, beats in notes:
            if midi:
                song.add(t, voice(midi + octave, beats * BEAT * 0.95))
            t += beats * BEAT


def add_wind(song):
    n = int(BARS * BAR * RATE)
    x = fft_lowpass(np.random.uniform(-1, 1, n), 500)
    t = np.arange(n) / RATE
    # Two slow gusts per loop, period chosen so the loop stays seamless.
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * t / (BARS * BAR / 2)) ** 2
    song.add(0, x / (np.max(np.abs(x)) or 1) * 0.05 * swell)


def score():
    song = synth.Song(BARS * BAR)
    add_wind(song)
    for bar in range(BARS):
        start = bar * BAR
        root, tones = CHORDS[bar % 8]
        add_gallop(song, start, 0.14 if 4 <= bar < 28 else 0.1)
        add_bass(song, start, root)
        add_guitar(song, start, tones, busy=4 <= bar < 28)
        if bar % 8 == 0:
            song.add(start, synth.fm(69 + (12 if bar == 16 else 0), 3.0, ratio=3.5, index=2.0, vol=0.08))
    add_line(song, 4 * BAR, WHISTLE, whistle)
    add_line(song, 12 * BAR, HARMONICA, harmonica)
    add_line(song, 20 * BAR, WHISTLE, whistle)
    # Under the second whistle the harmonica holds each chord's third.
    for b in range(8):
        song.add((20 + b) * BAR, harmonica(CHORDS[b][1][1], BAR * 0.95, vol=0.07))
    return song


if __name__ == '__main__':
    synth.render('western', score(), echo='0.8:0.6:140|420:0.28|0.14')
