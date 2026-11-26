import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const routes = JSON.parse(readFileSync(resolve(root, 'data/2027/tdf2027-routes.json'), 'utf8'));

async function waitFor(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the Tour de France 2027 page');
}

describe('Tour de France 2027 page (full route)', () => {
  it('renders all 21 stages, the stats bar and illustrative profiles', async () => {
    let html = readFileSync(resolve(root, '2027/tdf.html'), 'utf8');
    for (const f of ['race-page', 'tour-page']) {
      const js = readFileSync(resolve(root, `dist/${f}.js`), 'utf8');
      html = html.replace(
        `<script src="../dist/${f}.js"></script>`,
        () => `<script>${js}</script>`,
      );
    }
    const errors: unknown[] = [];
    const page = new JSDOM(html, {
      url: 'https://example.test/2027/tdf.html',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.addEventListener('error', (event) => errors.push(event.error ?? event.message));
        window.HTMLElement.prototype.scrollIntoView = () => {}; // missing in jsdom
        (window as any).fetch = async (url: string) =>
          url === '../data/2027/tdf2027-routes.json'
            ? { ok: true, json: async () => routes }
            : { ok: false, status: 404, json: async () => ({}) };
      },
    });
    try {
      const { document } = page.window;
      await waitFor(() => document.querySelectorAll('#stageList .stage-btn').length === 21);
      expect(document.querySelectorAll('#stageList .rest-row').length).toBe(3);
      const stats = [...document.querySelectorAll('#topstats .statcell .value')].map(
        (el) => el.textContent,
      );
      expect(stats).toEqual(['3,479 km', '53,450 m', '21', '3', '3']);

      // Stage 9 has no traced profile and an unknown climb position.
      const btn = [...document.querySelectorAll<HTMLElement>('#stageList .stage-btn')][8];
      btn.click();
      const panel = document.getElementById('panel')!;
      expect(panel.textContent).toContain('Grand Colombier');
      const svg = panel.querySelector('svg.profile');
      expect(svg).not.toBeNull();
      expect(svg!.outerHTML).not.toContain('NaN');
      expect(panel.textContent).not.toMatch(/NaN|undefined|null/);
      expect(errors).toEqual([]);
    } finally {
      page.window.close();
    }
  });
});
