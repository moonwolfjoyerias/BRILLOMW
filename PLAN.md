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
| Abrir y cerrar la caja del día | — | ✔ | — |
| Autorizar un cambio físico | — | ✔ | ✔ |
| Registrar una garantía | — | ✔ | ✔ |
| Cancelar una venta cobrada | — | — | ✔ |
| Descuentos manuales o cambio de precio al cobrar | — | — | — |

"Encargado" es el rol antes llamado RH (en la página sigue guardado como
`encargado`).

### Sesión

- Cada persona tiene **su propia cuenta**.
- Inicia sesión con **Nombre + PIN al principio del turno** y la cierra al
  terminar. No se confirma cada acción.
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
- Reglas por confirmar en §7: a quién se le fía, quién lo autoriza,
  límite de crédito y cómo cuenta para comisiones.

### Corte de caja

- **Diario**, uno **por caja** y uno **general**.
- Lo abre y lo cierra Encargado.

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

### Apartados

- Las emprendedoras y líderes los **solicitan desde la página**.
- Staff los **gestiona desde BRILLO**: quién apartó, qué tiene apartado y
  qué ha pagado.
- Se mantienen las reglas actuales: depósito de $50 por ventana, monto
  libre, 3 días normal, 15 días foránea, VIP sin depósito ni vencimiento
  con aprobación de Staff.

### Prototipo de la dueña ("Caja de la joyería")

La dueña hizo un prototipo en HTML con las pantallas y flujos que quiere.
BRILLO lo toma como **referencia funcional y visual** (no como código):

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
   el apartado que cambió.
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
| 11 | ¿El prototipo "Caja de la joyería" ya se usa con datos reales (ventas, clientes, inventario, apartados o créditos de verdad)? Si sí, también se migran | Dueña |
| 12 | Créditos: ¿a quién se le fía (público, emprendedoras o ambos), quién lo autoriza y hay límite? | Jefes |
| 13 | Créditos: ¿la venta cuenta para comisiones cuando se entrega la pieza o conforme entran los abonos? | Jefes |
| 14 | Servicios (grabado, reparación, ajustes): ¿cuentan para comisiones y recompensas? | Jefes |
| 15 | ¿Créditos entran desde el primer día o pueden esperar a después del arranque? | Jefes |
