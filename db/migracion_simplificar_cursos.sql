-- Migración: quitar "ediciones" y simplificar Cursos a nombre + descripción.
-- El docente y la fecha de evaluación pasan a vivir en la Nota.
-- Ejecutar UNA VEZ en el SQL Editor de tu proyecto existente en Supabase.

-- 1. Columnas nuevas
alter table cursos add column if not exists descripcion text;
alter table notas add column if not exists docente text;

-- 2. Agregar curso_id a matriculas y migrar los datos desde ediciones
alter table matriculas add column if not exists curso_id uuid references cursos(id) on delete cascade;

update matriculas m
set curso_id = e.curso_id
from ediciones e
where m.edicion_id = e.id;

-- 3. Migrar el docente de la edición hacia la nota correspondiente
update notas n
set docente = e.docente
from matriculas m
join ediciones e on e.id = m.edicion_id
where n.matricula_id = m.id and n.docente is null;

-- 4. Hacer curso_id obligatorio y renombrar la restricción única
alter table matriculas alter column curso_id set not null;
alter table matriculas drop constraint if exists matriculas_alumno_id_edicion_id_key;
alter table matriculas drop constraint if exists matriculas_alumno_id_curso_id_key;
alter table matriculas add constraint matriculas_alumno_id_curso_id_key unique (alumno_id, curso_id);

-- 5. Borrar la vista vieja PRIMERO (depende de edicion_id, hay que quitarla
-- antes de poder borrar la columna o la tabla de la que depende)
drop view if exists v_record_notas;

-- 6. Ahora sí, quitar edicion_id y la tabla ediciones (ya no se usan)
alter table matriculas drop column if exists edicion_id;
drop table if exists ediciones;

-- 7. Recrear la vista de reportes sin ediciones
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
