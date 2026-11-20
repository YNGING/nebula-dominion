import { FACTION_STYLES, INVADER_STYLE } from '../../data/factions';
import { getMap, type FieldDef, type MapDef, type PlanetDef } from '../../data/maps';
import type { UnitKind } from '../../data/units';
import { dist } from '../../sim/math';
import type { FactionSetup } from '../../sim/World';
import { waveComposition } from '../modes/SurvivalController';
import type { MissionController } from './MissionController';
import type { HighlightArea, MissionDef } from './types';

const VEGA = 'Ammiraglio Vega';
const OPS = 'Ufficiale operativo';

const BLUE = FACTION_STYLES[0];
const RED = FACTION_STYLES[1];
const GREEN = FACTION_STYLES[2];
const AMBER = FACTION_STYLES[3];

const player = (extra: Partial<FactionSetup> = {}): FactionSetup => ({
  name: 'Tu',
  color: BLUE.color,
  controller: 'human',
  difficulty: 'normal',
  doctrine: null,
  ...extra,
});

const pirates = (extra: Partial<FactionSetup> = {}): FactionSetup => ({
  name: 'Pirati di Kessel',
  color: RED.color,
  controller: 'ai',
  difficulty: 'normal',
  doctrine: null,
  invader: true,
  noBase: true,
  team: 1,
  ...extra,
});

const planet = (name: string, x: number, y: number, radius: number, income: number, supply: number, style: number): PlanetDef => ({
  name,
  x,
  y,
  radius,
  income,
  supply,
  style,
});
const field = (x: number, y: number, count: number, amount = 1200, spread = 140): FieldDef => ({ x, y, count, amount, spread });

function customMap(id: string, name: string, width: number, height: number, spawns: { x: number; y: number }[], planets: PlanetDef[], fields: FieldDef[]): MapDef {
  return { id, name, description: '', width, height, maxPlayers: spawns.length, spawns, planets, fields };
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ======================================================================= 0. Addestramento

interface TutorialStep {
  text: string;
  goal: string;
  highlight: HighlightArea;
  beacon?: (c: MissionController) => { x: number; y: number } | null;
  enter?: (c: MissionController) => void;
  done: (c: MissionController) => boolean;
}

/** Garantisce al giocatore almeno `min` minerali per il passo del tutorial. */
function topUp(c: MissionController, min: number): void {
  const f = c.world.factions[c.player];
  if (f.minerals < min) {
    f.minerals = min;
    c.say(OPS, 'Il comando ci ha inviato dei minerali per questa esercitazione.');
  }
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    text: 'Benvenuto, comandante. Iniziamo dalla visuale: muovila con le frecce, portando il mouse ai bordi dello schermo oppure cliccando sulla minimappa.',
    goal: 'Muovi la visuale',
    highlight: 'minimap',
    done: (c) => c.ui.cameraTravel() > 400,
  },
  {
    text: 'Questa è la nostra Nave Madre: produce le navi e raccoglie i minerali. Selezionala con un clic, oppure premi C.',
    goal: 'Seleziona la Nave Madre',
    highlight: null,
    beacon: (c) => c.world.mothershipOf(c.player),
    done: (c) => c.ui.selectedKinds().includes('mothership'),
  },
  {
    text: 'In basso a destra c\'è la scheda comandi. Costruisci un Minatore con il pulsante Q.',
    goal: 'Costruisci un Minatore',
    highlight: 'card',
    done: (c) => c.unitsOf(c.player, 'miner').length >= 3,
  },
  {
    text: 'I Minatori estraggono da soli dagli asteroidi e portano i minerali alla Nave Madre. Il totale è in alto a sinistra: raccogline 150.',
    goal: 'Raccogli 150 minerali',
    highlight: 'resources',
    enter: (c) => (c.data.minedBase = c.world.factions[c.player].stats.mined),
    done: (c) => {
      const got = c.world.factions[c.player].stats.mined - c.data.minedBase;
      c.setProgress('step', `${Math.floor(Math.min(150, got))}/150`);
      return got >= 150;
    },
  },
  {
    text: 'Ci servono navi da combattimento. Con la Nave Madre selezionata costruisci 4 Caccia (W): sono veloci e ottimi contro Minatori e Corazzate.',
    goal: 'Costruisci 4 Caccia',
    highlight: 'card',
    enter: (c) => topUp(c, 240),
    done: (c) => {
      const n = c.unitsOf(c.player, 'fighter').length;
      c.setProgress('step', `${Math.min(4, n)}/4`);
      return n >= 4;
    },
  },
  {
    text: 'Seleziona i Caccia: trascina un riquadro attorno a loro tenendo premuto il tasto sinistro, oppure premi Z per selezionare tutta la flotta.',
    goal: 'Seleziona i Caccia',
    highlight: null,
    done: (c) => c.ui.selectedKinds().filter((k) => k === 'fighter').length >= Math.min(4, c.unitsOf(c.player, 'fighter').length),
  },
  {
    text: 'Vedi il pianeta Alfa? Con i Caccia selezionati, fai click destro vicino al pianeta: restando nella zona tratteggiata lo conquisteremo.',
    goal: 'Conquista il pianeta Alfa',
    highlight: null,
    beacon: (c) => c.world.planets[0],
    done: (c) => {
      const p = c.world.planets[0];
      if (p.progress > 0 && p.captureFaction === c.player) c.setProgress('step', `${Math.round(p.progress * 100)}%`);
      return p.owner === c.player;
    },
  },
  {
    text: 'Ottimo! I pianeti danno minerali e alzano il limite flotta. Proteggiamolo: seleziona il pianeta Alfa con un clic e costruisci una Torretta (Q).',
    goal: 'Costruisci una Torretta su Alfa',
    highlight: 'card',
    beacon: (c) => c.world.planets[0],
    enter: (c) => topUp(c, 160),
    done: (c) => c.unitsOf(c.player, 'turret').length >= 1,
  },
  {
    text: 'La Nave Madre può anche fare ricerca, una alla volta. Selezionala e usa la seconda riga di pulsanti (oppure Shift + Q, W, E, R, T).',
    goal: 'Avvia una ricerca',
    highlight: 'card',
    enter: (c) => topUp(c, 160),
    done: (c) => {
      const f = c.world.factions[c.player];
      return !!f.researching || Object.values(f.research).some((v) => v > 0);
    },
  },
  {
    text: 'Ultimo esercizio: un avamposto pirata a est. Seleziona la flotta, premi A e clicca sull\'avamposto: le navi avanzeranno attaccando tutto ciò che incontrano. Costruisci altre navi se serve!',
    goal: "Distruggi l'avamposto pirata",
    highlight: null,
    beacon: () => ({ x: 2650, y: 1050 }),
    enter: (c) => topUp(c, 300),
    done: (c) => {
      const left = c.unitsOf(1).length;
      c.setProgress('step', `${left} rimasti`);
      return left === 0;
    },
  },
];

