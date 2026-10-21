"""Night of the Capstone: the pharaoh theme's ambient loop.

A Hijaz (E phrygian dominant: E F G# A B C D) night piece at 84 bpm,
32 bars, about 91 seconds. An oud-like plucked ostinato over an E/B drone,
a ney flute (breathy sine with vibrato) singing two phrases, a plucked
taqsim in the middle, and darbuka (maqsum: doum tek - tek doum - tek -)
with a frame drum on the downbeats. The last bars thin out to the opening
texture so the loop seam is not heard.

    python3 tools/ambient/pharaoh.py
"""
import os
import subprocess
import sys
import tempfile

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import ROOT, Song, drum, noise, pad, pluck, render, tone  # noqa: E402

BPM = 84
BEAT = 60.0 / BPM
BAR = 4 * BEAT
BARS = 32

np.random.seed(1922)  # the year the tomb was opened; fixes the plucks' noise

# Two bars of eighth-note ostinato, alternating.
OSTINATO = [[52, 53, 56, 53, 52, 50, 52, 59], [52, 53, 56, 57, 56, 53, 52, 50]]

NEY_A = [
    [(64, 2), (65, 1), (68, 1)], [(65, 1.5), (64, 0.5), (64, 2)],
    [(68, 1), (69, 1), (71, 1), (69, 1)], [(68, 2), (65, 1), (64, 1)],
    [(72, 2), (71, 1), (69, 1)], [(68, 1), (69, 1), (68, 1), (65, 1)],
    [(64, 1), (65, 1), (62, 1), (64, 1)], [(64, 4)],
]
NEY_B = [
    [(76, 2), (74, 1), (72, 1)], [(71, 2), (72, 1), (71, 1)],
    [(69, 1), (68, 1), (69, 1), (71, 1)], [(72, 3), (71, 1)],
    [(69, 1), (68, 1), (65, 1), (68, 1)], [(69, 2), (68, 1), (65, 1)],
    [(64, 1), (65, 1), (68, 1), (65, 1)], [(64, 4)],
]


def ney(song, start, midi, beats, vol=0.2):
    """A ney note: vibrato sine, a soft octave partial and breath noise."""
    dur = beats * BEAT
    body = tone('sine', midi, dur + 0.15, vol=vol, attack=0.09, decay=0.2, sustain=0.85, release=0.18, vibrato=0.009)
    over = tone('sine', midi + 12, dur + 0.15, vol=vol * 0.12, attack=0.12, decay=0.2, sustain=0.7, release=0.18)
    breath = noise(min(dur, 0.6), vol=vol * 0.18, cutoff=2400, attack=0.04)
    song.add(start, body + over)
    song.add(start, breath)


def ney_phrase(song, bar0, phrase, vol=0.2):
    for i, bar in enumerate(phrase):
        t = (bar0 + i) * BAR
        for midi, beats in bar:
            ney(song, t, midi, beats, vol)
            t += beats * BEAT


def oud(song, start, midi, vol=0.32, dur=0.9, bright=0.55):
    song.add(start, pluck(midi, dur, bright=bright, vol=vol))


def ostinato(song, bar, vol=0.3):
    for i, m in enumerate(OSTINATO[bar % 2]):
        oud(song, bar * BAR + i * BEAT / 2, m, vol=vol * (1.0 if i % 4 == 0 else 0.75))


def taqsim(song, bar0):
    """Eight bars of running plucks around the ney's first phrase, with a
    quick tremolo on each long note, the way an oud fills a held tone."""
    for i, bar in enumerate(NEY_A):
        t = (bar0 + i) * BAR
        for midi, beats in bar:
            n = max(1, int(beats * 4))
            for k in range(n):
                step = (midi if k % 2 == 0 or beats < 1.5 else midi - 1) - 12
                oud(song, t + k * BEAT / 4, step + 12, vol=0.22 if k else 0.3, dur=0.5, bright=0.7)
            t += beats * BEAT


def drums(song, bar, full=True):
    """Maqsum on the darbuka; the frame drum marks the bar."""
    t = bar * BAR
    e = BEAT / 2
    song.add(t, drum(58, vol=0.5, dur=0.9, bend=0.6, decay=3.5))
    if not full:
        return
    for pos in (0, 4):
        song.add(t + pos * e, drum(92, vol=0.55, dur=0.45, bend=1.2, decay=7))
    for pos in (1, 3, 6):
        song.add(t + pos * e, drum(420, vol=0.24, dur=0.12, bend=0.4, decay=34))
    for pos in (2, 5, 7):
        song.add(t + pos * e + e / 2, drum(520, vol=0.09, dur=0.06, bend=0.2, decay=50))


def drone(song):
    """E and B, in eight-bar sweeps so the pad breathes."""
    for b in range(0, BARS, 8):
        song.add(b * BAR, pad([40, 47, 52], 8 * BAR + 1.5, kind='saw', vol=0.11, attack=2.5, release=2.5, cutoff=700, spread=6.0))


def build():
    song = Song(BARS * BAR)
    drone(song)
    for bar in range(BARS):
        quiet = bar < 4 or bar >= 28
        if not 12 <= bar < 20:
            ostinato(song, bar, vol=0.24 if quiet else 0.3)
        drums(song, bar, full=4 <= bar < 28)
    ney_phrase(song, 4, NEY_A, vol=0.2)
    taqsim(song, 12)
    ney_phrase(song, 20, NEY_B, vol=0.2)
    return song


def trim(length):
    """loudnorm leaves about a quarter second of near-silence after the
    music; cut the file back to the song's exact length so the loop has no
    gap."""
    out = os.path.join(ROOT, 'internal/generator/templates/themes/pharaoh/ambient.ogg')
    with tempfile.TemporaryDirectory() as d:
        tmp = os.path.join(d, 'trim.ogg')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', out, '-af', 'atrim=end=%.4f' % length,
                        '-c:a', 'libvorbis', '-q:a', '3', tmp], check=True)
        os.replace(tmp, out)
    print('trimmed to', round(length, 2), 's,', os.path.getsize(out) // 1024, 'KiB')


if __name__ == '__main__':
    render('pharaoh', build(), echo='0.8:0.75:90|240:0.3|0.18', quality=3)
    trim(BARS * BAR)
