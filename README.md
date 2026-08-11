# Territory Insights

Construye una plataforma SaaS web profesional de inteligencia territorial, análisis demográfico agregado y monitoreo de presencia pública en internet.

STACK OBLIGATORIO:

Frontend: React + TypeScript

UI: Tailwind CSS + shadcn/ui

Backend/Base de datos: Supabase PostgreSQL

Autenticación: Supabase Auth

Hosting/deploy: Vercel

Mapas: Mapbox GL JS o Leaflet

Gráficas: Recharts

Arquitectura preparada para producción

IMPORTANTE:
La plataforma NO debe utilizarse para inferir, almacenar, clasificar o predecir preferencias políticas individuales, afiliación política o intención de voto.
Los datos territoriales y demográficos deben mostrarse exclusivamente de forma agregada.
Los contactos personales deben mantenerse separados de los datos electorales y únicamente pueden almacenarse cuando exista una base legal/consentimiento apropiado.

OBJETIVO DEL PRODUCTO

Crear una plataforma denominada provisionalmente "Territorio Intelligence" que permita:

Visualizar un mapa interactivo de secciones territoriales.

Consultar información demográfica agregada por sección.

Comparar indicadores territoriales.

Registrar contactos autorizados mediante un formulario.

Analizar métricas agregadas de cobertura de contactos.

Ejecutar monitoreo de presencia pública en internet.

Generar análisis tipo social listening inspirado en herramientas como Brand24.

Mostrar dashboards ejecutivos.

Exportar información y reportes.

Mantener arquitectura multiusuario, segura y escalable.

DISEÑO

Crear una interfaz:

Minimalista

Premium

Profesional

Inspirada sutilmente en Zacatecas y su arquitectura barroca

Sin exceso de ornamentos

Responsive

Desktop-first para el dashboard

Mobile responsive

Sidebar lateral

Dark/light mode

Cards con métricas

Mapas a pantalla amplia

Tipografía elegante

Animaciones discretas

MÓDULOS PRINCIPALES

DASHBOARD

Mostrar:

Total de habitantes representados

Total de secciones

Total de contactos registrados

Cobertura territorial

Secciones con mayor concentración de contactos

Evolución mensual de registros

Distribución demográfica agregada

Actividad reciente

Alertas del sistema

Nunca presentar estos datos como "votos", "votantes fidelizados" o "probabilidad de voto".

MAPA TERRITORIAL

Crear un mapa interactivo.

Cada sección territorial debe representarse mediante geometría/polígono cuando existan archivos geoespaciales disponibles.

Al seleccionar una sección mostrar:

ID de sección

Municipio

Localidad

Población total

Distribución por rangos de edad

Distribución por género

Indicadores demográficos disponibles

Número de contactos registrados en la sección, únicamente como métrica administrativa

Porcentaje de cobertura administrativa

Agregar:

búsqueda de sección

búsqueda de municipio

filtros

zoom

capas

leyenda

clustering

vista satelital opcional

exportación

No mostrar inferencias sobre preferencias políticas.

PANEL DE SECCIÓN

Crear drawer/modal lateral.

Información:

SECCIÓN

Identificador

Municipio

Localidad

Población

DEMOGRAFÍA

0–17

18–29

30–44

45–59

60+

GÉNERO

Mujeres

Hombres

No especificado/otros cuando la fuente permita dicha categoría

CONTACTOS ADMINISTRATIVOS

Total registrados

Porcentaje respecto a población de referencia

Evolución temporal

Agregar gráficos Recharts.

REGISTRO DE CONTACTOS

Crear formulario:

Nombre

Edad

Género

Teléfono

Sección territorial

Municipio

Fecha de registro

Consentimiento para almacenamiento de datos

Consentimiento para comunicaciones, cuando corresponda

Validaciones:

nombre obligatorio

edad válida

teléfono validado

sección válida

consentimiento obligatorio para almacenar datos personales

Agregar:

editar

eliminar

buscar

filtrar

exportar

historial

Separar completamente estos datos de cualquier información política.

CONTACTOS

Crear tabla profesional:

Nombre
Edad
Género
Sección
Municipio
Teléfono parcialmente oculto
Fecha de alta
Estado
Consentimiento

Agregar:

búsqueda

filtros

paginación

ordenamiento

exportación CSV

importación CSV

