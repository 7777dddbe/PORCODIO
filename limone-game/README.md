# 🍋 Max a Limone sul Garda

Open world in 3D (stile GTA) ambientato a **Limone sul Garda**: lago, centro storico con porto, alberghi con piscine,
uliveti, montagna, strade con traffico, Carabinieri, moto d'acqua, Vespa, armi e missioni.
Tutta la grafica (texture, edifici, alberi, personaggi, suoni) è **generata dal codice**: nessun file esterno.
L'unica dipendenza è Three.js, caricato da CDN (jsDelivr).

## Come si gioca
| Azione | Tastiera / mouse | Touch |
|---|---|---|
| Muoversi / correre | `WASD` / `Shift` | stick sinistro / CORRI |
| Guardare | mouse | trascina a destra |
| Sparare / mirare | click sx / click dx | SPARA / MIRA |
| Saltare / freno a mano | `Spazio` | SALTA / FRENO |
| Salire e scendere | `E` | E |
| Armi | `1`-`4`, `Q`/`G` | ARMA |
| Ricarica, mappa, clacson, ora | `R`, `M`, `H`, `T` | MAPPA |

Missioni: gara in moto d'acqua (porto), consegna pizza (Pizzeria Al Porto), fuga dai Carabinieri (stazione).
Inoltre: 38 limoni 🍋 nascosti, gelati per curarsi, giubbotti, armi sparse per la mappa.

## Avvio
Serve solo un server statico (i moduli ES non funzionano da `file://`):

```bash
cd limone-game
python3 -m http.server 8080   # poi apri http://localhost:8080
```

Qualità grafica: `?q=low`, `?q=med`, `?q=high` (di default: alta su PC, media su telefono).

## File unico
`./build.sh` crea `dist/index.html` (tutto il gioco in un solo file, Three.js resta da CDN).

## Struttura
`src/map.js` geografia · `terrain.js` terreno e shader · `water.js` lago · `sky.js` cielo/giorno-notte ·
`buildings.js`, `props.js`, `vegetation.js` paesaggio · `character.js` Max e pedoni · `vehicles.js` veicoli e IA ·
`npc.js` pedoni/traffico/polizia · `game.js` regole, camera, combattimento · `hud.js`, `input.js`, `audio.js`, `fx.js`.
