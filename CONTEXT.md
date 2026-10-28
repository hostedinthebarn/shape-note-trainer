# Shape-note trainer

A practice app where congregation singers sing 7-shape (Aikin) notation into their phone's microphone and get feedback, note by note. This is the glossary agreed during the design map (2026-10-27/28). It is a glossary only: no implementation detail. The master copy lives in Gary's notes vault; keep the two in step.

## Language

**Level**:
One of the graded tiers of difficulty, 1–8, matching the existing drill scores.
_Avoid_: stage, grade, lesson

**Exercise**:
One short phrase for the singer to sing, in a given key and clef, belonging to a level.
_Avoid_: drill (as a technical term), phrase, question

**Attempt**:
One singing of an exercise into the microphone.
_Avoid_: take, try, run

**Note result**:
The judgement on one note of an attempt: **unaided** (held in tune with no help beyond replaying do), **helped** (held in tune after "play this note" was used) or **skipped** (the singer moved on without it). An in-tune note also carries how far sharp or flat it was and how long it took to settle.
_Avoid_: grade, mark, pass/fail (for a single note)

**In tune**:
A note's sung pitch, judged against the given do, staying within the band (±50 cents, or ±25 in strict mode) for the hold time. The note's octave doesn't matter.
_Avoid_: correct, right (when the pitch test is meant)

**Voice part**:
The line a singer sings: soprano, alto, tenor or bass. It sets the clef (soprano and alto treble, tenor and bass bass clef, as in *Songs of Faith and Praise*) and a default pitch of do.
_Avoid_: voice type, range (as a name for the part)

**Pitch of do**:
The singer's comfortable do (for a tenor, about C4). The singer's range runs from sol below it to do above it.
_Avoid_: tonic (when the singer's setting is meant), home note

**Key**:
The major key an exercise is written in, shown by its key signature. It is chosen near the singer's pitch of do, so the key varies while the pitch stays comfortable. The shapes never change with the key.
_Avoid_: scale, tonality

**Clean attempt**:
An attempt in which every note result is unaided. Three in a row at a level prompt a suggestion to move up; levels are never locked.
_Avoid_: pass, perfect

**Strict mode**:
A setting the singer chooses that narrows the in-tune band. It is never imposed by the level.
_Avoid_: hard mode, advanced

**Degree**:
A movable-do syllable (do, re, mi, fa, sol, la, ti). It determines the shape shown; the key determines the pitch.
_Avoid_: solfège note, syllable (when the scale position is meant)

**Shape**:
The notehead form that stands for a degree in 7-shape (Aikin) notation.
_Avoid_: notehead (when the shape itself is meant)

## Informal

"Drill" means the practice activity in general and isn't a technical term. "Packet" is a build-process term (see the build log) and isn't part of the app's language.
