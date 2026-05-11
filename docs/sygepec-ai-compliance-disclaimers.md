# SYGEPEC — Disclaimers & Conformité IA

> Document de référence pour toutes les mentions légales et avertissements IA

---

## Principe Fondamental

**SYGEPEC n'est pas un cabinet d'avocats en immigration.**

La plateforme fournit des outils d'assistance administrative et des recommandations 
basées sur l'intelligence artificielle à des fins informatives uniquement.

**Toute décision finale doit être validée par un conseiller humain agréé.**

---

## Disclaimers Obligatoires par Fonctionnalité

### 1. Widget IA d'Intake (Page Publique)

> Affiché dans le widget de chat, au-dessus des messages.

```
ℹ️ Cet assistant est un outil d'aide administrative automatisé. 
Les informations collectées sont utilisées pour préparer votre dossier.
Aucun conseil juridique n'est fourni. Un conseiller humain SYGEPEC 
vous contactera pour valider votre profil.
```

---

### 2. Résultats de l'Audit IA

> Affiché sur la page de résultats d'audit, avant les recommandations.

```
⚠️ AVERTISSEMENT IMPORTANT

Les recommandations ci-dessous sont générées par un algorithme d'intelligence artificielle
à des fins indicatives uniquement. Elles ne constituent pas un avis juridique.

Les lois et règlements d'immigration changent fréquemment. SYGEPEC ne garantit pas 
l'exactitude, l'exhaustivité ou l'actualité des informations générées.

Ces résultats doivent être examinés et confirmés par un conseiller en immigration agréé
avant toute action légale ou administrative.

En continuant, vous reconnaissez avoir lu et compris cet avertissement.
```

**Champ Firestore :** `auditResponse.aiDisclaimerAcknowledged: true` requis avant affichage des recommandations.

---

### 3. Vérification IA des Documents

> Affiché sur le résultat de chaque vérification de document.

```
🤖 Analyse automatique effectuée

Cette vérification préliminaire a été effectuée par un système d'intelligence artificielle.
Elle ne remplace pas la révision officielle par un agent SYGEPEC.

Des problèmes peuvent ne pas être détectés ou des faux positifs peuvent apparaître.
Votre document sera examiné par un agent humain qualifié avant toute décision finale.
```

**Champ Firestore :** `document.aiCheckResult.disclaimer` contient ce texte.

---

### 4. Score de Préparation au Voyage

> Affiché sur la page Travel Readiness.

```
📊 Note sur le Score de Préparation

Ce score est calculé automatiquement sur la base des informations que vous avez fournies.
Il est indicatif et ne garantit pas votre éligibilité à l'entrée dans votre pays de destination.

Les exigences d'entrée peuvent varier selon votre nationalité, le type de visa obtenu
et la politique du pays de destination à la date de votre voyage.

Consultez toujours les sites officiels des ambassades et consulats.
```

---

### 5. Recommandations de Formation

> Affiché sur la page Formations.

```
ℹ️ Les formations sont recommandées sur la base de votre profil d'audit.
Ces recommandations sont générées automatiquement et peuvent ne pas refléter 
toutes vos aptitudes ou besoins spécifiques. 

Certains partenaires de formation sont des tiers indépendants de SYGEPEC.
SYGEPEC ne garantit pas les résultats de ces formations.
```

---

### 6. Dashboard Client (Bandeau)

> Affiché en permanence sur le dashboard client.

```
ℹ️ Révision humaine requise — L'IA de SYGEPEC est un outil d'assistance administrative. 
Toute décision finale requiert la révision d'un conseiller humain agréé.
```

---

## Mentions Légales Footer

À inclure sur toutes les pages publiques :

```
SYGEPEC n'est pas un cabinet d'avocats en immigration et ne fournit pas de conseils juridiques.
Les informations fournies sur cette plateforme sont à titre informatif uniquement et ne doivent pas 
être utilisées comme substitut à un conseil juridique professionnel.

© 2024 SYGEPEC. Tous droits réservés.
```

---

## Consentement RGPD (à implémenter)

Lors de l'inscription et de la soumission du formulaire widget IA :

```
En soumettant ce formulaire, vous acceptez notre Politique de Confidentialité et autorisez 
SYGEPEC à traiter vos données personnelles pour vous accompagner dans votre démarche 
d'immigration conformément au RGPD.

Vos données ne seront jamais vendues à des tiers.
Vous pouvez exercer vos droits d'accès, de rectification et de suppression à tout moment
en contactant privacy@sygepec.com
```

---

## Checklist de Conformité

- [ ] Widget IA : disclaimer visible avant premier message
- [ ] Audit wizard : disclaimer accepté (checkbox) à l'étape 11
- [ ] Résultats audit : `aiDisclaimerAcknowledged` sauvegardé en Firestore
- [ ] Vérification document IA : disclaimer dans `aiCheckResult.disclaimer`
- [ ] Travel readiness : disclaimer affiché
- [ ] Footer public : mentions légales
- [ ] Page d'inscription : consentement RGPD
- [ ] Politique de confidentialité : page dédiée `/legal/privacy`
- [ ] Conditions d'utilisation : page dédiée `/legal/terms`
