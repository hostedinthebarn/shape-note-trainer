# Sing the Shapes

Sight-read 7-shape (Aikin) notation by singing into your phone. The app gives you do, you sing each note, and it listens, using the shapes of *Songs of Faith and Praise*. Free, no account, and it works offline once opened.

**Use it:** [sing.hostedinthebarn.com](https://sing.hostedinthebarn.com/). On a phone, add it to your Home Screen.

**How it was built:** Claude planned the pieces and wrote the tests; a local model (qwen3-coder, on a MacBook) wrote every file in `src/core/` against those tests. The story is on the [Hosted in the Barn blog](https://hostedinthebarn.com/).

**Privacy:** everything happens on the phone. The microphone audio is analysed in the browser and never sent anywhere; settings and practice history stay in the browser's local storage. The site sets no cookies and loads no analytics.

- **Vocabulary:** [CONTEXT.md](CONTEXT.md)
- **Layout:**
  - `src/types.ts` holds the shared types.
  - `src/core/` is pure logic. Each file was written by a local model (qwen3-coder) from a packet and its tests.
  - `src/shell/` is the browser side: audio, screens and storage.
  - `static/` holds the hand-written static files.
- **Build:** `npm run build` (or `node --no-warnings build.mjs`). It strips types into `public/js/`, copies the `STATIC` allowlist, rejects any other file type and aborts on secret patterns. **Only `public/` is ever deployed.**
- **Tests:** `npm test` (`node --test`, Node ≥ 23.6). There are no dependencies.
- **Prototypes:** the throwaway branches `prototype/sw37-singing` and `prototype/sw38-screens`.

## Deploy

`npm run deploy` runs the tests, builds `public/` (the allowlist and secret scan in `build.mjs`) and uploads it as a static-assets Cloudflare Worker (`wrangler.jsonc`). `public/` is the only thing uploaded; there's no Worker script.

## Licence

MIT, see [LICENSE](LICENSE). The music font is [Bravura](https://github.com/steinbergmedia/bravura) by Steinberg, under the SIL Open Font License (`static/font/OFL.txt`).
