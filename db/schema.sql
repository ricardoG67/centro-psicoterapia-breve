-- Esquema de base de datos: Gestión Académica
-- Ejecutar en el SQL Editor del panel de Supabase (una sola vez, en un
-- proyecto nuevo). Si ya tenías un esquema anterior, usa el archivo de
-- migración correspondiente en vez de este.

create extension if not exists "pgcrypto";

-- ALUMNOS ------------------------------------------------------------
create table alumnos (
  id uuid primary key default gen_random_uuid(),
  nombres text not null,
  apellidos text not null,
  tipo_documento text not null default 'DNI' check (tipo_documento in ('DNI', 'Pasaporte')),
  documento text not null,
  fecha_nacimiento date,
  correo text,
  celular text,
  profesion text,
  nacionalidad text,
  created_at timestamptz not null default now(),
  unique (tipo_documento, documento)
);

-- FORMACIONES: el programa completo (ej. "Formación Psicoterapia Edición
-- III"). Es lo que el alumno se matricula y lo que aparece en el
-- certificado, con una sola nota final.
create table formaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  horas integer,
  created_at timestamptz not null default now()
);

-- CURSOS: módulos reutilizables entre formaciones (ej. Epistemología,
-- Fundamentos, Hipnosis Ericksoniana). Una formación puede no tener
-- ninguno (funciona con nota directa) o varios.
create table cursos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  created_at timestamptz not null default now()
);

-- Qué cursos componen cada formación (muchos a muchos).
create table formacion_cursos (
  id uuid primary key default gen_random_uuid(),
  formacion_id uuid not null references formaciones(id) on delete cascade,
  curso_id uuid not null references cursos(id) on delete cascade,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  unique (formacion_id, curso_id)
);

-- MATRÍCULAS (un alumno inscrito en una formación) -----------------------
create table matriculas (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references alumnos(id) on delete cascade,
  formacion_id uuid not null references formaciones(id) on delete cascade,
  fecha_matricula date not null default current_date,
  created_at timestamptz not null default now(),
  unique (alumno_id, formacion_id)
);

-- NOTAS: nota FINAL de la formación. Siempre editable a mano; si la
-- formación tiene cursos componentes, la pantalla de Notas sugiere el
-- promedio de notas_curso, pero el valor que queda guardado aquí es el
-- que se usa en el certificado.
create table notas (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null unique references matriculas(id) on delete cascade,
  calificacion numeric(5,2),
  observacion text,
  docente text,
  fecha_evaluacion date,
  created_at timestamptz not null default now()
);

-- NOTAS_CURSO: nota independiente por cada curso componente, solo
-- aplica cuando la formación tiene cursos asignados via formacion_cursos.
create table notas_curso (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references matriculas(id) on delete cascade,
  curso_id uuid not null references cursos(id) on delete cascade,
  calificacion numeric(5,2),
  created_at timestamptz not null default now(),
  unique (matricula_id, curso_id)
);

-- SEGURIDAD: solo usuarios autenticados (los del equipo) pueden
-- leer y escribir. Nadie anónimo por internet puede ver datos.
alter table alumnos enable row level security;
alter table formaciones enable row level security;
alter table cursos enable row level security;
alter table formacion_cursos enable row level security;
alter table matriculas enable row level security;
alter table notas enable row level security;
alter table notas_curso enable row level security;

create policy "auth full access alumnos" on alumnos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access formaciones" on formaciones
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access cursos" on cursos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access formacion_cursos" on formacion_cursos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access matriculas" on matriculas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access notas" on notas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access notas_curso" on notas_curso
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- PERMISOS: además de las políticas RLS de arriba, Postgres exige el
-- permiso base sobre la tabla para el rol "authenticated" (el que usan
-- los usuarios logueados) y para "service_role" (scripts de administración
-- locales, como scripts/importar-alumnos.mjs). Sin esto da "permission denied".
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on alumnos, formaciones, cursos, formacion_cursos, matriculas, notas, notas_curso
  to authenticated;
grant select, insert, update, delete
  on alumnos, formaciones, cursos, formacion_cursos, matriculas, notas, notas_curso
  to service_role;

-- Vista de apoyo para los reportes (por alumno, por formación, record de notas)
-- security_invoker: la vista respeta las políticas RLS de quien consulta,
-- en vez de heredar los permisos del dueño de la vista (evita fugas).
create view v_record_notas with (security_invoker = true) as
select
  a.id as alumno_id,
  a.tipo_documento,
  a.documento,
  a.nombres,
  a.apellidos,
  f.id as formacion_id,
  f.nombre as formacion,
  m.id as matricula_id,
  m.fecha_matricula,
  n.calificacion,
  n.observacion,
  n.docente,
  n.fecha_evaluacion
from matriculas m
join alumnos a on a.id = m.alumno_id
join formaciones f on f.id = m.formacion_id
left join notas n on n.matricula_id = m.id;

grant select on v_record_notas to authenticated;

-- Vista de apoyo: notas por curso componente, con el nombre del curso y
-- de la formación a la que pertenece esa matrícula.
create view v_notas_curso with (security_invoker = true) as
select
  nc.matricula_id,
  nc.curso_id,
  c.nombre as curso,
  nc.calificacion
from notas_curso nc
join cursos c on c.id = nc.curso_id;

grant select on v_notas_curso to authenticated;
