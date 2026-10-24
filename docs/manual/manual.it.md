# Manuale di File Renamer

File Renamer rinomina molti file audio e video in una volta con un modello di nome. Vedi sempre i nuovi nomi prima che accada qualcosa, un file non viene mai sovrascritto e gli ultimi batch si possono annullare. È un'app desktop gratuita per Windows, macOS e Linux di OnAir Garage.

## Installazione e primo avvio

Scarica l'installer per il tuo sistema dalla pagina [Releases](https://github.com/djgragra/file-renamer/releases) e controllalo con `SHA256SUMS.txt`:
`File-Renamer-Setup-<V>.exe` (Windows), `File-Renamer-<V>-arm64.dmg` (Mac con Apple silicon), `File-Renamer-<V>-x64.dmg` (Mac con Intel), `File-Renamer-<V>.AppImage` (Linux).
L'app è gratuita e non ha un certificato Apple o Microsoft, quindi al primo avvio può comparire un avviso.

- **Windows**: avvia l'installer. Se SmartScreen dice «Windows ha protetto il PC», clicca *Ulteriori informazioni* → *Esegui comunque*.
- **macOS**: apri l'immagine disco e trascina l'app in Applicazioni. L'app è firmata ad-hoc, ed è ciò che serve a un Mac Apple silicon per aprirla. Il primo avvio mostra comunque l'avviso «sviluppatore non identificato»: apri *Impostazioni di Sistema → Privacy e sicurezza*, scorri in basso e clicca *Apri comunque* (il clic destro → Apri non esiste più da macOS 15). Se una versione precedente (26.10.3 o più vecchia) dice che l'app è «danneggiata», esegui una volta nel Terminale: `xattr -cr "/Applications/File Renamer.app" && codesign --force --deep -s - "/Applications/File Renamer.app"`
- **Linux**: rendi eseguibile l'AppImage (`chmod +x File-Renamer-*.AppImage`) e avviala.

L'app si apre sempre in inglese; scegli Italiano o Español dal menu della lingua e la scelta viene ricordata. Il tema può essere chiaro, scuro o seguire il sistema.

## Rinominare i file passo per passo

1. **Aggiungi i file**: trascina file o cartelle sull'elenco, oppure usa *Aggiungi file…* e *Aggiungi cartella…*. Le cartelle vengono scandite alla ricerca di file audio e video (*Cartelle: solo audio/video*); spunta *Includi sottocartelle* per andare più in profondità. File nascosti, cartelle e collegamenti vengono saltati.
2. **Scrivi un modello di nome** in *Modello del nome*, per esempio `{date:yyyyMMdd}_{seq:3}_{orig}`. Il modello si applica al nome senza estensione, che resta. I pulsanti *Inserisci* aggiungono un segnaposto al cursore e *Modelli recenti* richiama quelli usati prima.
3. **Guarda l'anteprima**: ogni riga mostra una casella, il *Nome attuale*, il *Nome nuovo* e uno *Stato*. Non è ancora stato rinominato nulla.
4. **Correggi i problemi**: una riga diventa rossa quando il nuovo nome è vuoto, è un nome riservato, è più lungo di 255 caratteri, è uguale a quello di un altro file del batch o esiste già su disco. Le righe rosse bloccano la rinomina finché non cambi il modello o le deselezioni.
5. **Premi *Rinomina…***, controlla il riepilogo e conferma. I file vengono rinominati sul posto, mai sovrascritti.
6. Se cambi idea, premi ***Annulla ultimo batch***.

Il contatore `{seq}` segue l'ordine dell'elenco e parte da dove dici tu (*Il contatore parte da* e *Passo*). Puoi ordinare l'elenco per ordine di aggiunta, nome A–Z o Z–A, data di modifica o dimensione prima che il contatore venga applicato.

## Segnaposto

I segnaposto vengono sostituiti nel nuovo nome; i pulsanti sotto il modello li inseriscono per te.

