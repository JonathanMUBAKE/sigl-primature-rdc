-- 20261127000600_temps_reel.sql — Temps réel et stock dynamique.
--
-- Deux exigences distinctes, tenues toutes les deux par la base :
--   1. Les tables qui bougent sont publiées sur Realtime, pour que les écrans
--      se mettent à jour sans que personne ne rafraîchisse.
--   2. Le stock se recalcule et s'alerte **dans la base**, à chaque mouvement.
--      Le franchissement de seuil n'est pas détecté par le code applicatif :
--      il l'est ici, donc il l'est toujours, quelle que soit la route qui a
--      écrit le mouvement.

-- ---------------------------------------------------------------------------
-- 1. La publication Realtime.
-- `supabase_realtime` est créée par Supabase ; on vérifie avant d'y ajouter,
-- et on n'ajoute pas deux fois.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  publiees text[] := array[
    'bien', 'mouvement', 'stock', 'etat_besoin', 'ligne_besoin', 'alerte', 'document'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : temps réel non configuré.';
    return;
  end if;

  foreach t in array publiees loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- L'ancienne valeur doit partir avec l'événement sur les tables qui sont
-- modifiées : un écran doit pouvoir afficher « passé de 40 à 12 ». `mouvement`
-- est en insertion seule, sa clé primaire suffit.
alter table bien          replica identity full;
alter table stock         replica identity full;
alter table etat_besoin   replica identity full;
alter table ligne_besoin  replica identity full;
alter table alerte        replica identity full;
alter table document      replica identity full;

-- ---------------------------------------------------------------------------
-- 2. Le stock dynamique.
-- ---------------------------------------------------------------------------

/**
 * Le sens d'un mouvement sur les quantités en stock.
 *   entrée, retour de maintenance, réemploi  → +
 *   sortie, perte, déclassement, réforme     → −
 *   transfert                                → − au départ (l'arrivée est un
 *                                              mouvement d'entrée distinct)
 *   maintenance                              → 0, le bien reste au patrimoine
 */
create or replace function sigl_sens_mouvement(type_mouvement text) returns int
  language sql immutable as
$$
  select case type_mouvement
    when 'entree'             then  1
    when 'retour_maintenance' then  1
    when 'reemploi'           then  1
    when 'sortie'             then -1
    when 'perte'              then -1
    when 'declassement'       then -1
    when 'reforme'            then -1
    when 'transfert'          then -1
    else 0
  end
$$;

/**
 * Recalcule la ligne de stock concernée par un mouvement.
 *
 * `security definer` : le déclencheur doit pouvoir écrire la ligne de stock
 * alors que le rôle appelant est `sigl_agent`. Ce n'est pas un contournement
 * du cloisonnement — la ligne de stock est dérivée du bien, et ce bien a déjà
 * été filtré par le RLS avant que le mouvement ne soit accepté.
 */
create or replace function sigl_maj_stock_apres_mouvement() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare
  le_bien   bien%rowtype;
  sens      int;
  la_unite  text;
begin
  select * into le_bien from bien where id = new.bien_id;
  if not found or le_bien.classement <> 'stock' then
    return new;
  end if;

  sens := sigl_sens_mouvement(new.type);
  if sens = 0 or le_bien.site_id is null then
    return new;
  end if;

  select coalesce(c.unite, 'unité') into la_unite
    from categorie c where c.code = le_bien.categorie_code;

  insert into stock (
    categorie_code, structure_id, site_id, designation, unite,
    quantite, seuil_minimum, seuil_critique, maj_le
  )
  values (
    le_bien.categorie_code, le_bien.structure_id, le_bien.site_id,
    le_bien.designation, coalesce(la_unite, 'unité'),
    greatest(sens * new.quantite, 0), 0, 0, now()
  )
  on conflict (categorie_code, site_id, designation) do update
    set quantite = greatest(stock.quantite + sens * new.quantite, 0),
        maj_le   = now();

  return new;
end
$$;

drop trigger if exists trg_mouvement_maj_stock on mouvement;
create trigger trg_mouvement_maj_stock
  after insert on mouvement
  for each row execute function sigl_maj_stock_apres_mouvement();

/**
 * Lève une alerte au franchissement du seuil minimum, puis du seuil critique.
 *
 * Deux garde-fous :
 *   - on n'alerte qu'au **franchissement** : la quantité était au-dessus du
 *     seuil avant la mise à jour, elle est en dessous après ;
 *   - on n'alerte pas deux fois tant que l'alerte précédente du même code sur
 *     la même ligne est encore ouverte ou en examen.
 *
 * Conformément à RG-022, l'alerte ne change aucun état métier : elle ouvre un
 * examen, un humain tranche, et la suite est conservée.
 */
create or replace function sigl_alerter_sur_seuil_stock() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare
  le_code      text;
  la_gravite   text;
  explication  text;
begin
  if new.quantite = old.quantite then
    return new;
  end if;

  if new.quantite <= new.seuil_critique and old.quantite > old.seuil_critique then
    le_code    := 'STOCK_CRITIQUE';
    la_gravite := 'critique';
    explication := format(
      'Le stock de « %s » est tombé à %s %s, au niveau du seuil critique fixé à %s. '
      || 'La rupture est imminente.',
      new.designation, new.quantite, new.unite, new.seuil_critique);

  elsif new.quantite <= new.seuil_minimum and old.quantite > old.seuil_minimum then
    le_code    := 'STOCK_SOUS_MINIMUM';
    la_gravite := 'attention';
    explication := format(
      'Le stock de « %s » est passé sous le seuil minimum : %s %s pour un minimum de %s.',
      new.designation, new.quantite, new.unite, new.seuil_minimum);
  else
    return new;
  end if;

  -- Pas de doublon tant que la précédente n'est pas tranchée.
  if exists (
    select 1 from alerte
    where code = le_code
      and objet_type = 'stock'
      and objet_id = new.id::text
      and statut in ('ouverte', 'en_examen')
  ) then
    return new;
  end if;

  insert into alerte (code, gravite, structure_id, objet_type, objet_id, explication, donnees, statut)
  values (
    le_code, la_gravite, new.structure_id, 'stock', new.id::text, explication,
    jsonb_build_object(
      'designation',     new.designation,
      'categorie_code',  new.categorie_code,
      'site_id',         new.site_id,
      'quantite',        new.quantite,
      'quantite_avant',  old.quantite,
      'seuil_minimum',   new.seuil_minimum,
      'seuil_critique',  new.seuil_critique,
      'unite',           new.unite
    ),
    'ouverte'
  );

  return new;
end
$$;

drop trigger if exists trg_stock_alerte_seuil on stock;
create trigger trg_stock_alerte_seuil
  after update of quantite on stock
  for each row execute function sigl_alerter_sur_seuil_stock();

-- Les deux fonctions de déclencheur appartiennent au propriétaire ; aucun rôle
-- métier ne doit pouvoir les appeler directement.
revoke all on function sigl_maj_stock_apres_mouvement() from public;
revoke all on function sigl_alerter_sur_seuil_stock() from public;
grant execute on function sigl_sens_mouvement(text) to sigl_agent, sigl_consolidation;
