-- Esquema de base de datos: Gestión Académica
-- Ejecutar en el SQL Editor del panel de Supabase (una sola vez, en un
-- proyecto nuevo). Si ya tenías el esquema anterior con "ediciones",
-- usa db/migracion_simplificar_cursos.sql en su lugar.

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

-- CURSOS ---------------------------------------------------------------
create table cursos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  horas integer,
  created_at timestamptz not null default now()
);

-- MATRÍCULAS (un alumno inscrito en un curso) ---------------------------
create table matriculas (
  id uuid primary key default gen_random_uuid(),
  alumno_id uuid not null references alumnos(id) on delete cascade,
  curso_id uuid not null references cursos(id) on delete cascade,
  fecha_matricula date not null default current_date,
  created_at timestamptz not null default now(),
  unique (alumno_id, curso_id)
);

-- NOTAS (una calificación final por matrícula) ---------------------------
create table notas (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null unique references matriculas(id) on delete cascade,
  calificacion numeric(5,2),
  observacion text,
  docente text,
  fecha_evaluacion date,
  created_at timestamptz not null default now()
);

-- SEGURIDAD: solo usuarios autenticados (los del equipo) pueden
-- leer y escribir. Nadie anónimo por internet puede ver datos.
alter table alumnos enable row level security;
alter table cursos enable row level security;
alter table matriculas enable row level security;
alter table notas enable row level security;

create policy "auth full access alumnos" on alumnos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access cursos" on cursos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access matriculas" on matriculas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access notas" on notas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- PERMISOS: además de las políticas RLS de arriba, Postgres exige el
-- permiso base sobre la tabla para el rol "authenticated" (el que usan
-- los usuarios logueados). Sin esto da error "permission denied".
grant usage on schema public to authenticated;
grant select, insert, update, delete on alumnos, cursos, matriculas, notas to authenticated;

-- Vista de apoyo para los reportes (por alumno, por curso, record de notas)
-- security_invoker: la vista respeta las políticas RLS de quien consulta,
-- en vez de heredar los permisos del dueño de la vista (evita fugas).
create view v_record_notas with (security_invoker = true) as
select
  a.id as alumno_id,
  a.tipo_documento,
  a.documento,
  a.nombres,
  a.apellidos,
  c.id as curso_id,
  c.nombre as curso,
  m.id as matricula_id,
  m.fecha_matricula,
  n.calificacion,
  n.observacion,
  n.docente,
  n.fecha_evaluacion
from matriculas m
join alumnos a on a.id = m.alumno_id
join cursos c on c.id = m.curso_id
left join notas n on n.matricula_id = m.id;

grant select on v_record_notas to authenticated;