| Segnaposto | Significato |
|---|---|
| `{date}` / `{date:FORMATO}` | Data corrente, predefinita `yyyy-MM-dd` |
| `{time}` / `{time:FORMATO}` | Ora corrente, predefinita `HHmmss` |
| `{mdate}` / `{mtime}` | Come `{date}` / `{time}`, ma con l'ora di modifica del file stesso |
| `{date+1h:H}`, `{date-1d:yyyyMMdd}` | Spostato di N minuti (`m`), ore (`h`) o giorni (`d`) |
| `{seq}` / `{seq:N}` | Contatore del batch, riempito con zeri a N cifre |
| `{rand}` / `{rand:N}` | Lettere minuscole e cifre casuali (predefinito 6, al massimo 64) |
| `{env:NOME}` | Valore della variabile d'ambiente `NOME` (vuoto se non esiste) |
| `{orig}` | Nome originale senza estensione |
| `{parent}` | Nome della cartella che contiene il file |
| `{artist}` / `{title}` | Tag letti dal file (ID3, commenti Vorbis, MP4, RIFF INFO, APE…); più artisti sono uniti con `/`, che in un nome diventa `_`. Vuoto se il file non ne ha |
| `{duration}` / `{duration:mmss}` / `{duration:hhmmss}` | Durata in secondi interi (`187`), minuti e secondi (`0307`), ore, minuti e secondi (`000307`) |
| `{bitrate}` / `{samplerate}` | Bitrate in kbit/s (arrotondato) e frequenza di campionamento in Hz, come scritti nel file |

FORMATO usa le lettere `yyyy yy MM M dd d HH H hh h mm m ss s SSS a`; il testo tra apici singoli è letterale. Un `{parola}` sconosciuta viene lasciata com'è e segnalata nell'anteprima. I valori casuali restano gli stessi mentre scrivi, così l'anteprima non sfarfalla: *Nuovi valori casuali* ne estrae un nuovo gruppo. Un file senza il tag richiesto ottiene un valore vuoto e la sua riga dice «tag mancante». I nomi che confermi sono esattamente i nomi mostrati.

## Cerca e sostituisci, pulizia ed estensione

Apri *Cerca e sostituisci, pulizia, estensione* per rifinire il nuovo nome dopo che il modello è stato applicato.

- **Cerca e sostituisci**: *Cerca* un pezzo di testo (o un'espressione regolare, con *Espressione regolare*; *Maiuscole/minuscole* è facoltativo) e indica *Sostituisci con*. Una sostituzione vuota toglie il testo. Un'espressione non valida blocca la rinomina e lo dice.
- **Pulizia**: lettere tutto minuscolo, TUTTO MAIUSCOLO o Iniziali Maiuscole; spazi sostituiti con `_` o `-`; togli gli accenti (è → e); togli i caratteri speciali (restano lettere, cifre, spazio e `_ - .`).
- **Estensione**: tienila, minuscola, MAIUSCOLA oppure sostituiscila con un'altra (lettere, cifre, `_`, `+` e `-`, al massimo 16 caratteri). Cambia solo il nome: un `.wav` rinominato in `.mp3` resta un file WAV.
- **Preset**: *Salva preset…* conserva il modello, il contatore, cerca e sostituisci e la pulizia sotto un nome (fino a 50). Sceglilo di nuovo da *Preset*; *Elimina* lo toglie.

## Anteprima, log e annulla

- **Copia anteprima** mette negli appunti una riga per ogni file che verrebbe rinominato (`nome vecchio → nome nuovo`).
- **Salva log…** scrive un CSV dell'ultimo batch: nome vecchio, nome nuovo, cartella, risultato e ora, anche per i file che non sono riusciti. Si apre in Excel, Numbers e LibreOffice.
- ***Annulla ultimo batch*** ripristina i nomi del batch più recente; premilo di nuovo per tornare indietro di un altro. Si conservano gli ultimi 10 batch. Un file modificato dopo la rinomina, o il cui vecchio nome è ora usato da un altro file, resta com'è. Un batch che non si può più annullare si può dimenticare per arrivare a quello prima.

## Impostazioni

Le impostazioni sono in schede, nello stesso ordine di ogni app OnAir Garage:

| Scheda | Contenuto |
|---|---|
| Generale | Lingua e tema |
| Aggiornamenti | L'aggiornamento guidato (vedi sotto) |
| Backup | Esportazione e importazione di impostazioni e preset |
| Aiuto e informazioni | Versione, licenza, link, *Copia info per assistenza*, *Apri cartella log* e il riquadro mancia |

**Backup**: *Esporta* salva impostazioni e preset come `file-renamer-backup-AAAA-MM-GG.json`; *Importa* li rilegge su un altro computer. L'app non conserva password né token, quindi il file non ne contiene.

**Aiuto e informazioni** mostra la versione, la licenza, i crediti e i link. *Copia info per assistenza* copia versione, sistema e lingua, mai nomi di file o cartelle. *Apri cartella log* apre i log giornalieri (7 giorni, solo conteggi). Il piccolo riquadro mancia ha un salvadanaio e un pulsante: entrambi aprono la pagina di sostegno del sito nella lingua dell'app; dentro l'app non viene mai chiesto nulla.

## Aggiornamenti

File Renamer cerca una nuova versione 15 secondi dopo l'avvio e poi ogni 24 ore (puoi disattivarlo, e premere *Controlla ora*, in *Impostazioni → Aggiornamenti*, che mostra anche la data e il risultato dell'ultimo controllo). Un avviso offre *Scarica e installa*, *Ricordamelo dopo* (24 ore) e *Salta questa versione*, con le prime righe delle note di rilascio. Il download mostra una barra di avanzamento, si può annullare e viene controllato con lo SHA-256 pubblicato nella release (`SHA256SUMS.txt`): un file che non corrisponde viene eliminato. *Chiudi e installa* viene rifiutato mentre una rinomina è in corso e salva prima una copia di sicurezza delle impostazioni. Dopo l'aggiornamento compare una volta la finestra *Novità*. Niente viene installato senza un clic.

