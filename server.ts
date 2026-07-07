import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 images
  app.use(express.json({ limit: '50mb' }));

  // Face Analysis API
  app.post("/api/analyze-face", async (req, res) => {
    try {
      const { images } = req.body; // array of base64 strings
      
      if (!images || images.length !== 3) {
        return res.status(400).json({ error: "Richieste 3 immagini del viso (fronte, lato sx, lato dx)." });
      }

      const prompt = `Sei un esperto dermatologo e analista clinico della pelle (specializzato in sistemi di bio-impedenza ed analisi multispettrale d'immagine come SkinPlus e Hintime Group).
Valuta queste 3 foto del viso di un cliente (fronte, lato sinistro, lato destro) applicando rigorosi standard dermatologici professionali:

1. IDRATAZIONE (Corneometria):
   - Valore 0-100% basato sulla presenza di microrughe da disidratazione (zona perioculare/fronte), opacità e desquamazione fine.
   - 60% - 100%: Pelle ottimamente idratata.
   - 40% - 59%: Disidratazione lieve/moderata.
   - <40%: Disidratazione severa (barriera lipidica compromessa).

2. SEBO (Sebumetria):
   - Valore 0-100% basato sulla lucentezza della zona T, visibilità e dimensione dei pori ed eruzioni acneiche.
   - <30%: Pelle alipica o secca.
   - 30% - 50%: Equilibrio idrolipidico perfetto (pelle normale).
   - >50%: Pelle mista o iper-seborroica (pelle grassa).

3. PH EPIDERMICO:
   - Valore 0.0-14.0 basato sulla valutazione visiva dello stato di salute cutaneo.
   - 4.5 - 5.5: Range ideale e acido fisiologico.
   - <4.5: Forte acidità (spesso correlata a iper-seborrea ed acne attiva).
   - >6.0: Alcalino (barriera protettiva compromessa, xerosi senile o estrema sensibilità).

4. MELANINA & FOTOTIPO (Scala di Fitzpatrick):
   - Fototipo 1 (Melanina 0-15%): Pelle chiarissima, efelidi, biondo/rosso.
   - Fototipo 2 (Melanina 16-30%): Pelle chiara, sensibile al sole.
   - Fototipo 3 (Melanina 31-50%): Pelle media, si abbronza gradualmente.
   - Fototipo 4 (Melanina 51-70%): Pelle olivastra/scura.
   - Fototipo 5 (Melanina 71-85%): Pelle bruna.
   - Fototipo 6 (Melanina 86-100%): Pelle nera.

ATTENZIONE MASSIMA AI REQUISITI DI VISIBILITÀ:
- Se il viso non è chiaramente visibile, è eccessivamente coperto da capelli, le foto sono scattate al buio, sfocate, o la posizione della testa è errata/fuori fuoco in QUALSIASI delle 3 foto, DEVI obbligatoriamente impostare il campo "error" con un messaggio dettagliato in italiano che spieghi il problema e dica all'utente di rifare le foto. Non fornire punteggi se c'è un errore di questo tipo.
- Altrimenti, compila accuratamente i punteggi in base alle scale descritte e fornisci un breve riassunto clinico ("summary") in italiano sulle condizioni generali del cliente spiegando i parametri rilevati e come correggerli. L'analisi ha un margine di errore standard di ±2%.`;

      const parts = images.map((base64: string) => ({
        inlineData: {
          mimeType: "image/jpeg",
          data: base64.split(',')[1] || base64, // handle data URL prefix if present
        }
      }));

      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              error: {
                type: Type.STRING,
                description: "Messaggio di errore se le foto non sono valide. Lascia vuoto o ometti se l'analisi va a buon fine.",
              },
              summary: {
                type: Type.STRING,
                description: "Riassunto delle condizioni generali del viso con spiegazione clinica dei risultati, scritto in italiano.",
              },
              hydration: { type: Type.NUMBER, description: "Punteggio idratazione 0-100" },
              sebum: { type: Type.NUMBER, description: "Punteggio sebo 0-100" },
              ph: { type: Type.NUMBER, description: "Punteggio Ph 0-14" },
              melanin: { type: Type.NUMBER, description: "Punteggio melanina 0-100" },
              phototype: { type: Type.INTEGER, description: "Fototipo 1-6" }
            }
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");
      
      const result = JSON.parse(text);
      res.json(result);
    } catch (error: any) {
      console.error("Face Analysis Error:", error);
      res.status(500).json({ error: "Errore durante l'analisi del viso." });
    }
  });

  // Body Analysis API
  app.post("/api/analyze-body", async (req, res) => {
    try {
      const { images } = req.body; // array of base64 strings
      
      if (!images || images.length !== 4) {
        return res.status(400).json({ error: "Richieste 4 immagini del corpo (fronte, retro, lato sx, lato dx)." });
      }

      const prompt = `Sei un esperto consulente estetico e analista antropometrico avanzato (ispirato ai sistemi diagnostici professionali per il corpo come Hintime Group e SkinPlus). 
Valuta queste 4 foto del corpo intero di un cliente (fronte, retro, lato sinistro, lato destro) applicando rigorosi standard di valutazione corporea:

1. RITENZIONE IDRICA (Indice Edema):
   - Valore 0-100% calcolato considerando gonfiore interstiziale visibile, accumulo alle caviglie/gambe, e turgore cutaneo.
   - <30%: Ritenzione minima/normale.
   - 30% - 55%: Ritenzione edematosa lieve.
   - 56% - 80%: Ritenzione moderata.
   - >80%: Ritenzione severa con evidente edema tissutale.

2. CELLULITE (Scala Clinica di Nürnberger-Müller):
   - DEVI scegliere RIGOROSAMENTE uno di questi quattro valori letterali:
     * "Assente" (Nessuna irregolarità spontanea né alla contrazione/compressione).
     * "1° Grado - Edematosa" (Pelle liscia a riposo, ma presenta aspetto a 'buccia d'arancia' quando pizzicata o contratta).
     * "2° Grado - Fibrosa" (Irregolarità e aspetto a 'buccia d'arancia' visibili spontaneamente solo in piedi, scomparendo da sdraiati).
     * "3° Grado - Sclerotica" (Noduli evidenti sia in piedi che da sdraiati, avvallamenti profondi, talvolta dolenti).

3. TONO MUSCOLARE E TISSUTALE (Cutometria e Tensione):
   - Valore 0-100% basato sulla compattezza, lassità visibile, rilassamento dei tessuti in base alla gravità.
   - 75% - 100%: Tono ottimale (compattezza elevata).
   - 40% - 74%: Tono discreto/normale.
   - <40%: Ipotonia marcata o lassità cutanea.

4. FOTOTIPO (Fitzpatrick Scale 1-6):
   - Fototipo da 1 a 6 basato sulla colorazione della pelle e sensibilità solare.

ATTENZIONE AI REQUISITI DI VALIDITÀ:
- Se il corpo non è interamente visibile, l'illuminazione è pessima, la fotocamera è troppo vicina impedendo l'analisi della silhouette intera, o la posa è scorretta, DEVI impostare il campo "error" con un messaggio dettagliato in italiano che spieghi come rifare le foto.
- Altrimenti, fornisci un breve riassunto clinico ("summary") sulle condizioni generali del corpo, cellulite e ritenzione, spiegando le cause del livello rilevato e compila i punteggi. L'analisi ha un margine di errore standard di ±2%.`;

      const parts = images.map((base64: string) => ({
        inlineData: {
          mimeType: "image/jpeg",
          data: base64.split(',')[1] || base64,
        }
      }));

      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              error: {
                type: Type.STRING,
                description: "Messaggio di errore se le foto non sono valide. Lascia vuoto o ometti se l'analisi va a buon fine.",
              },
              summary: {
                type: Type.STRING,
                description: "Riassunto delle condizioni generali del corpo, cellulite e ritenzione idrica, scritto in italiano.",
              },
              waterRetention: { type: Type.NUMBER, description: "Punteggio ritenzione idrica 0-100" },
              cellulite: { type: Type.STRING, description: "Grado di cellulite: 'Assente', '1° Grado - Edematosa', '2° Grado - Fibrosa', '3° Grado - Sclerotica'" },
              tone: { type: Type.NUMBER, description: "Punteggio tono muscolare/tissutale 0-100" },
              phototype: { type: Type.INTEGER, description: "Fototipo 1-6" }
            }
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");
      
      const result = JSON.parse(text);
      res.json(result);
    } catch (error: any) {
      console.error("Body Analysis Error:", error);
      res.status(500).json({ error: "Errore durante l'analisi del corpo." });
    }
  });


  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
