# BRILLO MW — Plan del proyecto

**B**ase de **R**egistro de **I**nventarios, **L**íderes, **L**iquidaciones y
**O**ficinas MW. Sistema operativo de la tienda de MW Joyería que reemplaza
a Aronium, trabajando **de la mano de la página web** sin invadirla.

Meta: dejar Aronium a **finales de 2026**.

---

## 1. Principios

1. **BRILLO no modifica la página web.** Viven en repositorios distintos
   (`brillomw` y `-mw-joyeria-portal`). Cualquier cambio que BRILLO
   necesite en la página se pide y se autoriza por separado (ver §6).
2. **Mismos datos, un solo Firebase.** BRILLO usa el mismo proyecto de
   Firebase que la página (`moonwolf-portal`): mismas cuentas, mismo
   catálogo, mismas emprendedoras y líderes.
3. **La página queda para emprendedoras y líderes.** Todo lo operativo
   de la tienda (inventario, caja, apartados, cambios, garantías) pasa a
   BRILLO.

---

## 2. Decisiones tomadas

### Tienda y equipos

| Tema | Decisión |
|---|---|
| Sucursales | 1 |
| Cajas (PC) | 2 — app de escritorio |
| Tablets | 3 — una por persona de Staff en su turno |

### Quién hace qué

| Acción | Staff | Encargado | Administrativo |
|---|:-:|:-:|:-:|
| Alta, edición y baja de productos (tablet) | ✔ | ✔ | ✔ |
| Gestionar apartados (tablet) | ✔ | ✔ | ✔ |
| Cobrar en caja | — | ✔ | ✔ |
| Abrir y cerrar la caja del día | — | ✔ | ✔ |
| Autorizar un cambio físico | — | ✔ | ✔ |
| Registrar una garantía | — | ✔ | ✔ |
| Cancelar una venta cobrada | — | — | ✔ |
| Descuentos manuales o cambio de precio al cobrar | — | — | — |

"Encargado" es el rol antes llamado RH (en la página sigue guardado como
`encargado`).

### Sesión

- Cada persona usa **su cuenta real de la página** (las que ya existen en
  Configuración → Usuarios y permisos). Las cuentas de prueba (`staff01`,
  etc.) no se usan en BRILLO.
- Inicia sesión **al principio del turno con el mismo usuario y contraseña
  de la página**, y la cierra al terminar. No se confirma cada acción.
- Entrar con PIN queda como mejora para después; se puede agregar sin
  rehacer nada.
- Cada movimiento queda registrado a nombre de quien tenía la sesión abierta.

### Cobro y ticket

- Público general y emprendedoras/líderes se atienden igual: mismos
  métodos de pago, mismo ticket y entrega de certificado de garantía.
- **Descuento de mayoreo automático** al identificar a la emprendedora o
  líder:

  | Categoría | Descuento |
  |---|---|
  | Oro laminado | 60% |
  | Acero inoxidable y fantasía | 40% |
  | Cajas de regalo y exhibidores | 30% |
  | Souvenirs | % asignado por artículo |

- Métodos de pago: efectivo, tarjeta (terminal) y transferencia.
  **Tarjeta y transferencia siempre guardan su número de referencia**, y
  no se puede registrar dos veces la misma.
- **Ticket:** logo, folio, artículos, método de pago, referencia, quién
  cobró e **IVA desglosado** (faltan datos por confirmar, ver §7).
- **Sin facturación electrónica (CFDI).**
- **Servicios:** se cobran grabado, reparación y ajustes. Son artículos
  sin inventario, que siempre se pueden vender; el precio puede fijarse
  al momento de cobrar.

### Ventas a crédito (fiado)

- Se vende a crédito **a veces**: la clienta se lleva la pieza y paga
  después en abonos.
- Cada abono se registra con su método de pago (y referencia si es
  tarjeta o transferencia) y entra al corte del día en que se cobra.
- Se le puede fiar a **cualquier cliente** (público general, emprendedoras
  y líderes) y **no hay límite** de crédito.
