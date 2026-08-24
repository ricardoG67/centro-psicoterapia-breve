-- Le faltaba a "service_role" (la clave de administrador que usa el
-- script de importación) permiso para escribir en las tablas.
-- Ejecutar una vez en el SQL Editor de Supabase.
grant select, insert, update, delete on alumnos, cursos, matriculas, notas to service_role;
