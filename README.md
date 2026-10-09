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
```

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