function enterStep(c: MissionController, i: number): void {
  const s = TUTORIAL_STEPS[i];
  c.data.step = i;
  c.clearObjectives();
  c.objective('step', `Passo ${i + 1}/${TUTORIAL_STEPS.length}: ${s.goal}`);
  c.say(VEGA, s.text);
  c.setHighlight(s.highlight);
  s.enter?.(c);
  const b = s.beacon?.(c);
  c.setBeacon(b ?? null);
}

const tutorial: MissionDef = {
  id: 'tutorial',
  title: 'Addestramento',
  subtitle: 'Le basi del comando',
  briefing: [
    'Comandante, benvenuto nella Lega Azzurra.',
    "Prima di affidarti una flotta, l'Ammiraglio Vega ti guiderà passo per passo:",
    'visuale, produzione, minerali, conquista dei pianeti, torrette, ricerca e combattimento.',
    'Segui le istruzioni nel riquadro in basso e gli obiettivi in alto a sinistra.',
  ],
  seed: 101,
  map: () =>
    customMap(
      'm-tutorial',
      'Poligono di Vesta',
      3200,
      2000,
      [{ x: 520, y: 1000 }],
      [planet('Alfa', 1300, 640, 48, 2, 8, 2), planet('Beta', 2600, 1350, 50, 2, 8, 0), planet('Gamma', 1500, 1560, 44, 1.5, 8, 3)],
      [field(900, 760, 5), field(880, 1300, 4), field(1900, 950, 5, 1500)],
    ),
  factions: [player({ minerals: 400 }), pirates()],
  setup(c) {
    // avamposto pirata: una torretta e tre Caccia di guardia
    c.spawn('turret', 1, 2650, 1050);
    c.spawn('fighter', 1, 2560, 980, 3);
    enterStep(c, 0);
  },
  update(c) {
    const i = c.data.step;
    const s = TUTORIAL_STEPS[i];
    // il segnale segue il bersaglio (es. la Nave Madre)
    const b = s.beacon?.(c);
    if (b) c.setBeacon(b);
    if (!s.done(c)) return;
    c.complete('step');
    if (i + 1 >= TUTORIAL_STEPS.length) {
      c.say(VEGA, 'Addestramento completato. Sei pronto per il tuo primo comando!');
      c.win();
      return;
    }
    enterStep(c, i + 1);
  },
};