ANALYTICS TERRITORIAL

Crear dashboard con:

cobertura por municipio

cobertura por sección

evolución temporal

distribución de edades

distribución de género

concentración territorial

comparativos entre municipios

Usar mapas de calor exclusivamente para indicadores agregados.

WEB MONITORING

Crear módulo denominado:

"Monitor Público"

Permitir introducir:

nombre de persona pública

organización

marca

candidato

término de búsqueda

El sistema debe recopilar únicamente información públicamente disponible y respetar:

robots.txt

términos de servicio

rate limits

copyright

legislación aplicable

NO realizar scraping de contenido detrás de login.

NO almacenar información personal innecesaria.

ANÁLISIS TIPO BRAND24

Crear pipeline de análisis:

FUENTES

sitios web públicos

noticias

blogs

RSS

plataformas que proporcionen APIs oficiales

fuentes públicas permitidas

MÉTRICAS:

total de menciones

menciones por día

menciones por semana

menciones por mes

evolución

fuentes

dominios

temas

palabras frecuentes

sentimiento

alcance estimado cuando sea posible

engagement cuando la fuente lo proporcione

publicaciones positivas/negativas/neutrales

tendencia

Dashboard:

MENTIONS
SENTIMENT
REACH
SOURCES
TOPICS
TREND

Crear gráfico temporal.

Crear nube/listado de palabras.

Crear ranking de fuentes.

Crear timeline de menciones.

ANÁLISIS IA

Implementar servicio desacoplado para análisis mediante IA.

Cada contenido debe clasificarse:

sentimiento

tema

idioma

relevancia

entidad mencionada

Generar resumen ejecutivo:

"¿Qué está ocurriendo en internet?"

"¿Cuáles son los principales temas?"

"¿Cómo evolucionó la conversación?"

"¿Qué fuentes están generando mayor volumen?"

Evitar inferir intención de voto o preferencias políticas de individuos.

REPORTES

Permitir generar:

PDF

CSV

Excel

Reportes:

territorial

demográfico

contactos

monitoreo web

menciones

sentimiento

evolución

AUTENTICACIÓN

Supabase Auth.

Roles:

SUPER_ADMIN
ADMIN
ANALYST
VIEWER

Implementar Row Level Security.

BASE DE DATOS

Crear tablas:

users
organizations
territorial_units
territorial_geometries
demographics
contacts
contact_consents
contact_history
web_monitors
web_sources
web_mentions
sentiment_analysis
topics
reports
audit_logs

Crear relaciones e índices.

SEGURIDAD

Implementar:

Supabase RLS

autenticación

autorización por organización

auditoría

validación de inputs

rate limiting

sanitización

protección de endpoints

variables de entorno

secretos exclusivamente en backend

no exponer service_role key

backups

logs

ARQUITECTURA

Separar:

/app
/components
/features
/lib
/services
/hooks
/types
/pages

Servicios:

territoryService
demographicsService
contactsService
monitoringService
analyticsService
reportService

EXPERIENCIA

Crear navegación:

Dashboard
Mapa Territorial
Secciones
Contactos
Analytics
Monitor Público
Menciones
Reportes
Configuración

SEED DATA

Crear datos ficticios para desarrollo.

IMPORTANTE:
No inventar datos electorales reales.

Crear claramente un mecanismo para importar posteriormente datasets oficiales.

IMPORTACIÓN DE DATOS

Crear módulo:

"Importar datos territoriales"

Soportar:

CSV
GeoJSON
JSON

Permitir mapear columnas.

Validar:

identificador

municipio

población

geometría

datos demográficos

Mostrar preview antes de importar.

DEPLOY

Preparar:

Supabase
Vercel
Environment Variables
Production build
Error handling
Logging

Variables:

VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
MAPBOX_TOKEN
MONITORING_API_URL
AI_API_URL

Nunca introducir secretos directamente en el frontend.

RESULTADO

No crear un prototipo visual.

Crear una aplicación funcional con:

navegación real

autenticación

base de datos

CRUD

RLS

mapas

gráficas

importación

dashboards

monitoreo

reportes

manejo de errores

estados loading/empty/error

responsive design

La aplicación debe quedar preparada para conectar datasets territoriales reales y servicios externos mediante APIs.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://territory-insight-65.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9447552c-69d0-4210-ac02-cb6b1c6eba83).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
