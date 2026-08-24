-- Agrega el campo "horas" a Cursos (duración del curso en horas académicas).
-- Ejecutar una vez en el SQL Editor de Supabase.
alter table cursos add column if not exists horas integer;
