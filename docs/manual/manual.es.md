# Manual de File Renamer

File Renamer cambia el nombre de muchos archivos de audio y vídeo a la vez con un patrón de nombre. Siempre ves los nombres nuevos antes de que pase nada, un archivo no se sobrescribe nunca y los últimos lotes se pueden deshacer. Es una app de escritorio gratuita para Windows, macOS y Linux de OnAir Garage.

## Instalación y primer inicio

Descarga el instalador para tu sistema desde la página de [Releases](https://github.com/djgragra/file-renamer/releases) y compruébalo con `SHA256SUMS.txt`:
`File-Renamer-Setup-<V>.exe` (Windows), `File-Renamer-<V>-arm64.dmg` (Mac con Apple silicon), `File-Renamer-<V>-x64.dmg` (Mac con Intel), `File-Renamer-<V>.AppImage` (Linux).
La app es gratuita y no tiene certificado de Apple ni de Microsoft, así que en el primer inicio puede aparecer un aviso.

- **Windows**: ejecuta el instalador. Si SmartScreen dice «Windows protegió su PC», pulsa *Más información* → *Ejecutar de todos modos*.
- **macOS**: abre la imagen de disco y arrastra la app a Aplicaciones. La app tiene una firma ad-hoc, que es lo que necesita un Mac Apple silicon para abrirla. El primer inicio muestra igualmente el aviso «desarrollador no identificado»: abre *Ajustes del Sistema → Privacidad y seguridad*, desplázate hacia abajo y pulsa *Abrir de todos modos* (el clic derecho → Abrir ya no existe desde macOS 15). Si una versión anterior (26.10.3 o más antigua) dice que la app está «dañada», ejecuta una vez en Terminal: `xattr -cr "/Applications/File Renamer.app" && codesign --force --deep -s - "/Applications/File Renamer.app"`
- **Linux**: haz ejecutable el AppImage (`chmod +x File-Renamer-*.AppImage`) y ejecútalo.

La app se abre siempre en inglés; elige Italiano o Español en el menú de idioma y la elección se recuerda. El tema puede ser claro, oscuro o seguir el sistema.

## Renombrar archivos paso a paso

1. **Añade archivos**: suelta archivos o carpetas en la lista, o usa *Añadir archivos…* y *Añadir carpeta…*. Las carpetas se exploran en busca de archivos de audio y vídeo (*Carpetas: solo audio/vídeo*); marca *Incluir subcarpetas* para ir más a fondo. Los archivos ocultos, las carpetas y los enlaces se omiten.
2. **Escribe un patrón de nombre** en *Patrón del nombre*, por ejemplo `{date:yyyyMMdd}_{seq:3}_{orig}`. El patrón se aplica al nombre sin la extensión, que se mantiene. Los botones *Insertar* añaden un marcador en el cursor y *Patrones recientes* recupera los que usaste antes.
3. **Mira la vista previa**: cada fila muestra una casilla, el *Nombre actual*, el *Nombre nuevo* y un *Estado*. Todavía no se ha renombrado nada.
4. **Corrige los problemas**: una fila se pone roja cuando el nombre nuevo está vacío, es un nombre reservado, tiene más de 255 caracteres, es igual al de otro archivo del lote o ya existe en el disco. Las filas rojas bloquean el cambio de nombre hasta que cambies el patrón o las desmarques.
5. **Pulsa *Renombrar…***, revisa el resumen y confirma. Los archivos se renombran en su sitio, nunca se sobrescriben.
6. Si cambias de opinión, pulsa ***Deshacer último lote***.

El contador `{seq}` sigue el orden de la lista y empieza donde tú digas (*El contador empieza en* y *Paso*). Puedes ordenar la lista por orden de adición, nombre A–Z o Z–A, fecha de modificación o tamaño antes de que se aplique el contador.

## Marcadores

Los marcadores se sustituyen en el nombre nuevo; los botones bajo el patrón los insertan por ti.

| Marcador | Significado |
|---|---|
| `{date}` / `{date:FORMATO}` | Fecha actual, por defecto `yyyy-MM-dd` |
| `{time}` / `{time:FORMATO}` | Hora actual, por defecto `HHmmss` |
| `{mdate}` / `{mtime}` | Igual que `{date}` / `{time}`, pero con la hora de modificación del propio archivo |
| `{date+1h:H}`, `{date-1d:yyyyMMdd}` | Desplazado N minutos (`m`), horas (`h`) o días (`d`) |
| `{seq}` / `{seq:N}` | Contador del lote, rellenado con ceros hasta N cifras |
| `{rand}` / `{rand:N}` | Letras minúsculas y cifras aleatorias (por defecto 6, como máximo 64) |
| `{env:NOMBRE}` | Valor de la variable de entorno `NOMBRE` (vacío si no existe) |
| `{orig}` | Nombre original sin la extensión |
| `{parent}` | Nombre de la carpeta que contiene el archivo |
| `{artist}` / `{title}` | Etiquetas leídas del archivo (ID3, comentarios Vorbis, MP4, RIFF INFO, APE…); varios artistas se unen con `/`, que en un nombre pasa a ser `_`. Vacío si el archivo no tiene |
| `{duration}` / `{duration:mmss}` / `{duration:hhmmss}` | Duración en segundos enteros (`187`), minutos y segundos (`0307`), horas, minutos y segundos (`000307`) |
| `{bitrate}` / `{samplerate}` | Tasa de bits en kbit/s (redondeada) y frecuencia de muestreo en Hz, tal como están escritas en el archivo |

FORMATO usa las letras `yyyy yy MM M dd d HH H hh h mm m ss s SSS a`; el texto entre comillas simples es literal. Un `{palabra}` desconocida se deja tal cual y se señala en la vista previa. Los valores aleatorios se mantienen mientras escribes, para que la vista previa no parpadee: *Nuevos valores aleatorios* saca un conjunto nuevo. Un archivo sin la etiqueta pedida recibe un valor vacío y su fila dice «etiqueta ausente». Los nombres que confirmas son exactamente los nombres mostrados.

## Buscar y reemplazar, limpieza y extensión

Abre *Buscar y reemplazar, limpieza, extensión* para afinar el nombre nuevo después de aplicar el patrón.

- **Buscar y reemplazar**: *Buscar* un trozo de texto (o una expresión regular, con *Expresión regular*; *Distinguir mayúsculas* es opcional) e indica *Reemplazar por*. Un reemplazo vacío quita el texto. Una expresión no válida bloquea el cambio de nombre y lo dice.
- **Limpieza**: letras todo en minúsculas, TODO EN MAYÚSCULAS o Primeras Mayúsculas; espacios cambiados por `_` o `-`; quitar acentos (è → e); quitar caracteres especiales (se mantienen letras, cifras, espacio y `_ - .`).
- **Extensión**: mantenerla, en minúsculas, en MAYÚSCULAS o sustituirla por otra (letras, cifras, `_`, `+` y `-`, 16 caracteres como máximo). Solo cambia el nombre: un `.wav` renombrado a `.mp3` sigue siendo un archivo WAV.
- **Presets**: *Guardar preset…* conserva el patrón, el contador, buscar y reemplazar y la limpieza con un nombre (hasta 50). Elígelo de nuevo en *Preset*; *Eliminar* lo quita.

## Vista previa, registro y deshacer

- **Copiar vista previa** pone en el portapapeles una línea por cada archivo que se renombraría (`nombre antiguo → nombre nuevo`).
- **Guardar registro…** escribe un CSV del último lote: nombre antiguo, nombre nuevo, carpeta, resultado y hora, también para los archivos que fallaron. Se abre en Excel, Numbers y LibreOffice.
- ***Deshacer último lote*** restaura los nombres del lote más reciente; púlsalo otra vez para retroceder uno más. Se conservan los últimos 10 lotes. Un archivo modificado tras el cambio de nombre, o cuyo nombre antiguo lo usa ahora otro archivo, se queda como está. Un lote que ya no se puede deshacer se puede olvidar para llegar al anterior.

## Ajustes

Los ajustes están en pestañas, en el mismo orden que en todas las apps de OnAir Garage:

| Pestaña | Contenido |
|---|---|
| General | Idioma y tema |
| Actualizaciones | La actualización guiada (véase más abajo) |
| Copia de seguridad | Exportación e importación de ajustes y presets |
| Ayuda e información | Versión, licencia, enlaces, *Copiar info para asistencia*, *Abrir carpeta de registros* y la tarjeta de propina |

**Copia de seguridad**: *Exportar* guarda los ajustes y los presets como `file-renamer-backup-AAAA-MM-DD.json`; *Importar* los lee de nuevo en otro equipo. La app no guarda contraseñas ni tokens, así que el archivo no contiene ninguno.

**Ayuda e información** muestra la versión, la licencia, los créditos y los enlaces. *Copiar info para asistencia* copia versión, sistema e idioma, nunca nombres de archivo ni carpetas. *Abrir carpeta de registros* abre los registros diarios (7 días, solo recuentos). La pequeña tarjeta de propina tiene una hucha y un botón: ambos abren la página de apoyo del sitio web en el idioma de la app; dentro de la app no se pide nunca nada.

## Actualizaciones

File Renamer busca una versión nueva 15 segundos después de iniciarse y luego cada 24 horas (puedes desactivarlo, y pulsar *Comprobar ahora*, en *Ajustes → Actualizaciones*, que muestra además la fecha y el resultado de la última comprobación). Un aviso ofrece *Descargar e instalar*, *Recordármelo más tarde* (24 horas) y *Omitir esta versión*, con las primeras líneas de las notas de la versión. La descarga muestra una barra de progreso, se puede cancelar y se comprueba con el SHA-256 publicado en la versión (`SHA256SUMS.txt`): un archivo que no coincide se elimina. *Cerrar e instalar* se rechaza mientras hay un cambio de nombre en curso y guarda antes una copia de seguridad de los ajustes. Tras la actualización aparece una vez la ventana *Novedades*. No se instala nada sin un clic.

## Límites y seguridad

- Solo se renombran los archivos normales. Las carpetas, los enlaces simbólicos y los archivos ocultos que se encuentran al explorar carpetas se omiten. Una exploración se detiene en 20.000 archivos.
- **Las reglas de Windows para los nombres valen en todos los sistemas**, de modo que los nombres también funcionan después de mover los archivos a Windows o a un disco FAT/exFAT: los caracteres `< > : " / \ | ? *` y los caracteres de control se sustituyen por `_` (la fila lo dice); los nombres reservados como `CON`, `PRN`, `AUX`, `NUL`, de `COM1` a `COM9` y de `LPT1` a `LPT9` se rechazan; un nombre no debe terminar en espacio ni en punto.
- **Nunca sobrescribir**: el nombre nuevo se reserva primero y el antiguo se quita después. En los sistemas de archivos sin enlaces duros (FAT, exFAT, algunos recursos de red) la app comprueba y luego renombra, lo que deja una ventana de tiempo muy pequeña.
- Los intercambios y las cadenas dentro de un lote (a→b mientras b→c) y los cambios de solo mayúsculas (`Clip.wav` → `clip.wav`) pasan por nombres temporales en la misma carpeta.
- La app no escribe nunca las etiquetas ni cambia el contenido de un archivo: etiquetas, duraciones, tasas de bits y frecuencias de muestreo solo se leen, en tu equipo, y solo cuando el patrón usa alguna. No se envía nada a ninguna parte.
- Una expresión regular muy pesada sobre miles de archivos puede hacer lenta la vista previa.
- No es un instrumento certificado: lee siempre la vista previa antes de confirmar.

## Solución de problemas

| Problema | Qué hacer |
|---|---|
| macOS: «la app está dañada / no se puede abrir» | Abre *Ajustes del Sistema → Privacidad y seguridad → Abrir de todos modos*; para una versión anterior a la 26.10.4, ejecuta en Terminal `xattr -cr "/Applications/File Renamer.app" && codesign --force --deep -s - "/Applications/File Renamer.app"`. |
| Windows: «Windows protegió su PC» | *Más información* → *Ejecutar de todos modos*. |
| Linux: el AppImage no se inicia | Hazlo ejecutable (`chmod +x`) e instala FUSE (`libfuse2`) si tu sistema lo necesita. |
| Una fila está en rojo | Lee su estado: cambia el patrón o desmarca la fila. |
| La fila dice «etiqueta ausente» | El archivo no tiene esa etiqueta: el valor está vacío. Usa otro marcador o revisa las etiquetas con un editor de etiquetas. |
| Deshacer dejó algunos archivos como estaban | Se modificaron tras el cambio de nombre, o su nombre antiguo lo usa otro archivo. |
| La descarga de la actualización falló con «checksum mismatch» | El archivo se eliminó automáticamente. Inténtalo de nuevo o descarga el instalador a mano desde la página de versiones. |

## Contactos

Graziano Melzi · OnAir Garage — `https://onairgarage.com` — `hello@onairgarage.com`. Página de la herramienta: `https://onairgarage.com/tools/file-renamer/`. Código fuente y versiones: `https://github.com/djgragra/file-renamer`. Licencia: MIT © 2026 Graziano Melzi.
