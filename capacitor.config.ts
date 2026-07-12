import type { CapacitorConfig } from "@capacitor/cli"

// App nativa (Capacitor) que ENVUELVE tu Next.js desplegado en Vercel.
// La app abre `server.url` dentro de un WebView nativo → tu sistema corre igual
// que en el navegador, pero con acceso a plugins nativos (impresora iMin, etc.).
//
// IMPORTANTE: pushear al repo → Vercel redeploya → la app muestra la versión
// nueva al recargar. Solo hay que recompilar el APK si se cambia la parte nativa.
const config: CapacitorConfig = {
  appId: "com.codea.ucobot",
  appName: "UcoBot",
  // Carpeta de respaldo (se usa offline / como fallback). En runtime manda server.url.
  webDir: "mobile-shell",
  server: {
    // ⚠️ Reemplazá por tu URL de PRODUCCIÓN real si tenés dominio propio.
    url: "https://chatbot-sass-eight.vercel.app",
    androidScheme: "https",
  },
  android: {
    // Permite que el WebView cargue tu sitio https sin problemas de mixed content.
    allowMixedContent: false,
  },
}

export default config
