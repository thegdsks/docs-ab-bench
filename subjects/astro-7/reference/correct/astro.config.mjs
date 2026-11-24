import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import { remarkReadingTime } from './remark-reading-time.mjs';

// Astro 7 renders Markdown with its native pipeline by default; remark
// plugins need the unified() processor from @astrojs/markdown-remark.
export default defineConfig({
  markdown: {
    processor: unified({ remarkPlugins: [remarkReadingTime] }),
  },
});