// ======================================================================= 1. Corsa ai minerali

const MINERAL_GOAL = 6000;

const mineralRush: MissionDef = {
  id: 'minerali',
  title: 'Corsa ai minerali',
  subtitle: 'Estrai 6000 minerali sotto le incursioni pirata',
  briefing: [
    'La flotta ha bisogno di minerali, in fretta.',
    'Estrai 6000 minerali dalla Fascia di Kessel. I pirati attaccheranno i nostri Minatori',
    'con incursioni sempre più numerose: proteggili con Caccia, Fregate e torrette.',
    'Disponibili: Minatori, Caccia, Fregate. Obiettivo facoltativo: perdere al massimo 5 Minatori.',
  ],
  seed: 202,
  map: () =>
    customMap(
      'm-minerali',
      'Fascia di Kessel',
      3600,
      2400,
      [{ x: 600, y: 1200 }],
      [planet('Kessel I', 1500, 1200, 50, 2, 8, 0), planet('Kessel II', 2900, 600, 46, 2, 8, 2), planet('Kessel III', 2900, 1800, 46, 2, 8, 3)],
      [field(980, 980, 5), field(980, 1440, 5), field(1700, 600, 6, 1500), field(1700, 1800, 6, 1500), field(2500, 1200, 6, 1500)],
    ),
  factions: [player({ minerals: 300 }), pirates()],
  rules: { allowedShips: ['miner', 'fighter', 'frigate'] },
  setup(c) {
    c.objective('mine', `Estrai ${MINERAL_GOAL} minerali`, { progress: `0/${MINERAL_GOAL}` });
    c.objective('miners', 'Perdi al massimo 5 Minatori', { optional: true, progress: '0/5' });
    c.say(VEGA, 'Avvia subito altri Minatori. Le prime incursioni pirata arriveranno da est entro poco più di un minuto.');
    c.data.raid = 0;
    c.data.nextRaid = 70;
    c.data.lostMiners = 0;
  },
  update(c) {
    const w = c.world;
    const mined = w.factions[c.player].stats.mined;
    c.setProgress('mine', `${Math.floor(Math.min(MINERAL_GOAL, mined))}/${MINERAL_GOAL}`);

    // conteggio dei Minatori persi
    const miners = new Set(c.unitsOf(c.player, 'miner').map((u) => u.id));
    for (const k of Object.keys(c.data)) {
      if (!k.startsWith('m') || !/^m\d+$/.test(k)) continue;
      const id = Number(k.slice(1));
      if (!miners.has(id)) {
        delete c.data[k];
        c.data.lostMiners++;
      }
    }
    for (const id of miners) c.data[`m${id}`] = 1;
    c.setProgress('miners', `${c.data.lostMiners}/5`);
    if (c.data.lostMiners > 5) c.fail('miners');

    if (mined >= MINERAL_GOAL) {
      c.say(VEGA, 'Stive piene. Ottimo lavoro, comandante!');
      if (c.status('miners') === 'active') c.complete('miners');
      c.win();
      return;
    }

    // incursioni dal bordo est verso i campi con più Minatori
    if (c.elapsed >= c.data.nextRaid) {
      c.data.raid++;
      c.data.nextRaid = c.elapsed + Math.max(35, 55 - c.data.raid * 2);
      const n = c.data.raid;
      const y = w.rng.range(300, w.height - 300);
      const raiders = c.spawn('fighter', 1, w.width - 120, y, 2 + n);
      if (n >= 4) raiders.push(...c.spawn('frigate', 1, w.width - 160, y + 80, Math.floor(n / 4)));
      const target = c.unitsOf(c.player, 'miner')[0] ?? w.mothershipOf(c.player);
      if (target) c.attackMove(raiders, target.x, target.y);
      c.say(OPS, `Incursione pirata in arrivo da est: ${raiders.length} navi!`);
    }
    // i pirati inattivi ripartono verso i Minatori
    if (w.tick % 60 === 0) {
      const idle = c.unitsOf(1).filter((u) => u.order.type === 'idle');
      const target = c.unitsOf(c.player, 'miner')[0] ?? w.mothershipOf(c.player);
      if (idle.length && target) c.attackMove(idle, target.x, target.y);
    }
  },
};

