# 📍 CSV2MAP GT

**CSV2MAP GT** es una herramienta web que permite convertir archivos `.CSV` con códigos de departamentos en **archivos geoespaciales `.SHP` y `.KML`**, listos para análisis en software GIS.

### 🧭 Sitio en producción:
👉 https://csv2map.vercel.app

---

## 🔎 ¿Qué hace?

- ✅ Carga archivos CSV con una columna de códigos de departamento
- 🗺️ Muestra en un mapa los departamentos seleccionados
- 📦 Descarga un ZIP con archivos `.shp` y `.kml` generados desde el CSV

---

## 🛠️ Tecnologías utilizadas

| Parte         | Tecnología                        |
|---------------|-----------------------------------|
| Frontend      | React + Vite + Tailwind CSS       |
| Backend       | FastAPI + GeoPandas               |
| Mapas         | Leaflet.js                        |
| Hosting       | Vercel (frontend) + Render (API)  |
| Análisis      | Google Analytics                  |

---

## 📁 Estructura

```bash
GEO_GUATE/
├── geo_guate_frontend/        # App React
│   ├── public/                # GeoJSON y archivos públicos
│   └── src/                   # Componentes de React
├── Departamentos/             # Shapefile base (.shp, .dbf, etc.)
├── utils/                     # Funciones auxiliares
├── main.py                    # API FastAPI
├── requirements.txt           # Dependencias Python
└── README.md
```

---

## 🚀 Cómo correr localmente

### 1. Clonar el repositorio

```bash
git clone https://github.com/PeterArgueta/csv2map.git
cd csv2map
```

### 2. Ejecutar el backend (FastAPI)

```bash
cd GEO_GUATE
pip install -r requirements.txt
uvicorn main:app --reload
```

> El backend se inicia en `http://localhost:8000`

### 3. Ejecutar el frontend

```bash
cd geo_guate_frontend
npm install
npm run dev
```

> La app se abre en `http://localhost:5173`

> Asegúrate de tener configurada esta variable en `.env`:

```env
VITE_API_URL=http://localhost:8000
```

---

## 📦 Producción

- Backend (Render): https://csv2map.onrender.com
- Frontend (Vercel): https://csv2map.vercel.app

---

## 📄 Licencia

Este proyecto está bajo la licencia MIT.  
Hecho por [Peter Argueta](https://www.linkedin.com/in/peterargueta/)