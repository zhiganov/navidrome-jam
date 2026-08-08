

# Navidrome Jam

Reproducción sincronizada de música para escuchar la misma música con amigos en tiempo real. Construido como una extensión de [Navidrome](https://www.navidrome.org/). Presenta una estética retro de Windows 98 / GeoCities.

**En vivo en [jam.zhgnv.com](https://jam.zhgnv.com)**

<img width="1200" height="630" alt="og-image" src="https://github.com/user-attachments/assets/6eba935c-632b-407e-b905-6d334d6a0eab" />

## Motivación

Spotify Jam te permite escuchar música juntos, pero requiere Spotify Premium y no admite tu propia biblioteca de música (archivos FLAC). Este proyecto permite la reproducción sincronizada de tu colección de música personal con amigos mientras juegas o te reúnes.

## Arquitectura

```
              ┌──────────────────┐
              │  Jam Sync Server │
              │   (WebSocket)    │
              └──────────────────┘
                ▲              ▲
     sync cmds  │              │  sync cmds
                │              │
          ┌─────┴─────┐   ┌────┴──────┐
          │  Client 1 │   │  Client 2 │
          │  (Web UI) │   │  (Web UI) │
          └─────┬─────┘   └────┬──────┘
                │              │
     audio HTTP │              │ audio HTTP
                ▼              ▼
              ┌──────────────────┐
              │    Navidrome     │
              │  (Your server)   │
              └──────────────────┘
```

### Componentes

1. **Navidrome** - Tu servidor de música existente (autoalojado o gestionado). Los clientes transmiten audio directamente desde él a través de la API Subsonic; el servidor de sincronización nunca toca los datos de audio.
2. **Jam Sync Server** - Servidor WebSocket ligero que transmite comandos de reproducción (reproducir/pausar/buscar/marcador de tiempo). Realiza capturas instantáneas del estado de la sala en un volumen persistente cada 30 segundos y al apagar el servidor, para que las sesiones sobrevivan a los reinicios del servidor.
3. **Web Client** - SPA React que maneja la autenticación de Navidrome, la reproducción de audio y la interfaz de la sala. Se conecta tanto a Navidrome (para música) como al servidor de sincronización (para la coordinación).

## Características

- Reproducción sincronizada de reproducción/pausa/búsqueda en todos los participantes (<500 ms de desviación)
- Cola compartida con reordenación, reproducción automática, modo de repetición y cola automática de álbumes
- Controles del anfitrión con delegación de cocreador
- Explorador de biblioteca: Artistas, Álbumes A-Z, Recién añadidos, Recientemente reproducidos, Favoritos
- Búsqueda de música integrada con la biblioteca de Navidrome
- **Subidas de usuarios** - Sube música a través del cliente web (se transmite vía SFTP a Navidrome, se indexa automáticamente)
- **Me gusta** - Marca pistas para guardarlas en tus favoritos de Navidrome (persiste entre salas/sesiones)
- Las subidas con "me gusta" están protegidas contra la limpieza automática
- Compatible con FLAC y todos los formatos que maneja Navidrome
- **Navegación de listas de reproducción** - Carga listas de reproducción de Navidrome en la cola
- Registro autoadministrado basado en códigos de invitación
- Resiliencia de la sala: 5 minutos de período de gracia al desconectarse + capturas instantáneas del estado en un volumen persistente
- Diseño compatible con móviles (pestañas Cola/Personas en pantallas ≤1024px)
- Tema de interfaz retro Windows 98 / GeoCities
- **[Jam With Boo](https://boo.zhgnv.com)** - Edición San Valentín con avatares kawaii y sincronización de "abrazo de pata"

## Pila tecnológica

- **Navidrome**: Servidor de música basado en Go (existente)
- **Servidor de sincronización**: Node.js + Express + Socket.io
- **Cliente**: React + Vite
- **Protocolo**: WebSocket para comunicación en tiempo real, API Subsonic para transmisión de música

## Despliegue

Elige tu método de despliegue:

### Opción 1: Vercel + Railway (Recomendado)

**Despliegue más rápido, ~$0-5/mes**

1. **Desplegar servidor**: [Railway.app](https://railway.app) - despliega desde GitHub, configura las variables de entorno (consulta `server/.env.example`)
2. **Desplegar cliente**: [Vercel.com](https://vercel.com) - importa el proyecto, establece `VITE_NAVIDROME_URL` y `VITE_JAM_SERVER_URL`
3. **Configurar códigos de invitación**: Añade `INVITE_CODES`, `NAVIDROME_ADMIN_USER`, `NAVIDROME_ADMIN_PASS` en Railway para el registro autoadministrado

Consulta [VERCEL_QUICKSTART.md](./VERCEL_QUICKSTART.md) para más detalles.

### Opción 2: VPS (Autoalojado)

**Control total, ~$5-10/mes**

```bash
curl -fsSL https://raw.githubusercontent.com/zhiganov/navidrome-jam/main/install.sh | bash
```

📖 [Guía de despliegue VPS](./DEPLOYMENT.md)

---

## Desarrollo local

### Prerrequisitos

1. **Navidrome** - Instala y configura Navidrome
   ```bash
   # Consulta: https://www.navidrome.org/docs/installation/
   ```

2. **Node.js 18+** - Requerido para el servidor de sincronización y el cliente

### Inicio rápido

1. Clona el repositorio:
   ```bash
   git clone https://github.com/zhiganov/navidrome-jam.git
   cd navidrome-jam
   ```

2. Instala las dependencias del servidor:
   ```bash
   cd server
   npm install
   cp .env.example .env
   # Edita .env si es necesario
   ```

3. Instala las dependencias del cliente:
   ```bash
   cd ../client
   npm install
   cp .env.example .env
   # Edita .env para apuntar a tu instancia de Navidrome
   ```

4. Inicia el servidor de sincronización:
   ```bash
   cd ../server
   npm run dev
   ```

5. En una nueva terminal, inicia el cliente:
   ```bash
   cd client
   npm run dev
   ```

6. Abre http://localhost:5173 en tu navegador

Consulta [QUICKSTART.md](./QUICKSTART.md) para instrucciones detalladas de prueba.

## Seguridad

Este proyecto implementa varias medidas de seguridad:
- Validación y saneamiento de entradas para prevenir ataques XSS
- Limitación de velocidad para prevenir el uso indebido
- Autenticación basada en tokens con Navidrome
- Validación de sesión al restaurar

Para consideraciones de seguridad detalladas, consulta [SECURITY.md](./SECURITY.md).

## Desarrollo

### Estructura del proyecto

```
navidrome-jam/
├── server/           # Servidor de sincronización WebSocket (Node.js + Socket.io)
│   ├── src/
│   │   ├── index.js         # Servidor principal con validación y limitación de velocidad
│   │   ├── roomManager.js   # Gestión de estados de sala y limpieza
│   │   └── sftpUploader.js  # Canal de subida SFTP a PikaPods
│   └── test-client.html     # Cliente de prueba HTML
├── client/           # Cliente web React
│   ├── src/
│   │   ├── components/      # Componentes React
│   │   │   ├── SyncedAudioPlayer.jsx  # Reproductor de audio con control de volumen
│   │   │   ├── ErrorBoundary.jsx      # Envoltorio de manejo de errores
│   │   │   ├── catData.js             # Definiciones de avatares + SVG de pata (Boo)
│   │   │   ├── CatPicker.jsx          # Superposición de selección de avatar (Boo)
│   │   │   ├── CatDanceFloor.jsx      # Tira animada de avatares (Boo)
│   │   │   └── PawButton.jsx          # Botón de "abrazo de pata" mantenido (Boo)
│   │   ├── contexts/        # Contextos React
│   │   │   ├── NavidromeContext.jsx   # Proveedor de cliente Navidrome
│   │   │   └── JamContext.jsx         # Proveedor de cliente Jam
│   │   ├── services/        # Clientes API
│   │   │   ├── navidrome.js          # Cliente API Subsonic de Navidrome
│   │   │   └── jamClient.js          # Envoltorio de cliente WebSocket
│   │   └── App.jsx          # Aplicación principal con estados de carga
│   └── public/
│       ├── favicon.svg            # Favicon de nota musical Win98
│       ├── og-image.svg           # Fuente de imagen OG (escena Win98)
│       └── og-image.png           # Imagen OG rasterizada para vistas previas sociales
├── docs/             # Documentación
├── QUICKSTART.md     # Guía de inicio rápido
└── SECURITY.md       # Consideraciones de seguridad
```

### Ejecutar pruebas

Prueba el servidor de sincronización con el cliente de prueba HTML:
```bash
cd server
npm run dev
# Abre test-client.html en dos ventanas del navegador
```

Prueba con la pila completa:
```bash
# Terminal 1: Servidor de sincronización
cd server && npm run dev

# Terminal 2: Cliente web
cd client && npm run dev

# Abre http://localhost:5173 en dos navegadores
```

## Hoja de ruta

- **Configuración de sala** - Salas privadas/públicas, protección con contraseña, niveles de permisos
- **Pruebas automatizadas** - Jest para el servidor de sincronización, Vitest + React Testing Library para el cliente
- **Migración a TypeScript** - Migración completa del código (servidor + cliente)
- **Integración con My Community** - Insertar pestaña de escucha compartida en la extensión [My Community](https://github.com/zhiganov/my-community)

## Registro de cambios

### 2026-02-15 — Listas de reproducción, Resiliencia de sala

- **Navegación de listas de reproducción**: Navega y añade listas de reproducción de Navidrome desde el explorador de biblioteca.
- **Período de gracia de la sala**: Las salas permanecen activas durante 5 minutos después de que el último usuario se desconecte (por ejemplo, cambio de celda LTE mientras se conduce). La cola, la posición de reproducción y el código de la sala se conservan para una reconexión sin interrupciones.
- **Capturas instantáneas del estado de la sala**: Las salas activas realizan capturas instantáneas en un volumen persistente cada 30 segundos y al apagar el servidor. Las sesiones sobreviven a los reinicios y reimplantaciones del servidor.
- **Selector de comunidad**: Movido desde el diálogo de creación de sala a la barra de encabezado de la sala para un acceso más fácil.

### 2026-02-15 — Subidas de usuarios, Gustos persistentes, Favoritos

- **Subidas de usuarios**: Sube archivos de audio a través del cliente web. Los archivos se transmiten a Navidrome vía SFTP y se indexan automáticamente. Limpieza automática de 30 días con bandera permanente (50/usuario).
- **Gustos persistentes**: El botón de "me gusta" se sincroniza con los favoritos de Navidrome a través de la API Subsonic `star.view`/`unstar.view`. Los gustos persisten entre salas y sesiones: si ya te gustó una pista, el botón permanece activo al volver a encontrarla.
- **Protección de subidas con "me gusta"**: Los archivos subidos con al menos un "me gusta" están exentos de la limpieza automática de 30 días.
- **Modo de navegación de favoritos**: Nueva opción "Favoritos" en el menú desplegable del explorador de biblioteca: muestra todas las pistas marcadas de Navidrome.
- **Reproducido recientemente**: Reemplazado "Aleatorio" por "Reproducido recientemente" en el menú desplegable de navegación (el botón de mezcla aleatoria sigue disponible en las vistas de álbum).
- **Iconos de controles SVG**: Reemplazado el pixel art CSS por iconos SVG con `mask-image` (Bootstrap Icons para "me gusta", estilo Lucide para repetición). Monocromáticos por defecto, coloreados cuando están activos.

### 2026-02-14 — Jam With Boo (Edición San Valentín)

- **Jam With Boo**: Edición del Día de San Valentín en [boo.zhgnv.com](https://boo.zhgnv.com). Rama separada (`feature/jam-with-boo`) con su propio dominio, imágenes OG y favicon.
- **Avatares kawaii**: 9 personajes impulsados por [react-kawaii](https://github.com/elizabetdev/react-kawaii) (Gato, Fantasma, Planeta, Helado, Taza, Mochila, Bocadillo, Chocolate, Navegador). Selector de avatar al unirse, visible en la lista de usuarios y la tira de baile.
- **Clímax de "abrazo de pata"**: Mantén el botón de pata durante 8 segundos: cuando 2 o más usuarios lo mantienen simultáneamente, los avatares convergen en una explosión de corazón con parpadeo de pantalla. El clímax persiste mientras todos sigan manteniéndolo.
- **Tira de baile**: Fila de avatares animados encima de la barra de "reproduciendo ahora". Los avatares rebotan cuando suena la música, convergen durante el mantenimiento de la pata y se separan en explosión durante el clímax.
- **Tema de San Valentín**: Colores de acento rosa/rosonados sobre la base de Win98. Imagen OG y favicon personalizados para compartir en redes sociales.
- **CORS de múltiples orígenes**: El servidor `CLIENT_URL` ahora soporta orígenes separados por comas (por ejemplo, `https://jam.zhgnv.com,https://boo.zhgnv.com`).

### 2026-02-11 — Modos de navegación, diseño móvil, gestión de compilaciones

- **Modos de navegación**: El explorador de biblioteca ahora soporta cuatro modos mediante menú desplegable: Artistas (por defecto), Álbumes A-Z, Recién añadidos y Aleatorio (con botón de mezcla). Los álbumes se obtienen vía `getAlbumList2.view`.
- **Agrupación de álbumes de compilación**: Los álbumes con el mismo nombre y año se fusionan en una única entrada que muestra "Varios artistas". Al hacer clic, se abre una lista de pistas combinada de todos los subálbumes, ordenada por número de disco/canción.
- **Nombres de artistas en listas de pistas**: La vista de canciones del álbum muestra el artista de cada pista cuando difiere del artista del álbum: esencial para compilaciones y bandas sonoras.
- **Pestañas para móviles**: Las pestañas de Cola y Personas aparecen en pantallas ≤1024px, mostrando la gestión completa de la cola y la lista de usuarios en línea (los paneles laterales de escritorio permanecen sin cambios).
- **Licencia**: Cambiada de MIT a Apache-2.0.

### 2026-02-10 — Correcciones de sincronización, repetición, salas activas, panel de administración

- **Correcciones de sincronización**: Se corrigieron tres errores interrelacionados: sin reproducción al unirse, pista incorrecta al cambiar el anfitrión y condición de carrera cuando la sincronización llega antes de que el elemento de audio se monte. El servidor ahora envía un evento de sincronización al unirse; el cliente detecta cambios de pista y aplica una sincronización diferida vía `pendingSyncRef`.
- **Modo de repetición**: Activa la repetición automática para que la sala reproduzca para siempre. Las pistas terminadas se vuelven a añadir al final de la cola. Cola vacía + repetición = bucle de una sola pista. Estado persistido en `localStorage`.
- **Cola automática de álbumes**: Al reproducir una pista desde la vista de navegación de álbumes, se añaden ahora todas las pistas restantes del álbum, para que los botones anterior/siguiente funcionen dentro del álbum.
- **Salas activas**: La pantalla de selección de salas muestra las salas activas actualmente con el nombre del anfitrión, el número de oyentes y la pista actual. Se actualiza automáticamente cada 10 segundos.
- **Panel de administración**: Página con estilo Win98 renderizada por el servidor en `/admin` para la gestión de códigos de invitación: ver el estado del código (disponible/usado/quién lo usó), generar nuevos códigos, eliminar códigos. Protegido con contraseña de administrador.
- **Compartir en redes sociales**: Etiquetas meta OG, Twitter Cards, favicon personalizado de Win98 (SVG) e imagen OG con escena del reproductor Winamp para vistas previas enriquecidas de enlaces en mensajería.
- **Enlace de GitHub**: Enlace al repositorio añadido a las pantallas de inicio de sesión y selección de sala.

### 2026-02-10 — Cocreadores, explorador de biblioteca, controles de transporte

- **Sistema de cocreadores**: El anfitrión puede ascender/descender usuarios a cocreador. Los cocreadores obtienen control total de reproducción y cola. El servidor valida con `canControl()` (anfitrión O cocreador). El estado de cocreador se limpia al salir del usuario.
- **Explorador de biblioteca**: Pestaña de navegación con navegación por artista/álbum/canción. Navegación por migas de pan (Biblioteca > Artista > Álbum). Botón "Añadir todo a la cola" en la vista de álbum. Iconos de carpeta estilo Win98 y miniaturas de álbum.
- **Controles de transporte**: Botones de anterior/reproducir-pausa/siguiente al estilo Winamp con iconos dibujados en CSS en un panel oscuro rebajado. Reproducir/pausar se actualiza reactivamente mediante devoluciones de llamada del elemento de audio.
- **Reordenación de cola**: Mueve las pistas hacia arriba/abajo o elimínalas. Botones de flechas Unicode.
- **Historial de reproducción**: El botón de pista anterior navega el historial real (umbral de 3 segundos: reiniciar vs retroceder).
- **Corrección de errores**: "Añadir todo a la cola" solo añadía la última pista (cierre de estado obsoleto), nombre de usuario invisible en la lista de usuarios (herencia de color CSS), cola desconectada del reproductor (reproducción automática al primer añadido).

### 2026-02-09 — Lanzamiento inicial

- Salas de reproducción de música sincronizada con sincronización WebSocket
- Integración de la API Subsonic de Navidrome (búsqueda, transmisión, metadatos)
- Registro autoadministrado basado en códigos de invitación
- Tema de interfaz retro Windows 98 / GeoCities
- Desplegado en Vercel (cliente) + Railway (servidor)

## Contribución

¡Contribuciones bienvenidas! Abre un problema o una PR.

## Licencia

Apache-2.0

## Reconocimientos

- [Navidrome](https://www.navidrome.org/) - El excelente servidor de música sobre el que se construye este proyecto
- Inspirado por Spotify Jam
