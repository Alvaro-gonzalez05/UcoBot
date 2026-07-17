# Evolution API — piloto local

Entorno de prueba para validar Evolution antes de pagar hosting.
**Regla de oro del piloto: usar un número de prueba propio, jamás el de un cliente.**

## Requisitos
- Docker Desktop corriendo.

## Arranque

```bash
cd docker/evolution
copy .env.example .env    # editar EVOLUTION_API_KEY y POSTGRES_PASSWORD
docker compose up -d
```

## Probar

1. Manager web: <http://localhost:8080/manager> → login con tu `EVOLUTION_API_KEY`.
2. Crear instancia (nombre p. ej. `piloto`), elegir motor **Baileys**.
3. Escanear el QR con WhatsApp del número de prueba (Dispositivos vinculados).
4. Mandarle un mensaje a ese número desde otro teléfono: tiene que aparecer en
   los logs (`docker compose logs -f evolution`) y llegar al webhook de UcoBot
   si tenés `npm run dev` corriendo.

## Endpoints útiles (header `apikey: <EVOLUTION_API_KEY>`)

| Acción | Request |
|---|---|
| Crear instancia | `POST http://localhost:8080/instance/create` body `{"instanceName":"piloto","integration":"WHATSAPP-BAILEYS","qrcode":true}` |
| Ver QR | `GET http://localhost:8080/instance/connect/piloto` |
| Estado | `GET http://localhost:8080/instance/connectionState/piloto` |
| Enviar texto | `POST http://localhost:8080/message/sendText/piloto` body `{"number":"549261XXXXXXX","text":"hola"}` |
| Logout | `DELETE http://localhost:8080/instance/logout/piloto` |

> Nota: estas rutas son de Evolution **v2** (imagen `evoapicloud/evolution-api`).
> Si la imagen que baja es otra generación, confirmar rutas en el manager.

## Apagar

```bash
docker compose down        # conserva sesiones (volúmenes)
docker compose down -v     # borra TODO, incluida la sesión (pide QR de nuevo)
```
