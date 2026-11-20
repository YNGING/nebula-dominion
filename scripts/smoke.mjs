// Smoke test: avvia il gioco buildato, entra in partita, prova qualche comando e salva screenshot.
// Uso: npm run build && npm run smoke  (richiede "npx vite preview" su PREVIEW_URL o la avvia da solo)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

// Playwright non è una dipendenza del progetto: si usa quello installato nel sistema.
const { chromium } = createRequire(import.meta.url)('playwright');

const PORT = 4179;
const URL = process.env.PREVIEW_URL ?? `http://localhost:${PORT}/`;
const OUT = process.env.SHOTS ?? 'screenshots';
mkdirSync(OUT, { recursive: true });

const server = process.env.PREVIEW_URL
  ? null
  : spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(URL);
      if (r.ok) return;
    } catch {
      /* non ancora pronto */
    }
    await sleep(200);
  }
  throw new Error('preview non raggiungibile');
}

const errors = [];
let browser;
try {
  await waitServer();
  browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForFunction(() => window.__game?.scene?.isActive('Menu'), null, { timeout: 15000 });
  await page.mouse.move(720, 420);
  await sleep(800);
  await page.screenshot({ path: `${OUT}/1-menu.png` });

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.scene.isActive('Hud'), null, { timeout: 10000 });
  const cam0 = await page.evaluate(() => {
    const c = window.__game.scene.getScene('Game').cameras.main;
    return [c.scrollX, c.scrollY];
  });
  await sleep(1500);
  const cam1 = await page.evaluate(() => {
    const c = window.__game.scene.getScene('Game').cameras.main;
    return [c.scrollX, c.scrollY];
  });
  if (cam0[0] !== cam1[0] || cam0[1] !== cam1[1]) errors.push(`la camera si è mossa da sola: ${cam0} -> ${cam1}`);
  const renderer = await page.evaluate(() => (window.__game.renderer.type === 2 ? 'WebGL' : 'Canvas'));
  await page.screenshot({ path: `${OUT}/2-start.png` });

  // seleziona la Nave Madre e produce un caccia e un minatore
  await page.evaluate(() => (window.__game.scene.getScene('Game').world.factions[0].minerals = 1000));
  await page.keyboard.press('KeyC');
  await sleep(200);
  await page.keyboard.press('KeyW');
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('Shift+KeyQ');
  await sleep(300);
  const researching = await page.evaluate(() => window.__game.scene.getScene('Game').world.factions[0].researching?.track ?? null);
  if (researching !== 'weapons') errors.push(`ricerca non avviata con Shift+Q (${researching})`);
  await page.mouse.move(1290, 790);
  await sleep(300);
  await page.screenshot({ path: `${OUT}/3-production.png` });

  // accelera la partita e lascia lavorare la simulazione
  await page.evaluate(() => {
    const gs = window.__game.scene.getScene('Game');
    gs.speedIndex = 4;
  });
  await sleep(6000);
  // selezione a riquadro attorno alla base e ordine di attacco-movimento verso il centro
  await page.keyboard.press('KeyZ');
  await page.keyboard.press('KeyA');
  await page.mouse.click(900, 300);
  await sleep(4000);
  await page.keyboard.press('F1');
  await sleep(300);
  await page.screenshot({ path: `${OUT}/4-help.png` });
  await page.keyboard.press('Escape');

  const state = await page.evaluate(() => {
    const gs = window.__game.scene.getScene('Game');
    const w = gs.world;
    return {
      tick: w.tick,
      units: w.units.length,
      mine: w.units.filter((u) => u.faction === 0).map((u) => u.kind),
      minerals: Math.round(w.factions[0].minerals),
      doctrines: w.factions.map((f) => f.doctrine),
      research: w.factions[0].researching,
    };
  });

  // partita veloce IA contro IA in modalità spettatore fino alla fine
  await page.evaluate(() => {
    const game = window.__game;
    game.scene.getScene('Hud').scene.stop();
    game.scene.start('Game', { mapId: 'orione', aiCount: 3, difficulty: 'hard', spectate: true, seed: 3 });
  });
  await sleep(1500);
  await page.evaluate(() => {
    const gs = window.__game.scene.getScene('Game');
    gs.cameras.main.setZoom(0.45);
    gs.centerOn(gs.world.width / 2, gs.world.height / 2);
    gs.speedIndex = 4;
  });
  await sleep(12000);
  await page.screenshot({ path: `${OUT}/5-battle.png` });
  // salta in avanti nel tempo facendo girare la simulazione direttamente
  const result = await page.evaluate(() => {
    const gs = window.__game.scene.getScene('Game');
    let n = 0;
    while (!gs.world.over && n < 20 * 60 * 40) {
      gs.match.step();
      for (const e of gs.world.events) gs.onEvent(e);
      n++;
    }
    return { over: gs.world.over, winner: gs.world.winner, minutes: (gs.world.tick / 1200).toFixed(1) };
  });
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/6-gameover.png` });

  console.log(JSON.stringify({ renderer, state, result, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill();
}