- Lo registra quien cobra (Encargado o Administrativo).
- **Entra después del arranque** (fase 5); no es indispensable el primer día.
- Por confirmar en §7: en qué momento cuenta para comisiones y recompensas.

### Corte de caja

- **Diario**, uno **por caja** y uno **general**.
- La abre y la cierra Encargado o Administrativo, con un fondo inicial
  en efectivo que se captura al abrir.
- **Hecho:** pestaña Caja → "Corte del día". Por caja: corte parcial en
  vivo (ventas, artículos, folios, descuento de mayoreo, IVA, total por
  método de pago con sus referencias, e/l contra público general) y
  efectivo esperado = fondo + efectivo de ventas + entradas − salidas.
  Entradas y salidas de efectivo con motivo. Cierre: se captura el
  efectivo contado y queda el sobrante o faltante (con nota obligatoria
  si no cuadra); ya cerrada, no se puede cobrar en esa caja ese día.
  Corte general del día con las dos cajas. Ticket del corte en 58/80 mm.
- Cada venta suma al turno: si se cobra mientras alguien cierra la caja,
  el cierre se detiene y pide revisar de nuevo, para que no quede fuera
  ninguna venta.
- Pendiente: los pagos de comisión del reporte de Aronium (todavía no se
  pagan comisiones desde BRILLO) y el desglose por denominaciones.

### Cambios físicos (devoluciones)

- Se aceptan si la pieza viene **intacta y con su etiqueta**.
- La pieza **regresa al inventario** y la persona queda con **saldo a
  favor**.
- Solo para **emprendedoras y líderes**. El saldo **no caduca**.
- Lo autoriza Encargado o Administrativo.

### Garantías

- Aplican a **todos** (público general, emprendedoras y líderes).
- Las registra Encargado o Administrativo, capturando el **folio del
  certificado** la primera vez que se hace válida.
- Se cambia la pieza: lo que se pagó por la original se toma a cuenta y
  pueden elegir cualquier otra pieza nueva.
- La pieza defectuosa **no** regresa al inventario a la venta.
- Los certificados se siguen imprimiendo fuera de BRILLO (llevan cuidados
  y un folio).

### Regla de dinero para comisiones y recompensas

**Solo cuenta el dinero nuevo que entra; el saldo a favor nunca cuenta.**

> Se lleva un anillo y paga $80 → cuentan $80. Lo regresa (cambio físico)
> → queda saldo a favor de $80; no se resta nada. Se lleva una pulsera de
> $92, usa los $80 de saldo y paga $12 → **solo cuentan $12**.

Aplica a comisiones de líderes, Reto de Constancia, rifas y demás
cálculos del Plan MW.

### Inventario y etiquetas

- BRILLO pasa a ser la **fuente de verdad del inventario**.
- Las etiquetas llevan un **código QR con el código del producto**.
- Hoy se diseñan e imprimen en otro programa; **BRILLO las generará e
  imprimirá**.
- Las tablets leen el QR con la cámara y toman las fotos de los productos.

### Inicio y Mi cuenta

- **Hecho:** Inicio (pestaña con la que abre BRILLO). Para todos: resumen
  operativo (pendientes de depósito, apartados vencidos, lista de deseos)
  y eventos de la semana. Encargado y Admin: caja de hoy (vendido y cajas
  abiertas) y próximo periodo de pago; Encargado, recordatorios de
  nómina; Staff, sus actividades por confirmar; Admin, productos
  disponibles, emprendedoras/líderes activas, Plan MW pendiente,
  solicitudes de inscripción y actividad reciente. Cada tarjeta lleva a
  su pestaña.
- **Hecho:** Mi cuenta para los 3 roles: perfil (foto, usuario, teléfono,
  correo; Admin los edita, como en la página), recibo de nómina de la
  semana (y semanas anteriores) con firma de recibido, e información
  laboral. "Olvidé mi contraseña" le manda un aviso real a Administración.
- Diferencias: en la página, Staff ve un directorio de todo el personal
  y elige a quién consultar la nómina (cuenta compartida); en BRILLO cada
  quien ve la suya. Encargado ve datos reales de Nómina en vez de los de
  ejemplo. Falta en Inicio de Admin: comisiones pendientes (llega con
  Comisiones) y cambios de Configuración (vive solo en el navegador).

