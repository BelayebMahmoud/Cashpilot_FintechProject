import { type ErrorCode, type ErrorDetails } from '@cashpilot/domain';
import { formatMoney } from '@cashpilot/ui/format';

/**
 * French message for every business error code: what happened and how to fix it.
 * The domain only knows codes; wording lives here.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  NOT_FOUND: "Cette ressource n'existe pas ou vous n'y avez pas accès.",
  FORBIDDEN: 'Votre rôle ne permet pas cette action.',
  VALIDATION: 'Certains champs sont invalides. Corrigez-les puis réessayez.',
  CONFLICT: 'Cette action a déjà été effectuée.',
  INVALID_AMOUNT: 'Montant invalide : saisissez un nombre positif avec au plus 3 décimales (ex. 1 234,500).',
  INVALID_DATE: 'Date invalide : vérifiez la date saisie.',
  REASON_REQUIRED: 'Un motif est obligatoire pour cette action.',
  SLUG_TAKEN: 'Cet identifiant d’entreprise est déjà utilisé.',
  LAST_OWNER: "L'entreprise doit garder au moins un dirigeant : nommez-en un autre d'abord.",
  ALREADY_MEMBER: 'Cette personne est déjà membre de l’entreprise.',
  USER_NOT_FOUND: "Aucun compte n'existe avec cet e-mail : demandez à la personne de créer son compte d'abord.",
  PARTY_INVALID: 'Coordonnées invalides : vérifiez le nom, l’e-mail et le téléphone.',
  PARTY_ARCHIVED: 'Ce tiers est archivé : restaurez-le pour le modifier ou l’utiliser.',
  INVOICE_NOT_DRAFT: 'Seul un brouillon peut être modifié ou supprimé.',
  INVOICE_NOT_ISSUED: 'Cette facture n’est pas émise : validez-la d’abord.',
  INVOICE_EMPTY: 'Ajoutez au moins une ligne à la facture.',
  INVOICE_DUE_BEFORE_ISSUE: "L'échéance doit être postérieure ou égale à la date d'émission.",
  INVOICE_CLIENT_INVALID: 'Choisissez un client valide.',
  INVOICE_HAS_PAYMENTS: 'Annulation impossible : des encaissements existent. Contre-passez-les d’abord.',
  INVOICE_OVERPAID: 'Le montant dépasse le reste à payer.',
  PAYMENT_IN_FUTURE: 'Un encaissement ne peut pas être daté dans le futur : utilisez un flux prévu.',
  PAYMENT_BEFORE_ISSUE: "La date d'encaissement précède la date d'émission de la facture.",
  PAYMENT_ALREADY_REVERSED: 'Cet encaissement a déjà été contre-passé.',
  PAYMENT_IS_REVERSAL: 'Une contre-passation ne peut pas elle-même être annulée.',
  EXPENSE_INVALID_TRANSITION: "Cette action n'est pas possible dans l'état actuel de la dépense.",
  EXPENSE_NOT_APPROVED: 'Seule une dépense approuvée peut être payée.',
  EXPENSE_RECEIPT_REQUIRED: 'Ajoutez un justificatif avant de soumettre la dépense.',
  RECEIPT_INVALID_TYPE: 'Format non accepté : PDF, JPG, PNG ou WEBP.',
  RECEIPT_TOO_LARGE: 'Le justificatif dépasse 5 Mo.',
  MOVEMENT_BEFORE_OPENING: "Aucun mouvement ne peut être antérieur à la date d'ouverture de la trésorerie.",
  DUPLICATE_OPERATION: 'Cette opération a déjà été enregistrée : le solde n’a pas été modifié une seconde fois.',
  PLANNED_FLOW_PAST: 'Un flux prévu ponctuel doit être daté aujourd’hui ou plus tard.',
  ADJUSTMENT_TARGET_NOT_FOUND: "Une hypothèse vise un flux qui n'existe plus (facture réglée, dépense payée…). Retirez-la.",
  PROJECT_INVALID: 'Projet invalide : vérifiez le nom, le client et les dates.',
};

/** Message with details when useful (e.g. the remaining amount for INVOICE_OVERPAID). */
export function messageFor(code: ErrorCode, details?: ErrorDetails): string {
  if (code === 'INVOICE_OVERPAID' && typeof details?.remainingMillimes === 'number') {
    return `Le montant dépasse le reste à payer (${formatMoney(details.remainingMillimes)}).`;
  }
  return ERROR_MESSAGES[code] ?? 'Une erreur est survenue.';
}
