# Plan d'implémentation — OCR des factures niveau "god-like"

**Statut :** brouillon de planification, non implémenté.
**Portée :** `src/components/InvoiceOcrPage.tsx`, `src/data/invoiceOcr.ts`, et tout ce qui en dépend
(alias produits, intégration achats/factures).
**Objectif :** faire passer l'OCR des factures d'un outil "best-effort" à un outil qui détecte et
extrait correctement les informations sur **quasiment n'importe quel fichier** (photo prise au
téléphone, scan de mauvaise qualité, PDF natif, PDF scanné, document tourné/incliné, facture en
plusieurs langues ou mises en page), avec de bonnes performances (temps de traitement perçu,
fluidité de l'interface) et une fiabilité mesurable.

---

## 1. Où on en est aujourd'hui (état réel du code)

Résumé factuel de l'implémentation actuelle, pour ne pas repartir de zéro sur de mauvaises bases :

- **Extraction du texte** (`src/data/invoiceOcr.ts`) :
  - Image (jpg/png/webp) → **Tesseract.js**, langue française, une seule passe, aucun
    prétraitement d'image (pas de redressement, pas de binarisation, pas d'amélioration de
    contraste avant OCR).
  - PDF → **pdf.js** essaie d'abord la couche texte native (rapide, fiable si le PDF est
    "numérique") ; si le texte extrait fait moins de 20 caractères, on considère le PDF "scanné"
    et on rend chaque page sur un `<canvas>` puis on relance Tesseract dessus.
  - DOCX → **mammoth.js**, extraction de texte brut.
  - Taille max : 20 Mo (`MAX_OCR_FILE_SIZE_BYTES`).
- **Extraction des champs** (`parseInvoiceText`) : purement **heuristique à base de
  regex** — recherche de motifs "facture n°...", d'un premier motif de date plausible, de nombres
  suivant les mots "HT"/"TVA"/"TTC", et de lignes ressemblant à
  "désignation + quantité + prix unitaire [+ montant]". Le code assume explicitement un compromis
  "mieux vaut proposer une valeur à corriger que n'en proposer aucune" (favorise le rappel, pas la
  précision).
- **Résolution des entités** : fournisseur et produits comparés au texte détecté via correspondance
  de sous-chaîne / alias déjà mémorisés (`ProductAlias`), jamais de correspondance floue
  (distance d'édition, similarité sémantique).
- **Validation humaine obligatoire** : tout est modifiable dans l'écran de vérification, et
  **rien n'est intégré** avant un clic explicite sur "Valider et intégrer" — ce garde-fou reste
  une bonne base à conserver telle quelle, quelle que soit l'évolution de l'extraction.
- **Limites connues, constatées en conditions réelles** (voir la capture faite dans la
  documentation, `docs-site/content/05-achats/04-ocr-des-factures.md`) : un montant TTC peut être
  mal lu même sur un document propre et bien contrasté généré numériquement — preuve que la marge
  de progression est réelle, pas juste théorique.
- **Sélection du fichier, côté interface** (`InvoiceOcrPage.tsx`) : un unique
  `<input type="file">` générique, avec seulement un attribut `accept` limitant les extensions —
  aucun attribut `capture`, aucune distinction entre "choisir un fichier existant" et "prendre une
  photo maintenant", et aucune étape de confirmation entre la prise de vue et le lancement de
  l'OCR. Sur mobile, le comportement exact (proposer l'appareil photo ou juste la galerie) dépend
  donc entièrement du navigateur, pas d'un choix délibéré de l'application.

## 2. Pourquoi l'approche actuelle plafonne

1. **Pas de prétraitement d'image.** Une photo de facture prise au téléphone (perspective,
   ombres, papier froissé, mauvais éclairage) donne un texte quasi illisible à Tesseract sans
   redressement ni nettoyage préalable — c'est la cause numéro un d'échec en usage réel.
