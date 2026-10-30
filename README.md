# BRILLO MW

Sistema de caja e inventario de MW Joyería. Trabaja de la mano de la página
web (`-mw-joyeria-portal`): comparte su proyecto de Firebase (mismas cuentas,
mismo catálogo) sin modificar la página. Ver [PLAN.md](PLAN.md).

## Desarrollo

```
npm install
npm run dev        # abre la app en el navegador
npm test           # pruebas
npm run typecheck  # revisión de tipos
npm run build      # versión lista para empaquetar en dist/
npm run dev:piloto # BRILLO PILOTO en el navegador (nada se guarda)
npm run build:piloto # BRILLO PILOTO en dist/piloto/
```

## BRILLO PILOTO

La misma app, con los datos reales, pero **sin guardar nada**: para
practicar y enseñar a usar BRILLO sin afectar a nadie. Se publica junto con
BRILLO en la misma dirección terminada en `/piloto/`, y como se arma del
mismo código, cada cambio que se fusione a `main` también llega al piloto.

- Se entra con las cuentas reales. Lo que se lee es real (catálogo,
  emprendedoras, ventas…).
- Lo que se "guarda" (ventas, cambios físicos, garantías, inventario, nómina,
  aprobar inscripciones…) se queda solo en la memoria de esa pantalla: se ve
  como si se hubiera guardado, pero a Firebase no llega nada. Al recargar, o
  con "Reiniciar práctica", se borra. No se crean cuentas de acceso.
- Una franja y la etiqueta "PILOTO" lo indican, y cada ticket impreso dice
  "PILOTO · SIN VALOR".
- Cómo funciona: todo BRILLO usa Firestore a través de `src/datos/firestore.ts`;
  en piloto esa puerta pone las escrituras en una capa en memoria encima de
  lo real. La prueba `src/datos/puerta.test.ts` falla (y no se publica) si
  algún archivo nuevo importa `firebase/firestore` directo y se saltara el
  piloto.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `src/firebase.ts` | Conexión al mismo Firebase que la página |
| `src/pagina/` | Lectura de datos de la página (catálogo), con la misma forma y reglas de compatibilidad que ella |
| `src/sesion/` | Inicio de turno con las cuentas reales de la página (solo Staff, Encargado y Administrativo) |
| `src/vistas/` | Pantallas |
| `src/estilos/` | Identidad visual de la página (Cinzel, Poppins, colores de marca) |

## Estado

**Fase 0:** inicio de sesión y catálogo de solo lectura. Las apps de
escritorio (Tauri) y tablet (Capacitor) se agregan al cerrar la fase 0.

Nota: `npm audit` reporta alertas en `@grpc/grpc-js`, una dependencia que
Firestore solo usa al correr en Node (servidor). La app corre en navegador,
Tauri y Capacitor, donde ese paquete no se incluye.
