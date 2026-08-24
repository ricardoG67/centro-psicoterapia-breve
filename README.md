# Gestión Académica

Aplicación web para administrar alumnos, cursos/ediciones, matrículas y notas.
Stack 100% gratuito: frontend estático (Vue 3 + Vite) en GitHub Pages, backend
y base de datos en Supabase.

> Diplomas y constancias quedan planificados para la versión 2.0.

## 1. Crear el proyecto en Supabase

1. Crea una cuenta gratuita en https://supabase.com y un proyecto nuevo.
2. Ve a **SQL Editor** y ejecuta el contenido de [`db/schema.sql`](db/schema.sql).
   Esto crea las tablas, las políticas de seguridad (RLS) y las vistas de reportes.
3. Ve a **Authentication → Users** y crea manualmente los 4 usuarios del equipo
   (correo + contraseña). No hace falta que se registren solos: los creas tú
   desde el panel.
4. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public key`

## 2. Configurar el proyecto local

```bash
npm install
cp .env.example .env
```

Edita `.env` y pega ahí la URL y la anon key del paso anterior.

## 3. Levantar en modo desarrollo

```bash
npm run dev
```

Abre la URL que te muestre la terminal (usualmente http://localhost:5173).

## 4. Compilar para producción

```bash
npm run build
```

Esto genera la carpeta `dist/` con los archivos estáticos listos para publicar.

## 5. Publicar en GitHub Pages

1. Crea un repositorio en GitHub (puede ser privado) y sube este proyecto.
2. Instala la herramienta de despliegue:
   ```bash
   npm install --save-dev gh-pages
   ```
3. Agrega en `package.json`, dentro de `"scripts"`:
   ```json
   "deploy": "vite build && gh-pages -d dist"
   ```
4. Cada vez que quieras publicar cambios:
   ```bash
   npm run deploy
   ```
5. En GitHub, ve a **Settings → Pages** y confirma que la fuente sea la rama
   `gh-pages`.
6. Cuando tengan acceso al DNS del dominio, agreguen un registro `CNAME`
   apuntando su dominio (o subdominio) a `usuario.github.io`, y configuren
   el dominio personalizado en **Settings → Pages**. Mientras tanto, el sitio
   ya es accesible en `https://usuario.github.io/nombre-repo/`.

## Notas de seguridad

- La `anon key` de Supabase es pública por diseño; la protección real de los
  datos la dan las políticas de Row Level Security (RLS) definidas en
  `db/schema.sql`, que solo permiten leer/escribir a usuarios autenticados.
- Los 4 usuarios se crean manualmente desde el panel de Supabase, no hay
  registro público abierto.
