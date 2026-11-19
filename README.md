# Nebula Dominion

Piccolo RTS spaziale in 2D che gira nel browser. Estrai minerali dagli asteroidi, conquista i pianeti e distruggi la Nave Madre nemica.

Realizzato con **Phaser 3 + TypeScript + Vite**. Tutta la grafica e l'audio sono generati a runtime: non ci sono file di asset.

## Come si gioca

- Parti con una **Nave Madre** e 2 **Minatori**. I minatori portano i minerali degli asteroidi alla Nave Madre.
- Con i minerali produci navi (fino a 2 alla volta). Ogni nave occupa spazio nel **limite flotta**.
- **Pianeti**: porta navi da combattimento nella zona tratteggiata di un pianeta per conquistarlo. Danno minerali al secondo, alzano il limite flotta e possono ospitare 2 torrette.
- Se nella zona ci sono navi di più fazioni, il pianeta è conteso e la conquista si ferma.
- **Vittoria**: distruggi tutte le Navi Madri nemiche.

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
- `src/data/` — statistiche di navi e armi, mappe, fazioni: il bilanciamento si fa qui.
- `src/render/` — texture generate a runtime, rendering del mondo, nebbia di guerra, effetti sonori WebAudio.
- `src/scenes/`, `src/input/` — scene Phaser (menu, gioco, HUD) e controlli.
- `tests/` — test di bilanciamento (morra cinese a parità di costo), economia, conquista e partite IA contro IA.

## Pubblicazione su GitHub Pages

Il workflow `.github/workflows/deploy.yml` esegue test e build a ogni push su `main` e pubblica `dist/` su GitHub Pages.
Nel repository va attivato una volta: **Settings → Pages → Source: GitHub Actions**.
