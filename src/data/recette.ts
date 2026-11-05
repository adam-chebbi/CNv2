// Feuille de recette (cahier des charges §20.2): the scenarios Café Noir checks before accepting
// the delivery. Each one says what to do and which screen to use.

export interface RecetteScenario {
  id: string;
  fonction: string;
  attendu: string;
  comment: string;
  ecran: string;
}

export const RECETTE_SCENARIOS: RecetteScenario[] = [
  { id: 'comptoir', fonction: 'Vente au comptoir', attendu: 'Une vente sans table peut être saisie, réglée et retrouver son ticket', comment: 'Caisse → 2 produits → encaisser en espèces → retrouver le numéro dans Tickets', ecran: 'Caisse, Tickets' },
  { id: 'calcul', fonction: 'Calcul de vente', attendu: 'Quantités, suppléments et réductions produisent le même total sur tous les écrans', comment: 'Même commande avec supplément et offre en caisse et par QR : comparer panier, addition, ticket', ecran: 'Caisse, menu QR' },
  { id: 'especes', fonction: 'Espèces', attendu: 'Total 22 DT, reçu 30 DT → monnaie 8 DT', comment: 'Vente de 22 DT, saisir 30 DT reçus', ecran: 'Caisse' },
  { id: 'multi', fonction: 'Plusieurs règlements', attendu: 'Le solde diminue ; le ticket n’est réglé qu’à couverture totale', comment: '10 DT TPE + 5 DT ticket resto + le reste en espèces', ecran: 'Caisse' },
  { id: 'ouverture', fonction: 'Ouverture de caisse', attendu: 'Le fond initial et l’utilisateur sont enregistrés', comment: 'Ouvrir avec 100 DT puis consulter la session', ecran: 'Caisse, Sessions de caisse' },
  { id: 'cloture', fonction: 'Clôture', attendu: 'Le montant attendu est comparé au comptage réel avec conservation de l’écart', comment: 'Fond 100, ventes espèces 200, sortie 50, remboursement 10 → attendu 240 ; compter 238 → écart −2 commenté', ecran: 'Caisse, Sessions de caisse' },
  { id: 'qr', fonction: 'Commande QR', attendu: 'Elle reste en attente jusqu’à validation par l’équipe', comment: 'Commander depuis un téléphone ; vérifier que rien n’arrive en cuisine avant acceptation', ecran: 'Menu QR, Actions à traiter' },
  { id: 'simultanees', fonction: 'Commandes simultanées', attendu: 'Deux téléphones commandent sur la même visite sans écraser leurs commandes', comment: 'Deux téléphones envoient en même temps', ecran: 'Menu QR' },
  { id: 'doublons', fonction: 'Doublons', attendu: 'Un double appui ne crée pas deux commandes ou deux encaissements', comment: 'Double appui rapide sur « Envoyer » et « Encaisser » ; couper puis rétablir le réseau', ecran: 'Menu QR, Caisse' },
  { id: 'preparation', fonction: 'Préparation', attendu: 'Les articles sont dirigés vers la cuisine ou le bar configuré', comment: 'Commande café + croque → bar et cuisine', ecran: 'Écran cuisine, Écran bar' },
  { id: 'droits', fonction: 'Droits serveur', attendu: 'Une table non assignée n’est pas accessible au serveur', comment: 'Serveur 1 tente d’ouvrir une table du carré du serveur 2', ecran: 'Plan de salle' },
  { id: 'annulation', fonction: 'Annulation', attendu: 'La demande du serveur nécessite une décision du gérant avant application', comment: 'Serveur demande ; addition inchangée ; gérant accepte', ecran: 'Plan de salle, Annulations' },
  { id: 'stock', fonction: 'Stock', attendu: 'Une commande n’est décomptée qu’une fois, sans second déstockage au règlement', comment: 'Relever un ingrédient avant/après validation puis après encaissement', ecran: 'Stock, Fiche de consommation' },
  { id: 'annulation-prep', fonction: 'Annulation après préparation', attendu: 'Les matières ne sont pas réintégrées automatiquement', comment: 'Passer en préparation, annuler, vérifier le stock et le traitement demandé', ecran: 'Annulations, Stock' },
  { id: 'compte', fonction: 'Compte client', attendu: 'Le client retrouve ses consommations attribuées sans consulter les historiques des autres', comment: 'Deux comptes clients à la même table', ecran: 'Compte client' },
  { id: 'favoris', fonction: 'Favoris', attendu: 'La reprise utilise les prix et disponibilités actuels', comment: 'Changer un prix, rendre un produit indisponible, puis « Recommander »', ecran: 'Compte client' },
  { id: 'fidelite', fonction: 'Fidélité', attendu: 'Les points sont acquis après encaissement complet, une seule fois', comment: '0 point avant le règlement complet, puis les points une seule fois', ecran: 'Caisse, Compte client' },
  { id: 'reservation', fonction: 'Réservation', attendu: 'Une demande reste en attente jusqu’à confirmation', comment: 'Réserver en ligne ; vérifier le message et l’état', ecran: 'Réserver, Réservations' },
  { id: 'appel', fonction: 'Appel serveur', attendu: 'La bonne table est affichée et la demande peut être prise en charge puis clôturée', comment: 'Appeler depuis une table ; prendre en charge ; traiter', ecran: 'Menu QR, Actions à traiter' },
  { id: 'pointage', fonction: 'Pointage', attendu: 'Une présence de 08 h 00 à 16 h 30 avec 30 minutes de pause produit huit heures travaillées', comment: 'Pointages (ou ajout manuel) puis vue Équipe', ecran: 'Pointage, Équipe' },
  { id: 'amortissement', fonction: 'Amortissement', attendu: 'Une valeur de 6 000 DT sur 60 mois produit une dotation mensuelle de 100 DT', comment: 'Créer l’équipement et lire la fiche', ecran: 'Machines & amortissement' },
  { id: 'cloture-visite', fonction: 'Clôture de visite', attendu: 'Les anciens accès ne permettent plus d’agir sur la table', comment: 'Libérer la table puis retenter une commande depuis le téléphone', ecran: 'Plan de salle, menu QR' },
  { id: 'tracabilite', fonction: 'Traçabilité', attendu: 'Les opérations sensibles conservent leur auteur et leur historique', comment: 'Consulter le journal après les tests de clôture, annulation et fidélité', ecran: 'Journal détaillé' },
];
