# QR Studio · Conversor de enlaces a códigos QR

Aplicación web para convertir enlaces o texto en códigos QR personalizados. Funciona
por completo en el navegador: **ningún dato se envía a un servidor**.

## Funcionalidades

- **Vista previa en vivo:** el QR se actualiza mientras escribes.
- **Vista previa móvil flotante:** en pantallas pequeñas, un mini QR fijo sigue tus
  cambios mientras te desplazas por la personalización o el historial.
- **Normalización de enlaces:** añade `https://` automáticamente a dominios escritos
  sin esquema.
- **Personalización:**
  - tamaño de exportación (512, 1024, 2048 y 4096 px);
  - margen;
  - nivel de corrección de errores (L, M, Q y H);
  - estilo de puntos (cuadrados, redondeados, puntos y elegante);
  - colores de primer plano y fondo, o fondo transparente;
  - logo central (ajusta la corrección a H automáticamente).
- **Exportación:** descarga en PNG o SVG, copia la imagen al portapapeles, comparte o
  imprime.
- **Historial local:** guarda hasta 20 códigos en `localStorage`, con favoritos y
  opción de borrar.
- **Modo claro/oscuro:** respeta la preferencia del sistema y recuerda tu elección.
- **Accesibilidad:** etiquetas, foco visible, mensajes con `aria-live` y soporte para
  `prefers-reduced-motion`.

## Cómo ejecutarla

No necesita compilación ni backend.

1. Con WAMP, abre `http://localhost/Conversor-de-QR/`.
2. O sirve la carpeta con PHP:

   ```bash
   php -S 127.0.0.1:8000
   ```

3. También puedes abrir `index.html` directamente, aunque se recomienda usar un
   servidor local para que el portapapeles y el historial funcionen sin restricciones.

## Estructura

```text
index.html                  Interfaz
css/styles.css              Estilos y temas
js/app.js                   Lógica de la aplicación
js/vendor/qr-code-styling.js Librería de generación de QR (MIT)
favicon.svg                 Icono
```

La generación y exportación usan [qr-code-styling](https://github.com/kozakdenys/qr-code-styling),
incluida localmente para que la app no dependa de un CDN.

## Próximos pasos posibles

- Añadir tipos de QR: WiFi, email, teléfono, SMS, WhatsApp, vCard, ubicación y evento.
- Escanear QR desde una imagen o la cámara.
- Convertir la app en PWA para usarla offline e instalarla.
- Generación por lotes desde un CSV.