### Calendario

- **Hecho:** pestaña Calendario para Staff, Encargado y Admin, igual que
  la página: resumen, búsqueda, filtro presencial/virtual, agregar,
  editar (con foto) y eliminar eventos, y lista de asistencia con
  descarga en CSV. Cada cambio queda en el evento ("Agregado/Editado por")
  y en Actividad.
- Diferencias: en la página, Staff no deja registro en Actividad al
  mover el calendario; en BRILLO todos lo dejan. El correo a
  emprendedoras por evento nuevo no se manda porque en la página está
  sin configurar (EmailJS vacío).
- Encontrado en la página: cuando una emprendedora confirma asistencia,
  el guardado se rechaza (las reglas solo dejan escribir eventos al
  personal interno) y el error se ignora, así que la confirmación no
  llega al servidor.

### Actividad y Actividades del Staff

- **Hecho:** pestaña Actividad: la misma bitácora que la página (últimas
  300 acciones), en vivo, con las mismas reglas (solo Admin ve acciones de
  Admin; Staff solo catálogo, apartados, calendario y lista de deseos) y
  filtros por sección, rol, origen (página o BRILLO) y texto.
- **Hecho:** Actividades del Staff. Staff ve "Mis actividades" de la
  semana y confirma con "Enterado" (su empleado se toma de Nómina, ligado
  a su cuenta o por nombre, como la página). Encargado y Admin organizan
  la semana: actividades base precargadas, crear, editar, sortear zonas,
  anunciar (avisa a cada responsable), firmar, eliminar y reportes
  (semanal y de organización) para imprimir o guardar en PDF. Admin
  además ve "Todas las actividades".
- Diferencia: los reportes se imprimen o se guardan en PDF desde el
  navegador, en vez de descargarse directamente como en la página.

### Lista de deseos y resurtido

- **Hecho:** pestaña Lista de deseos en BRILLO para Staff, Encargado y
  Admin, igual que la página: crear solicitudes (para una Emprendedora o
  público en general), cambiar estado (al marcar "Disponible" se elige el
  producto y se le avisa a la Emprendedora) y filtros. Resurtido: Staff y
  Encargado lo solicitan (avisa a la bandeja de Staff); Administración lo
  revisa, agrega observaciones y lo atiende (avisa a quien lo pidió).
- Al dar de alta un producto en BRILLO aparece el mismo paso que en la
  página: "¿Alguien pedía algo como esto?" para marcar solicitudes.
- Diferencia: en la página, Encargado solo ve las solicitudes que creó
  Encargado; en BRILLO todos ven todas, como Staff y Admin en la página.

### Apartados

- Las emprendedoras y líderes los **solicitan desde la página**.
- Staff los **gestiona desde BRILLO**: quién apartó, qué tiene apartado y
  qué ha pagado.
- Se mantienen las reglas actuales: depósito de $50 por ventana, monto
  libre, 3 días normal, 15 días foránea, VIP sin depósito ni vencimiento
  con aprobación de Staff.
- **Hecho:** pestaña Apartados en BRILLO para Staff, Encargado y Admin,
  igual que el panel de la página (nueva ventana, depósito, comprobante
  por WhatsApp, no depositó, VIP, liquidar, excedente, cancelar, quitar
  pieza, bolsita, quitar de la vista, desapartar, avisos de vencimiento
  en Admin). Cada acción es una transacción: ventana, existencias,
  crédito, Actividad y avisos se guardan juntos o nada. Las referencias
  de transferencia se comparten con las ventas de BRILLO.
- Pendiente: los días y el depósito se leen de Configuración de la
  página, que hoy vive solo en el navegador; BRILLO usa los valores de
  siempre ($50, 3 y 15 días).

### Prototipo de la dueña ("Caja de la joyería")

La dueña hizo un prototipo en HTML con las pantallas y flujos que quiere.
BRILLO lo toma como **referencia funcional y visual** (no como código).
No se ha usado con datos reales, así que no hay nada que migrar de él.

