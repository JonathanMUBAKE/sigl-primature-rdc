-- 20261127020000_alerte_condition_levee.sql
--
-- Une rupture qui se répète et reste muette.
--
-- Le garde-fou anti-doublon de la migration 000600 ne regardait que le statut :
-- tant qu'une alerte du même code était `ouverte` ou `en_examen`, aucune autre
-- ne pouvait s'ouvrir. L'intention était juste — on ne harcèle pas le
-- magasinier pendant qu'il instruit —, mais l'effet, lui, ne l'était pas :
--
--   un article passe sous le seuil (alerte), est réapprovisionné (la quantité
--   repasse au-dessus, l'alerte reste ouverte car le système ne tranche rien),
--   puis replonge → **aucune nouvelle alerte**. Personne n'est averti de la
--   seconde rupture, et personne ne voit passer ce silence.
--
-- Dans un système dont le métier est d'avertir, c'est la panne la plus coûteuse
-- qui soit : elle ne se manifeste pas.
--
-- Trois changements, décidés le 27 novembre 2026 (voir
-- `docs/JOURNAL-DU-CHANTIER.md`) :
--
--   1. le **retour au-dessus du seuil est horodaté** dans `donnees` de
--      l'alerte — la date et la quantité qui l'a levée. L'alerte ne se referme
--      pas pour autant : RG-022 tient, le système n'décide rien, un humain
--      classe. Mais il classe en sachant que la condition n'est plus réunie ;
--   2. le **verrou anti-doublon saute quand la condition a été levée**. Une
--      alerte dont la condition est levée attend seulement d'être classée :
--      elle ne bâillonne plus la suivante. Un nouveau franchissement ouvre une
--      nouvelle alerte, et l'ancienne reste ouverte, à classer ;
--   3. rien ici ne modifie un état métier, ni la quantité, ni les seuils, ni le
--      statut d'une alerte. RG-022, toujours.

-- ---------------------------------------------------------------------------
-- Le franchissement de seuil, dans les deux sens.
-- ---------------------------------------------------------------------------
create or replace function sigl_alerter_sur_seuil_stock() returns trigger
  language plpgsql security definer set search_path = public as
$$
declare
  le_code      text;
  la_gravite   text;
  explication  text;
  leve         jsonb;
begin
  if new.quantite = old.quantite then
    return new;
  end if;

  -- -------------------------------------------------------------------------
  -- 1. Le retour au-dessus d'un seuil. On horodate, on ne referme pas.
  --
  -- La marque est posée sur les alertes du code concerné qui sont encore en
  -- cours et qui n'en portent pas déjà une : une alerte dont la condition a
  -- été levée puis réouverte n'existe pas — c'est une alerte **nouvelle** qui
  -- s'ouvre dans ce cas, par le 2. ci-dessous.
  -- -------------------------------------------------------------------------
  leve := jsonb_build_object(
    'condition_levee_le', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'quantite_au_retour', new.quantite
  );

  if new.quantite > new.seuil_critique and old.quantite <= old.seuil_critique then
    update alerte
       set donnees = donnees || leve
     where code = 'STOCK_CRITIQUE'
       and objet_type = 'stock'
       and objet_id = new.id::text
       and statut in ('ouverte', 'en_examen')
       and donnees->>'condition_levee_le' is null;
  end if;

  if new.quantite > new.seuil_minimum and old.quantite <= old.seuil_minimum then
    update alerte
       set donnees = donnees || leve
     where code = 'STOCK_SOUS_MINIMUM'
       and objet_type = 'stock'
       and objet_id = new.id::text
       and statut in ('ouverte', 'en_examen')
       and donnees->>'condition_levee_le' is null;
  end if;

  -- -------------------------------------------------------------------------
  -- 2. Le franchissement à la baisse. C'est lui qui lève une alerte.
  -- -------------------------------------------------------------------------
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

  -- Pas de doublon tant qu'une alerte du même code est en cours **et que sa
  -- condition n'a pas été levée entre-temps**. Si elle l'a été, elle n'attend
  -- plus qu'un classement : elle ne doit pas faire taire une rupture nouvelle.
  if exists (
    select 1 from alerte
    where code = le_code
      and objet_type = 'stock'
      and objet_id = new.id::text
      and statut in ('ouverte', 'en_examen')
      and donnees->>'condition_levee_le' is null
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

comment on function sigl_alerter_sur_seuil_stock() is
  'Lève une alerte au franchissement d’un seuil de stock, horodate le retour au-dessus sans refermer (RG-022), et ne laisse pas une alerte dont la condition est levée faire taire une rupture nouvelle.';

revoke all on function sigl_alerter_sur_seuil_stock() from public;

-- L'index qui sert les deux interrogations ci-dessus : les alertes en cours
-- d'un objet de stock.
create index if not exists idx_alerte_stock_en_cours
  on alerte (objet_type, objet_id, code)
  where statut in ('ouverte', 'en_examen');
