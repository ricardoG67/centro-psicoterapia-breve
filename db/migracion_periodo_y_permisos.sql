-- Migración: refuerza permisos en todas las tablas (soluciona el
-- "permission denied for table alumnos" al editar) y agrega Periodo +
-- Fechas de inicio/fin a Formación (antes se guardaban por error en la
-- nota de cada alumno individual, como workaround).
-- Ejecutar UNA VEZ en el SQL Editor de tu proyecto en Supabase.
-- No borra ningún dato.

-- 1. Reforzar permisos en todas las tablas (por si alguna quedó corta)
grant select, insert, update, delete
  on alumnos, formaciones, cursos, formacion_cursos, matriculas, notas, notas_curso
  to authenticated;
grant select, insert, update, delete
  on alumnos, formaciones, cursos, formacion_cursos, matriculas, notas, notas_curso
  to service_role;

-- 2. Periodo y fechas de la formación (una vez por formación, no por alumno)
alter table formaciones add column if not exists periodo text;
alter table formaciones add column if not exists fecha_inicio date;
alter table formaciones add column if not exists fecha_fin date;

-- 3. Actualizar la vista de reportes para incluir periodo y fechas de la formación
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
