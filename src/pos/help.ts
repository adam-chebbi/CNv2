// Plain-language guide of each register/service screen, shown by the "Aide" button. Written for
// staff who are not at ease with computers: short steps, the words printed on the buttons, no
// jargon. Keep it in sync when a screen's buttons change.

export interface ScreenHelp {
  goal: string;
  steps: string[];
  tips?: string[];
}

export const SCREEN_HELP: Record<string, ScreenHelp> = {
  pos_register: {
    goal: 'Encaisser une vente au comptoir ou à emporter.',
    steps: [
      "Si la caisse est fermée, appuyez sur « Ouvrir la caisse » et comptez le fond de caisse.",
      'Touchez les articles pour les ajouter au ticket. Touchez une ligne pour changer la quantité ou ajouter une remarque.',
      'Appuyez sur le grand bouton vert « Encaisser ». Espèces est déjà choisi : touchez le montant reçu (ou « Montant exact »), puis « Encaisser ».',
      'La monnaie à rendre s’affiche en grand. Imprimez le ticket puis « Nouvelle vente ».',
    ],
    tips: ['Un client veut payer en plusieurs fois ? Utilisez « Partager l’addition » dans l’écran de paiement.', 'En fin de service : « Clôturer » et comptez le tiroir.', 'Au clavier : F2 rechercher, F8 encaisser, F9 espèces au montant exact, F10 imprimer, Alt+M ouvrir le menu.', 'La vente en cours est gardée si la page se recharge.'],
  },
  pos_floor: {
    goal: 'Voir les tables et servir en salle.',
    steps: [
      'Vert = libre, bleu = occupée, violet = réservée, orange = commande à valider, jaune = addition demandée, rouge clignotant = le client appelle.',
      'Touchez une table libre pour installer des clients, puis prenez la commande.',
      'Touchez une table occupée pour ajouter des articles, envoyer en cuisine ou encaisser.',
      'Pour changer de table ou regrouper deux tables : « Déplacer / fusionner ».',
    ],
    tips: ['Le bouton 2D / 3D change seulement l’affichage, pas les tables.'],
  },
  pos_actions: {
    goal: 'Traiter ce que les clients demandent (appel serveur, addition, commande QR).',
    steps: ['Les demandes les plus anciennes sont en haut.', 'Appuyez sur « Je m’en occupe » pour que vos collègues sachent que c’est pris.', 'Une fois fait, appuyez sur « Traité ».'],
  },
  pos_kitchen: {
    goal: 'Préparer les commandes envoyées à la cuisine.',
    steps: ['Chaque carte est une commande, la plus ancienne à gauche.', 'Touchez « Commencer » quand vous la préparez, « Prête » quand elle peut partir, puis « Servie ».', 'Une carte qui devient rouge attend depuis trop longtemps.'],
  },
  pos_bar: {
    goal: 'Préparer les boissons envoyées au bar.',
    steps: ['Chaque carte est une commande, la plus ancienne à gauche.', 'Touchez « Commencer », puis « Prête », puis « Servie ».', 'Une carte qui devient rouge attend depuis trop longtemps.'],
  },
  pos_reservations: {
    goal: 'Noter et suivre les réservations.',
    steps: ['« Réservation téléphone » : nom, téléphone, nombre de personnes, date et heure.', 'Une demande en ligne attend votre réponse : « Traiter », puis « Confirmer » ou « Refuser ».', 'Si le client ne vient pas : « Non présenté ».'],
  },
  pos_cancellations: {
    goal: 'Demander ou valider l’annulation d’un article déjà envoyé.',
    steps: ['Choisissez l’article et indiquez la raison (erreur, client parti…).', 'Un responsable valide ou refuse la demande.', 'Toute annulation est enregistrée avec votre nom.'],
  },
  pos_timeclock: {
    goal: 'Pointer votre arrivée et votre départ.',
    steps: ['En arrivant : « Arrivée ».', 'Pour la pause : « Départ en pause » puis « Retour de pause ».', 'En partant : « Départ ».'],
  },
  pos_team: {
    goal: 'Voir qui est présent et les heures de l’équipe.',
    steps: ['La liste montre qui est pointé en ce moment.', 'Choisissez une période pour voir le total des heures par personne.'],
  },
  pos_tickets: {
    goal: 'Retrouver, réimprimer ou rembourser un ticket.',
    steps: ['Cherchez par numéro de ticket, date ou montant.', 'Ouvrez le ticket puis « Réimprimer (duplicata) ».', 'Une correction ou un remboursement demande les droits d’un responsable.'],
  },
  pos_sessions: {
    goal: 'Voir les ouvertures et clôtures de caisse.',
    steps: ['Chaque ligne est une session : qui l’a ouverte, le total encaissé et l’écart de caisse.', 'Ouvrez une session pour le détail par mode de paiement.'],
  },
  pos_insights: {
    goal: 'Anticiper : ventes prévues, commandes fournisseurs conseillées, rentabilité de la carte.',
    steps: [
      '« Prévisions » : ce que vous devriez vendre ces 14 prochains jours et combien de personnes prévoir demain.',
      '« Réassort » : ce qu’il faut commander, déjà arrondi au conditionnement du fournisseur.',
      '« Ingénierie de menu » : quels articles rapportent le plus (étoiles) et lesquels revoir.',
    ],
    tips: ['Plus il y a d’historique de ventes, plus les prévisions sont justes.'],
  },
  pos_floor_designer: {
    goal: 'Dessiner la salle à l’échelle : murs, bar, tables, décor.',
    steps: [
      'Choisissez la salle, puis réglez sa taille en mètres.',
      'Ajoutez un élément depuis la barre (table, mur, bar, plante…) et faites-le glisser.',
      'Les flèches du clavier déplacent l’élément sélectionné ; « Suppr » le retire.',
      'Appuyez sur « Enregistrer ». Une alerte s’affiche si deux tables se chevauchent ou si un passage est trop étroit.',
    ],
    tips: ['« Versions » garde un plan été / hiver que vous pouvez remettre quand la salle est vide.'],
  },
  pos_floor_library: {
    goal: 'Ajouter des textures, des objets 3D ou le plan de l’architecte.',
    steps: ['Collez un lien (https) ou envoyez un fichier depuis l’ordinateur.', 'Donnez-lui un nom clair : il apparaîtra dans le concepteur du plan.'],
  },
  pos_setup: {
    goal: 'Préparer la caisse avant la première utilisation.',
    steps: ['Suivez les étapes dans l’ordre : établissement, caisses, imprimantes, carte, équipe.', 'Une étape terminée passe au vert.'],
  },
};

const SEEN_KEY = 'cn_help_seen';

/** Whether the guide of this screen was already shown once on this device. */
export const helpSeen = (id: string): boolean => {
  try {
    return (JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]).includes(id);
  } catch {
    return true;
  }
};

export const markHelpSeen = (id: string): void => {
  try {
    const seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
    seen.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* private mode: the guide simply shows again next time */
  }
};