- Se conservan sus secciones: Vender, Apartados, Créditos, Tickets,
  Inventario, Clientes, Reportes, Ajustes y Seguridad.
- Se suman al plan funciones que trae y no estaban: servicios sin
  inventario, costo y ganancia por pieza (visibles solo con permiso),
  stock mínimo, ubicación de la pieza, carga masiva de inventario y
  clientes desde Excel/CSV, pre-ticket, bloqueo automático por
  inactividad, historial de movimientos por pieza, bitácora de cambios y
  sus 12 reportes (incluidos ventas por cajero y por grupo de líder).
- Lo que **no** se toma tal cual, porque no sirve con 2 cajas y 3
  tablets o con las reglas de MW: guardado local por equipo, folios y
  existencias calculados en cada equipo, permisos revisados solo en
  pantalla, apartados de 30 días con anticipo, código de barras Code 39
  y productos sin variantes.

### Diseño

- BRILLO usa la identidad de la **página**: Cinzel para encabezados,
  Poppins para el cuerpo (Zing Rust Script en usos puntuales), con los
  mismos colores de marca.

### Historial de Aronium

- Se migra **todo**, incluidas las ventas pasadas, porque de ahí salen
  comisiones y recompensas.
- Lo que hoy se saca de Aronium es un **reporte**: ventas totales, cuánto
  entró por tarjeta, transferencia y efectivo, y pagos de comisiones.
  BRILLO lo reemplaza.

---

## 3. Módulos

| # | Módulo | Dónde | Qué hace |
|---|---|---|---|
| 1 | Acceso | Caja y tablet | Inicio de sesión por persona con Nombre + PIN; permisos según rol |
| 2 | Inventario | Tablet (y caja) | Alta, edición y baja de productos con variantes (modelo → color → talla); fotos; existencias; historial de movimientos |
| 3 | Etiquetas QR | Tablet o caja | Generar e imprimir etiquetas con QR del código del producto |
| 4 | Caja | PC | Cobro con QR, mayoreo automático, pagos con referencia, saldo a favor, ticket |
| 5 | Corte de caja | PC | Apertura y cierre diario, por caja y general |
| 6 | Cambios y garantías | PC | Cambio físico con saldo a favor; garantía con folio del certificado |
| 7 | Apartados | Tablet | Gestión de las solicitudes que llegan de la página: depósitos, piezas, liquidaciones, vencimientos |
| 8 | Reportes | PC | Reemplazo del reporte de Aronium: ventas, métodos de pago con referencias, comisiones pagadas, cortes |
| 9 | Migración de Aronium | Una sola vez | Productos, existencias, clientas y ventas pasadas |
| 10 | Cancelaciones | PC | Cancelación de ventas, solo Administrativo |
| 11 | Créditos | PC | Ventas a crédito, abonos, saldos por cobrar y estado de cuenta |
| 12 | Clientes | PC y tablet | Público general con número de membresía; emprendedoras y líderes se leen de la página |
| 13 | Carga masiva | PC | Alta de inventario y clientes desde Excel/CSV |

---

## 4. Tecnología (propuesta)

| Pieza | Propuesta | Por qué |
|---|---|---|
| Interfaz | Una sola base de código web (TypeScript) para caja y tablet | Se escribe una vez y se adapta a cada pantalla |
| Caja (PC) | **Tauri** → instalador de Windows | Acceso directo a las impresoras de tickets y etiquetas |
| Tablet | **Capacitor** → app de Android (o iPad) | Cámara para leer QR y tomar fotos |
| Datos | **Firebase** (Auth + Firestore + Storage para fotos), mismo proyecto que la página | Datos compartidos con la página |
| Sin internet | Persistencia local de Firestore en la caja | Poder cobrar aunque se caiga la red; se sincroniza al volver |

Pendiente técnico: el lector de QR en las cajas. Los lectores USB de
código de barras comunes (1D) no leen QR; hace falta un lector 2D o usar
una webcam.

---

## 5. Fases

Calendario aproximado desde octubre de 2026; se ajusta conforme lleguen
los pendientes de §7.