## Limiti e sicurezza

- Vengono rinominati solo i file normali. Cartelle, collegamenti simbolici e file nascosti trovati scandendo le cartelle vengono saltati. Una scansione si ferma a 20.000 file.
- **Le regole di Windows per i nomi valgono su ogni sistema**, così i nomi funzionano anche dopo aver spostato i file su Windows o su un disco FAT/exFAT: i caratteri `< > : " / \ | ? *` e i caratteri di controllo vengono sostituiti con `_` (la riga lo dice); i nomi riservati come `CON`, `PRN`, `AUX`, `NUL`, da `COM1` a `COM9` e da `LPT1` a `LPT9` vengono rifiutati; un nome non deve finire con uno spazio o un punto.
- **Mai sovrascrivere**: il nuovo nome viene prima prenotato e il vecchio viene tolto dopo. Sui file system senza hard link (FAT, exFAT, alcune condivisioni di rete) l'app controlla e poi rinomina, il che lascia una finestra di tempo molto piccola.
- Scambi e catene dentro un batch (a→b mentre b→c) e cambi di sole maiuscole (`Clip.wav` → `clip.wav`) passano da nomi temporanei nella stessa cartella.
- L'app non scrive mai i tag né cambia il contenuto di un file: tag, durate, bitrate e frequenze di campionamento vengono solo letti, sul tuo computer, e solo quando il modello ne usa uno. Non viene inviato nulla da nessuna parte.
- Un'espressione regolare molto pesante su migliaia di file può rendere lenta l'anteprima.
- Non è uno strumento certificato: leggi sempre l'anteprima prima di confermare.

## Risoluzione dei problemi

| Problema | Cosa fare |
|---|---|
| macOS: «l'app è danneggiata / non può essere aperta» | Apri *Impostazioni di Sistema → Privacy e sicurezza → Apri comunque*; per una versione precedente alla 26.10.4, esegui nel Terminale `xattr -cr "/Applications/File Renamer.app" && codesign --force --deep -s - "/Applications/File Renamer.app"`. |
| Windows: «Windows ha protetto il PC» | *Ulteriori informazioni* → *Esegui comunque*. |
| Linux: l'AppImage non si avvia | Rendila eseguibile (`chmod +x`) e installa FUSE (`libfuse2`) se il tuo sistema lo richiede. |
| Una riga è rossa | Leggi il suo stato: cambia il modello, oppure deseleziona la riga. |
| La riga dice «tag mancante» | Il file non ha quel tag: il valore è vuoto. Usa un altro segnaposto o controlla i tag con un editor di tag. |
| L'annullamento ha lasciato alcuni file com'erano | Sono stati modificati dopo la rinomina, oppure il loro vecchio nome è usato da un altro file. |
| Il download dell'aggiornamento è fallito con «checksum mismatch» | Il file è stato eliminato automaticamente. Riprova, oppure scarica l'installer a mano dalla pagina delle release. |

## Contatti

Graziano Melzi · OnAir Garage — `https://onairgarage.com` — `hello@onairgarage.com`. Pagina dello strumento: `https://onairgarage.com/tools/file-renamer/`. Codice sorgente e release: `https://github.com/djgragra/file-renamer`. Licenza: MIT © 2026 Graziano Melzi.
