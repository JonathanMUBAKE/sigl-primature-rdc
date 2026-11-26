-- Le raccord qui manquait entre la base et le flux temps réel.
--
-- Deux mécanismes coexistent et ne font pas le même travail :
--
--   * la publication `supabase_realtime`, posée par la migration 000600, sert
--     les clients qui parlent directement à Supabase ;
--   * le flux SSE du serveur, lui, écoute `LISTEN sigl_flux` et relaie aux
--     navigateurs après filtrage par structure — car la sécurité au niveau des
--     lignes ne protège pas un canal d'événements, c'est le serveur qui le fait.
--
-- Sans les déclencheurs ci-dessous, le second ne recevait que ce que les routes
-- publiaient elles-mêmes. Un changement venu d'ailleurs — une correction en
-- base, un traitement différé, le déclencheur de stock de la migration 000200 —
-- n'atteignait aucun écran. C'est ce trou que cette migration ferme.
--
-- La charge utile reprend au champ près la forme attendue par
-- `server/src/routes/_flux.js` : { type, objet, id, structure_id, horodatage }.

create or replace function sigl_notifier_flux()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ligne       record;
  objet       text := tg_argv[0];
  genre       text;
  identifiant uuid;
  structure   uuid;
  charge      jsonb;
begin
  -- Quelle ligne décrit l'événement, et de quel genre est-il ?
  if tg_op = 'DELETE' then
    ligne := old;
    genre := 'suppression';
  elsif tg_op = 'INSERT' then
    ligne := new;
    genre := 'creation';
  else
    ligne := new;
    genre := 'modification';
  end if;

  -- `id` et `structure_id` ne portent pas toujours ces noms : on les lit en
  -- JSON pour que le même déclencheur serve les sept tables sans variante.
  identifiant := nullif(to_jsonb(ligne) ->> 'id', '')::uuid;
  structure   := nullif(to_jsonb(ligne) ->> 'structure_id', '')::uuid;

  charge := jsonb_build_object(
    'type',         genre,
    'objet',        objet,
    'id',           identifiant,
    'structure_id', structure,
    'horodatage',   to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  -- Le stock porte sa quantité : l'écran la montre sans relire la ligne.
  if objet = 'stock' then
    charge := charge || jsonb_build_object('quantite', (to_jsonb(ligne) ->> 'quantite')::numeric);
  end if;

  -- `pg_notify` plafonne à 8 000 octets. Nos charges tiennent largement, mais
  -- on reste sur l'essentiel : l'écran recharge la ligne s'il lui faut plus.
  perform pg_notify('sigl_flux', charge::text);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function sigl_notifier_flux() is
  'Émet sur le canal sigl_flux à chaque changement des tables suivies. Le serveur relaie en SSE après filtrage par structure.';

-- Les sept tables qui bougent. `after` : on ne notifie que ce qui a réussi,
-- et `NOTIFY` étant transactionnel, rien ne part si la transaction échoue.
do $$
declare
  cible record;
begin
  for cible in
    select * from (values
      ('bien',        'patrimoine'),
      ('mouvement',   'patrimoine'),
      ('stock',       'stock'),
      ('etat_besoin', 'besoin'),
      ('ligne_besoin','besoin'),
      ('document',    'document'),
      ('alerte',      'alerte')
    ) as t(nom_table, nom_objet)
  loop
    execute format(
      'drop trigger if exists sigl_flux_%1$s on public.%1$I',
      cible.nom_table
    );
    execute format(
      'create trigger sigl_flux_%1$s
         after insert or update or delete on public.%1$I
         for each row execute function sigl_notifier_flux(%2$L)',
      cible.nom_table, cible.nom_objet
    );
  end loop;
end;
$$;
