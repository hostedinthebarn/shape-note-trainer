---
component: hold-gap
root: ../..
target: src/core/hold.ts
tests: src/core/hold.test.ts
neighbours: packets/hold-gap/hold.prev.ts
---

# Packet: hold, one fix (SW-58 review)

## Task

`hold.prev.ts` (included below) is the current, working `src/core/hold.ts`. It passes every test except one. Return the **whole file**, identical to `hold.prev.ts` except for this one change. Do not rename, reorder, reformat or "improve" anything else.

## The change

In `holdReading()`, in the **voiced** branch only, when a gap resets the hold (the `if (gap)` block: `lastVoiced !== null && t - lastVoiced > GAP_MS`), also empty the median window: `newH.window = []`, before the new reading is added. Do **not** touch the window in the unvoiced (`err === null`) branch: `recentMedian()` must keep showing the last voiced readings through a silence until they age out. Going out of band still resets start, heldMs and errs but keeps the window.

Why: readings from before a gap must never judge readings after it. A wrong note (300 cents) from 0 to 200, unvoiced readings from 210 to 330, then the right note (0 cents) from 340 must start the hold at 340 and accept it at 640 with cents 0.

## Constraints

Same as the original: pure (never change the input hold; copy it first, as `hold.prev.ts` does), no imports. Output one TypeScript code block containing the complete `src/core/hold.ts`. `hold.prev.ts` is reference only: don't import it.
