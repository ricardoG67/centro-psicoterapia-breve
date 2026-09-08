-- Migración: renombrar "cursos" (el programa completo) a "formaciones",
-- y crear un nuevo "cursos" como catálogo de módulos reutilizables entre
-- formaciones, cada uno con su propia nota.
-- Ejecutar UNA VEZ en el SQL Editor de tu proyecto existente en Supabase.
-- No borra ningún dato: tus 12 cursos, 237 alumnos, 272 matrículas y
-- 272 notas quedan intactos, solo cambian de nombre de tabla/columna.

-- 1. Renombrar la tabla "cursos" (el programa) a "formaciones"
alter table cursos rename to formaciones;
alter table matriculas rename column curso_id to formacion_id;
alter table matriculas rename constraint matriculas_alumno_id_curso_id_key to matriculas_alumno_id_formacion_id_key;

-- 2. Crear el nuevo catálogo de cursos (módulos reutilizables)
create table cursos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  created_at timestamptz not null default now()
);

-- 3. Qué cursos componen cada formación (muchos a muchos)
create table formacion_cursos (
  id uuid primary key default gen_random_uuid(),
  formacion_id uuid not null references formaciones(id) on delete cascade,
  curso_id uuid not null references cursos(id) on delete cascade,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  unique (formacion_id, curso_id)
);

-- 4. Nota independiente por curso componente (opcional, según formación)
create table notas_curso (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references matriculas(id) on delete cascade,
  curso_id uuid not null references cursos(id) on delete cascade,
  calificacion numeric(5,2),
  created_at timestamptz not null default now(),
  unique (matricula_id, curso_id)
);

-- 5. Seguridad y permisos para las tablas nuevas
alter table cursos enable row level security;
alter table formacion_cursos enable row level security;
alter table notas_curso enable row level security;

create policy "auth full access cursos" on cursos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access formacion_cursos" on formacion_cursos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth full access notas_curso" on notas_curso
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant select, insert, update, delete on cursos, formacion_cursos, notas_curso to authenticated;
grant select, insert, update, delete on cursos, formacion_cursos, notas_curso to service_role;
-- La tabla "formaciones" (renombrada) ya tenía permisos como "cursos", pero
-- por si acaso los reforzamos con el nombre nuevo:
grant select, insert, update, delete on formaciones to authenticated;
grant select, insert, update, delete on formaciones to service_role;

-- 6. Recrear la vista de reportes con los nombres nuevos
drop view if exists v_record_notas;
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

-- 7. Vista nueva: notas por curso componente
create view v_notas_curso with (security_invoker = true) as
select
  nc.matricula_id,
  nc.curso_id,
  c.nombre as curso,
  nc.calificacion
from notas_curso nc
join cursos c on c.id = nc.curso_id;

grant select on v_notas_curso to authenticated;