| Fase | Semanas | Entrega | Resultado |
|---|---|---|---|
| 0. Base | 1–2 | Proyecto, conexión a Firebase, inicio de sesión por persona, catálogo de solo lectura | Se puede entrar a BRILLO en PC y tablet |
| 1. Inventario | 3–6 | Alta y edición de productos en tablet, fotos, lectura de QR, impresión de etiquetas, movimientos de inventario | Staff maneja el catálogo desde la tablet |
| 2. Caja | 5–9 | Cobro, servicios, mayoreo automático, pagos con referencia, IVA desglosado, saldo a favor, ticket, corte diario | Se puede cobrar sin Aronium |
| 3. Cambios y migración | 8–11 | Cambios físicos, garantías, migración de productos y existencias desde Aronium | Inventario real cargado en BRILLO |
| 4. Arranque | 10–12 | Prueba en paralelo con Aronium, ajustes, capacitación | **Se deja Aronium** |
| 5. Después del arranque | 2027 | Apartados en BRILLO, créditos, reportes completos, historial de ventas migrado, cancelaciones | Todo lo operativo fuera de la página |

**Lo indispensable para el primer día** (fases 0–4): inventario, cobro,
ticket y corte de caja.

---

## 6. Lo que necesita cambios en la página (requiere autorización)

BRILLO no los hace por su cuenta; se piden uno por uno cuando toque.

1. **Catálogo e inventario (antes de la fase 1).** Hoy la página guarda
   el catálogo reescribiendo **toda** la colección de productos y borra lo
   que no conoce. Si BRILLO cambia existencias o productos, el siguiente
   guardado de la página lo desharía. Opciones: que la página guarde solo
   el producto que cambió, o que la edición de catálogo se retire de la
   página (si ya se hará en BRILLO).
2. **Ventas en comisiones y recompensas (antes del arranque).** Hoy la
   página solo cuenta los apartados liquidados. Tiene que leer también las
   ventas de BRILLO, aplicando la regla de "solo dinero nuevo".
3. **Apartados (fase 5).** La página reescribe también toda la colección
   de apartados. Para que Staff los gestione en BRILLO mientras las
   emprendedoras los solicitan en la página, la página debe guardar solo
   el apartado que cambió. **Hecho** en la página (apartados y avisos
   guardan solo lo que cambió).
4. **Reglas de seguridad de Firestore (fase 0).** BRILLO necesita reglas
   para sus propias colecciones. El archivo de reglas es uno solo y está
   en el repositorio de la página, o se usa una base de datos aparte para
   BRILLO dentro del mismo proyecto.

---

## 7. Pendientes de información

| # | Pendiente | De quién |
|---|---|---|
| 1 | Un ejemplo real del código que lleva el QR de una etiqueta | Tienda |
| 2 | Datos que faltan en el ticket; idealmente foto de un ticket actual | Tienda |
| 3 | Fondo de caja: ¿cada caja abre con un monto fijo? | Jefes |
| 4 | Marcas y modelos de la impresora de tickets y la de etiquetas | Tienda |
| 5 | ¿Qué lector usarán en las cajas para el QR? | Tienda |
| 6 | Exportaciones de Aronium de ejemplo (productos, clientas, ventas) y si la de ventas trae detalle por artículo | Tienda |
| 7 | Desde qué fecha migrar las ventas | Jefes |
| 8 | Garantía: si la pieza nueva cuesta menos, ¿qué pasa con la diferencia (sobre todo para público general, que no tiene saldo a favor)? | Jefes |
| 9 | Garantía: ¿qué se hace con la pieza defectuosa (merma o devolución a proveedor)? | Jefes |
| 10 | Tablets: ¿Android o iPad? | Jefes |
| 11 | Créditos: ¿la venta a crédito cuenta para comisiones, Reto y rifas **al entregar la pieza** (todo el monto ese día) o **conforme entran los abonos** (cada abono en su fecha, como la regla de "solo dinero nuevo")? | Jefes |
| 12 | Servicios (grabado, reparación, ajustes): ¿cuentan para comisiones y recompensas? | Jefes |
