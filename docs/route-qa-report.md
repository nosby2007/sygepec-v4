# QA Fonctionnelle Route par Route (Bloc 2)

## Methode
- Analyse des routes Angular declarees (app + modules lazy)
- Verification guards et redirections
- Verification build apres hardening

## Resultats

| Route | Statut | Auth requise | Probleme trouve | Correctif applique | Risque restant |
|---|---|---|---|---|---|
| `/` | PASS | Non | Aucun | n/a | Faible |
| `/home` | PASS | Non | Aucun | n/a | Faible |
| `/public` | PASS | Non | Aucun | n/a | Faible |
| `/start-audit` | PASS | Non | Aucun | n/a | Faible |
| `/auth/login` | PASS | Non | Aucun | n/a | Faible |
| `/auth/register` | PASS | Non | Enregistrement sans role explicite | Role par defaut `client` ajoute | Faible |
| `/dashboard` | PASS | Oui (`authGuard`) | Aucun | n/a | Faible |
| `/client/dashboard` | PASS | Oui | Aucun (redirect) | n/a | Faible |
| `/immigration` | PASS | Oui | Aucun bloquant detecte | n/a | Moyen (depend des data rules en prod) |
| `/support` | PASS | Oui (shell) | Guard local commente (non bloquant car shell protege) | n/a | Faible |
| `/jobs` | PASS | Oui (shell) | Guard local commente (non bloquant car shell protege) | n/a | Faible |
| `/travel` | PASS | Oui | Aucun bloquant detecte | n/a | Faible |
| `/training` | PASS | Oui | Aucun bloquant detecte | n/a | Moyen (indexes selon volume) |
| `/admin` | PASS | Oui (`authGuard` + `orgGuard` + `adminGuard`) | `orgGuard` base sur champ non peuple (`isOrgMember`) | `isOrgMember` ajoute au contexte + guard corrige | Faible |
| `/admin/org` | PASS | Oui | Incoherence roles legacy/cibles | Guards admin alignes RBAC enterprise + compat legacy | Moyen (migration roles legacy a finaliser) |
| `**` | PASS | Non | Aucun | n/a | Faible |

## Observations complementaires

1. Les routes modules `support/jobs/immigration` reposent sur la protection shell; acceptable mais un durcissement local de defense-in-depth reste recommande.
2. Le module admin depend de la qualite des donnees `users.role/users.roles`; une migration role unique est recommandee.

## Validation technique

- Build applique apres corrections: PASS
- Sortie generee: `dist/sygepec-V4`
