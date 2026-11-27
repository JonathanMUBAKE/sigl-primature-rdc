-- 20261127030000_portee_comptable_public.sql — La portée du comptable public.
--
-- Complète ADR-001. Rien n'est retiré : une **troisième** portée de lecture est
-- ajoutée, à côté de la portée propre (sa structure et ses filles) et de la
-- consolidation (tout).
--
-- POURQUOI. Le comptable public n'est pas un agent de la structure : il est mis
-- à disposition par le ministère du Budget ou des Finances, et le décret
-- 13/050 art. 137 lui confie un contrôle **en matière de dépenses et en matière
-- de patrimoine**. Sa fonction est donc transversale à l'institution, et non
-- bornée à la cellule où son bureau se trouve. Borner sa lecture à sa structure
-- rompait la chaîne de la commande au paiement : il voyait les bons de commande
-- de toute la Primature mais aucun certificat de prise en charge hors de son
-- périmètre, et RG-011 lui opposait l'absence d'un certificat qui existait.
--
-- OÙ S'ARRÊTE CETTE PORTÉE. À la frontière juridique, pas à la frontière
-- administrative. Un établissement public autonome — ARMP, APCSC, ARC-CSU,
-- Caisse Nationale de Péréquation — a sa personnalité juridique, son budget et
-- **son propre comptable public** : sa comptabilité des matières ne se lit pas
-- d'en haut. La portée transversale couvre donc exactement les structures de
-- régime `integre`, celles dont le patrimoine est celui de la Primature.
--
-- CE QUI N'EST PAS TOUCHÉ. `sigl_ecriture_permise` reste identique au mot près :
-- la portée transversale est une **lecture**, jamais une écriture. RG-018 tient
-- donc exactement comme avant, et le comptable public d'un établissement
-- autonome — dont la structure est de régime `autonome` — n'obtient aucune
-- portée élargie, puisque `db.js` ne pose le drapeau que pour un comptable
-- public d'une structure `integre`.

/**
 * Vrai quand la session est celle d'un comptable public du périmètre intégré.
 * Posé par `db.js` à l'ouverture de la transaction, d'après les rôles chargés
 * en base — jamais d'après une valeur venue de la requête.
 */
create or replace function sigl_portee_integre() returns boolean
  language sql stable as
$$ select coalesce(nullif(current_setting('sigl.portee_integre', true), ''), 'non') = 'oui' $$;

revoke all on function sigl_portee_integre() from public;
grant execute on function sigl_portee_integre() to sigl_agent, sigl_consolidation;

/**
 * RG-017, tenue par la base — troisième branche ajoutée.
 *
 * La lecture est permise :
 *   - en mode consolidation (poste de commande, contrôle externe) ;
 *   - sur sa propre structure et ses filles ;
 *   - sur toute structure de régime `integre` quand la session porte la
 *     portée transversale du comptable public.
 *
 * Elle reste refusée sur un établissement `autonome` dont on n'est pas membre,
 * hors consolidation. La session sans contexte continue d'échouer fermée.
 *
 * `security definer` : la fonction doit lire `structure.regime` sans dépendre
 * des droits du rôle appelant, comme `sigl_ecriture_permise` le fait déjà.
 */
create or replace function sigl_lecture_permise(cible uuid) returns boolean
  language sql stable security definer set search_path = public as
$$
  select sigl_consolide()
     or (cible is not null and cible in (select sigl_portee_structures()))
     or (
       cible is not null
       and sigl_portee_integre()
       and sigl_structure_courante() is not null
       and exists (select 1 from structure s where s.id = cible and s.regime = 'integre')
     )
$$;

revoke all on function sigl_lecture_permise(uuid) from public;
grant execute on function sigl_lecture_permise(uuid) to sigl_agent, sigl_consolidation;