// ======================================================================= 2. Testa di ponte

const PLANET_GOAL = 3;
const BRIDGE_TIME = 600;

const bridgehead: MissionDef = {
  id: 'testa-di-ponte',
  title: 'Testa di ponte',
  subtitle: 'Possiedi 3 pianeti entro 10 minuti',
  briefing: [
    "L'Impero Cremisi sta allungando le mani sulla Nebulosa Gemella.",
    'Dobbiamo stabilire una testa di ponte prima di loro: possiedi 3 pianeti',
    'contemporaneamente entro 10 minuti. Il nemico è giovane ma non starà a guardare.',
  ],
  seed: 303,
  map: () => getMap('gemella'),
  factions: [player(), { name: RED.name, color: RED.color, controller: 'ai', difficulty: 'easy', doctrine: 'armor' }],
  spawnOrder: [0, 1],
  setup(c) {
    c.objective('planets', `Possiedi ${PLANET_GOAL} pianeti contemporaneamente`, { progress: `0/${PLANET_GOAL}` });
    c.setTimer('Tempo rimasto', BRIDGE_TIME);
    c.say(VEGA, 'Kepler e Ganimede sono vicini alla nostra base. Il pianeta centrale vale di più, ma è conteso.');
  },
  update(c) {
    const owned = c.ownedPlanets();
    c.setProgress('planets', `${Math.min(owned, PLANET_GOAL)}/${PLANET_GOAL}`);
    if (owned >= PLANET_GOAL) {
      c.say(VEGA, 'Testa di ponte stabilita. La Nebulosa Gemella è nostra!');
      c.win();
    } else if (c.timeLeft() <= 0) {
      c.fail('planets');
      c.lose('Tempo scaduto: la testa di ponte non è stata stabilita.');
    }
  },
};

// ======================================================================= 3. Assedio

const SIEGE_TIME = 480;

const siege: MissionDef = {
  id: 'assedio',
  title: 'Assedio',
  subtitle: 'Resisti 8 minuti, poi contrattacca',
  briefing: [
    "Lo Sciame del Vuoto si è alleato con l'Impero Cremisi.",
    'Per 8 minuti le loro ondate colpiranno i nostri pianeti fortificati: resisti.',
    'Quando le ondate si esauriranno, contrattacca e distruggi la Nave Madre cremisi.',
  ],
  seed: 404,
  map: () =>
    customMap(
      'm-assedio',
      'Bastione di Orfeo',
      4000,
      2600,
      [
        { x: 550, y: 1300 },
        { x: 3450, y: 1300 },
      ],
      [
        planet('Orfeo', 1150, 750, 48, 2, 8, 0),
        planet('Euridice', 1150, 1850, 48, 2, 8, 2),
        planet('Lete', 2000, 1300, 80, 3, 12, 1),
        planet('Stige', 2850, 750, 48, 2, 8, 3),
        planet('Acheronte', 2850, 1850, 48, 2, 8, 0),
      ],
      [field(720, 900, 5), field(720, 1700, 5), field(3280, 900, 5), field(3280, 1700, 5), field(2000, 650, 5, 1500), field(2000, 1950, 5, 1500)],
    ),
  factions: [
    player({ minerals: 500 }),
    { name: RED.name, color: RED.color, controller: 'ai', difficulty: 'easy', doctrine: 'arsenal', team: 1 },
    { name: INVADER_STYLE.name, color: INVADER_STYLE.color, controller: 'ai', difficulty: 'normal', doctrine: null, team: 1, invader: true, noBase: true },
  ],
  spawnOrder: [0, 1],
  setup(c) {
    c.givePlanet(0, c.player, 2);
    c.givePlanet(1, c.player, 2);
    c.objective('hold', 'Resisti alle ondate', { progress: fmt(SIEGE_TIME) });
    c.setTimer('Fine delle ondate', SIEGE_TIME);
    c.say(VEGA, 'Orfeo ed Euridice sono fortificati. Prepara la flotta: la prima ondata arriva tra 45 secondi.');
    c.data.wave = 0;
    c.data.nextWave = 45;
    c.data.phase = 1;
  },
  update(c) {
    const w = c.world;
    if (c.data.phase === 1) {
      c.setProgress('hold', fmt(c.timeLeft()));
      if (c.timeLeft() <= 0) {
        c.data.phase = 2;
        c.complete('hold');
        c.clearTimer();
        c.objective('destroy', 'Distruggi la Nave Madre cremisi');
        c.say(VEGA, 'Le ondate si sono esaurite. Ora contrattacca: distruggi la Nave Madre cremisi!');
        const m = w.mothershipOf(1);
        if (m) c.setBeacon(m);
        return;
      }
      if (c.elapsed >= c.data.nextWave) {
        c.data.wave++;
        c.data.nextWave = c.elapsed + 60;
        const kinds: UnitKind[] = waveComposition(c.data.wave + 1, 0.9, () => w.rng.next());
        const y = w.rng.range(400, w.height - 400);
        const wave = kinds.flatMap((k, i) => c.spawn(k, 2, w.width - 150, y + (i % 5) * 30 - 60));
        const targets = w.planets.filter((p) => p.owner === c.player);
        const t = targets[c.data.wave % Math.max(1, targets.length)] ?? w.mothershipOf(c.player);
        if (t) c.attackMove(wave, t.x, t.y);
        c.say(OPS, `Ondata ${c.data.wave} dello Sciame in arrivo!`);
      }
      if (w.tick % 60 === 0) {
        const idle = c.unitsOf(2).filter((u) => u.order.type === 'idle');
        const m = w.mothershipOf(c.player);
        if (idle.length && m) c.attackMove(idle, m.x, m.y);
      }
    } else if (!w.factions[1].alive) {
      c.complete('destroy');
      c.say(VEGA, "La Nave Madre cremisi è distrutta. L'assedio è spezzato!");
      c.win();
    }
  },
};

