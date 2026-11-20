# Nebula Dominion

Piccolo RTS spaziale in 2D che gira nel browser. Estrai minerali dagli asteroidi, conquista i pianeti e distruggi la Nave Madre nemica.

Realizzato con **Phaser 3 + TypeScript + Vite**. Tutta la grafica e l'audio sono generati a runtime: non ci sono file di asset.

## Come si gioca

- Parti con una **Nave Madre** e 2 **Minatori**. I minatori portano i minerali degli asteroidi alla Nave Madre.
- Con i minerali produci navi (fino a 2 alla volta). Ogni nave occupa spazio nel **limite flotta**.
- **Pianeti**: porta navi da combattimento nella zona tratteggiata di un pianeta per conquistarlo. Danno minerali al secondo, alzano il limite flotta e possono ospitare 2 torrette.
- Se nella zona ci sono navi di più fazioni, il pianeta è conteso e la conquista si ferma.
- **Vittoria**: distruggi tutte le Navi Madri nemiche.

### Mappe

Oltre alle 3 mappe fisse puoi scegliere **Casuale**: il generatore crea una mappa simmetrica (quindi equa) a partire da un seme, con dimensione (piccola, media, grande) e quantità di risorse a scelta. Stesso seme = stessa mappa, così puoi rigiocare una mappa che ti è piaciuta. Con 1 avversario la mappa ha 2 basi, con 2-3 avversari 4 basi. Il menu mostra un'anteprima della mappa.

### Dottrine

Prima della partita scegli una dottrina; le IA ne ricevono una casuale.

| Dottrina | Effetti |
|---|---|
| Ingegneria | estrazione +30%, torrette −30% costo |
| Corazze | scafi +15%, Corazzate costruite il 20% più in fretta, velocità −5% |
| Sciame | Caccia a 50 minerali, velocità +8%, scafi −5% |
| Arsenale | gittata +15%, ricerca −30% costo |

### Ricerca

La Nave Madre svolge una ricerca alla volta, senza occupare la produzione (Shift + Q W E R T, oppure i pulsanti della seconda riga). Ogni linea ha 3 livelli (150/250/350 minerali, 30/40/50 s):
Armi (+10% danno), Scafi (+10% scafo, anche sulle navi già in campo), Motori (+8% velocità), Estrazione (+15%), Difese (+15% danno e scafo di torrette e Nave Madre).

### Navi

| Nave | Ruolo | Forte contro | Debole contro |
|---|---|---|---|
| Minatore | raccolta (disarmato) | — | Caccia |
| Caccia | veloce, incursioni | Minatori, Corazzate | Fregate |
| Fregata | flak ad area | Caccia | Corazzate |
| Corazzata | lenta, lunga gittata | Fregate, strutture | Caccia |
| Nave Supporto | ripara gli alleati | — | — |

### Comandi

| Comando | Effetto |
|---|---|
| Click sinistro / trascina | seleziona (Shift aggiunge) |
| Doppio click | seleziona tutte le navi visibili dello stesso tipo |
| Click destro | muovi, attacca, estrai, o imposta il punto di raccolta (Nave Madre) |
| `A` + click | attacco-movimento |
| `S` / `H` | fermati / mantieni posizione |
| `G` / `B` | i minatori estraggono / rientrano col carico |
| `Q W E R T` | produci (con la Nave Madre selezionata) · `Q` torretta (con un tuo pianeta selezionato) |
| `Shift` + `Q W E R T` | ricerca: Armi, Scafi, Motori, Estrazione, Difese |
| `Shift`/`Ctrl` + `1-9`, `1-9` | crea / richiama un gruppo (doppia pressione: centra la camera) |
| `Z` / `X` / `C` | tutta la flotta / tutti i minatori / Nave Madre |
| Frecce, bordi dello schermo, tasto centrale | sposta la camera · rotella: zoom · `Spazio`: centra la selezione |
| `P` · `+`/`−` · `M` · `F1` | pausa · velocità · audio · aiuto |

## Sviluppo

```bash
npm install
npm run dev        # server di sviluppo
npm test           # test della simulazione (Vitest)
npm run build      # build di produzione in dist/
npm run smoke      # smoke test con Playwright sulla build (richiede Playwright installato)
```

### Struttura

- `src/sim/` — simulazione deterministica a 20 tick/s in TypeScript puro (nessun import di Phaser): movimento, combattimento, economia, conquista, comandi.
- `src/ai/` — IA a macchina a stati (economia, espansione, difesa, ondate d'attacco), tre livelli di difficoltà.
- `src/data/` — statistiche di navi e armi, ricerca, dottrine, mappe: il bilanciamento si fa qui.
- `src/data/mapgen.ts` — generatore di mappe casuali simmetriche (deterministico dato il seme).
- `src/sim/stats.ts` — statistiche effettive per fazione (base + dottrina + ricerca).
- `src/render/` — texture generate a runtime, rendering del mondo, nebbia di guerra, effetti sonori WebAudio.
- `src/scenes/`, `src/input/` — scene Phaser (menu, gioco, HUD) e controlli.
- `tests/` — test di bilanciamento (morra cinese a parità di costo), economia, conquista e partite IA contro IA.

## Pubblicazione su GitHub Pages

Il workflow `.github/workflows/deploy.yml` esegue test e build a ogni push su `main` e pubblica `dist/` su GitHub Pages.
Nel repository va attivato una volta: **Settings → Pages → Source: GitHub Actions**.
