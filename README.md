# TTL=0 · Diagnóstico de Redes (Servidor Local para Clases)

Presentación interactiva, terminal simulada multi-OS (Windows, Linux, Cisco IOS) y quiz en tiempo real tipo Kahoot, diseñado para ejecutarse **100% de manera local y offline** en el aula de clases.

Tu computadora funciona al mismo tiempo como:
1. **Proyector**: Muestra las diapositivas, animaciones de red y tabla de clasificación en pantalla grande.
2. **Servidor Local Node.js**: Distribuye la presentación a los celulares y laptops de los estudiantes conectados a la misma red Wi-Fi o zona Wi-Fi (Hotspot) de tu equipo, sin necesidad de conexión a Internet.

---

## 🚀 Inicio Rápido

Solo necesitas tener **Node.js** instalado (no requiere librerías externas ni `npm install`).

```bash
# Iniciar el servidor local
npm start
# O directamente:
node server.js
```

El servidor detectará automáticamente las interfaces de red de tu equipo e imprimirá en la terminal:

```text
╔══════════════════════════════════════════════════════════════════╗
║         TTL=0 · SERVIDOR LOCAL DE CLASE (REDES)                  ║
╠══════════════════════════════════════════════════════════════════╣
║ [Proyector / Este PC]:                                           ║
║   http://localhost:3000                                          ║
║                                                                  ║
║ [Estudiantes / Dispositivos en la misma red Wi-Fi o Hotspot]:    ║
║   http://192.168.1.50:3000                                       ║
║                                                                  ║
║  • Clave de Administrador: 1708                                  ║
║  • Resultados guardados en: resultados.json                      ║
║  • Sincronización en tiempo real (SSE): ACTIVADA                 ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## 📱 ¿Cómo se conectan los estudiantes?

1. Los estudiantes se conectan a la **misma red Wi-Fi del aula** (o al **Punto de acceso / Hotspot** que compartas desde tu laptop o celular).
2. Abren el navegador en sus celulares (Chrome, Safari, Firefox, etc.) e ingresan la IP que muestra la terminal o el botón **"Celulares"** en la barra superior (ej: `http://192.168.1.50:3000`).
3. En el **Hub de entrada**, eligen la pestaña **Participante**, escriben su nombre y listo.

---

## 👨‍🏫 Modo Presentador (Administrador)

- En el proyector o en tu navegador abre `http://localhost:3000`.
- En el Hub de entrada elige **Presentador (Admin)** y coloca la clave: **`1708`**.
- Al cambiar de diapositiva o presionar **"Iniciar para todos"** en el quiz, todas las pantallas de los estudiantes cambiarán **instantáneamente** en tiempo real mediante *Server-Sent Events (SSE)* con latencia menor a 5 ms.

---

## 📊 Guardado de Resultados

Al terminar el quiz, los resultados de todos los estudiantes se guardan automáticamente en tu PC en el archivo:
```text
resultados.json
```
Contiene el nombre, puntaje, aciertos, segundos transcurridos y fecha de cada participante para que puedas calificar fácilmente después de clase.

---

## ⚙️ Opciones avanzadas

Puedes cambiar el puerto o la contraseña con variables de entorno:
```bash
PORT=8080 ADMIN_PASS=miClave node server.js
```
