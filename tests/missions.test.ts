import { describe, expect, it } from 'vitest';
import type { UnitKind } from '../src/data/units';
import { CAMPAIGN, TUTORIAL_STEPS } from '../src/game/missions/campaign';
import { Match } from '../src/game/Match';
import { issueCommand } from '../src/sim/commands';

const start = (id: string) => new Match({ mapId: '', aiCount: 0, difficulty: 'normal', mode: 'mission', missionId: id });
const run = (m: Match, seconds: number, until?: () => boolean) => {
  for (let i = 0; i < seconds * 20 && !m.world.over; i++) {
    m.step();
    if (until?.()) return;
  }
};

describe('missioni', () => {
  for (const def of CAMPAIGN) {
    it(`"${def.title}" si carica e gira 90 secondi`, () => {
      const m = start(def.id);
      expect(m.mission).not.toBeNull();
      expect(m.mission!.objectives.length).toBeGreaterThan(0);
      run(m, 90);
      expect(m.world.tick).toBeGreaterThan(0);
    });
  }

  it('il tutorial si completa passo per passo', () => {
    const m = start('tutorial');
    const w = m.world;
    const c = m.mission!;
    let travel = 0;
    let selected: UnitKind[] = [];
    c.ui = { selectedKinds: () => selected, cameraTravel: () => travel };
    const mother = w.mothershipOf(0)!;
    const steps: number[] = [];
    const advance = (seconds: number) => run(m, seconds, () => w.over);
    // 1: camera
    travel = 500;
    advance(0.2);
    steps.push(c.data.step);
    // 2: selezione della Nave Madre
    selected = ['mothership'];
    advance(0.2);
    // 3: un minatore
    issueCommand(w, 0, { type: 'build', structureId: mother.id, kind: 'miner' });
    advance(8);
    // 4: minerali (i minatori lavorano da soli)
    advance(90);
    expect(c.data.step).toBeGreaterThanOrEqual(4);
    // 5: 4 caccia
    for (let i = 0; i < 4; i++) issueCommand(w, 0, { type: 'build', structureId: mother.id, kind: 'fighter' });
    advance(15);
    // 6: selezione dei caccia
    selected = ['fighter', 'fighter', 'fighter', 'fighter'];
    advance(0.2);
    // 7: conquista di Alfa
    const alfa = w.planets[0];
    const fighters = w.units.filter((u) => u.faction === 0 && u.kind === 'fighter').map((u) => u.id);
    issueCommand(w, 0, { type: 'move', ids: fighters, x: alfa.x + 80, y: alfa.y });
    advance(40);
    expect(alfa.owner).toBe(0);
    // 8: torretta
    issueCommand(w, 0, { type: 'buildTurret', planetId: alfa.id });
    advance(14);
    // 9: ricerca
    issueCommand(w, 0, { type: 'research', track: 'weapons' });
    advance(0.2);
    expect(c.data.step).toBe(TUTORIAL_STEPS.length - 1);
    // 10: avamposto pirata (si aiuta la flotta con qualche Fregata)
    const fleet = [...fighters, ...c.spawn('frigate', 0, 1800, 1000, 4).map((u) => u.id)];
    issueCommand(w, 0, { type: 'attackMove', ids: fleet, x: 2650, y: 1050 });
    advance(120);
    expect(w.over).toBe(true);
    expect(w.winner).toBe(0);
  }, 60_000);

  it('Corsa ai minerali: vittoria a 6000 minerali e regole sulle navi', () => {
    const m = start('minerali');
    const w = m.world;
    const mother = w.mothershipOf(0)!;
    w.factions[0].minerals = 1000;
    expect(issueCommand(w, 0, { type: 'build', structureId: mother.id, kind: 'battleship' })).toMatch(/missione/);
    expect(issueCommand(w, 0, { type: 'build', structureId: mother.id, kind: 'frigate' })).toBeNull();
    w.factions[0].stats.mined = 6000;
    run(m, 0.2);
    expect(w.over).toBe(true);
    expect(w.winner).toBe(0);
  });

  it('Testa di ponte: vittoria con 3 pianeti, sconfitta allo scadere del tempo', () => {
    const a = start('testa-di-ponte');
    for (const id of [0, 1, 5]) a.world.planets[id].owner = 0;
    run(a, 0.2);
    expect(a.world.winner).toBe(0);
    const b = start('testa-di-ponte');
    b.mission!.timer!.endTick = b.world.tick + 2;
    run(b, 1);
    expect(b.world.over).toBe(true);
    expect(b.world.winner).toBeNull();
    expect(b.world.overReason).toMatch(/Tempo scaduto/);
  });

  it('Assedio: dopo le ondate si passa al contrattacco', () => {
    const m = start('assedio');
    const c = m.mission!;
    expect(m.world.units.filter((u) => u.faction === 0 && u.kind === 'turret')).toHaveLength(4);
    run(m, 50);
    expect(m.world.units.some((u) => u.faction === 2)).toBe(true);
    c.timer!.endTick = m.world.tick + 1;
    run(m, 0.5);
    expect(c.data.phase).toBe(2);
    expect(c.status('destroy')).toBe('active');
    m.world.eliminate(1);
    run(m, 0.2);
    expect(m.world.winner).toBe(0);
  });

  it("Scorta: vittoria all'arrivo, sconfitta se l'ammiraglia cade", () => {
    const a = start('scorta');
    const f = a.mission!.byTag('flagship')!;
    expect(f.maxHp).toBe(1500);
    f.x = 4650;
    f.y = 900;
    run(a, 0.2);
    expect(a.world.winner).toBe(0);
    const b = start('scorta');
    b.world.kill(b.mission!.byTag('flagship')!);
    run(b, 0.2);
    expect(b.world.over).toBe(true);
    expect(b.world.winner).toBeNull();
  });

  it("Dominio: l'alleato non viene attaccato e la vittoria arriva con i due nemici eliminati", () => {
    const m = start('dominio');
    const w = m.world;
    expect(w.isEnemy(0, 1)).toBe(false);
    expect(w.isEnemy(2, 3)).toBe(false);
    expect(w.isEnemy(1, 2)).toBe(true);
    run(m, 240);
    expect(w.factions[1].alive).toBe(true);
    expect(w.over).toBe(false);
    w.eliminate(2);
    w.eliminate(3);
    run(m, 0.2);
    expect(w.winner).toBe(0);
  });
});
