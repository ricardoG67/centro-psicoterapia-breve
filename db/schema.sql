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
  periodo text,
  fecha_inicio date,
  fecha_fin date,
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

-- PROFESORES: catálogo de docentes.
create table profesores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  correo text,
  celular text,
  created_at timestamptz not null default now()
);

-- Cuestionario por defecto de la evaluación docente (editable). Las
-- evaluaciones ya registradas conservan su propia copia de las preguntas.
create table evaluacion_preguntas (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

-- EVALUACIONES: una por profesor + curso + formación. Si la formación no
-- tiene cursos asignados, curso_id queda vacío (se evalúa la formación).
create table evaluaciones_docentes (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references profesores(id) on delete cascade,
  formacion_id uuid not null references formaciones(id) on delete cascade,
  curso_id uuid references cursos(id) on delete cascade,
  encuestados integer check (encuestados is null or encuestados >= 0),
  created_at timestamptz not null default now()
);

-- Promedio de cada pregunta (escala 1 a 4). La nota final de la
-- evaluación es el promedio de estos valores y se calcula en la app.
create table evaluacion_respuestas (
  id uuid primary key default gen_random_uuid(),
  evaluacion_id uuid not null references evaluaciones_docentes(id) on delete cascade,
  orden integer not null,
  pregunta text not null,
  promedio numeric(3,2) not null check (promedio >= 1 and promedio <= 4),
  unique (evaluacion_id, orden)
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
alter table profesores enable row level security;
alter table evaluacion_preguntas enable row level security;
alter table evaluaciones_docentes enable row level security;
alter table evaluacion_respuestas enable row level security;

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
create policy "auth full access profesores" on profesores
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access evaluacion_preguntas" on evaluacion_preguntas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access evaluaciones_docentes" on evaluaciones_docentes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access evaluacion_respuestas" on evaluacion_respuestas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- PERMISOS: además de las políticas RLS de arriba, Postgres exige el
-- permiso base sobre la tabla para el rol "authenticated" (el que usan
-- los usuarios logueados) y para "service_role" (scripts de administración
-- locales, como scripts/importar-alumnos.mjs). Sin esto da "permission denied".
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on alumnos, formaciones, cursos, formacion_cursos, matriculas, notas, notas_curso,
     profesores, evaluacion_preguntas, evaluaciones_docentes, evaluacion_respuestas
  to authenticated;
grant select, insert, update, delete
  on alumnos, formaciones, cursos, formacion_cursos, matriculas, notas, notas_curso,
     profesores, evaluacion_preguntas, evaluaciones_docentes, evaluacion_respuestas
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
  f.periodo,
  f.fecha_inicio as formacion_fecha_inicio,
  f.fecha_fin as formacion_fecha_fin,
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

-- Cuestionario inicial de la evaluación docente.
insert into evaluacion_preguntas (texto, orden) values
  ('El docente es puntual', 1),
  ('El docente explica los objetivos del curso y su evaluación', 2),
  ('El docente prepara sus clases con antelación', 3),
  ('La explicación de las clases son claras', 4),
  ('El docente despierta interés sobre el tema', 5),
  ('El docente responde satisfactoriamente las consultas', 6),
  ('El docente integra teoría y práctica', 7),
  ('El docente promueve la participación del estudiante', 8),
  ('El docente crea un buen ambiente de clase', 9),
  ('Estoy satisfecho con el desarrollo de la enseñanza', 10);