// ======================================================================= 4. Scorta

const ESCORT_GOAL = { x: 4700, y: 900 };

const escort: MissionDef = {
  id: 'scorta',
  title: 'Scorta',
  subtitle: "Porta l'Ammiraglia Aurora oltre il passaggio",
  briefing: [
    "L'Ammiraglia Aurora deve attraversare il Passaggio di Nyx, infestato dai pirati.",
    'Non hai una Nave Madre: hai solo la flotta di scorta. Porta l\'Aurora al segnale a est.',
    "L'Aurora è lenta ma resistente e ripara le navi vicine. Se viene distrutta, la missione fallisce.",
    "Consiglio: tieni le Fregate vicino all'Aurora e usa la Corazzata, a lunga gittata, contro le torrette.",
  ],
  seed: 505,
  map: () =>
    customMap(
      'm-scorta',
      'Passaggio di Nyx',
      5000,
      1800,
      [{ x: 300, y: 900 }],
      [planet('Nyx', 2000, 300, 60, 2, 8, 3), planet('Erebo', 3300, 1550, 56, 2, 8, 0)],
      [field(1200, 1500, 4), field(4000, 250, 4)],
    ),
  factions: [player({ noBase: true, minerals: 0 }), pirates({ noBase: true })],
  rules: { research: false, turrets: false },
  setup(c) {
    c.spawn('support', c.player, 320, 900, 1, { label: 'Ammiraglia Aurora', tag: 'flagship', hp: 1500 });
    c.spawn('fighter', c.player, 460, 780, 6);
    c.spawn('frigate', c.player, 460, 1020, 4, { spacing: 40 });
    c.spawn('battleship', c.player, 250, 1100);
    c.spawn('support', c.player, 220, 700);
    // difese pirata lungo la rotta
    c.spawn('turret', 1, 1800, 600);
    c.spawn('turret', 1, 1800, 1200);
    c.spawn('fighter', 1, 2600, 900, 6);
    c.spawn('frigate', 1, 3600, 800, 3, { spacing: 44 });
    c.spawn('battleship', 1, 3700, 1050);
    c.spawn('turret', 1, 4300, 650);
    c.objective('reach', "Porta l'Ammiraglia Aurora al segnale", { progress: '0%' });
    c.objective('alive', "L'Ammiraglia Aurora deve sopravvivere");
    c.setBeacon(ESCORT_GOAL);
    c.say(VEGA, "Seleziona l'Aurora e la scorta, poi procedi verso est. Le torrette pirata coprono l'ingresso del passaggio.");
    c.data.ambush = 0;
  },
  update(c) {
    const w = c.world;
    const f = c.byTag('flagship');
    if (!f) {
      c.fail('alive');
      c.fail('reach');
      c.lose("L'Ammiraglia Aurora è stata distrutta.");
      return;
    }
    const pct = Math.max(0, Math.min(1, (f.x - 320) / (ESCORT_GOAL.x - 320)));
    c.setProgress('reach', `${Math.round(pct * 100)}%`);
    if (dist(f.x, f.y, ESCORT_GOAL.x, ESCORT_GOAL.y) < 220) {
      c.complete('alive');
      c.say(VEGA, "L'Aurora ha superato il passaggio. Missione compiuta!");
      c.win();
      return;
    }
    // imboscate e rinforzi legati all'avanzata dell'Aurora
    if (c.data.ambush === 0 && f.x > 1500) {
      c.data.ambush = 1;
      const a = c.spawn('fighter', 1, f.x + 500, 80, 6);
      c.attack(a, f);
      c.say(OPS, "Imboscata da nord! Puntano all'Aurora!");
    } else if (c.data.ambush === 1 && f.x > 2500) {
      c.data.ambush = 2;
      c.spawn('frigate', c.player, 150, 800, 3, { spacing: 40 });
      c.spawn('fighter', c.player, 150, 1000, 4);
      c.say(VEGA, 'Rinforzi in arrivo da ovest: 3 Fregate e 4 Caccia. Raggiungeranno la scorta.');
      c.attackMove(c.unitsOf(c.player).filter((u) => u.x < 400 && u.tag !== 'flagship'), f.x, f.y);
    } else if (c.data.ambush === 2 && f.x > 3800) {
      c.data.ambush = 3;
      const b = [...c.spawn('frigate', 1, f.x + 200, w.height - 80, 2), ...c.spawn('fighter', 1, f.x + 260, w.height - 120, 4)];
      c.attack(b, f);
      c.say(OPS, 'Seconda imboscata da sud!');
    }
    if (w.tick % 40 === 0 && f.hp < f.maxHp * 0.35 && c.data.warned !== 1) {
      c.data.warned = 1;
      c.say(OPS, "L'Aurora è gravemente danneggiata! Allontanala dal fuoco e lascia che si ripari.");
    }
  },
};

