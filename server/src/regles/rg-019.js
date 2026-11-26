// RG-019 — Un document figé n'est jamais modifié ; on émet un document lié.
// Code du numérique art. 42.

export function rg019({ document, operation } = {}) {
  if (!document) return null;
  const ecriture = operation === 'modification' || operation === 'suppression';
  if (document.fige !== false && ecriture) {
    return {
      code: 'RG-019',
      message:
        `Émettez un document rectificatif rattaché au document ${document.numero ?? ''} : un document figé ne se modifie ni ne s'efface, il se corrige par un document lié.`.replace('  ', ' '),
      champ: 'document_id',
    };
  }
  return null;
}
