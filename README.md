# Shape-note trainer

Sight-read 7-shape (Aikin) notation by singing into your phone. The app gives you do, you sing each note, and it listens, using the shapes of *Songs of Faith and Praise*. It's built for one congregation and personal practice; it isn't a public product.

- **Vocabulary:** [CONTEXT.md](CONTEXT.md)
- **Layout:**
  - `src/types.ts` holds the shared types.
  - `src/core/` is pure logic. Each file was written by a local model (qwen3-coder) from a packet and its tests.
  - `src/shell/` is the browser side: audio, screens and storage.
  - `static/` holds the hand-written static files.
- **Build:** `npm run build` (or `node --no-warnings build.mjs`). It strips types into `public/js/`, copies the `STATIC` allowlist, rejects any other file type and aborts on secret patterns. **Only `public/` is ever deployed.**
- **Tests:** `npm test` (`node --test`, Node ≥ 23.6). There are no dependencies.
- **Prototypes:** the throwaway branches `prototype/sw37-singing` and `prototype/sw38-screens`.
