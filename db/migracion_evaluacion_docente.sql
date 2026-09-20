-- Migración: Profesores y Evaluación docente.
-- Ejecutar UNA VEZ en el SQL Editor de tu proyecto en Supabase.
-- No borra ni modifica ningún dato existente (solo agrega tablas nuevas).
-- Se puede volver a ejecutar sin problema si algo falló a medias.

-- PROFESORES: catálogo de docentes.
create table if not exists profesores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  correo text,
  celular text,
  created_at timestamptz not null default now()
);

-- Cuestionario por defecto (editable). Las preguntas que se cargan al
-- crear una evaluación nueva; las evaluaciones ya registradas conservan
-- su propia copia de las preguntas, así que cambiar esto no las altera.
create table if not exists evaluacion_preguntas (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);

-- EVALUACIONES: una por profesor + curso + formación. Si la formación no
-- tiene cursos asignados, curso_id queda vacío (se evalúa la formación).
create table if not exists evaluaciones_docentes (
  id uuid primary key default gen_random_uuid(),
  profesor_id uuid not null references profesores(id) on delete cascade,
  formacion_id uuid not null references formaciones(id) on delete cascade,
  curso_id uuid references cursos(id) on delete cascade,
  encuestados integer check (encuestados is null or encuestados >= 0),
  created_at timestamptz not null default now()
);

-- Promedio de cada pregunta (escala 1 a 4). La nota final de la
-- evaluación es el promedio de estos valores y se calcula en la app.
create table if not exists evaluacion_respuestas (
  id uuid primary key default gen_random_uuid(),
  evaluacion_id uuid not null references evaluaciones_docentes(id) on delete cascade,
  orden integer not null,
  pregunta text not null,
  promedio numeric(3,2) not null check (promedio >= 1 and promedio <= 4),
  unique (evaluacion_id, orden)
);

-- Seguridad: solo usuarios autenticados, igual que el resto de las tablas.
alter table profesores enable row level security;
alter table evaluacion_preguntas enable row level security;
alter table evaluaciones_docentes enable row level security;
alter table evaluacion_respuestas enable row level security;

drop policy if exists "auth full access profesores" on profesores;
create policy "auth full access profesores" on profesores
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "auth full access evaluacion_preguntas" on evaluacion_preguntas;
create policy "auth full access evaluacion_preguntas" on evaluacion_preguntas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "auth full access evaluaciones_docentes" on evaluaciones_docentes;
create policy "auth full access evaluaciones_docentes" on evaluaciones_docentes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "auth full access evaluacion_respuestas" on evaluacion_respuestas;
create policy "auth full access evaluacion_respuestas" on evaluacion_respuestas
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

grant select, insert, update, delete
  on profesores, evaluacion_preguntas, evaluaciones_docentes, evaluacion_respuestas
  to authenticated;
grant select, insert, update, delete
  on profesores, evaluacion_preguntas, evaluaciones_docentes, evaluacion_respuestas
  to service_role;

-- Cuestionario inicial (solo si todavía no hay preguntas cargadas).
insert into evaluacion_preguntas (texto, orden)
select texto, orden from (values
  ('El docente es puntual', 1),
  ('El docente explica los objetivos del curso y su evaluación', 2),
  ('El docente prepara sus clases con antelación', 3),
  ('La explicación de las clases son claras', 4),
  ('El docente despierta interés sobre el tema', 5),
  ('El docente responde satisfactoriamente las consultas', 6),
  ('El docente integra teoría y práctica', 7),
  ('El docente promueve la participación del estudiante', 8),
  ('El docente crea un buen ambiente de clase', 9),
  ('Estoy satisfecho con el desarrollo de la enseñanza', 10)
) as v(texto, orden)
where not exists (select 1 from evaluacion_preguntas);
