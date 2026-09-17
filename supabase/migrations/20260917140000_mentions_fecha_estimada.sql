-- Las menciones de Facebook e Instagram llegan por el índice de un buscador,
-- que no expone la fecha de publicación. Se guarda la fecha de la corrida para
-- poder ordenarlas, pero hay que poder distinguirla de una fecha real: sin esta
-- marca, una publicación de hace meses aparecería como si fuera de hoy.
ALTER TABLE public.web_mentions
  ADD COLUMN IF NOT EXISTS published_at_estimated boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.web_mentions.published_at_estimated IS
  'true cuando published_at es la fecha en que se detectó la mención y no la de '
  'publicación, porque la fuente no la expone.';