2. **Regex = fragile par construction.** Chaque nouveau format de facture (fournisseur différent,
   langue différente, disposition différente du tableau d'articles) peut casser silencieusement un
   motif regex, sans qu'on le sache avant qu'un utilisateur ne tombe dessus.
3. **Une seule tentative, pas de score de confiance.** Le système ne sait jamais "à quel point" il
   est sûr d'un champ détecté — tout est traité pareil à l'écran, qu'il s'agisse d'une date évidente
   ou d'un total probablement faux.
4. **Traitement 100 % côté navigateur.** Tesseract.js dans le navigateur est lent (plusieurs
   secondes à dizaines de secondes selon l'appareil) et plafonné par la puissance du poste client —
   aucune marge pour utiliser un modèle plus lourd/plus précis sans dégrader l'expérience.
5. **Pas de mesure.** Il n'existe aujourd'hui aucun jeu de test, aucune métrique de précision par
   champ, donc aucun moyen objectif de savoir si un changement améliore ou dégrade la qualité
   d'extraction.

## 3. Vision cible

Un pipeline en plusieurs étages, chacun avec un rôle précis, qui se dégrade proprement (jamais un
écran vide ou une erreur brute) :

```text
Fichier reçu
   -> [Normalisation]      convertir en image(s) exploitable(s), quel que soit le format d'entrée
   -> [Prétraitement]      redressement, recadrage, contraste/binarisation, débruitage
   -> [Extraction]         OCR haute qualité + (option) extraction structurée par modèle de vision
   -> [Fusion & score]     combiner les sources, attribuer un niveau de confiance par champ
   -> [Résolution]         rattacher fournisseur/produits aux données réelles (floue, pas exacte)
   -> [Vérification humaine]  écran actuel, enrichi d'indicateurs de confiance par champ
   -> [Intégration]        inchangé : création commande + réception + facture
```

Rien dans les étapes 1 à 4 ne doit jamais bloquer l'arrivée à l'étape 5 : en cas d'échec partiel, on
présente ce qu'on a, avec les champs manquants vides plutôt qu'une erreur qui empêche toute saisie.

## 4. Décision structurante à trancher avant de coder

**Question à poser à l'équipe / au client, pas à deviner seul :** faut-il introduire un traitement
**côté serveur** (obligatoire pour utiliser un modèle de vision plus puissant qu'un simple OCR, et
pour de meilleures performances sur mobile), ou rester **100 % côté navigateur** (plus simple,
aucune donnée de facture n'transite par un serveur tiers, mais plafonné en qualité et en vitesse) ?

| Option | Avantages | Inconvénients |
|---|---|---|
| **A. Tout côté navigateur (évolution de l'existant)** | Aucune infrastructure serveur à ajouter ; aucune facture n'est jamais envoyée à un service externe ; cohérent avec l'architecture actuelle. | Plafond de qualité et de vitesse lié à l'appareil du client ; le prétraitement d'image doit être réimplémenté en JS pur ou via une librairie WASM. |
| **B. Traitement serveur avec un modèle de vision (LLM multimodal)** | Bond de qualité majeur : un modèle de vision moderne lit correctement des factures manuscrites, tournées, de mauvaise qualité, dans n'importe quelle mise en page, et peut renvoyer directement un JSON structuré (fournisseur, montants, lignes) sans regex du tout. Traitement plus rapide côté client (juste un upload). | Nécessite un backend qui appelle une API externe (coût par appel, clé API à sécuriser côté serveur) ; la facture (potentiellement des données sensibles côté fournisseur) transite par ce service tiers — à valider avec le client avant d'implémenter. |
| **C. Hybride** | Le prétraitement d'image reste local (rapide, gratuit, améliore déjà beaucoup Tesseract) ; le modèle de vision (option B) sert de "second avis" optionnel ou de solution de repli quand la confiance de l'extraction locale est basse. | Complexité d'implémentation la plus élevée des trois. |

**Recommandation :** commencer par l'option A (gains rapides, faible risque, §5), livrer, mesurer —
puis proposer l'option C au client comme amélioration séparée, avec son arbitrage coût/confidentialité
explicite, plutôt que de l'imposer dans ce premier plan.

## 5. Plan par phases (option A comme socle, C en extension optionnelle)

### Phase 0 — Fondations de mesure (à faire en premier, avant tout changement d'algorithme)

Sans jeu de test, impossible de savoir si une "amélioration" en est vraiment une.

1. Constituer un **jeu de 20 à 40 factures réelles ou réalistes** couvrant les cas difficiles :
   photo au téléphone légèrement de travers, photo avec ombre, scan propre, PDF natif, PDF scanné
   basse résolution, facture avec un tableau d'articles multi-lignes, facture sans tableau
   (texte libre), facture d'un fournisseur non encore connu du système.
2. Pour chaque facture, définir la **valeur attendue** de chaque champ (fournisseur, numéro, date,
   échéance, HT, TVA, TTC, chaque ligne d'article) — un petit fichier JSON "vérité terrain" par
   facture.
3. Écrire un script de test qui fait tourner le pipeline d'extraction sur tout le jeu et calcule,
   par champ : taux d'exactitude, taux de "champ non détecté", taux de "détecté mais faux".
4. Ce script devient le **critère d'acceptation** de chaque phase suivante — une phase n'est
   "terminée" que si elle améliore ou maintient ces chiffres, jamais si elle les dégrade.

### Phase 1 — Capture mobile : choisir un fichier ou prendre une photo, avec confirmation avant OCR

Objectif : sur téléphone, ne plus dépendre du comportement par défaut, pas toujours prévisible, du
navigateur — proposer explicitement les deux façons d'apporter une facture, et ne jamais lancer un
traitement OCR (potentiellement long) sur une photo que l'utilisateur n'a pas eu l'occasion de
juger correcte.

1. **Deux points d'entrée distincts et visibles**, à la place de l'unique zone de dépôt actuelle,
   affichés côte à côte sur mobile (et la zone de glisser-déposer reste l'entrée principale sur
   desktop, où elle a du sens) :
   - **"Importer depuis l'appareil"** — ouvre le sélecteur de fichiers habituel (galerie photos,
     Fichiers, etc.), inchangé par rapport à aujourd'hui.
   - **"Prendre une photo"** — ouvre directement l'appareil photo du téléphone. Techniquement, un
     second `<input type="file">`, avec `accept="image/*"` et l'attribut **`capture="environment"`**
     (caméra arrière, la plus adaptée à photographier un document posé devant soi) — pris en charge
     nativement par les navigateurs mobiles, sans dépendance supplémentaire.
2. **Écran de confirmation après la prise de vue, avant tout traitement OCR** — dès que la photo est
   prise (avant même de lancer l'extraction) :
   - afficher la photo prise en grand, occupant l'essentiel de l'écran ;
   - un bouton **coche (✓)** — "Valider cette photo" — qui lance l'analyse OCR sur cette image,
     exactement comme un fichier importé aujourd'hui ;
   - un bouton **croix (✗)** — "Reprendre la photo" — qui rouvre directement l'appareil photo sans
     repasser par l'écran de choix, pour reprendre le cliché tout de suite si le cadrage, le flou
     ou l'éclairage ne convient pas.
   - Cet écran s'intercale strictement entre "prise de vue" et "extraction" — il ne remplace ni ne
     modifie l'écran de vérification des champs détectés (voir Phase 5, inchangé dans son
     principe), qui reste l'étape suivante une fois la photo validée.
3. **Import depuis l'appareil : même logique de confirmation**, par cohérence — un fichier choisi
   dans la galerie passe lui aussi par un aperçu avec les mêmes boutons coche/croix avant
   extraction, plutôt que de lancer l'OCR immédiatement à la sélection (le cas "je me suis trompé
   de photo dans ma galerie" existe aussi).
4. Cet écran de confirmation est le moment naturel pour **appliquer un aperçu léger du
   prétraitement d'image** (Phase 2 ci-après, une fois implémentée) — montrer la version
   redressée/nettoyée plutôt que la photo brute, pour que l'utilisateur juge la qualité réellement
   transmise à l'OCR, pas la photo telle quelle.
5. Sur desktop (pas d'appareil photo pertinent), seule l'option "Importer depuis l'appareil"
   s'affiche — la détection se fait simplement en vérifiant si `navigator.mediaDevices` /
   les capacités tactiles suggèrent un contexte mobile, sans complexifier l'expérience desktop
   actuelle qui fonctionne déjà bien.

### Phase 2 — Prétraitement d'image (le gain le plus rentable, à isoler et livrer en premier)

Objectif : donner à Tesseract une image aussi propre que possible avant de lui demander de lire.

1. **Redressement automatique (deskew)** — détecter l'angle d'inclinaison du document (via analyse
   des lignes du texte ou de la structure) et le corriger avant OCR.
2. **Recadrage du document** — détecter les bords du papier dans la photo (contraste
   papier/arrière-plan) et recadrer pour ne garder que le document, en supprimant le bureau/la
   main/l'arrière-plan visibles sur une photo de téléphone.
3. **Amélioration du contraste et binarisation adaptative** — convertir en niveaux de gris puis
   appliquer un seuillage adaptatif (type Otsu ou Sauvola) plutôt qu'un seuil fixe, pour bien lire
   aussi bien un texte sombre sur fond clair qu'une photo à l'éclairage inégal.
4. **Suppression de bruit léger** (flou gaussien minime avant binarisation, ou filtre médian) pour
   les photos bruitées (faible luminosité, capteur de téléphone d'entrée de gamme).
5. Réaliser ce prétraitement via **OpenCV.js (WASM)**, qui tourne déjà dans le navigateur et évite
   de réinventer des algorithmes de vision par ordinateur en JS pur — ou, si le poids ajouté au
   bundle est jugé trop important, une librairie plus légère ciblée juste sur ces 4 opérations.
6. Prétraiter **chaque page** d'un PDF scanné de la même façon (le pipeline PDF actuel rend déjà
   chaque page sur un canvas — il suffit d'insérer ce prétraitement juste avant l'appel à
   Tesseract sur ce canvas).

**Résultat attendu, mesuré via le jeu de test de la Phase 0 :** amélioration nette du taux de
détection correcte sur les photos de mauvaise qualité, sans rien changer à l'extraction de champs
elle-même.

### Phase 3 — Extraction de champs plus robuste (remplacer/renforcer les regex)

1. **Table de correspondances par position, pas seulement par mot-clé** — au lieu de chercher
   uniquement "HT"/"TVA"/"TTC" suivis d'un nombre sur la même ligne, analyser la structure en
   colonnes du texte reconnu (Tesseract fournit les positions/bounding boxes de chaque mot, pas
   seulement le texte brut — actuellement ignorées) pour mieux séparer les colonnes d'un tableau
   d'articles, même mal alignées.
2. **Plusieurs motifs candidats par champ, avec score de confiance** — au lieu d'un seul regex "le
   premier qui matche gagne", tester plusieurs formulations plausibles pour chaque champ
   (variantes de "N° facture" / "Facture no" / "Ref facture" / etc.) et choisir le meilleur candidat
   selon un score (position dans le document, proximité d'autres indices, cohérence avec les
   autres champs déjà extraits).
3. **Validation croisée entre champs, pas juste un avertissement isolé** — le contrôle déjà
   existant ("le total des lignes diffère du TTC saisi") doit devenir une **famille** de
   vérifications : HT + TVA ≈ TTC, la somme des lignes ≈ HT ou TTC selon le cas, la date
   d'échéance ≥ la date de facture, etc. — chaque incohérence baisse le score de confiance des
   champs impliqués plutôt que de rester un simple message isolé sur les lignes.
4. **Exposer ce score de confiance à l'écran de vérification** (Phase 5) au lieu de le garder en
   interne.

### Phase 4 — Résolution floue des fournisseurs et produits

1. Remplacer la correspondance par sous-chaîne exacte par une **similarité floue** (distance de
   Levenshtein normalisée, ou une librairie de correspondance floue légère) pour proposer le bon
   fournisseur/produit même avec une faute de reconnaissance OCR d'un ou deux caractères (déjà
   visible dans les captures de documentation : "Grains de cafe Arabica" détecté au lieu de
   "Grains de café Arabica" — actuellement rattrapé uniquement par la mémorisation d'alias
   après coup, jamais au moment de la première détection).
2. Proposer un **classement des 2-3 meilleures correspondances possibles** par ligne d'article
   plutôt qu'un unique choix "trouvé ou pas trouvé", pour que l'utilisateur choisisse en un clic
   parmi des suggestions plutôt que de retaper le nom du produit à chaque fois.
3. Faire de même pour le fournisseur si le nom détecté ne correspond exactement à aucun fournisseur
   existant.

### Phase 5 — Interface : montrer la confiance, pas juste le résultat

1. Sur l'écran de vérification, styliser différemment un champ **détecté avec forte confiance**
   (bordure neutre) d'un champ **détecté avec faible confiance ou en conflit avec une vérification
   croisée** (bordure orange, avec une info-bulle expliquant pourquoi) — actuellement tous les
   champs détectés ont le même traitement visuel, qu'ils soient fiables ou non.
2. Trier ou mettre en avant les champs à faible confiance pour que l'utilisateur les vérifie en
   priorité, plutôt que de devoir tout relire ligne par ligne avec la même attention.
3. Garder inchangé le principe déjà en place : rien n'est jamais intégré automatiquement, la
   confiance guide l'attention de l'utilisateur, elle ne remplace jamais sa validation.

### Phase 6 (optionnelle, à valider séparément avec le client) — Second avis par modèle de vision

Seulement si l'option **C** du §4 est retenue après discussion :

1. Ajouter un point d'entrée serveur (nouvelle route API) qui reçoit l'image/le PDF déjà prétraité
   par la Phase 2, et appelle un modèle de vision multimodal pour extraire directement les champs
   sous forme structurée (JSON), avec sa propre estimation de confiance par champ.
2. Fusionner ce résultat avec celui du pipeline local : en cas d'accord entre les deux sources,
   confiance maximale ; en cas de désaccord, présenter les deux valeurs candidates à l'utilisateur
   plutôt que de trancher silencieusement.
3. Design explicite à valider avant implémentation : cet appel est-il **systématique**
   (meilleure qualité par défaut, mais coût et latence sur chaque facture) ou **à la demande**
   (un bouton "Améliorer la détection" quand le résultat local est jugé peu fiable) ? Recommandation
   : à la demande, pour ne jamais dégrader la rapidité perçue du cas courant (facture propre, déjà
   bien lue localement).
4. Sécurité : la clé d'API du service de vision ne doit **jamais** être exposée côté client — cet
   appel doit obligatoirement passer par le serveur, jamais directement depuis le navigateur.

## 6. Performance — objectifs chiffrés

Sans mesure de départ actuelle, ces cibles sont des points de repère à confirmer après un premier
benchmark sur le jeu de test de la Phase 0, pas des chiffres gravés dans le marbre :

- Image simple (photo nette, une page) : extraction + proposition de champs affichée en moins de
  **5 secondes** sur un appareil mobile d'entrée de gamme.
- PDF natif (texte déjà numérique, sans passer par l'OCR image) : moins de **1 seconde**.
- PDF scanné multi-pages : le prétraitement + OCR doivent rester **linéaires** en nombre de pages
  (pas de dégradation superlinéaire), avec un indicateur de progression par page pendant le
  traitement (actuellement, un seul état "en cours" global, sans détail par page).
- Le prétraitement d'image (Phase 2) doit rester local et ne jamais faire perdre plus de 1 à 2
  secondes au total, sous peine d'annuler le gain de qualité par une pire expérience perçue — à
  vérifier explicitement dans les tests de la Phase 0, pas supposé.

## 7. Ce que ce plan ne change pas (par choix, pas par oubli)

- Le principe de **vérification humaine obligatoire avant intégration** reste intact à chaque
  phase — aucune automatisation ne doit jamais créer une commande/réception/facture sans un clic
  explicite de confirmation.
- Le comportement d'intégration lui-même (création commande → réception complète → facture non
  payée) n'est pas modifié par ce plan — seule la qualité de ce qui arrive dans le formulaire de
  vérification change.
- Aucune phase de ce plan ne requiert de modifier le schéma de données existant (commandes,
  fournisseurs, factures) — tout se joue en amont, dans l'extraction et la présentation.

## 8. Prochaines étapes concrètes

1. Valider ce plan (en particulier l'arbitrage du §4) avant d'écrire le moindre code.
2. Constituer le jeu de test de la Phase 0 — c'est un travail humain (rassembler/anonymiser des
   factures réelles, ou en produire des réalistes) qui peut démarrer immédiatement, en parallèle de
   toute décision technique.
3. La Phase 1 (capture mobile) ne dépend d'aucune décision d'architecture (§4) ni du jeu de test —
   elle peut être implémentée et livrée indépendamment, en premier, dès maintenant.
4. Une fois le jeu de test prêt, implémenter la Phase 2 (prétraitement d'image) isolément, la
   mesurer, puis décider si les Phases 3 à 5 suivent dans la foulée ou sont reportées.

## 9. État d'avancement

- [x] **Phase 1 — Capture mobile** : implémentée (voir `src/components/InvoiceOcrPage.tsx`) —
  choix "Importer depuis l'appareil" / "Prendre une photo" sur mobile, écran de confirmation
  (coche pour lancer l'OCR / croix pour reprendre) avant tout traitement, pour les deux méthodes
  d'apport de fichier. Documentation utilisateur mise à jour dans
  `docs-site/content/05-achats/04-ocr-des-factures.md`.
- [ ] Phase 0 — Fondations de mesure
- [ ] Phase 2 — Prétraitement d'image
- [ ] Phase 3 — Extraction de champs plus robuste
- [ ] Phase 4 — Résolution floue
- [ ] Phase 5 — Interface de confiance
- [ ] Phase 6 (optionnelle) — Second avis par modèle de vision