// ======================================================================= 5. Dominio

const dominion: MissionDef = {
  id: 'dominio',
  title: 'Dominio',
  subtitle: 'Con un alleato contro due imperi',
  briefing: [
    "La battaglia finale per il Crocevia di Orione.",
    "L'Impero Cremisi e il Consorzio Ambra combattono insieme. Lo Sciame Smeraldo è al nostro fianco.",
    'Distruggi entrambe le Navi Madri nemiche. Il nostro alleato è nell\'angolo in basso a sinistra.',
  ],
  seed: 606,
  map: () => getMap('orione'),
  factions: [
    player({ team: 0 }),
    { name: GREEN.name, color: GREEN.color, controller: 'ai', difficulty: 'normal', doctrine: 'swarm', team: 0 },
    { name: RED.name, color: RED.color, controller: 'ai', difficulty: 'hard', doctrine: 'armor', team: 1 },
    { name: AMBER.name, color: AMBER.color, controller: 'ai', difficulty: 'hard', doctrine: 'arsenal', team: 1 },
  ],
  // tu in alto a sinistra, l'alleato in basso a sinistra, i nemici a destra
  spawnOrder: [0, 3, 1, 2],
  setup(c) {
    c.objective('destroy', 'Distruggi le Navi Madri nemiche', { progress: '0/2' });
    c.objective('ally', "Lo Sciame Smeraldo deve sopravvivere", { optional: true });
    c.say(VEGA, 'Due imperi contro di noi, ma non siamo soli. Coordinati con lo Sciame Smeraldo: espanditi e colpisci per primo.');
  },
  update(c) {
    const w = c.world;
    const dead = [2, 3].filter((f) => !w.factions[f].alive).length;
    c.setProgress('destroy', `${dead}/2`);
    if (!w.factions[1].alive) c.fail('ally');
    if (dead === 2) {
      if (c.status('ally') === 'active') c.complete('ally');
      c.say(VEGA, 'Il Crocevia di Orione è nostro. Vittoria, comandante!');
      c.win();
    }
  },
};

export const CAMPAIGN: MissionDef[] = [tutorial, mineralRush, bridgehead, siege, escort, dominion];

export function getMission(id: string): MissionDef {
  return CAMPAIGN.find((m) => m.id === id) ?? CAMPAIGN[0];
}

export function missionIndex(id: string): number {
  return CAMPAIGN.findIndex((m) => m.id === id);
}
