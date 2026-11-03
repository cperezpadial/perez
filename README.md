# Ondas – reproductor de música libre con modo sin conexión

PWA sin dependencias ni servidor (HTML + JS). Ábrela desde cualquier servidor estático (HTTPS o `localhost`) e instálala desde el navegador.

    cd docs && python3 -m http.server 8080   # y abre http://localhost:8080

- **Buscar**: Internet Archive (sin clave) y Jamendo (client_id gratuito, en Ajustes). Solo música Creative Commons.
- **Sin conexión**: botón ⬇ guarda la canción en IndexedDB; también puedes importar tus propios MP3/FLAC/etc.
- Biblioteca (♡), cola, aleatorio, repetir, controles del sistema (Media Session) y funcionamiento offline vía Service Worker.

No incluye ni descarga música con derechos de autor (Spotify, YouTube, etc.).
